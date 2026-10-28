import { describe, expect, it } from 'vitest';
import { districtTerms, waterTerms } from '@/lib/news/districtTerms';
import { loadTerms, matchBodies } from '@/lib/news/match';
import type { CatalogBody } from '@/lib/ingest/catalog';

const body = (id: string, name: string, type: CatalogBody['type'] = 'mud') => ({ id, name, type, category: 'tracked' }) as CatalogBody;
const hc12 = body('hcmud_12', 'Harris County Municipal Utility District No. 12');
const nw12 = body('nwhcmud_12', 'Northwest Harris County Municipal Utility District No. 12');
const terms = districtTerms([hc12, nw12, body('katy_isd_board', 'Katy ISD Board of Trustees', 'school_board'), body('spring_isd_board', 'Spring ISD Board of Trustees', 'school_board')], [], { 'Katy ISD': 'Katy Independent School District' });

describe('pattern news terms for rollout districts (plan 0.10)', () => {
  it('matches a district by its county-prefixed name, never a bare number', () => {
    expect(matchBodies('Harris County MUD 12 sets a tax rate', terms).body_ids).toEqual(['hcmud_12']);
    expect(matchBodies('HCMUD 12 board meets', terms).body_ids).toEqual(['hcmud_12']);
    expect(matchBodies('Fort Bend County MUD 12 sets a tax rate', terms).body_ids).toEqual([]);
    expect(matchBodies('MUD 12 sets a tax rate', terms).body_ids).toEqual([]);
  });

  it('keeps Northwest Harris County MUD 12 apart from Harris County MUD 12', () => {
    expect(matchBodies('Northwest Harris County MUD 12 approves bonds', terms).body_ids).toEqual(['nwhcmud_12']);
  });

  it('matches school boards by short and Census names without crossing Spring and Spring Branch', () => {
    expect(matchBodies('Katy Independent School District trustees vote', terms).body_ids).toEqual(['katy_isd_board']);
    expect(matchBodies('Spring Branch ISD weighs closures', terms).body_ids).toEqual([]);
  });

  it('keeps hand-written entries and skips names that are only a kind', () => {
    expect(districtTerms([body('hcmud_489', 'Harris County Municipal Utility District No. 489')], [{ body_id: 'hcmud_489', aliases: ['MUD 489'], exclude_terms: [] }])).toEqual([]);
    expect(waterTerms({ id: 'x', name: 'Utility District' })).toBeUndefined();
  });

  it('loads hand terms plus catalog terms with no repeated body', () => {
    const ids = loadTerms().map((t) => t.body_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('katy_isd_board');
    expect(loadTerms(undefined, false).map((t) => t.body_id)).not.toContain('katy_isd_board');
  });
});
