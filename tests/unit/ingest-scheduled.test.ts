import { describe, expect, it } from 'vitest';
import type { SourceConfig } from '@/lib/adapters/types';
import { createMemoryStore } from '@/lib/ingest/memoryStore';
import type { RunOptions, RunReport } from '@/lib/ingest/run';
import { pickResultsMeetings, rotationOrder, runScheduled, shardOf, SWEEP_ALL_MAX } from '@/lib/ingest/scheduled';
import type { ResultsCandidate, StoredSource } from '@/lib/ingest/store';

const SOURCES: SourceConfig[] = [
  { id: 'hc_commissioners_court', body_id: 'commissioners_court', adapter: 'legistar', config: {} },
  { id: 'hisd_board', body_id: 'hisd_board', adapter: 'legistar', config: {} },
  { id: 'cfisd_board', body_id: 'cfisd_board', adapter: 'boardbook', config: {} },
  { id: 'houston_city_council', body_id: 'houston_city_council', adapter: 'primegov', config: {} },
  { id: 'lone_star_board', body_id: 'lone_star_board', adapter: 'llm_extract', config: {} },
  { id: 'hcmud_489', body_id: 'hcmud_489', adapter: 'llm_extract', config: { results_max_days: 75 } },
  { id: 'manual', adapter: 'manual', config: { dir: 'data/manual' } },
];
const DAY = 86_400_000;
const NOON = new Date('2026-10-20T12:00:00-05:00');
const NIGHT = new Date('2026-10-20T03:00:00-05:00');

