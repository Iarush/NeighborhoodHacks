import type { Adapter, AdapterDocument, AdapterResult, Item, Meeting, RunMode, SourceConfig } from '../types';
import { PDF_TIMEOUT_MS, getBytes, type HttpOptions } from '../http';
import { discover, downloadUrl, type DiscoveredDoc } from '../discover';
import { LlmExtractConfigSchema, meetingFromLink } from '../llmExtract';
import { getPdfText, getPositionedText, type PdfText } from '../pdfText';
import { documentContentHash } from '@/lib/ingest/hash';
import { parseMudAgenda, type ParseResult } from './parse';
import { detectFirm, profileById } from './profiles';

// The mud_agenda adapter (mud-code-parser-spec §3-§4). Finds agenda links exactly like
// llm_extract (same `discover` config), then walks the no-AI ladder per document:
//   1 text layer -> 2 text rebuilt from word positions -> 3 stored OCR text -> 4 loose parser
// and stops at the first accepted parse. Rung 5 (the LLM under a monthly cap) is Phase 5 and
// isn't wired yet, so a document that fails rungs 1-4 is stored link-only with a parse_failed
// warning. Rung 3 isn't synchronous: a scan is stored with needs_ocr, the OCR job
// (.github/workflows/ocr.yml) stores its text, and a later run parses it here.

export const MudAgendaConfigSchema = LlmExtractConfigSchema;

export type MudAgendaDeps = {
  http?: HttpOptions;
  now?: () => Date;
  pdfText?: (bytes: Uint8Array) => Promise<PdfText>;
  positionedText?: (bytes: Uint8Array) => Promise<PdfText>;
};

export type LadderInput = {
  source_id: string;
  body_id: string;
  doc: Pick<DiscoveredDoc, 'url' | 'date' | 'type'>;
  now: Date;
  default_time?: string;
  /** Rung 1 text (null when the PDF has no text layer). */
  text: PdfText | null;
  /** Rung 2, computed only when rung 1 fails. */
  positioned?: () => Promise<PdfText | null>;
  /** Rung 3: OCR text stored for this PDF, if any. */
  ocr?: string;
};

export type LadderOutcome =
  | { ok: true; rung: 1 | 2 | 3 | 4; result: ParseResult; positioned?: PdfText; needs_ocr: false }
  | { ok: false; rung: number; reasons: string[]; profile: string; positioned?: PdfText; needs_ocr: boolean };

/** Run rungs 1-4 for one document. Pure apart from the optional positioned-text callback. */
export async function runLadder(input: LadderInput): Promise<LadderOutcome> {
  const parse = (text: string, opts: { ocr?: boolean; loose?: boolean } = {}) => {
    const firm = detectFirm(text);
    return parseMudAgenda(text, profileById(firm.id), {
      source_id: input.source_id,
      body_id: input.body_id,
      url: input.doc.url,
      now: input.now,
      link: { date: input.doc.date, type: input.doc.type },
      default_time: input.default_time,
      ...opts,
    });
  };
  const tried: { rung: number; result: ParseResult }[] = [];
  const attempt = (rung: 1 | 2 | 3 | 4, text: string, opts?: { ocr?: boolean; loose?: boolean }) => {
    const result = parse(text, opts);
    tried.push({ rung, result });
    return result.ok ? result : null;
  };

  let positioned: PdfText | undefined;
  if (input.text?.has_text_layer) {
    const r1 = attempt(1, input.text.text);
    if (r1) return { ok: true, rung: 1, result: r1, needs_ocr: false };
    positioned = (await input.positioned?.()) ?? undefined;
    if (positioned?.has_text_layer) {
      const r2 = attempt(2, positioned.text);
      if (r2) return { ok: true, rung: 2, result: r2, positioned, needs_ocr: false };
    }
  }
  if (input.ocr) {
    const r3 = attempt(3, input.ocr, { ocr: true });
    if (r3) return { ok: true, rung: 3, result: r3, positioned, needs_ocr: false };
  }
  // Rung 4: the loose parser on the best text from rungs 1-3 (text layer first, OCR last).
  const looseInputs: { text: string; ocr: boolean }[] = [];
  if (input.text?.has_text_layer) looseInputs.push({ text: input.text.text, ocr: false });
  if (positioned?.has_text_layer) looseInputs.push({ text: positioned.text, ocr: false });
  if (input.ocr) looseInputs.push({ text: input.ocr, ocr: true });
  for (const li of looseInputs) {
    const r4 = attempt(4, li.text, { loose: true, ocr: li.ocr });
    if (r4) return { ok: true, rung: 4, result: r4, positioned, needs_ocr: false };
  }
  const last = tried.filter((t) => t.rung !== 4).at(-1) ?? tried.at(-1);
  // OCR is the next step for a scan, or for a text layer rungs 1-2 couldn't read, until OCR text exists.
  return { ok: false, rung: tried.at(-1)?.rung ?? 0, reasons: last?.result.reasons ?? ['no text layer'], profile: last?.result.profile ?? 'generic', positioned, needs_ocr: !input.ocr };
}

