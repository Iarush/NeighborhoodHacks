import { inMaintenanceWindow } from '@/lib/adapters/boardbook';
import type { AdapterKind, RunMode, SourceConfig } from '@/lib/adapters/types';
import { DEFAULT_RESULTS_MAX_DAYS } from './health';
import { loadSources } from './registry';
import { runIngest, type RunOptions, type RunReport } from './run';
import { seedAll } from './seed';
import type { IngestStore, ResultsCandidate, StoredSource } from './store';

// One scheduled ingest call (agent-scraper-spec §9 P2-C), within a time budget:
//   1. seed bodies and sources
//   2. near-term sweep: every source, meetings in the next 72 hours (catches late-added items)
//   3. rotation: the source checked longest ago
//   4. results: up to 3 past meetings still waiting for an outcome
//   5. more rotation while time remains (the cron runs only a few times a day, so one source
//      per call would take days to cover them all)
// AI sources read at most one new agenda document per run; the rest are picked up next call.
// At scale (district coverage plan 0.8, ~550 sources), three things change:
//   - the near-term sweep visits only sources with a stored meeting in the next 72 hours once the
//     registry is larger than SWEEP_ALL_MAX (small registries keep sweeping every source);
//   - rotation goes by how overdue a source is (time since last check / its check interval);
//   - a call can take one shard of the sources (`shard`), so the GitHub Actions matrix runs
//     several calls, each under Vercel's 300-second limit.
// There's no news stage: lib/ingest may not import lib/news (D32), and news isn't needed for the demo.

export type Stage = 'near_term' | 'rotation' | 'results';
export type SkipReason = 'maintenance_window' | 'budget' | 'llm_limit';
export type RunSummary = Omit<RunReport, 'warning_text'> & { stage: Stage };
export type ScheduledReport = {
  ok: boolean;
  elapsed_ms: number;
  runs: RunSummary[];
  skipped: { source_id: string; stage: Stage; reason: SkipReason }[];
};

export type ScheduledOptions = {
  store: IngestStore;
  /** Defaults to data/sources.yaml. */
  sources?: SourceConfig[];
  now?: () => Date;
  /** Stop starting new runs once this much time has passed. Vercel functions here get 300 s. */
  budgetMs?: number;
  /** AI documents per AI-source run (null = no cap, for the laptop CLI). */
  maxLlmDocs?: number | null;
  /** Take only this shard of the sources (stable by source ID). */
  shard?: { index: number; count: number };
  /** Run a single source (the admin "run now" button, or a manual call). */
  only?: { sourceId: string; mode?: Stage; meetings?: string[] };
  /** Injected in tests. */
  run?: (opts: RunOptions) => Promise<RunReport>;
};

export const DEFAULT_BUDGET_MS = 270_000;
/** Don't start a source with less time than this left (AI sources need room for a PDF and a model call). */
const MIN_LEFT_MS = 45_000;
const AI_MIN_LEFT_MS = 150_000;
const RESULTS_PER_CALL = 3;
const RESULTS_RECHECK_MS = 24 * 3_600_000;
const DAY = 86_400_000;

const NEAR_TERM_MS = 72 * 3_600_000;
/** Up to this many sources, the near-term sweep visits all of them (agent-scraper-spec §9 P2-C). */
export const SWEEP_ALL_MAX = 25;
const DEFAULT_CHECK_EVERY_HOURS = 24;
/** Rotation runs per call that may read a new agenda with the model. Skipped AI sources stay most overdue, so they go first next call. */
const AI_READS_PER_CALL = 2;

const AI: ReadonlySet<AdapterKind> = new Set(['primegov', 'llm_extract']);
const SWEEP_ORDER: AdapterKind[] = ['legistar', 'manual', 'boardbook', 'primegov', 'llm_extract'];

/** Stable shard for a source ID (FNV-1a), so a source always lands in the same matrix job. */
export function shardOf(id: string, count: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  return (h >>> 0) % count;
}

/** How often a source wants a rotation check: `check_every_hours` in its config, else 24. */
export function checkEveryMs(source: SourceConfig | undefined): number {
  const h = source?.config.check_every_hours;
  return (typeof h === 'number' && h > 0 ? h : DEFAULT_CHECK_EVERY_HOURS) * 3_600_000;
}

/**
 * Source IDs by how overdue they are: never-checked first, then (time since last check) / (check
 * interval), largest first. With equal intervals that's oldest first.
 */
export function rotationOrder(rows: Pick<StoredSource, 'id' | 'last_checked'>[], sources: SourceConfig[] = [], now?: Date): string[] {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const at = now?.getTime() ?? Math.max(0, ...rows.map((r) => (r.last_checked ? Date.parse(r.last_checked) : 0)));
  const overdue = (r: Pick<StoredSource, 'id' | 'last_checked'>) =>
    r.last_checked === null ? Infinity : (at - Date.parse(r.last_checked)) / checkEveryMs(byId.get(r.id));
  return [...rows]
    .sort((a, b) => {
      const oa = overdue(a);
      const ob = overdue(b);
      if (oa === ob) return a.id.localeCompare(b.id);
      return ob - oa;
    })
    .map((r) => r.id);
}

