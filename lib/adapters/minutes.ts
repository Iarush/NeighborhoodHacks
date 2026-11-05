import { DateTime } from 'luxon';
import type { AdapterDocument, Item, Meeting, ResultUpdate } from './types';
import { getBytes, type HttpOptions } from './http';
import { discover, downloadUrl, type DiscoveredDoc } from './discover';
import { runOutcomes, type GeminiModels, type LlmClient, type Outcome, type Outcomes } from './gemini';
import { quoteVerified } from './llmExtract';
import { getPdfText, type PdfText } from './pdfText';
import { documentContentHash } from '@/lib/ingest/hash';
import { ZONE, normalize } from '@/lib/ingest/normalize';
import { redactText } from '@/lib/ingest/redact';

// Results from minutes (agent-scraper-spec §8 Step 10, D22): for llm_extract and PrimeGov sources
// whose outcomes only appear in minutes. The LLM reports outcomes; code matches them to EXISTING
// items (agenda number first, then title-token overlap >= 0.5) and checks every quote.
// Minutes never create items.

export const MATCH_THRESHOLD = 0.5;

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'its', 'are', 'was', 'were', 'any', 'all', 'such', 'including', 'district']);

/** Lowercase word tokens (3+ characters, no stopwords) for title matching. */
export function tokens(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !STOP.has(t)),
  );
}

/** Share of the fragment's tokens that appear in the title (containment), plus Dice as a tie-breaker. */
export function overlapScore(fragment: string, title: string): { containment: number; dice: number } {
  const a = tokens(fragment);
  const b = tokens(title);
  if (a.size === 0 || b.size === 0) return { containment: 0, dice: 0 };
  let common = 0;
  for (const t of a) if (b.has(t)) common++;
  return { containment: common / a.size, dice: (2 * common) / (a.size + b.size) };
}

const normNumber = (n: string | undefined) => (n ? normalize(n).replace(/[.)\s]+$/g, '').replace(/^\(/, '') : '');

export type MatchResult = { item: Item; by: 'agenda_number' | 'title' } | { item?: undefined; reason: string };

/** Match one outcome to an existing item of the meeting. Never invents an item. */
export function matchOutcome(outcome: Pick<Outcome, 'agenda_number' | 'title_fragment'>, items: Item[]): MatchResult {
  const num = normNumber(outcome.agenda_number);
  if (num) {
    const byNum = items.filter((i) => normNumber(i.agenda_number) === num);
    if (byNum.length === 1) return { item: byNum[0]!, by: 'agenda_number' };
  }
  const scored = items
    .map((item) => ({ item, ...overlapScore(outcome.title_fragment, item.title) }))
    .filter((s) => s.containment >= MATCH_THRESHOLD)
    .sort((x, y) => y.containment - x.containment || y.dice - x.dice);
  if (scored.length === 0) return { reason: 'no matching item' };
  const [best, second] = scored;
  if (second && second.containment === best!.containment && second.dice === best!.dice) {
    return { reason: `tie between items ${best!.item.agenda_number ?? best!.item.external_id} and ${second.item.agenda_number ?? second.item.external_id}` };
  }
  return { item: best!.item, by: 'title' };
}

export type BuildResultsContext = {
  meeting_external_id: string;
  /** Known items of this meeting (from items.json in Phase 1). */
  items: Item[];
  /** Minutes URL (source_url of every update). */
  url: string;
  fullText: string;
  scanned: boolean;
};

const logText = (s: string) => JSON.stringify(redactText(s).text.slice(0, 120));

/** Validate and match LLM outcomes into ResultUpdates. Pure: no I/O. */
export function buildResultUpdates(chunks: (Outcomes | null)[], ctx: BuildResultsContext): { updates: ResultUpdate[]; warnings: string[] } {
  const updates: ResultUpdate[] = [];
  const warnings: string[] = [];
  const done = new Set<string>();
  for (const chunk of chunks) {
    for (const o of chunk?.outcomes ?? []) {
      const label = `${ctx.url}: outcome ${o.agenda_number ?? logText(o.title_fragment)}`;
      if (!ctx.scanned && !quoteVerified(o.source_quote, ctx.fullText)) {
        warnings.push(`${label} rejected: source_quote not in minutes: ${logText(o.source_quote)}`);
        continue;
      }
      const m = matchOutcome(o, ctx.items);
      if (!m.item) {
        warnings.push(`${label} not applied: ${m.reason}`);
        continue;
      }
      if (done.has(m.item.external_id)) continue; // overlap page or a repeated heading: first outcome wins
      done.add(m.item.external_id);
      updates.push({
        meeting_external_id: ctx.meeting_external_id,
        item_external_id: m.item.external_id,
        action: o.outcome,
        vote_result: o.outcome === 'tabled' ? 'no_action' : o.outcome,
        source_url: ctx.url,
        source_quote: redactText(o.source_quote).text,
        quote_verified: !ctx.scanned,
      });
    }
  }
  return { updates, warnings };
}