export function createMudAgendaAdapter(deps: MudAgendaDeps = {}): Adapter {
  return {
    async run(source: SourceConfig, mode: RunMode, window, prev): Promise<AdapterResult> {
      const result: AdapterResult = { meetings: [], items: [], documents: [], result_updates: [], warnings: [] };
      const cfg = MudAgendaConfigSchema.parse(source.config);
      const bodyId = source.body_id ?? source.id;
      const now = (deps.now ?? (() => new Date()))();
      const pdfText = deps.pdfText ?? getPdfText;
      const positionedText = deps.positionedText ?? getPositionedText;
      const http = { timeoutMs: PDF_TIMEOUT_MS, ...deps.http };

      if (mode.kind === 'results') {
        // §6 (Phase 4) replaces the minutes LLM call; until then mud_agenda sources check no outcomes.
        result.warnings.push(`${source.id}: mud_agenda outcomes from minutes are not built yet (spec Phase 4); nothing checked`);
        return result;
      }

      const found = await discover(cfg, window, { http: deps.http });
      const stamp = () => new Date().toISOString();
      for (const p of found.pages) {
        result.documents.push({ url: p.url, fetched_at: stamp(), content_hash: documentContentHash(p.html), raw: p.html, kind: 'html' });
      }
      result.warnings.push(...found.warnings);

      for (const doc of found.docs) {
        let bytes: Uint8Array;
        try {
          bytes = await getBytes(downloadUrl(doc.url), http);
        } catch (e) {
          result.warnings.push(`${doc.url}: fetch failed: ${(e as Error).message}`);
          continue;
        }
        const hash = documentContentHash(bytes);
        if (prev?.documentHashes[doc.url] === hash) continue; // D11: unchanged since the last parse
        let text: PdfText | null = null;
        try {
          text = await pdfText(bytes);
        } catch (e) {
          result.warnings.push(`${doc.url}: PDF text failed: ${(e as Error).message}`);
        }
        const outcome = await runLadder({
          source_id: source.id,
          body_id: bodyId,
          doc,
          now,
          default_time: cfg.default_time,
          text,
          positioned: async () => {
            try {
              return await positionedText(bytes);
            } catch (e) {
              result.warnings.push(`${doc.url}: positioned text failed: ${(e as Error).message}`);
              return null;
            }
          },
          ocr: prev?.ocrTexts?.[hash],
        });

        const pdfDoc: AdapterDocument = {
          url: doc.url,
          fetched_at: stamp(),
          content_hash: hash,
          raw: text?.text ?? '',
          kind: 'pdf_text',
          needs_ocr: outcome.needs_ocr,
          ...(outcome.ok ? { parse_rung: outcome.rung, parse_profile: outcome.result.profile } : { parse_profile: outcome.profile }),
        };
        result.documents.push(pdfDoc);
        // Rung 2 items were checked against the rebuilt text, so keep that text beside the PDF's.
        if (outcome.ok && outcome.rung === 2 && outcome.positioned) {
          result.documents.push({ url: `${doc.url}#positioned`, fetched_at: stamp(), content_hash: hash, raw: outcome.positioned.text, kind: 'pdf_text', parse_rung: 2 });
        }

        if (outcome.ok) {
          const { meeting, items } = outcome.result;
          result.meetings.push(meeting as Meeting);
          result.items.push(...(items as Item[]));
          if (outcome.rung === 3 || (outcome.rung === 4 && prev?.ocrTexts?.[hash] && !text?.has_text_layer)) {
            result.warnings.push(`${doc.url}: items parsed from OCR text (rung ${outcome.rung}); quotes not verified, items need review`);
          }
          continue;
        }
        result.meetings.push(meetingFromLink(source.id, bodyId, doc, cfg.default_time));
        if (outcome.needs_ocr) {
          result.warnings.push(`needs_ocr: ${source.id} ${doc.url}: ${text?.has_text_layer ? `rungs 1-2 failed (${outcome.reasons.slice(0, 2).join('; ')})` : 'no text layer'}; stored link-only until OCR text arrives`);
        } else {
          result.warnings.push(
            `parse_failed: ${source.id} firm=${outcome.profile} rung=${outcome.rung} ${doc.url}: ${outcome.reasons.slice(0, 3).join('; ')}; stored link-only (LLM rung not wired yet)`,
          );
        }
      }
      return result;
    },
  };
}

export const mudAgendaAdapter: Adapter = createMudAgendaAdapter();
