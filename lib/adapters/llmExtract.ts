import { DateTime } from 'luxon';
import { z } from 'zod';
import type { Adapter, AdapterDocument, AdapterResult, Item, Meeting, RunMode, SourceConfig } from './types';
import { PDF_TIMEOUT_MS, getBytes, type HttpOptions } from './http';
import { DiscoveryConfigSchema, discover, downloadUrl, type DiscoveredDoc } from './discover';
import { getPdfText, type PdfText } from './pdfText';
import { runMinutesResults } from './minutes';
import {
  geminiFromEnv,
  modelsFromEnv,
  runExtraction,
  type Extraction,
  type ExtractionRun,
  type GeminiModels,
  type KnownMeeting,
  type LlmClient,
} from './gemini';
import { parseAmounts } from '@/lib/ingest/amounts';
import { documentContentHash, llmItemExternalId, sha1 } from '@/lib/ingest/hash';
import { ZONE, normalize, parseClock, toChicagoIso } from '@/lib/ingest/normalize';
import { redactPersonnel, redactText } from '@/lib/ingest/redact';
import { itemStatus, quoteInSource } from '@/lib/ingest/validate';

// LLMExtractAdapter (agent-scraper-spec §8 Step 7). Pipeline per document:
// discover -> fetch -> content_hash (skip if unchanged, D11) -> getPdfText -> LLM (Flash)
// -> validate -> retry once with the fallback model if > 20% of items were dropped (D17)
// -> map -> redact. The LLM never produces amounts, status, IDs or body_id.

export const LlmExtractConfigSchema = DiscoveryConfigSchema.extend({
  default_time: z.string().optional(),
}).loose();
export type LlmExtractConfig = z.infer<typeof LlmExtractConfigSchema>;

/** D17: retry with the fallback model when more than this share of items is dropped. */
export const MAX_DROP_RATIO = 0.2;
/** Step 7: the meeting date must be within this many days of today. */
export const MAX_DATE_DISTANCE_DAYS = 60;
export const MAX_TITLE_LEN = 2000;

export type LlmExtractDeps = {
  http?: HttpOptions;
  now?: () => Date;
  /** null = no key (items are skipped with a warning). Default: geminiFromEnv() at run time. */
  llm?: LlmClient | null;
  models?: GeminiModels;
  pdfText?: (bytes: Uint8Array) => Promise<PdfText>;
};

/** Hyphenation repair for the quote check: "Assessor-\nCollector" -> "Assessor-Collector". */
export function repairHyphenation(text: string): string {
  return text.replace(/-[ \t]*\r?\n[ \t]*/g, '-').replace(/\f/g, '\n');
}

/** Quote check with §5.5 normalization plus hyphenation repair on both sides. */
export function quoteVerified(quote: string, fullText: string): boolean {
  if (!quote.trim()) return false;
  const repaired = repairHyphenation(fullText);
  return quoteInSource(quote, fullText) || quoteInSource(quote, repaired) || quoteInSource(repairHyphenation(quote), repaired);
}

const DOLLAR_RE = /\$\s?\d[\d,]*(?:\.\d+)?/g;
const squashNum = (s: string) => s.replace(/[\s,]/g, '');

/** `$` figures in `text` that do not appear in the source text. */
export function inventedDollarFigures(text: string, fullText: string): string[] {
  const src = squashNum(normalize(repairHyphenation(fullText)));
  return (text.match(DOLLAR_RE) ?? []).filter((f) => !src.includes(squashNum(f)));
}

/** Safe for logs: a quote with any private name removed. */
const logQuote = (q: string) => JSON.stringify(redactText(q).text.slice(0, 120));

export type BuildContext = {
  source_id: string;
  body_id: string;
  url: string;
  /** Full document text (pages joined with \f): exactly what the model saw. */
  fullText: string;
  scanned: boolean;
  now: Date;
  /** Date and type from the index link (trusted over the LLM's date). */
  link?: Pick<DiscoveredDoc, 'date' | 'type'>;
  /** Meeting already known from structured data (PrimeGov): its fields win, only items are used. */
  known?: Meeting;
  default_time?: string;
};

export type BuildResult = {
  meeting?: Meeting;
  items: Item[];
  warnings: string[];
  /** Items the model returned (after cross-chunk dedup) and items dropped by validation. */
  total: number;
  dropped: number;
};

const localDate = (iso: string) => DateTime.fromISO(iso, { setZone: true }).setZone(ZONE).toFormat('yyyy-MM-dd');

