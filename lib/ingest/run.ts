import { DateTime } from 'luxon';
import {
  AdapterResultSchema,
  type Adapter,
  type AdapterKind,
  type AdapterResult,
  type Amount,
  type Item,
  type Meeting,
  type RunMode,
  type SourceConfig,
} from '@/lib/adapters/types';
import type { Json } from '@/lib/database.types';
import { classify as p3Classify } from '@/lib/rules/classify';
import { loadAdapter } from './adapters';
import { itemContentHash, meetingContentHash } from './hash';
import { DEFAULT_RESULTS_MAX_DAYS, health, type HealthHistory } from './health';
import { createLlmBudget } from './llmSpend';
import { ZONE, nearTermWindow, resultsWindow, rotationWindow } from './normalize';
import type { BodyFacts, DocumentWrite, IngestStore, ItemWrite, MeetingWrite, SourceSnapshot, StoredItem, StoredMeeting, TaxRateRow } from './store';

// Phase 2 upsert pipeline (agent-scraper-spec §9 P2-B): run one source's adapter and write what
// changed to the database. Running it twice with the same input writes nothing.
//
// Rules worth knowing:
// - A meeting or item missing from a run is never treated as gone. Items are marked removed only
//   for meetings that came back with items in this run (an unchanged PDF is skipped by the adapter,
//   and a failed AI call returns a meeting with no items).
// - A decided item never moves back to upcoming or awaiting_result.
// - Previous document hashes are passed back to the adapter only for documents that produced stored
//   items, so an agenda whose AI extraction failed is retried on the next run.
// - Only rotation runs set sources.last_checked, so "oldest last_checked" still picks the next source to rotate.

/** documents.raw above this many characters is stored as null (the hash is kept). */
export const MAX_DOCUMENT_RAW = 1_000_000;

/** Adapters whose items are read from agenda PDFs by the AI (they go through review when they could text). */
const AI_ADAPTERS: ReadonlySet<AdapterKind> = new Set(['llm_extract', 'primegov', 'diligent', 'boarddocs']);

export type Tier = 'sms' | 'weekly' | 'timeline';
export type IngestClassification = { item_type: string; tier: Tier; rule_fired?: string };
export type ClassifiableItem = Pick<Item, 'title' | 'status' | 'contains_private_person'> & {
  description?: string;
  section?: string;
  matter_type?: string;
  amounts?: Item['amounts'];
};
/** P3's classify() (lib/rules/classify.ts) fits this; the 4th argument carries a meeting's date change. */
export type IngestClassifier = (
  item: ClassifiableItem,
  body: { id: string; sms_eligible: boolean; type: string },
  taxRates: unknown,
  meeting?: { date: string; previous_date?: string | null },
) => IngestClassification;

export type RunOptions = {
  store: IngestStore;
  source: SourceConfig;
  mode: RunMode;
  /** Defaults to the mode's window (rotation: today +30 days; near_term: +72 hours; results: the source's results_max_days). */
  window?: { from: Date; to: Date };
  /** Defaults to the source's adapter. */
  adapter?: Adapter;
  /** Defaults to P3's classify(). */
  classify?: IngestClassifier;
  now?: () => Date;
  /** Compute the report without writing anything. */
  dryRun?: boolean;
  /** Cap on agenda documents the AI reads in this run (the rest wait for the next run). */
  maxLlmDocs?: number;
};

export type RunReport = {
  source_id: string;
  mode: RunMode['kind'];
  /** False only when the adapter failed and nothing was written. */
  ok: boolean;
  /** False when health() raised an error flag. */
  healthy: boolean;
  error?: string;
  flags: string[];
  warnings: number;
  /** Warning text, for the local CLI only. Never returned by the cron route (it can quote agenda text). */
  warning_text: string[];
  meetings: { inserted: number; updated: number; unchanged: number; moved: number };
  items: { inserted: number; updated: number; unchanged: number; removed: number; restored: number; awaiting: number; skipped_unknown_body: number };
  result_updates: { applied: number; skipped_unverified: number; unknown_item: number };
  documents: number;
  /** New PDF text among `documents`: the runs that may have called the model (the scheduler's AI limit). */
  pdf_documents: number;
  elapsed_ms: number;
};

