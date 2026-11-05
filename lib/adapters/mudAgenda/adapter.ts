import type { Adapter, AdapterDocument, AdapterResult, Item, Meeting, RunMode, SourceConfig } from '../types';
import { PDF_TIMEOUT_MS, getBytes, type HttpOptions } from '../http';
import { discover, downloadUrl, type DiscoveredDoc } from '../discover';
import { LlmExtractConfigSchema, extractDocument, meetingFromLink } from '../llmExtract';
import { geminiFromEnv, modelsFromEnv, type GeminiModels, type LlmClient } from '../gemini';
import { getPdfText, getPositionedText, type PdfText } from '../pdfText';
import { runMinutesResults, type MinutesOutput } from '../minutes';
import { documentContentHash } from '@/lib/ingest/hash';
import { parseMudMinutes, type MinutesParse } from './minutes';
import { parseMudAgenda, type ParseResult } from './parse';
import { detectFirm, profileById } from './profiles';

// The mud_agenda adapter (mud-code-parser-spec §3-§4). Finds agenda links exactly like
// llm_extract (same `discover` config), then walks the no-AI ladder per document:
//   1 text layer -> 2 text rebuilt from word positions -> 3 stored OCR text -> 4 loose parser
// and stops at the first accepted parse. Rung 5 is the LLM (extractDocument, unchanged), only
// after OCR has been tried and only under the monthly cap (§4.1, prev.llmBudget): $1 or 20
// documents per Chicago month. With no budget, no key or a full month, a document that fails
// rungs 1-4 is stored link-only with a parse_failed warning. Rung 3 isn't synchronous: a scan is stored with needs_ocr, the OCR job
// (.github/workflows/ocr.yml) stores its text, and a later run parses it here.
// Results mode (§6) reads minutes on rungs 1-3 the same way (readMinutesLadder) and never calls the LLM.

export const MudAgendaConfigSchema = LlmExtractConfigSchema;