function meetingFrom(ext: Extraction['meeting'] | undefined, ctx: BuildContext, warnings: string[]): Meeting | undefined {
  if (ctx.known) return ctx.known;
  const llmDate = ext?.date && DateTime.fromISO(ext.date.slice(0, 10), { zone: ZONE }).isValid ? ext.date.slice(0, 10) : undefined;
  if (ext?.date && !llmDate) warnings.push(`${ctx.url}: LLM date "${ext.date}" is not a real date`);
  if (ctx.link && llmDate && llmDate !== ctx.link.date) {
    warnings.push(`${ctx.url}: link date ${ctx.link.date} and LLM date ${llmDate} disagree; using the link date`);
  }
  const date = ctx.link?.date ?? llmDate;
  if (!date) {
    warnings.push(`${ctx.url}: no meeting date; document rejected`);
    return undefined;
  }
  const today = DateTime.fromJSDate(ctx.now, { zone: ZONE }).startOf('day');
  const distance = Math.abs(DateTime.fromISO(date, { zone: ZONE }).diff(today, 'days').days);
  if (distance > MAX_DATE_DISTANCE_DAYS) {
    warnings.push(`${ctx.url}: meeting date ${date} is more than ${MAX_DATE_DISTANCE_DAYS} days from today; document rejected`);
    return undefined;
  }
  let time: string | undefined;
  if (ext?.time && parseClock(ext.time)) time = ext.time;
  else {
    if (ext?.time) warnings.push(`${ctx.url}: unparseable LLM time "${ext.time}"`);
    time = ctx.default_time;
  }
  const meeting: Meeting = {
    external_id: sha1(ctx.source_id + date),
    body_id: ctx.body_id,
    date: toChicagoIso(date, time),
    type: ctx.link?.type === 'special' || ext?.type === 'special' ? 'special' : 'regular',
    status: /cancel+ed/i.test(safeDecode(ctx.url)) ? 'cancelled' : 'scheduled',
    agenda_url: ctx.url,
  };
  const cq = ext?.comment_instructions_quote?.trim();
  if (cq) {
    if (!ctx.scanned && quoteVerified(cq, ctx.fullText)) meeting.comment_rules_text = cq;
    else if (ctx.scanned) warnings.push(`${ctx.url}: comment instructions not stored (scanned document, quote unverifiable)`);
    else warnings.push(`${ctx.url}: comment_instructions_quote not found in the text; dropped: ${logQuote(cq)}`);
  }
  return meeting;
}

/**
 * Validate and map LLM output (one Extraction per chunk) into a Meeting and Items. Pure: no I/O.
 * Used by the adapter, by PrimeGov (Step 8, with ctx.known) and by the golden tests.
 */
export function buildFromExtraction(chunks: (Extraction | null)[], ctx: BuildContext): BuildResult {
  const warnings: string[] = [];
  const firstMeeting = chunks.find((c) => c)?.meeting;
  const meeting = meetingFrom(firstMeeting, ctx, warnings);
  if (!meeting) return { items: [], warnings, total: 0, dropped: 0 };

  const items: Item[] = [];
  const idsByChunk = new Map<string, number>(); // base id -> chunk it was first seen in
  const usedIds = new Set<string>();
  let total = 0;
  let dropped = 0;
  chunks.forEach((chunk, ci) => {
    for (const raw of chunk?.items ?? []) {
      const title = raw.title?.trim() ?? '';
      const agendaNumber = raw.agenda_number?.trim().replace(/\.$/, '') || undefined;
      const baseId = llmItemExternalId(meeting.external_id, agendaNumber, title);
      const seenIn = idsByChunk.get(baseId);
      if (seenIn !== undefined && seenIn !== ci) continue; // overlap page: same item from the next chunk
      total++;
      if (!title) {
        dropped++;
        warnings.push(`${ctx.url}: item ${agendaNumber ?? '?'} dropped: empty title`);
        continue;
      }
      if (title.length >= MAX_TITLE_LEN) {
        dropped++;
        warnings.push(`${ctx.url}: item ${agendaNumber ?? '?'} dropped: title over ${MAX_TITLE_LEN} characters`);
        continue;
      }
      if (!ctx.scanned && !quoteVerified(raw.source_quote, ctx.fullText)) {
        dropped++;
        warnings.push(`${ctx.url}: item ${agendaNumber ?? '?'} dropped: source_quote not in text: ${logQuote(raw.source_quote)}`);
        continue;
      }
      let description = raw.description?.trim() || undefined;
      if (description) {
        const invented = inventedDollarFigures(description, ctx.fullText);
        if (invented.length) {
          warnings.push(`${ctx.url}: item ${agendaNumber ?? '?'} description dropped: ${invented.join(', ')} not in the document`);
          description = undefined;
        }
      }
      let id = baseId;
      if (seenIn === undefined) idsByChunk.set(baseId, ci);
      if (usedIds.has(id)) {
        let n = 2;
        while (usedIds.has(`${baseId}#${n}`)) n++;
        id = `${baseId}#${n}`;
        warnings.push(`${ctx.url}: external_id collision for item ${agendaNumber ?? JSON.stringify(title.slice(0, 40))}; using #${n}`);
      }
      usedIds.add(id);
      const item: Item = {
        external_id: id,
        meeting_external_id: meeting.external_id,
        body_id: ctx.body_id,
        ...(agendaNumber ? { agenda_number: agendaNumber } : {}),
        title,
        ...(raw.section?.trim() ? { section: raw.section.trim() } : {}),
        ...(description ? { description } : {}),
        status: itemStatus({}, meeting.date, ctx.now),
        amounts: parseAmounts(`${title} ${description ?? ''}`),
        attachments: [],
        contains_private_person: false,
        source_url: ctx.url,
        source_quote: raw.source_quote,
        quote_verified: !ctx.scanned,
      };
      items.push(redactPersonnel(item));
    }
  });
  if (total === 0) warnings.push(`${ctx.url}: no items extracted`);
  return { meeting, items, warnings, total, dropped };
}