const day = (iso: string) => DateTime.fromISO(iso, { setZone: true }).setZone(ZONE).startOf('day');

/**
 * Pair minutes documents with meetings by date: exact date first; otherwise a document within
 * `toleranceDays` when exactly one meeting fits it (and it fits exactly one document), with a warning.
 */
export function matchMinutesToMeetings(
  meetings: Pick<Meeting, 'external_id' | 'date'>[],
  docs: Pick<DiscoveredDoc, 'url' | 'date' | 'filename'>[],
  toleranceDays: number,
): { byMeeting: Map<string, Pick<DiscoveredDoc, 'url' | 'date' | 'filename'>>; warnings: string[] } {
  const byMeeting = new Map<string, Pick<DiscoveredDoc, 'url' | 'date' | 'filename'>>();
  const warnings: string[] = [];
  const used = new Set<string>();
  for (const m of meetings) {
    const d = day(m.date).toFormat('yyyy-MM-dd');
    const exact = docs.find((x) => x.date === d);
    if (exact) {
      byMeeting.set(m.external_id, exact);
      used.add(exact.url);
    }
  }
  if (toleranceDays <= 0) return { byMeeting, warnings };
  const within = (a: string, b: string) => Math.abs(day(a).diff(day(b), 'days').days) <= toleranceDays;
  for (const m of meetings) {
    if (byMeeting.has(m.external_id)) continue;
    const near = docs.filter((x) => !used.has(x.url) && within(x.date, m.date));
    if (near.length !== 1) {
      if (near.length > 1) warnings.push(`meeting ${m.external_id}: ${near.length} minutes documents within ${toleranceDays} days; none used`);
      continue;
    }
    const doc = near[0]!;
    const rivals = meetings.filter((o) => !byMeeting.has(o.external_id) && within(doc.date, o.date));
    if (rivals.length !== 1) {
      warnings.push(`${doc.filename}: fits ${rivals.length} meetings within ${toleranceDays} days; none used`);
      continue;
    }
    byMeeting.set(m.external_id, doc);
    used.add(doc.url);
    warnings.push(`minutes ${doc.filename} dated ${doc.date} matched to meeting ${m.external_id} (${day(m.date).toFormat('yyyy-MM-dd')}) within ${toleranceDays} days`);
  }
  return { byMeeting, warnings };
}

export type MinutesInput = {
  /** Past meetings to check (results mode), each with its date and optional minutes_url. */
  meetings: Meeting[];
  /** Known items of those meetings (Phase 1: items.json). Decided items are left alone. */
  items: Item[];
  /** Minutes index for meetings without minutes_url (llm_extract sources). */
  discovery?: Record<string, unknown>;
  tolerance_days: number;
  window: { from: Date; to: Date };
  llm: LlmClient | null;
  models: GeminiModels;
  http?: HttpOptions;
  pdfText?: (bytes: Uint8Array) => Promise<PdfText>;
  fetched_at?: string;
  /**
   * Reads outcomes without the LLM (mud_agenda, mud-code-parser-spec §6). When set, it replaces the
   * LLM call: it gets each minutes PDF and the meeting's open items, and returns updates, the
   * documents to store and warnings. `llm` is then not needed.
   */
  readOutcomes?: (args: { url: string; bytes: Uint8Array; meeting: Meeting; items: Item[] }) => Promise<MinutesOutput>;
};

export type MinutesOutput = { updates: ResultUpdate[]; documents: AdapterDocument[]; warnings: string[] };