/** Past meetings worth rechecking for outcomes: within the source's results_max_days, not checked in 24 hours. */
export function pickResultsMeetings(cands: ResultsCandidate[], sources: SourceConfig[], now: Date, limit = RESULTS_PER_CALL): ResultsCandidate[] {
  const byId = new Map(sources.map((s) => [s.id, s]));
  return cands
    .filter((c) => {
      const s = byId.get(c.source_id);
      if (!s || s.adapter === 'boardbook' || s.adapter === 'manual') return false; // no results mode for these yet
      const maxDays = typeof s.config.results_max_days === 'number' ? s.config.results_max_days : DEFAULT_RESULTS_MAX_DAYS;
      if (now.getTime() - Date.parse(c.date) > maxDays * DAY) return false;
      return !c.last_results_check || now.getTime() - Date.parse(c.last_results_check) >= RESULTS_RECHECK_MS;
    })
    .sort((a, b) => {
      if (!a.last_results_check !== !b.last_results_check) return a.last_results_check ? 1 : -1;
      return Date.parse(b.date) - Date.parse(a.date);
    })
    .slice(0, limit);
}

export async function runScheduled(opts: ScheduledOptions): Promise<ScheduledReport> {
  const { store } = opts;
  const clock = opts.now ?? (() => new Date());
  const run = opts.run ?? runIngest;
  const all = opts.sources ?? loadSources();
  const sources = opts.shard && !opts.only ? all.filter((s) => shardOf(s.id, opts.shard!.count) === opts.shard!.index) : all;
  const budget = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const cap = opts.maxLlmDocs === undefined ? 1 : opts.maxLlmDocs;
  const started = clock().getTime();
  const left = () => budget - (clock().getTime() - started);
  const report: ScheduledReport = { ok: true, elapsed_ms: 0, runs: [], skipped: [] };
  const byId = new Map(sources.map((s) => [s.id, s]));

  await seedAll(store, sources);

  const runOne = async (source: SourceConfig, stage: Stage, mode: RunMode) => {
    const r = await run({
      store,
      source,
      mode,
      now: clock,
      ...(AI.has(source.adapter) && cap !== null ? { maxLlmDocs: cap } : {}),
    });
    const { warning_text: _text, ...summary } = r;
    report.runs.push({ ...summary, stage });
    if (!r.ok) report.ok = false;
    return r;
  };
  const blocked = (source: SourceConfig, stage: Stage): boolean => {
    if (source.adapter === 'boardbook' && inMaintenanceWindow(clock())) {
      report.skipped.push({ source_id: source.id, stage, reason: 'maintenance_window' });
      return true;
    }
    if (left() < (AI.has(source.adapter) ? AI_MIN_LEFT_MS : MIN_LEFT_MS)) {
      report.skipped.push({ source_id: source.id, stage, reason: 'budget' });
      return true;
    }
    return false;
  };
  const finish = () => {
    report.elapsed_ms = clock().getTime() - started;
    return report;
  };

  if (opts.only) {
    const source = byId.get(opts.only.sourceId);
    if (!source) throw new Error(`unknown source: ${opts.only.sourceId}`);
    const stage = opts.only.mode ?? 'rotation';
    const mode: RunMode = stage === 'results' ? { kind: 'results', meeting_external_ids: opts.only.meetings ?? [] } : { kind: stage };
    await runOne(source, stage, mode);
    return finish();
  }

  // 2. Near-term sweep, deterministic sources first.
  let near = sources;
  if (all.length > SWEEP_ALL_MAX) {
    const soon = new Set(await store.sourcesWithMeetingsBetween(clock(), new Date(clock().getTime() + NEAR_TERM_MS)));
    near = sources.filter((s) => soon.has(s.id));
  }
  const sweep = [...near].sort((a, b) => SWEEP_ORDER.indexOf(a.adapter) - SWEEP_ORDER.indexOf(b.adapter));
  for (const s of sweep) if (!blocked(s, 'near_term')) await runOne(s, 'near_term', { kind: 'near_term' });

  // 3–5. Rotation (oldest first), with the results recheck after the first one.
  const order = rotationOrder(await store.listSources(), sources, clock()).filter((id) => byId.has(id));
  let aiRotations = 0;
  const rotate = async (id: string) => {
    const s = byId.get(id)!;
    if (AI.has(s.adapter) && aiRotations >= AI_READS_PER_CALL) {
      report.skipped.push({ source_id: s.id, stage: 'rotation', reason: 'llm_limit' });
      return;
    }
    if (blocked(s, 'rotation')) return;
    const r = await runOne(s, 'rotation', { kind: 'rotation' });
    // Only a run that read a new document used the model; a quiet check costs one page fetch.
    if (AI.has(s.adapter) && r.pdf_documents > 0) aiRotations++;
  };
  if (order.length) await rotate(order[0]!);

  const due = pickResultsMeetings(await store.resultsCandidates(clock()), sources, clock());
  const bySource = new Map<string, string[]>();
  for (const c of due) bySource.set(c.source_id, [...(bySource.get(c.source_id) ?? []), c.external_id]);
  for (const [id, meetings] of bySource) {
    const s = byId.get(id)!;
    if (!blocked(s, 'results')) await runOne(s, 'results', { kind: 'results', meeting_external_ids: meetings });
  }

  for (const id of order.slice(1)) await rotate(id);
  return finish();
}
