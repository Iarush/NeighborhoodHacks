import { describe, expect, it } from 'vitest';
import { QUIZ_BODY_TYPES } from '@/lib/contracts/bodyTypes';
import { TRACKED_BODIES, trackedBodies } from '@/lib/ingest/bodies';
import { loadBodyCatalog, parseBodyCatalog } from '@/lib/ingest/catalog';
import { loadSources } from '@/lib/ingest/registry';

const ids = new Set(TRACKED_BODIES.map((b) => b.id));

describe('tracked bodies seed', () => {
  it('seeds every body_id the sources can write, including section_body_map targets', () => {
    const needed = loadSources().flatMap((s) => {
      const map = (s.config.section_body_map ?? {}) as Record<string, string>;
      return [...(s.body_id ? [s.body_id] : []), ...Object.values(map)];
    });
    expect(needed.length).toBeGreaterThan(0);
    for (const id of needed) expect(ids.has(id), id).toBe(true);
  });

  it("seeds the stand-in lookup's fixed body IDs, so resolveBodies() doesn't drop them", () => {
    for (const id of ['houston_city_council', 'commissioners_court', 'flood_control', 'port_houston', 'hisd_board', 'hcc_board', 'cfisd_board', 'lone_star_board', 'hcad']) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it('has unique IDs, quiz body types and the tracked category', () => {
    expect(ids.size).toBe(TRACKED_BODIES.length);
    for (const b of TRACKED_BODIES) {
      expect((QUIZ_BODY_TYPES as readonly string[]).includes(b.type), b.id).toBe(true);
      expect(b.category).toBe('tracked');
      expect(b.name.trim().length).toBeGreaterThan(0);
    }
  });

  it('marks only the plan\'s SMS-eligible kinds of body as able to text (Project_Plan: texts)', () => {
    const eligible = new Set(['city_council', 'commissioners_court', 'flood_control', 'school_board', 'college_board', 'mud', 'esd']);
    for (const b of TRACKED_BODIES) expect(b.sms_eligible, b.id).toBe(eligible.has(b.type));
  });
});

describe('body catalog (one body list)', () => {
  const row = (id: string, extra = '') => `- id: ${id}
  name: Test ${id}
  type: mud
  category: tracked
  elected_or_appointed: Elected board of directors
  impact_rank: 50
  sms_eligible: true
  description_en: A test district.
  description_es: Un distrito de prueba.
  meeting_info_url: https://example.org/
  source_url: https://example.org/
${extra}`;

  it('seeds exactly the tracked quiz-type bodies in data/bodies.yaml, so ingest and the seed script agree', () => {
    const tracked = loadBodyCatalog().filter((b) => b.category === 'tracked');
    expect(TRACKED_BODIES.map((b) => b.id).sort()).toEqual(tracked.map((b) => b.id).sort());
    expect(ids.has('centerpoint')).toBe(false);
  });

  it('merges the generated district file into the same list', () => {
    const bodies = trackedBodies(parseBodyCatalog([row('hcmud_489'), row('hcmud_165')]));
    expect(bodies.map((b) => b.id)).toEqual(['hcmud_489', 'hcmud_165']);
  });

  it('rejects an ID repeated across files and an unknown tax-setting body', () => {
    expect(() => parseBodyCatalog([row('hcmud_1'), row('hcmud_1')])).toThrow(/duplicate body id/);
    expect(() => parseBodyCatalog([row('hcmud_2', '  tax_set_by_body_id: nowhere\n')])).toThrow(/not in the catalog/);
  });

  it('treats a missing district file as empty', () => {
    expect(loadBodyCatalog(['data/bodies.yaml', 'data/does-not-exist.yaml']).length).toBe(loadBodyCatalog(['data/bodies.yaml']).length);
  });
});
