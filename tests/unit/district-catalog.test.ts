import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBodyCatalog, parseJurisdictionMap } from '@/lib/ingest/catalog';
import { COMPTROLLER_SEARCH_URL, parseBatches, sameDistrict, schoolBody, schoolCode, waterBody, waterDistrict } from '@/lib/ingest/districtCatalog';

const batches = parseBatches(readFileSync('.plans/district-rollout-batches.md', 'utf8'));

describe('district names and IDs (plan 0.2, §6)', () => {
  it.each([
    ['HARRIS COUNTY MUD 489', 'hcmud_489', 'Harris County Municipal Utility District No. 489'],
    ['HARRIS COUNTY WCID 157', 'hcwcid_157', 'Harris County Water Control and Improvement District No. 157'],
    ['NORTHWEST HC MUD 012', 'nwhcmud_12', 'Northwest Harris County Municipal Utility District No. 12'],
    ['WEST HC MUD 11', 'whcmud_11', 'West Harris County Municipal Utility District No. 11'],
    ['HARRIS COUNTY FWSD 1A', 'hcfwsd_1a', 'Harris County Fresh Water Supply District No. 1A'],
    ['HC MUD 478B', 'hcmud_478b', 'Harris County Municipal Utility District No. 478B'],
    ['Harris County MUD 458', 'hcmud_458', 'Harris County Municipal Utility District No. 458'],
    ['HARRIS COUNTY UD 006', 'hcud_6', 'Harris County Utility District No. 6'],
    ['REMINGTON MUD 1', 'remington_mud_1', 'Remington Municipal Utility District No. 1'],
    ['CY-CHAMP PUD', 'cy_champ_pud', 'Cy-Champ Public Utility District'],
    ['SPRING CRK FOREST PUD', 'spring_creek_forest_pud', 'Spring Creek Forest Public Utility District'],
    ['C N P UD', 'cnp_ud', 'CNP Utility District'],
    ['WILLOW FORK DRAINAGE', 'willow_fork_drainage', 'Willow Fork Drainage District'],
    ['CLEAR LAKE CITY WA', 'clear_lake_city_wa', 'Clear Lake City Water Authority'],
    ['HARRIS-WALLER CNTY MUD 005', 'harris_waller_counties_mud_5', 'Harris-Waller Counties Municipal Utility District No. 5'],
    ['HARRIS WALLER COUNTIES MUD 7', 'harris_waller_counties_mud_7', 'Harris-Waller Counties Municipal Utility District No. 7'],
    ['FORT BEND MUD 30', 'fbcmud_30', 'Fort Bend County Municipal Utility District No. 30'],
    ['HC WCID FONDREN ROAD', 'hcwcid_fondren_road', 'Harris County Water Control and Improvement District Fondren Road'],
  ])('%s -> %s', (layer, id, name) => {
    expect(waterDistrict(layer)).toMatchObject({ id, name });
  });

  it('fixes the county layer "LAGO BELLA" to the statutory Lago Bello', () => {
    expect(waterBody({ code: '011', name: 'LAGO BELLA MUD 1A' }, new Map())).toMatchObject({ id: 'lago_bello_mud_1a', name: 'Lago Bello Municipal Utility District No. 1A' });
  });

  it('never builds an ID from the HCAD code: code 189 is MUD 489, code 489 is MUD 189', () => {
    expect(waterBody({ code: '489', name: 'HARRIS COUNTY MUD 189' }, new Map()).id).toBe('hcmud_189');
  });

  it('gives every W batch district a unique ID that passes the catalog schema', () => {
    const rows = [...batches.values()]
      .filter((b) => b.id.startsWith('W'))
      .flatMap((b) => b.entries.map((e) => waterBody(e, new Map())));
    expect(rows.length).toBe(497);
    expect(() => parseBodyCatalog([readFileSync('data/bodies.yaml', 'utf8'), JSON.stringify(rows.filter((r) => r.id !== 'hcmud_489'))])).not.toThrow();
    expect(rows.every((r) => r.meeting_info_url === COMPTROLLER_SEARCH_URL)).toBe(true);
  });
});

describe('batch list', () => {
  it('reads codes, keeps name suffixes and reports the blank W48 polygon', () => {
    expect(batches.get('W1')!.entries[0]).toEqual({ code: '465', name: 'HARRIS COUNTY MUD 165' });
    expect(batches.get('W13')!.entries.at(-1)).toEqual({ code: 'A94', name: 'FENSKE ROAD MUD' });
    expect(batches.get('W48')!.entries[0]).toEqual({ code: '601', name: 'HARRIS COUNTY WCID 001' });
    expect(batches.get('W48')!.problems).toHaveLength(1);
    expect(batches.get('X2')!.entries).toContainEqual({ code: '347', name: 'NORTHAMPTON MUD (DA)' });
  });

  it('reads school batches, including the code-012 mapping in S3', () => {
    expect(batches.get('S1')!.entries.map((e) => e.name)).toContain('Spring Branch ISD');
    expect(batches.get('S3')!.entries).toContainEqual({ code: '012', name: '' });
    expect(batches.get('S3')!.entries).toHaveLength(6);
    expect(batches.get('S3')!.problems).toEqual([]);
  });
});

describe('school boards', () => {
  const sites = new Map([['katy_isd_board', { id: 'katy_isd_board', website: 'https://www.katyisd.org/', checked_on: '2026-10-28' }]]);

  it("uses the stand-in lookup's ID, so both lookup paths land on one row", () => {
    expect(schoolBody('Katy ISD', sites)).toMatchObject({ id: 'katy_isd_board', type: 'school_board', meeting_info_url: 'https://www.katyisd.org/' });
  });

  it('refuses a school board with no checked website', () => {
    expect(() => schoolBody('Aldine ISD', sites)).toThrow(/district-sites/);
  });

  it("finds the ISD's HCAD code by its capitalized name", () => {
    expect(schoolCode('Goose Creek CISD', { '016': 'GOOSE CREEK CISD' })).toBe('016');
  });
});

describe('helpers', () => {
  it('matches HCAD and layer spellings of the same district', () => {
    expect(sameDistrict('HARRIS COUNTY MUD 165', 'HC MUD 165')).toBe(true);
    expect(sameDistrict('NORTHWEST HC MUD 012', 'NW HC MUD 12')).toBe(true);
    expect(sameDistrict('HARRIS COUNTY MUD 165', 'HC MUD 166')).toBe(false);
  });

  it('rejects repeated HCAD codes across map files', () => {
    const a = 'mappings:\n  - { code: "189", source_name: HC MUD 489, body_id: hcmud_489 }\n';
    expect(() => parseJurisdictionMap([a, a])).toThrow(/duplicate HCAD code/);
  });
});