function emptyReport(sourceId: string, mode: RunMode['kind']): RunReport {
  return {
    source_id: sourceId,
    mode,
    ok: true,
    healthy: true,
    flags: [],
    warnings: 0,
    warning_text: [],
    meetings: { inserted: 0, updated: 0, unchanged: 0, moved: 0 },
    items: { inserted: 0, updated: 0, unchanged: 0, removed: 0, restored: 0, awaiting: 0, skipped_unknown_body: 0 },
    result_updates: { applied: 0, skipped_unverified: 0, unknown_item: 0 },
    documents: 0,
    pdf_documents: 0,
    elapsed_ms: 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Pure helpers

const nul = <T>(v: T | undefined): T | null => (v === undefined ? null : v);
const opt = <T>(v: T | null): T | undefined => (v === null ? undefined : v);

/** JSON with sorted keys and undefined dropped, so jsonb values compare equal whatever their key order. */
function canonical(v: unknown): string {
  return JSON.stringify(v ?? null, (_k, val: unknown) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(
          Object.entries(val as Record<string, unknown>)
            .filter(([, x]) => x !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : val,
  );
}

const TIME_KEYS = new Set(['date', 'end_date', 'previous_date', 'first_seen_at', 'removed_at']);

/** True when every column in `write` already has that value in `stored`. Timestamps compare as instants. */
export function sameRow(write: object, stored: object): boolean {
  const s = stored as Record<string, unknown>;
  for (const [k, v] of Object.entries(write)) {
    const was = s[k] ?? null;
    if (TIME_KEYS.has(k)) {
      const a = v == null ? null : Date.parse(v as string);
      const b = was == null ? null : Date.parse(was as string);
      if (a !== b) return false;
    } else if (canonical(v) !== canonical(was)) return false;
  }
  return true;
}

export function reviewStatusFor(a: {
  adapter: AdapterKind;
  tier: string | null;
  quoteVerified: boolean | null | undefined;
  prev?: { review_status: string | null };
  changed: boolean;
}): ItemWrite['review_status'] {
  const needsReview = a.quoteVerified === false || (AI_ADAPTERS.has(a.adapter) && a.tier === 'sms');
  if (!a.prev) return needsReview ? 'pending' : null;
  const stored = a.prev.review_status as ItemWrite['review_status'];
  if (!a.changed) return stored;
  if (needsReview) return 'pending'; // includes D16: approved, changed, still sms
  return stored === 'pending' ? null : stored;
}

export function asMeeting(row: StoredMeeting): Meeting {
  return {
    external_id: row.external_id,
    body_id: row.body_id ?? '',
    date: row.date,
    ...(row.end_date ? { end_date: row.end_date } : {}),
    type: row.type === 'special' ? 'special' : 'regular',
    status: row.status === 'cancelled' ? 'cancelled' : 'scheduled',
    agenda_url: row.agenda_url ?? '',
    ...(row.source_url_es ? { source_url_es: row.source_url_es } : {}),
    ...(row.video_url ? { video_url: row.video_url } : {}),
    ...(row.minutes_url ? { minutes_url: row.minutes_url } : {}),
    ...(row.comment_rules_text ? { comment_rules_text: row.comment_rules_text } : {}),
  };
}

export function asItem(row: StoredItem, meetingExternalId: string): Item {
  const out: Item = {
    external_id: row.external_id,
    meeting_external_id: meetingExternalId,
    body_id: row.body_id ?? '',
    title: row.title,
    status: row.status as Item['status'],
    amounts: (Array.isArray(row.amounts) ? row.amounts : []) as unknown as Amount[],
    attachments: (Array.isArray(row.attachments) ? row.attachments : []) as unknown as Item['attachments'],
    contains_private_person: row.contains_private_person,
    source_url: row.source_url,
  };
  const optional = {
    agenda_number: opt(row.agenda_number),
    section: opt(row.section),
    description: opt(row.description),
    matter_type: opt(row.matter_type),
    action: opt(row.action),
    vote_result: opt(row.vote_result) as Item['vote_result'],
    source_quote: opt(row.source_quote),
    quote_verified: opt(row.quote_verified),
  };
  for (const [k, v] of Object.entries(optional)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}

/** Stored meetings and their live items, for results mode (Step 10 needs what's already known). */
export function toKnown(snap: SourceSnapshot, meetingExternalIds: string[]): { meetings: Meeting[]; items: Item[] } {
  const want = new Set(meetingExternalIds);
  const meetings = snap.meetings.filter((m) => want.has(m.external_id));
  const byId = new Map(meetings.map((m) => [m.id, m]));
  return {
    meetings: meetings.map(asMeeting),
    items: snap.items
      .filter((i) => !i.removed_at && i.meeting_id && byId.has(i.meeting_id))
      .map((i) => asItem(i, byId.get(i.meeting_id!)!.external_id)),
  };
}

export function healthHistory(snap: SourceSnapshot): HealthHistory {
  const meetingExt = new Map(snap.meetings.map((m) => [m.id, m.external_id]));
  return {
    meetings: snap.meetings.map(asMeeting),
    items: snap.items.filter((i) => !i.removed_at && i.meeting_id && meetingExt.has(i.meeting_id)).map((i) => asItem(i, meetingExt.get(i.meeting_id!)!)),
    tax_items_seen: snap.items.map((i) => i.external_id),
    comment_rules_missing_reported: snap.source?.last_flags?.includes('comment_rules_missing') ?? false,
  };
}

/** The latest hash per document URL, but only for URLs that produced at least one live stored item. */
export function prevDocumentHashes(snap: SourceSnapshot): Record<string, string> {
  const withItems = new Set(snap.items.filter((i) => !i.removed_at).map((i) => i.source_url));
  const out: Record<string, string> = {};
  for (const d of snap.documents) if (d.url && d.content_hash && withItems.has(d.url)) out[d.url] = d.content_hash;
  return out;
}

function storedItemWrite(s: StoredItem): ItemWrite {
  return {
    source_id: s.source_id,
    external_id: s.external_id,
    meeting_id: s.meeting_id ?? '',
    body_id: s.body_id ?? '',
    meeting_body_id: s.meeting_body_id,
    agenda_number: s.agenda_number,
    title: s.title,
    section: s.section,
    description: s.description,
    matter_type: s.matter_type,
    item_type: s.item_type,
    status: s.status as ItemWrite['status'],
    action: s.action,
    vote_result: s.vote_result as ItemWrite['vote_result'],
    tier: s.tier as ItemWrite['tier'],
    rule_fired: s.rule_fired,
    review_status: s.review_status as ItemWrite['review_status'],
    source_quote: s.source_quote,
    quote_verified: s.quote_verified,
    amounts: s.amounts,
    attachments: s.attachments,
    contains_private_person: s.contains_private_person,
    needs_story: s.needs_story,
    source_url: s.source_url,
    content_hash: s.content_hash ?? '',
    first_seen_at: s.first_seen_at,
    removed_at: s.removed_at,
    is_demo: s.is_demo,
  };
}

function storedMeetingWrite(m: StoredMeeting): MeetingWrite {
  return {
    source_id: m.source_id,
    external_id: m.external_id,
    body_id: m.body_id ?? '',
    date: m.date,
    end_date: m.end_date,
    type: m.type === 'special' ? 'special' : 'regular',
    status: m.status === 'cancelled' ? 'cancelled' : 'scheduled',
    agenda_url: m.agenda_url,
    source_url_es: m.source_url_es,
    video_url: m.video_url,
    minutes_url: m.minutes_url,
    comment_rules_text: m.comment_rules_text,
    content_hash: m.content_hash ?? '',
    previous_date: m.previous_date,
    is_demo: m.is_demo,
  };
}

function meetingWrite(sourceId: string, m: Meeting, prev: StoredMeeting | undefined, moved: boolean): MeetingWrite {
  return {
    source_id: sourceId,
    external_id: m.external_id,
    body_id: m.body_id,
    date: m.date,
    end_date: nul(m.end_date),
    type: m.type,
    status: m.status,
    agenda_url: m.agenda_url || null,
    source_url_es: nul(m.source_url_es),
    video_url: nul(m.video_url),
    minutes_url: m.minutes_url ?? prev?.minutes_url ?? null,
    comment_rules_text: nul(m.comment_rules_text),
    content_hash: meetingContentHash(m),
    previous_date: moved ? prev!.date : (prev?.previous_date ?? null),
    is_demo: m.is_demo ?? false,
  };
}

function itemHash(v: { title: string; status: Item['status']; action: string | null; vote_result: string | null; amounts: Json }): string {
  return itemContentHash({
    title: v.title,
    status: v.status,
    action: opt(v.action),
    vote_result: opt(v.vote_result) as Item['vote_result'],
    amounts: (Array.isArray(v.amounts) ? v.amounts : []) as unknown as Amount[],
  });
}

function dedupe<T>(rows: T[], key: (r: T) => string): T[] {
  const m = new Map<string, T>();
  for (const r of rows) m.set(key(r), r);
  return [...m.values()];
}

function defaultWindow(mode: RunMode, source: SourceConfig, now: Date): { from: Date; to: Date } {
  const n = DateTime.fromJSDate(now, { zone: ZONE });
  if (mode.kind === 'near_term') return nearTermWindow(n);
  if (mode.kind === 'results') {
    const max = typeof source.config.results_max_days === 'number' ? source.config.results_max_days : DEFAULT_RESULTS_MAX_DAYS;
    return resultsWindow(max, n);
  }
  return rotationWindow(n);
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);
const facts = (b: BodyFacts) => ({ id: b.id, sms_eligible: b.sms_eligible, type: b.type ?? 'other' });

// ---------------------------------------------------------------------------------------------

export async function runIngest(opts: RunOptions): Promise<RunReport> {
  const started = Date.now();
  const { store, source } = opts;
  const now = (opts.now ?? (() => new Date()))();
  const nowIso = now.toISOString();
  const classify: IngestClassifier = opts.classify ?? p3Classify;
  const report = emptyReport(source.id, opts.mode.kind);
  const warnings: string[] = [];
  const finish = () => {
    report.warnings = warnings.length;
    report.warning_text = warnings;
    report.elapsed_ms = Date.now() - started;
    return report;
  };

  // 1. Load what's stored.
  const snap = await store.snapshot(source.id);
  let mode = opts.mode;
  if (mode.kind === 'results' && !mode.known) mode = { ...mode, known: toKnown(snap, mode.meeting_external_ids) };
  const window = opts.window ?? defaultWindow(mode, source, now);
  const runSource = opts.maxLlmDocs ? { ...source, config: { ...source.config, max_llm_docs: opts.maxLlmDocs } } : source;
  const history = healthHistory(snap);

  // 2. Run the adapter. A failure writes no rows, only the source's health.
  let result: AdapterResult;
  try {
    const adapter = opts.adapter ?? (await loadAdapter(source.adapter));
    const ocrTexts = source.adapter === 'mud_agenda' && mode.kind !== 'results' ? await store.ocrTexts(source.id) : undefined;
    // §4.1: the monthly LLM cap. Dry runs get none, so the LLM rung is off and nothing is spent uncounted.
    const llmBudget = source.adapter === 'mud_agenda' && mode.kind !== 'results' && !opts.dryRun ? createLlmBudget(store, now) : undefined;
    result = AdapterResultSchema.parse(
      await adapter.run(runSource, mode, window, { documentHashes: prevDocumentHashes(snap), ...(ocrTexts ? { ocrTexts } : {}), ...(llmBudget ? { llmBudget } : {}) }),
    );
  } catch (e) {
    const message = errorText(e);
    const h = health({ fetch_error: message }, history, source, now);
    Object.assign(report, { ok: false, healthy: false, error: message, flags: h.flags });
    if (!opts.dryRun) await store.updateSource(source.id, { last_error: message, last_flags: h.flags });
    return finish();
  }
  warnings.push(...result.warnings);

  const meetingsIn = dedupe(result.meetings, (m) => m.external_id);
  const itemsIn = dedupe(result.items, (i) => i.external_id);
  const bodyIds = [...new Set([...meetingsIn.map((m) => m.body_id), ...itemsIn.map((i) => i.body_id), ...snap.items.map((i) => i.body_id ?? '')])].filter(Boolean);
  const bodies = new Map((await store.bodies(bodyIds)).map((b) => [b.id, b]));
  const rates: Map<string, TaxRateRow> = bodies.size ? await store.taxRates([...bodies.keys()]) : new Map();
  const ratesFor = (bodyId: string) => rates.get(bodyId) ?? null;

  const storedMeetingByExt = new Map(snap.meetings.map((m) => [m.external_id, m]));
  const storedMeetingById = new Map(snap.meetings.map((m) => [m.id, m]));
  const storedItemByExt = new Map(snap.items.map((i) => [i.external_id, i]));

  // 3. Meetings. `current` is each meeting as it stands after this run.
  const meetingWrites = new Map<string, MeetingWrite>();
  const moved = new Set<string>();
  const skippedMeetings = new Set<string>();
  const current = new Map<string, { date: string; status: string; previous_date: string | null; body_id: string | null }>();
  for (const s of snap.meetings) current.set(s.external_id, { date: s.date, status: s.status, previous_date: s.previous_date, body_id: s.body_id });
  for (const m of meetingsIn) {
    if (!bodies.has(m.body_id)) {
      skippedMeetings.add(m.external_id);
      warnings.push(`meeting ${m.external_id}: body ${m.body_id} has no bodies row; skipped`);
      continue;
    }
    const prev = storedMeetingByExt.get(m.external_id);
    const isMoved = !!prev && Date.parse(prev.date) !== Date.parse(m.date);
    const w = meetingWrite(source.id, m, prev, isMoved);
    current.set(m.external_id, { date: w.date, status: w.status, previous_date: w.previous_date, body_id: w.body_id });
    if (isMoved) {
      moved.add(m.external_id);
      report.meetings.moved++;
    }
    if (!prev) {
      report.meetings.inserted++;
      meetingWrites.set(m.external_id, w);
    } else if (!sameRow(w, prev)) {
      report.meetings.updated++;
      meetingWrites.set(m.external_id, w);
    } else report.meetings.unchanged++;
  }

  // 4–5. Items from the adapter: hash, classify on change, review status.
  const itemWrites = new Map<string, ItemWrite>();
  const itemMeeting = new Map<string, string>(); // item external_id -> meeting external_id
  for (const s of snap.items) {
    const m = s.meeting_id ? storedMeetingById.get(s.meeting_id) : undefined;
    if (m) itemMeeting.set(s.external_id, m.external_id);
  }
  const seenIncoming = new Set<string>();
  const incomingByMeeting = new Map<string, Set<string>>();
  for (const it of itemsIn) {
    if (skippedMeetings.has(it.meeting_external_id)) continue;
    const mt = current.get(it.meeting_external_id);
    if (!mt) {
      warnings.push(`item ${it.external_id}: meeting ${it.meeting_external_id} is unknown; skipped`);
      continue;
    }
    const body = bodies.get(it.body_id);
    if (!body) {
      report.items.skipped_unknown_body++;
      warnings.push(`item ${it.external_id}: body ${it.body_id} has no bodies row; skipped`);
      continue;
    }
    seenIncoming.add(it.external_id);
    itemMeeting.set(it.external_id, it.meeting_external_id);
    if (!incomingByMeeting.has(it.meeting_external_id)) incomingByMeeting.set(it.meeting_external_id, new Set());
    incomingByMeeting.get(it.meeting_external_id)!.add(it.external_id);

    const prev = storedItemByExt.get(it.external_id);
    let status = it.status;
    let action = nul(it.action);
    let vote = nul(it.vote_result);
    if (prev?.status === 'decided' && it.status !== 'decided' && !it.vote_result) {
      // A refetch without an outcome never undoes a recorded decision.
      status = 'decided';
      action = prev.action;
      vote = prev.vote_result as ItemWrite['vote_result'];
    }
    const amounts = it.amounts as unknown as Json;
    const hash = itemHash({ title: it.title, status, action, vote_result: vote, amounts });
    const reclassify = !prev || prev.content_hash !== hash || moved.has(it.meeting_external_id);
    const cls: IngestClassification =
      reclassify || !prev?.tier
        ? classify(
            { ...it, status },
            facts(body),
            ratesFor(body.id),
            moved.has(it.meeting_external_id) ? { date: mt.date, previous_date: mt.previous_date } : { date: mt.date },
          )
        : { item_type: prev.item_type ?? 'other', tier: prev.tier as Tier, rule_fired: opt(prev.rule_fired) };
    const w: ItemWrite = {
      source_id: source.id,
      external_id: it.external_id,
      meeting_id: storedMeetingByExt.get(it.meeting_external_id)?.id ?? '',
      body_id: it.body_id,
      meeting_body_id: mt.body_id,
      agenda_number: nul(it.agenda_number),
      title: it.title,
      section: nul(it.section),
      description: nul(it.description),
      matter_type: nul(it.matter_type),
      item_type: cls.item_type,
      status,
      action,
      vote_result: vote,
      tier: cls.tier,
      rule_fired: cls.rule_fired ?? null,
      review_status: reviewStatusFor({ adapter: source.adapter, tier: cls.tier, quoteVerified: it.quote_verified, prev, changed: reclassify }),
      source_quote: nul(it.source_quote),
      quote_verified: nul(it.quote_verified),
      amounts,
      attachments: it.attachments as unknown as Json,
      contains_private_person: it.contains_private_person,
      needs_story: !prev || reclassify ? true : prev.needs_story,
      source_url: it.source_url,
      content_hash: hash,
      first_seen_at: prev?.first_seen_at ?? nowIso,
      removed_at: null,
      is_demo: it.is_demo ?? false,
    };
    if (!prev) report.items.inserted++;
    else if (!sameRow(w, prev)) {
      report.items.updated++;
      if (prev.removed_at) report.items.restored++;
    } else {
      report.items.unchanged++;
      continue;
    }
    itemWrites.set(it.external_id, w);
  }

  // 6. Items gone from a meeting that came back with items. Rows are never deleted.
  for (const [mExt, incoming] of incomingByMeeting) {
    const sm = storedMeetingByExt.get(mExt);
    if (!sm) continue;
    for (const s of snap.items) {
      if (s.meeting_id !== sm.id || s.removed_at || incoming.has(s.external_id)) continue;
      itemWrites.set(s.external_id, { ...storedItemWrite(s), removed_at: nowIso });
      report.items.removed++;
    }
  }

  // 7a. Upcoming -> awaiting_result once the meeting has started (not for cancelled meetings).
  for (const s of snap.items) {
    if (s.removed_at || s.status !== 'upcoming' || seenIncoming.has(s.external_id) || itemWrites.has(s.external_id)) continue;
    const sm = s.meeting_id ? storedMeetingById.get(s.meeting_id) : undefined;
    const mt = sm ? current.get(sm.external_id) : undefined;
    if (!mt || mt.status === 'cancelled' || Date.parse(mt.date) > now.getTime()) continue;
    const base = storedItemWrite(s);
    itemWrites.set(s.external_id, {
      ...base,
      status: 'awaiting_result',
      content_hash: itemHash({ title: base.title, status: 'awaiting_result', action: base.action, vote_result: base.vote_result, amounts: base.amounts }),
    });
    report.items.awaiting++;
  }

  // 7b. Outcomes (ResultUpdate). Unverified quotes wait (no review row exists for them yet); items are never created from minutes.
  for (const u of result.result_updates) {
    if (u.quote_verified === false) {
      report.result_updates.skipped_unverified++;
      continue;
    }
    const stored = storedItemByExt.get(u.item_external_id);
    const base = itemWrites.get(u.item_external_id) ?? (stored ? storedItemWrite(stored) : undefined);
    if (!base || itemMeeting.get(u.item_external_id) !== u.meeting_external_id) {
      report.result_updates.unknown_item++;
      warnings.push(`result for unknown item ${u.item_external_id} (meeting ${u.meeting_external_id}); skipped`);
      continue;
    }
    if (base.status === 'decided' && base.action === u.action && base.vote_result === u.vote_result) continue;
    const body = bodies.get(base.body_id);
    const mt = current.get(u.meeting_external_id);
    const decidedItem: ClassifiableItem = {
      title: base.title,
      status: 'decided',
      contains_private_person: base.contains_private_person,
      ...(base.description ? { description: base.description } : {}),
      ...(base.section ? { section: base.section } : {}),
      ...(base.matter_type ? { matter_type: base.matter_type } : {}),
      amounts: (Array.isArray(base.amounts) ? base.amounts : []) as unknown as Amount[],
    };
    const cls: IngestClassification = body
      ? classify(decidedItem, facts(body), ratesFor(body.id), mt ? { date: mt.date } : undefined)
      : { item_type: base.item_type ?? 'other', tier: (base.tier ?? 'timeline') as Tier, rule_fired: opt(base.rule_fired) };
    itemWrites.set(u.item_external_id, {
      ...base,
      status: 'decided',
      action: u.action,
      vote_result: u.vote_result,
      item_type: cls.item_type,
      tier: cls.tier,
      rule_fired: cls.rule_fired ?? null,
      review_status: reviewStatusFor({ adapter: source.adapter, tier: cls.tier, quoteVerified: base.quote_verified, prev: stored, changed: true }),
      needs_story: true,
      content_hash: itemHash({ title: base.title, status: 'decided', action: u.action, vote_result: u.vote_result, amounts: base.amounts }),
    });
    report.result_updates.applied++;
    // Outcomes from minutes record where they came from (Legistar outcomes come with the agenda data).
    if (AI_ADAPTERS.has(source.adapter)) {
      const sm = storedMeetingByExt.get(u.meeting_external_id);
      const mw = meetingWrites.get(u.meeting_external_id) ?? (sm ? storedMeetingWrite(sm) : undefined);
      if (mw && !mw.minutes_url) {
        if (!meetingWrites.has(u.meeting_external_id)) report.meetings.updated++;
        meetingWrites.set(u.meeting_external_id, { ...mw, minutes_url: u.source_url });
      }
    }
  }

  // 9. Documents: new (url, hash) pairs only; huge raw text is dropped, the hash kept.
  const knownDocs = new Set(snap.documents.map((d) => `${d.url}\u0000${d.content_hash}`));
  const urlMeeting = new Map<string, string>();
  for (const m of meetingsIn) if (m.agenda_url) urlMeeting.set(m.agenda_url, m.external_id);
  for (const i of itemsIn) if (!urlMeeting.has(i.source_url)) urlMeeting.set(i.source_url, i.meeting_external_id);
  const documentWrites: DocumentWrite[] = [];
  for (const d of result.documents) {
    const k = `${d.url}\u0000${d.content_hash}`;
    if (knownDocs.has(k)) continue;
    knownDocs.add(k);
    documentWrites.push({
      source_id: source.id,
      url: d.url,
      content_hash: d.content_hash,
      kind: d.kind,
      raw: d.raw.length > MAX_DOCUMENT_RAW ? null : d.raw,
      fetched_at: d.fetched_at,
      meeting_external_id: urlMeeting.get(d.url) ?? null,
      ...(d.needs_ocr !== undefined ? { needs_ocr: d.needs_ocr } : {}),
      ...(d.parse_rung !== undefined ? { parse_rung: d.parse_rung } : {}),
      ...(d.parse_profile !== undefined ? { parse_profile: d.parse_profile } : {}),
    });
  }
  report.documents = documentWrites.length;
  report.pdf_documents = documentWrites.filter((d) => d.kind === 'pdf_text').length;

  // 10. Health.
  const h = health({ agenda: result }, history, source, now);
  report.flags = h.flags;
  report.healthy = h.ok;

  if (opts.dryRun) return finish();

  // Writes: meetings first (new items need their IDs), then items, documents and the source.
  const meetingIds = new Map(snap.meetings.map((m) => [m.external_id, m.id]));
  if (meetingWrites.size) for (const r of await store.upsertMeetings([...meetingWrites.values()])) meetingIds.set(r.external_id, r.id);
  const itemRows: ItemWrite[] = [];
  for (const [ext, w] of itemWrites) {
    const meetingId = w.meeting_id || meetingIds.get(itemMeeting.get(ext) ?? '');
    if (!meetingId) {
      warnings.push(`item ${ext}: no meeting row; skipped`);
      continue;
    }
    itemRows.push({ ...w, meeting_id: meetingId });
  }
  if (itemRows.length) await store.upsertItems(itemRows);
  if (documentWrites.length) await store.insertDocuments(documentWrites);
  if (mode.kind === 'results') {
    const checked = mode.meeting_external_ids.map((e) => meetingIds.get(e)).filter((x): x is string => !!x);
    if (checked.length) await store.markResultsChecked(checked, nowIso);
  }
  await store.updateSource(source.id, {
    last_success: nowIso,
    last_flags: h.flags,
    last_error: null,
    ...(mode.kind === 'rotation' ? { last_checked: nowIso } : {}),
  });
  return finish();
}
