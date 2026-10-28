import { schoolBoardId } from '@/lib/lookup/standIn';
import type { CatalogBody, JurisdictionMapping } from './catalog';
import { bodiesWithAgendaSource, type SourceCoverageRow } from './coverage';
import { CENSUS_SCHOOL_NAMES, LAYER_NAME_FIXES, schoolCode, waterDistrict, type Batch } from './districtCatalog';

// Pure part of scripts/check-district-batch.ts (district coverage plan 0.9): runs the §4
// checklist for one batch and says pass or fail for each district. Database facts are passed
// in by the script; without keys they're left out and those checks print "skip", not "pass".

export type Target = { label: string; bodyId: string; code?: string };
export type CheckStatus = 'pass' | 'fail' | 'skip' | 'note';
export type Check = { step: string; status: CheckStatus; detail: string };
export type DistrictResult = { target: Target; checks: Check[]; ok: boolean };

/** Hand-recorded "no agendas online" reasons, from data/district-sites.yaml. */
export type NoAgendas = { id: string; reason: string; checked_on: string };

export type LiveFacts = {
  bodyIds: ReadonlySet<string>;
  codeToBody: ReadonlyMap<string, string>;
  boundaryBodyIds: ReadonlySet<string>;
};

export type CheckInput = {
  catalog: readonly CatalogBody[];
  map: readonly JurisdictionMapping[];
  sources: readonly SourceCoverageRow[];
  noAgendas: ReadonlyMap<string, NoAgendas>;
  hcad: Readonly<Record<string, string>>;
  live?: LiveFacts;
};

// Phase 0's pilot: the three districts already live (plan §3).
export const PILOT: readonly Target[] = [
  { label: 'Cypress-Fairbanks ISD', bodyId: 'cfisd_board' },
  { label: 'Houston ISD', bodyId: 'hisd_board' },
  { label: 'HARRIS COUNTY MUD 489', bodyId: 'hcmud_489' },
];

/** The body each batch entry should become, built the same way as the catalog builder. */
export function batchTargets(batch: Batch, hcad: Readonly<Record<string, string>>): Target[] {
  return batch.entries.map((entry) => {
    if (batch.id.startsWith('S') && entry.name === '') return { label: `HCAD code ${entry.code}`, bodyId: 'hisd_board', code: entry.code };
    if (batch.id.startsWith('S')) {
      const census = CENSUS_SCHOOL_NAMES[entry.name];
      return { label: entry.name, bodyId: census ? schoolBoardId(census) : '(no Census name)', code: schoolCode(entry.name, hcad) };
    }
    return { label: `${entry.code} ${entry.name}`, bodyId: waterDistrict(LAYER_NAME_FIXES[entry.code] ?? entry.name).id, code: entry.code };
  });
}

export function checkTargets(targets: readonly Target[], input: CheckInput): DistrictResult[] {
  const catalog = new Map(input.catalog.map((b) => [b.id, b]));
  const covered = bodiesWithAgendaSource(input.sources);
  return targets.map((target) => {
    const checks: Check[] = [];
    const add = (step: string, status: CheckStatus, detail: string) => checks.push({ step, status, detail });
    const body = catalog.get(target.bodyId);
    const codes = input.map.filter((m) => m.body_id === target.bodyId).map((m) => m.code);

    // 1. Catalog: the body is listed and its HCAD code points at it.
    add('catalog', body ? 'pass' : 'fail', body ? body.name : `${target.bodyId} is not in the catalog; run the builder for this batch`);
    if (target.code) {
      const mapped = input.map.find((m) => m.code === target.code);
      add('code map', mapped?.body_id === target.bodyId ? 'pass' : 'fail', mapped ? `${target.code} -> ${mapped.body_id}` : `code ${target.code} is not mapped`);
    } else {
      add('code map', codes.length ? 'pass' : 'fail', codes.length ? `codes ${codes.join(', ')}` : 'no HCAD code maps to this body');
    }
    if (target.code && input.hcad[target.code] === undefined && !/^A/.test(target.code)) add('code map', 'note', `code ${target.code} is not on HCAD's printed list`);

    // 4. Sources: ingesting, or a recorded reason there are no agendas online.
    const reason = input.noAgendas.get(target.bodyId);
    if (covered.has(target.bodyId)) add('source', 'pass', 'listed in data/sources.yaml');
    else if (reason) add('source', 'pass', `no agendas online (${reason.checked_on}): ${reason.reason}`);
    else add('source', 'fail', 'no source and no "no agendas online" reason');

    // Seeding, lookup and boundary need the database.
    if (!input.live) {
      add('database', 'skip', 'no Supabase keys: seeding, code map and boundary not checked');
    } else {
      add('seeded', input.live.bodyIds.has(target.bodyId) ? 'pass' : 'fail', input.live.bodyIds.has(target.bodyId) ? 'bodies row exists' : 'no bodies row; run seed-bodies --apply');
      const liveCodes = (target.code ? [target.code] : codes).filter((c) => input.live!.codeToBody.get(c) === target.bodyId);
      add('lookup', liveCodes.length ? 'pass' : 'fail', liveCodes.length ? `jurisdiction_map has ${liveCodes.join(', ')}` : 'jurisdiction_map has no code for this body; run seed-hcad-jurisdictions --apply');
      const hasBoundary = input.live.boundaryBodyIds.has(target.bodyId);
      add('boundary', hasBoundary ? 'pass' : 'fail', hasBoundary ? 'polygon loaded' : 'no polygon; run load:boundaries for this layer');
    }
    // Steps 5 and 6 (a real address, the pages at 390 px) are done by hand.
    return { target, checks, ok: checks.every((c) => c.status !== 'fail') };
  });
}

/** Boundaries loaded for bodies the batch doesn't list ("every polygon has a body"). */
export function strayBoundaries(live: LiveFacts, catalog: readonly CatalogBody[]): string[] {
  const ids = new Set(catalog.map((b) => b.id));
  return [...live.boundaryBodyIds].filter((id) => !ids.has(id)).sort();
}
