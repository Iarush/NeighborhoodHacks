import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { batchTargets, checkTargets, strayBoundaries, type CheckInput } from '@/lib/ingest/batchCheck';
import type { CatalogBody } from '@/lib/ingest/catalog';
import { parseBatches } from '@/lib/ingest/districtCatalog';

const batches = parseBatches(readFileSync('.plans/district-rollout-batches.md', 'utf8'));
const body = (id: string) => ({ id, name: id, type: 'mud' }) as CatalogBody;

const base: CheckInput = {
  catalog: [body('hcwcid_157')],
  map: [{ code: '617', source_name: 'HC WCID 157', body_id: 'hcwcid_157' }],
  sources: [{ body_id: 'hcwcid_157', config: {} }],
  noAgendas: new Map(),
  hcad: { '617': 'HC WCID 157' },
};
const target = { label: 'WCID 157', bodyId: 'hcwcid_157', code: '617' };

describe('batch checker (plan 0.9)', () => {
  it('builds targets from names, not codes, like the catalog builder', () => {
    const w1 = batchTargets(batches.get('W1')!, {});
    expect(w1[0]).toEqual({ label: '465 HARRIS COUNTY MUD 165', bodyId: 'hcmud_165', code: '465' });
    expect(batchTargets(batches.get('S3')!, {}).at(-1)).toMatchObject({ bodyId: 'hisd_board', code: '012' });
  });

  it('passes a listed, mapped, sourced district and skips database checks without keys', () => {
    const [r] = checkTargets([target], base);
    expect(r!.ok).toBe(true);
    expect(r!.checks.find((c) => c.step === 'database')?.status).toBe('skip');
  });

  it('fails a district with no source unless a no-agendas reason is recorded', () => {
    const noSource = { ...base, sources: [] };
    expect(checkTargets([target], noSource)[0]!.ok).toBe(false);
    const reason = new Map([['hcwcid_157', { id: 'hcwcid_157', reason: 'posts notices on a board only', checked_on: '2026-10-28' }]]);
    expect(checkTargets([target], { ...noSource, noAgendas: reason })[0]!.ok).toBe(true);
  });

  it('fails a code mapped to another body', () => {
    const r = checkTargets([target], { ...base, map: [{ code: '617', source_name: 'x', body_id: 'hcmud_189' }] })[0]!;
    expect(r.checks.find((c) => c.step === 'code map')).toMatchObject({ status: 'fail' });
  });

  it('checks seeding, lookup and boundary with live facts, and reports stray polygons', () => {
    const live = { bodyIds: new Set(['hcwcid_157']), codeToBody: new Map([['617', 'hcwcid_157']]), boundaryBodyIds: new Set(['other']) };
    const r = checkTargets([target], { ...base, live })[0]!;
    expect(r.checks.find((c) => c.step === 'boundary')?.status).toBe('fail');
    expect(r.ok).toBe(false);
    expect(strayBoundaries(live, base.catalog)).toEqual(['other']);
  });
});