function stubReport(o: RunOptions): RunReport {
  return {
    source_id: o.source.id,
    mode: o.mode.kind,
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

/** A fake runIngest on a fake clock: every run "takes" `costMs`; `docs` says how many new documents it read. */
function harness(start: Date, costMs = 1000, docs: (o: RunOptions) => number = () => 0) {
  let t = start.getTime();
  const calls: RunOptions[] = [];
  return {
    calls,
    now: () => new Date(t),
    run: async (o: RunOptions) => {
      calls.push(o);
      t += typeof costMs === 'number' ? costMs : 0;
      return { ...stubReport(o), documents: docs(o), pdf_documents: docs(o) };
    },
  };
}
const src = (id: string, last_checked: string | null): StoredSource => ({
  id,
  body_id: null,
  adapter: 'legistar',
  config: {},
  last_checked,
  last_success: null,
  expected_max_gap_days: null,
  last_flags: [],
  last_error: null,
  results_max_days: 45,
  comment_rules_hash: null,
  comment_rules_text: null,
});

describe('scheduled ingest', () => {
  it('rotationOrder puts never-checked sources first, then the oldest last_checked', () => {
    const order = rotationOrder([src('b', '2026-10-19T10:00:00Z'), src('c', null), src('a', '2026-10-18T10:00:00Z'), src('d', null)]);
    expect(order).toEqual(['c', 'd', 'a', 'b']);
  });

  it('seeds bodies and sources before running anything', async () => {
    const store = createMemoryStore();
    const h = harness(NOON);
    await runScheduled({ store, sources: SOURCES, now: h.now, run: h.run });
    expect(store.tables.bodies.length).toBeGreaterThan(0);
    expect(store.tables.sources.map((s) => s.id).sort()).toEqual(SOURCES.map((s) => s.id).sort());
  });

  it('sweeps every source in near_term mode, AI sources capped at one document', async () => {
    const store = createMemoryStore();
    const h = harness(NOON);
    await runScheduled({ store, sources: SOURCES, now: h.now, run: h.run });
    const sweep = h.calls.filter((c) => c.mode.kind === 'near_term');
    expect(sweep.map((c) => c.source.id).sort()).toEqual(SOURCES.map((s) => s.id).sort());
    for (const c of sweep) expect(c.maxLlmDocs).toBe(['primegov', 'llm_extract'].includes(c.source.adapter) ? 1 : undefined);
    // Deterministic sources go first, so a slow AI source can't starve them.
    const firstAi = sweep.findIndex((c) => ['primegov', 'llm_extract'].includes(c.source.adapter));
    expect(sweep.slice(firstAi).every((c) => ['primegov', 'llm_extract'].includes(c.source.adapter))).toBe(true);
  });

  it('skips BoardBook between 00:00 and 05:00 Central', async () => {
    const store = createMemoryStore();
    const h = harness(NIGHT);
    const report = await runScheduled({ store, sources: SOURCES, now: h.now, run: h.run });
    expect(h.calls.some((c) => c.source.id === 'cfisd_board')).toBe(false);
    expect(report.skipped).toContainEqual({ source_id: 'cfisd_board', stage: 'near_term', reason: 'maintenance_window' });
  });

  it('stops starting sources when the time budget runs out, and reports them as skipped', async () => {
    const store = createMemoryStore();
    const h = harness(NOON, 100_000);
    const report = await runScheduled({ store, sources: SOURCES, now: h.now, run: h.run, budgetMs: 270_000 });
    expect(h.calls.length).toBeLessThan(SOURCES.length);
    expect(report.skipped.some((s) => s.reason === 'budget')).toBe(true);
    expect(report.elapsed_ms).toBeLessThanOrEqual(270_000 + 100_000);
  });

  it('rotates while time remains, stopping AI sources after one that read a new document', async () => {
    const store = createMemoryStore();
    const h = harness(NOON, 1000, (o) => (o.mode.kind === 'rotation' && o.source.adapter !== 'legistar' && o.source.adapter !== 'boardbook' && o.source.adapter !== 'manual' ? 1 : 0));
    const report = await runScheduled({ store, sources: SOURCES, now: h.now, run: h.run });
    const rotation = h.calls.filter((c) => c.mode.kind === 'rotation');
    expect(rotation.length).toBeGreaterThan(1);
    expect(rotation.filter((c) => ['primegov', 'llm_extract'].includes(c.source.adapter))).toHaveLength(2);
    expect(report.skipped.filter((s) => s.reason === 'llm_limit')).toHaveLength(1);
  });

  it('keeps rotating AI sources whose check found nothing new (no model call)', async () => {
    const store = createMemoryStore();
    const h = harness(NOON);
    await runScheduled({ store, sources: SOURCES, now: h.now, run: h.run });
    const rotation = h.calls.filter((c) => c.mode.kind === 'rotation');
    expect(rotation.filter((c) => ['primegov', 'llm_extract'].includes(c.source.adapter))).toHaveLength(3);
  });

  it('only: runs just the named source in the named mode', async () => {
    const store = createMemoryStore();
    const h = harness(NOON);
    await runScheduled({ store, sources: SOURCES, now: h.now, run: h.run, only: { sourceId: 'hisd_board', mode: 'near_term' } });
    expect(h.calls.map((c) => [c.source.id, c.mode.kind])).toEqual([['hisd_board', 'near_term']]);
  });

  it('only with results mode passes the meeting IDs through', async () => {
    const store = createMemoryStore();
    const h = harness(NOON);
    await runScheduled({ store, sources: SOURCES, now: h.now, run: h.run, only: { sourceId: 'hcmud_489', mode: 'results', meetings: ['a', 'b'] } });
    expect(h.calls[0]!.mode).toEqual({ kind: 'results', meeting_external_ids: ['a', 'b'] });
  });

  it('pickResultsMeetings: MUD 489 at 62 days is picked, Lone Star at 46 days is not, at most 3, never BoardBook or manual', () => {
    const c = (source_id: string, days: number, last_results_check: string | null = null, external_id = `${source_id}-${days}`): ResultsCandidate => ({
      source_id,
      meeting_id: external_id,
      external_id,
      date: new Date(NOON.getTime() - days * DAY).toISOString(),
      last_results_check,
    });
    const picked = pickResultsMeetings(
      [c('hcmud_489', 62), c('lone_star_board', 46), c('cfisd_board', 2), c('manual', 2), c('hisd_board', 3, new Date(NOON.getTime() - 3_600_000).toISOString())],
      SOURCES,
      NOON,
    );
    expect(picked.map((p) => p.external_id)).toEqual(['hcmud_489-62']);
    const many = pickResultsMeetings([1, 2, 3, 4, 5].map((d) => c('hisd_board', d)), SOURCES, NOON);
    expect(many).toHaveLength(3);
  });

  it('runs results mode for due meetings, grouped by source', async () => {
    const store = createMemoryStore();
    await store.ensureBodies([{ id: 'hcmud_489', name: 'MUD', type: 'mud', category: 'tracked', sms_eligible: true }]);
    await store.syncSources([{ id: 'hcmud_489', body_id: 'hcmud_489', adapter: 'llm_extract', config: {}, expected_max_gap_days: null, results_max_days: 75 }]);
    const [m] = await store.upsertMeetings([
      {
        source_id: 'hcmud_489',
        external_id: 'past-1',
        body_id: 'hcmud_489',
        date: new Date(NOON.getTime() - 10 * DAY).toISOString(),
        end_date: null,
        type: 'regular',
        status: 'scheduled',
        agenda_url: null,
        source_url_es: null,
        video_url: null,
        minutes_url: null,
        comment_rules_text: null,
        content_hash: 'x',
        previous_date: null,
        is_demo: false,
      },
    ]);
    await store.upsertItems([
      {
        source_id: 'hcmud_489',
        external_id: 'i1',
        meeting_id: m!.id,
        body_id: 'hcmud_489',
        meeting_body_id: 'hcmud_489',
        agenda_number: null,
        title: 'Approve budget',
        section: null,
        description: null,
        matter_type: null,
        item_type: 'budget',
        status: 'awaiting_result',
        action: null,
        vote_result: null,
        tier: 'weekly',
        rule_fired: null,
        review_status: null,
        source_quote: null,
        quote_verified: null,
        amounts: [],
        attachments: [],
        contains_private_person: false,
        needs_story: false,
        source_url: 'https://example.org/a.pdf',
        content_hash: 'h',
        first_seen_at: NOON.toISOString(),
        removed_at: null,
        is_demo: false,
      },
    ]);
    const h = harness(NOON);
    await runScheduled({ store, sources: SOURCES, now: h.now, run: h.run });
    const results = h.calls.filter((c) => c.mode.kind === 'results');
    expect(results.map((c) => [c.source.id, c.mode])).toEqual([['hcmud_489', { kind: 'results', meeting_external_ids: ['past-1'] }]]);
  });

  describe('at district-rollout scale (plan 0.8)', () => {
    const MANY: SourceConfig[] = Array.from({ length: 550 }, (_, i) => ({
      id: `mud_${String(i).padStart(3, '0')}`,
      body_id: 'hcmud_489',
      adapter: i % 10 === 0 ? 'legistar' : 'llm_extract',
      config: {},
    }));
    const SHARDS = 6;

    it('splits sources into stable shards that cover every source once', () => {
      const counts = Array.from({ length: SHARDS }, (_, k) => MANY.filter((s) => shardOf(s.id, SHARDS) === k).length);
      expect(counts.reduce((a, b) => a + b, 0)).toBe(550);
      for (const c of counts) expect(c).toBeGreaterThan(550 / SHARDS / 2);
      expect(shardOf('hcmud_489', SHARDS)).toBe(shardOf('hcmud_489', SHARDS));
    });

    it('sweeps only sources with a meeting in the next 72 hours', async () => {
      expect(MANY.length).toBeGreaterThan(SWEEP_ALL_MAX);
      const store = createMemoryStore();
      store.tables.meetings.push({ id: 'm1', source_id: 'mud_007', date: new Date(NOON.getTime() + DAY).toISOString() } as never);
      store.tables.meetings.push({ id: 'm2', source_id: 'mud_008', date: new Date(NOON.getTime() + 5 * DAY).toISOString() } as never);
      const h = harness(NOON);
      await runScheduled({ store, sources: MANY, now: h.now, run: h.run });
      expect(h.calls.filter((c) => c.mode.kind === 'near_term').map((c) => c.source.id)).toEqual(['mud_007']);
    });

    it('stays inside the budget and reaches every source within a day of calls (none starves)', async () => {
      const store = createMemoryStore();
      const seen = new Set<string>();
      let t = NOON.getTime();
      // 6 shards x 8 calls a day (every 3 hours). A quiet check takes 1.5 s. About 1 AI check in 30
      // finds a new agenda (~18 a day, more than ~500 districts posting monthly) and takes 60 s.
      for (let call = 0; call < 8; call++) {
        for (let k = 0; k < SHARDS; k++) {
          const start = t;
          let n = 0;
          const run = async (o: RunOptions) => {
            const reads = o.mode.kind === 'rotation' && o.source.adapter === 'llm_extract' && ++n % 30 === 0 ? 1 : 0;
            t += reads ? 60_000 : 1500;
            seen.add(o.source.id);
            if (o.mode.kind === 'rotation') store.tables.sources.find((s) => s.id === o.source.id)!.last_checked = new Date(t).toISOString();
            return { ...stubReport(o), documents: reads, pdf_documents: reads };
          };
          const report = await runScheduled({ store, sources: MANY, now: () => new Date(t), run, shard: { index: k, count: SHARDS } });
          expect(t - start).toBeLessThanOrEqual(270_000);
          expect(report.runs.every((r) => shardOf(r.source_id, SHARDS) === k)).toBe(true);
        }
        t += 3 * 3_600_000;
      }
      expect(seen.size).toBe(550);
    });
  });
});