export type MudAgendaDeps = {
  http?: HttpOptions;
  now?: () => Date;
  pdfText?: (bytes: Uint8Array) => Promise<PdfText>;
  positionedText?: (bytes: Uint8Array) => Promise<PdfText>;
  /** Rung 5. null = no key. Default: geminiFromEnv() at run time, only when a budget is given. */
  llm?: LlmClient | null;
  models?: GeminiModels;
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

export type MinutesLadderInput = {
  url: string;
  bytes: Uint8Array;
  meeting_external_id: string;
  items: Item[];
  pdfText: (bytes: Uint8Array) => Promise<PdfText>;
  positionedText: (bytes: Uint8Array) => Promise<PdfText>;
  /** Stored OCR text by PDF content hash (prev.ocrTexts). */
  ocrTexts?: Record<string, string>;
  fetched_at?: string;
};

/** A minutes reading is accepted when its text could be split and code matched at least half the voted items. */
const minutesAccepted = (p: MinutesParse) => !p.unreadable && !p.warnings.some((w) => w.startsWith('minutes_low_match:'));

/**
 * §6 for one minutes PDF: rung 1 text layer, rung 2 text rebuilt from word positions, rung 3 stored
 * OCR text. Stops at the first accepted reading; otherwise keeps the reading with the most updates.
 * A PDF with no accepted reading and no OCR text yet is stored with needs_ocr.
 */
export async function readMinutesLadder(input: MinutesLadderInput): Promise<MinutesOutput> {
  const out: MinutesOutput = { updates: [], documents: [], warnings: [] };
  const stamp = () => input.fetched_at ?? new Date().toISOString();
  const hash = documentContentHash(input.bytes);
  const ctx = { meeting_external_id: input.meeting_external_id, url: input.url };
  const tried: { rung: 1 | 2 | 3; parse: MinutesParse }[] = [];
  let text: PdfText | null = null;
  try {
    text = await input.pdfText(input.bytes);
  } catch (e) {
    out.warnings.push(`${input.url}: minutes PDF text failed: ${(e as Error).message}`);
  }
  if (text?.has_text_layer) tried.push({ rung: 1, parse: parseMudMinutes(text.text, input.items, ctx) });
  let positioned: PdfText | null = null;
  if (text?.has_text_layer && !minutesAccepted(tried[0]!.parse)) {
    try {
      positioned = await input.positionedText(input.bytes);
    } catch (e) {
      out.warnings.push(`${input.url}: positioned text failed: ${(e as Error).message}`);
    }
    if (positioned?.has_text_layer) tried.push({ rung: 2, parse: parseMudMinutes(positioned.text, input.items, ctx) });
  }
  const ocr = input.ocrTexts?.[hash];
  if (ocr && !tried.some((t) => minutesAccepted(t.parse))) tried.push({ rung: 3, parse: parseMudMinutes(ocr, input.items, { ...ctx, ocr: true }) });

  const accepted = tried.find((t) => minutesAccepted(t.parse));
  const best = accepted ?? [...tried].sort((a, b) => b.parse.matched - a.parse.matched)[0];
  const needs_ocr = !accepted && !ocr;
  out.documents.push({
    url: input.url,
    fetched_at: stamp(),
    content_hash: hash,
    raw: text?.text ?? '',
    kind: 'pdf_text',
    needs_ocr,
    ...(best && best.parse.updates.length ? { parse_rung: best.rung } : {}),
  });
  if (best?.rung === 2 && positioned) {
    out.documents.push({ url: `${input.url}#positioned`, fetched_at: stamp(), content_hash: hash, raw: positioned.text, kind: 'pdf_text', parse_rung: 2 });
  }
  if (best && !best.parse.unreadable) {
    out.updates.push(...best.parse.updates);
    out.warnings.push(...best.parse.warnings);
  } else if (best) {
    out.warnings.push(...best.parse.warnings);
  }
  if (best?.rung === 3 && best.parse.updates.length) out.warnings.push(`${input.url}: outcomes read from OCR text; quotes not verified, updates need review`);
  if (needs_ocr) out.warnings.push(`needs_ocr: ${input.url}: ${text?.has_text_layer ? 'minutes rungs 1-2 not accepted' : 'no text layer'}; outcomes wait for OCR text`);
  return out;
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
        // §6: outcomes from minutes for known meetings, read by code (rungs 1-3); never creates items.
        const known = mode.known ?? { meetings: [], items: [] };
        const meetings = mode.meeting_external_ids.flatMap((id) => {
          const m = known.meetings.find((x) => x.external_id === id);
          if (!m) result.warnings.push(`meeting ${id}: not in the known meetings; skipped`);
          return m ? [m] : [];
        });
        const minutesIndex = typeof cfg.minutes_index_url === 'string' && /^https?:\/\//.test(cfg.minutes_index_url) ? cfg.minutes_index_url : undefined;
        if (!minutesIndex && meetings.some((m) => !m.minutes_url)) {
          result.warnings.push(`${source.id}: no minutes_index_url configured; only meetings with minutes_url are checked`);
        }
        const out = await runMinutesResults({
          meetings,
          items: known.items,
          discovery: minutesIndex
            ? { ...cfg, index_url: minutesIndex, link_pattern: String(cfg.minutes_link_pattern ?? '(?i)minutes'), follow_notice_page: false }
            : undefined,
          tolerance_days: typeof cfg.minutes_date_tolerance_days === 'number' ? cfg.minutes_date_tolerance_days : 0,
          window: { from: window.from, to: new Date(Math.min(window.to.getTime(), now.getTime())) },
          llm: null,
          models: { extract: '', fallback: '' }, // unused: readOutcomes replaces the LLM
          http,
          readOutcomes: ({ url, bytes, meeting, items }) =>
            readMinutesLadder({ url, bytes, meeting_external_id: meeting.external_id, items, pdfText, positionedText, ocrTexts: prev?.ocrTexts }),
        });
        result.documents.push(...out.documents);
        result.result_updates.push(...out.updates);
        result.warnings.push(...out.warnings);
        return result;
      }

      const budget = prev?.llmBudget;
      let llm: LlmClient | null | undefined;
      let capReached = false;
      let llmUnavailableWarned = false;

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
        // Rung 5: the LLM, only once OCR has been tried (a scan never goes straight to it) and under the cap.
        if (!outcome.needs_ocr && text && budget) {
          llm ??= deps.llm === undefined ? geminiFromEnv() : deps.llm;
          if (!llm) {
            if (!llmUnavailableWarned) result.warnings.push('llm_unavailable: no OPENROUTER_API_KEY or GEMINI_API_KEY is set; rung 5 skipped');
            llmUnavailableWarned = true;
          } else if (capReached || !(await budget.reserve(text.pages.length))) {
            if (!capReached) result.warnings.push(`llm_cap_reached: the monthly MUD LLM cap is used up; documents that fail rungs 1-4 stay link-only until the 1st (America/Chicago)`);
            capReached = true;
          } else {
            const out = await extractDocument({
              source_id: source.id,
              body_id: bodyId,
              url: doc.url,
              pdf: bytes,
              text,
              link: { date: doc.date, type: doc.type },
              default_time: cfg.default_time,
              llm,
              models: deps.models ?? modelsFromEnv(),
              now,
            });
            pdfDoc.parse_rung = 5;
            result.documents.push(...out.documents);
            result.warnings.push(...out.warnings);
            // §4.1: a document should need the LLM once; the fix is a profile.
            result.warnings.push(`profile_todo: ${source.id} firm=${outcome.profile} ${doc.url}: read by the LLM (rung 5); add or fix a profile`);
            if (out.meeting) {
              result.meetings.push(out.meeting);
              result.items.push(...out.items);
              continue;
            }
          }
        }
        result.meetings.push(meetingFromLink(source.id, bodyId, doc, cfg.default_time));
        if (outcome.needs_ocr) {
          result.warnings.push(`needs_ocr: ${source.id} ${doc.url}: ${text?.has_text_layer ? `rungs 1-2 failed (${outcome.reasons.slice(0, 2).join('; ')})` : 'no text layer'}; stored link-only until OCR text arrives`);
        } else {
          result.warnings.push(
            `parse_failed: ${source.id} firm=${outcome.profile} rung=${outcome.rung} ${doc.url}: ${outcome.reasons.slice(0, 3).join('; ')}; stored link-only${budget ? '' : ' (no LLM budget for this run)'}`,
          );
        }
      }
      return result;
    },
  };
}

export const mudAgendaAdapter: Adapter = createMudAgendaAdapter();