export type ExtractInput = {
  source_id: string;
  body_id: string;
  url: string;
  pdf: Uint8Array;
  text: PdfText;
  link?: Pick<DiscoveredDoc, 'date' | 'type'>;
  known?: Meeting;
  default_time?: string;
  llm: LlmClient;
  models: GeminiModels;
  now: Date;
  fetched_at?: string;
};

export type ExtractOutput = BuildResult & { documents: AdapterDocument[]; model: string };

const dropRatio = (r: BuildResult) => (r.total === 0 ? 1 : r.dropped / r.total);

/**
 * Extract one document's items with the LLM, validate, and retry once with the fallback model if
 * more than 20% of items were dropped (or nothing came back). Keeps the run with more valid items.
 * Used by the llm_extract adapter and by PrimeGov (Step 8, with `known`).
 */
export async function extractDocument(input: ExtractInput): Promise<ExtractOutput> {
  const scanned = !input.text.has_text_layer;
  const known: KnownMeeting | undefined = input.known
    ? { date: localDate(input.known.date), type: input.known.type }
    : input.link
      ? { date: input.link.date, type: input.link.type }
      : undefined;
  const ctx: BuildContext = {
    source_id: input.source_id,
    body_id: input.body_id,
    url: input.url,
    fullText: input.text.text,
    scanned,
    now: input.now,
    link: input.link,
    known: input.known,
    default_time: input.default_time,
  };
  const fetchedAt = input.fetched_at ?? input.now.toISOString();
  const documents: AdapterDocument[] = [];
  const warnings: string[] = [];
  const attempt = async (model: string) => {
    const run: ExtractionRun = await runExtraction(input.llm, model, { pages: input.text.pages, scanned, pdf: input.pdf, known: input.link ? undefined : known });
    run.raw.forEach((raw, i) => {
      if (raw) documents.push({ url: `${input.url}#llm=${model}&chunk=${i}`, fetched_at: fetchedAt, content_hash: documentContentHash(raw), raw, kind: 'llm_output' });
    });
    warnings.push(...run.errors.map((e) => `${input.url}: ${e}`));
    return buildFromExtraction(run.parsed, ctx);
  };
  let best = await attempt(input.models.extract);
  let model = input.models.extract;
  if (dropRatio(best) > MAX_DROP_RATIO && input.models.fallback !== input.models.extract) {
    warnings.push(`${input.url}: ${best.dropped}/${best.total} items dropped with ${model}; retrying with ${input.models.fallback}`);
    const retry = await attempt(input.models.fallback);
    if (retry.items.length > best.items.length) {
      best = retry;
      model = input.models.fallback;
    }
  }
  if (scanned) warnings.push(`${input.url}: scanned document (no text layer); quotes not verified, items need review`);
  return { ...best, warnings: [...warnings, ...best.warnings], documents, model };
}

const safeDecode = (url: string) => {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
};