/** Results mode for minutes-based sources. No minutes yet is normal: no updates and no error. */
export async function runMinutesResults(input: MinutesInput): Promise<MinutesOutput> {
  const out: MinutesOutput = { updates: [], documents: [], warnings: [] };
  const stamp = () => input.fetched_at ?? new Date().toISOString();
  const pdfText = input.pdfText ?? getPdfText;

  const open = (m: Meeting) => input.items.filter((i) => i.meeting_external_id === m.external_id && i.status !== 'decided');
  const meetings: Meeting[] = [];
  for (const m of input.meetings) {
    const t = Date.parse(m.date);
    if (Number.isNaN(t) || t < input.window.from.getTime() || t > input.window.to.getTime()) {
      out.warnings.push(`meeting ${m.external_id} (${m.date}) is outside the results window; skipped`);
      continue;
    }
    if (open(m).length === 0) {
      out.warnings.push(`meeting ${m.external_id}: no known items awaiting a result; skipped`);
      continue;
    }
    meetings.push(m);
  }
  if (meetings.length === 0) return out;

  const urls = new Map<string, string>();
  for (const m of meetings) if (m.minutes_url) urls.set(m.external_id, m.minutes_url);
  const needDiscovery = meetings.filter((m) => !urls.has(m.external_id));
  if (needDiscovery.length && input.discovery) {
    const earliest = DateTime.min(...needDiscovery.map((m) => day(m.date)))!.minus({ days: input.tolerance_days });
    try {
      const found = await discover(input.discovery, { from: earliest.toJSDate(), to: input.window.to }, { http: input.http });
      for (const p of found.pages) out.documents.push({ url: p.url, fetched_at: stamp(), content_hash: documentContentHash(p.html), raw: p.html, kind: 'html' });
      out.warnings.push(...found.warnings.map((w) => w.replace(/agenda PDFs/, 'minutes PDFs')));
      const paired = matchMinutesToMeetings(needDiscovery, found.docs, input.tolerance_days);
      out.warnings.push(...paired.warnings);
      for (const [id, doc] of paired.byMeeting) urls.set(id, doc.url);
    } catch (e) {
      out.warnings.push(`minutes discovery failed: ${(e as Error).message}`);
    }
  }

  let warnedNoLlm = false;
  for (const m of meetings) {
    const url = urls.get(m.external_id);
    if (!url) continue; // minutes not posted yet: normal
    if (input.readOutcomes) {
      try {
        const bytes = await getBytes(downloadUrl(url), input.http);
        const r = await input.readOutcomes({ url, bytes, meeting: m, items: open(m) });
        out.updates.push(...r.updates);
        out.documents.push(...r.documents);
        out.warnings.push(...r.warnings);
      } catch (e) {
        out.warnings.push(`${url}: minutes fetch failed: ${(e as Error).message}`);
      }
      continue;
    }
    if (!input.llm) {
      if (!warnedNoLlm) out.warnings.push('llm_unavailable: no OPENROUTER_API_KEY or GEMINI_API_KEY is set; minutes were not read');
      warnedNoLlm = true;
      out.warnings.push(`meeting ${m.external_id}: minutes found at ${url}`);
      continue;
    }
    let bytes: Uint8Array;
    let text: PdfText;
    try {
      bytes = await getBytes(url, input.http);
      text = await pdfText(bytes);
    } catch (e) {
      out.warnings.push(`${url}: minutes fetch failed: ${(e as Error).message}`);
      continue;
    }
    out.documents.push({ url, fetched_at: stamp(), content_hash: text.sha256, raw: text.text, kind: 'pdf_text' });
    const items = open(m);
    const scanned = !text.has_text_layer;
    const run = await runOutcomes(input.llm, input.models.extract, {
      pages: text.pages,
      scanned,
      pdf: bytes,
      items: items.map((i) => ({ agenda_number: i.agenda_number, title: i.title })),
    });
    run.raw.forEach((raw, i) => {
      if (raw) out.documents.push({ url: `${url}#llm=${run.model}&chunk=${i}`, fetched_at: stamp(), content_hash: documentContentHash(raw), raw, kind: 'llm_output' });
    });
    out.warnings.push(...run.errors.map((e) => `${url}: ${e}`));
    const built = buildResultUpdates(run.parsed, { meeting_external_id: m.external_id, items, url, fullText: text.text, scanned });
    out.updates.push(...built.updates);
    out.warnings.push(...built.warnings);
    if (scanned) out.warnings.push(`${url}: scanned minutes; quotes not verified, updates need review`);
  }
  return out;
}