/** Meeting from the index link alone (used when no LLM key is configured). */
export function meetingFromLink(sourceId: string, bodyId: string, doc: Pick<DiscoveredDoc, 'date' | 'type' | 'url'>, defaultTime?: string): Meeting {
  return {
    external_id: sha1(sourceId + doc.date),
    body_id: bodyId,
    date: toChicagoIso(doc.date, defaultTime),
    type: doc.type,
    status: /cancel+ed/i.test(safeDecode(doc.url)) ? 'cancelled' : 'scheduled',
    agenda_url: doc.url,
  };
}

export function createLlmExtractAdapter(deps: LlmExtractDeps = {}): Adapter {
  return {
    async run(source: SourceConfig, mode: RunMode, window, prev): Promise<AdapterResult> {
      const result: AdapterResult = { meetings: [], items: [], documents: [], result_updates: [], warnings: [] };
      const cfg = LlmExtractConfigSchema.parse(source.config);
      const bodyId = source.body_id ?? source.id;
      const now = (deps.now ?? (() => new Date()))();
      const llm = deps.llm === undefined ? geminiFromEnv() : deps.llm;
      const models = deps.models ?? modelsFromEnv();
      const pdfText = deps.pdfText ?? getPdfText;
      const http = { timeoutMs: PDF_TIMEOUT_MS, ...deps.http };

      if (mode.kind === 'results') {
        // Step 10 (D22): outcomes from minutes for known meetings; never creates items.
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
          llm,
          models,
          http,
          pdfText,
        });
        result.documents.push(...out.documents);
        result.result_updates.push(...out.updates);
        result.warnings.push(...out.warnings);
        return result;
      }

      const found = await discover(cfg, window, { http: deps.http });
      const stamp = () => new Date().toISOString();
      for (const p of found.pages) {
        result.documents.push({ url: p.url, fetched_at: stamp(), content_hash: documentContentHash(p.html), raw: p.html, kind: 'html' });
      }
      result.warnings.push(...found.warnings);

      const fetchText = async (doc: DiscoveredDoc) => {
        const bytes = await getBytes(downloadUrl(doc.url), http);
        const hash = documentContentHash(bytes);
        if (prev?.documentHashes[doc.url] === hash) return { bytes, hash, unchanged: true as const };
        const text = await pdfText(bytes);
        result.documents.push({ url: doc.url, fetched_at: stamp(), content_hash: hash, raw: text.text, kind: 'pdf_text' });
        return { bytes, hash, text, unchanged: false as const };
      };

      for (const doc of found.superseded) {
        try {
          await fetchText(doc);
        } catch (e) {
          result.warnings.push(`${doc.url}: fetch failed: ${(e as Error).message}`);
        }
      }

      if (!llm && found.docs.length) {
        result.warnings.push('llm_unavailable: no OPENROUTER_API_KEY or GEMINI_API_KEY is set; agenda items were not extracted');
      }
      // Phase 2: the scheduled ingest caps AI reads per run (time budget); the rest wait for the next run.
      const cap = typeof cfg.max_llm_docs === 'number' && cfg.max_llm_docs > 0 ? cfg.max_llm_docs : Infinity;
      let extracted = 0;
      for (const [index, doc] of found.docs.entries()) {
        if (llm && extracted >= cap) {
          const n = found.docs.length - index;
          result.warnings.push(`deferred: ${n} agenda document${n === 1 ? '' : 's'} for the next run (max_llm_docs ${cap})`);
          break;
        }
        let fetched: Awaited<ReturnType<typeof fetchText>>;
        try {
          fetched = await fetchText(doc);
        } catch (e) {
          result.warnings.push(`${doc.url}: fetch failed: ${(e as Error).message}`);
          continue;
        }
        if (fetched.unchanged) continue; // D11: same content_hash as last run
        if (!llm) {
          result.meetings.push(meetingFromLink(source.id, bodyId, doc, cfg.default_time));
          continue;
        }
        extracted++;
        const out = await extractDocument({
          source_id: source.id,
          body_id: bodyId,
          url: doc.url,
          pdf: fetched.bytes,
          text: fetched.text,
          link: { date: doc.date, type: doc.type },
          default_time: cfg.default_time,
          llm,
          models,
          now,
        });
        result.documents.push(...out.documents);
        result.warnings.push(...out.warnings);
        if (out.meeting) {
          result.meetings.push(out.meeting);
          result.items.push(...out.items);
        }
      }
      return result;
    },
  };
}

export const llmExtractAdapter: Adapter = createLlmExtractAdapter();
