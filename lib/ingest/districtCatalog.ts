import { z } from 'zod';
import { CENSUS_SCHOOL_NAMES } from '@/lib/lookup/schoolDistricts';
import { schoolBoardId } from '@/lib/lookup/standIn';
import type { CatalogBody } from './catalog';

// Pure helpers for scripts/build-district-catalog.ts (district coverage plan 0.2): read a batch
// from .plans/district-rollout-batches.md and turn each district into a catalog row plus its
// HCAD code mapping. IDs and names come from the district's name, never its HCAD code: code
// 189 is MUD 489 and code 489 is MUD 189 (plan §6).

export const COMPTROLLER_SEARCH_URL = 'https://spdpid.comptroller.texas.gov/';
export const HCAD_JURISDICTIONS_URL = 'https://public.hcad.org/resources/jurlist.asp';

export type BatchEntry = { code: string; name: string };
export type Batch = { id: string; done: boolean; entries: BatchEntry[]; problems: string[] };

/** Every batch line (`- [ ] **W1:** ...`) in the rollout file, keyed by batch ID. */
export function parseBatches(markdown: string): Map<string, Batch> {
  const out = new Map<string, Batch>();
  for (const line of markdown.split(/\r?\n/)) {
    const m = /^- \[( |x)\] \*\*([SWX]\d+):\*\* (.*)$/.exec(line);
    if (!m) continue;
    const batch: Batch = { id: m[2]!, done: m[1] === 'x', entries: [], problems: [] };
    for (const raw of m[3]!.split(/,\s*(?![^()]*\))/)) {
      // Drop the region note "(Goose Creek CISD)"; keep a name suffix such as "(061)" or "(DA)".
      const part = raw.replace(/\s*\((?:[^()]*ISD|Outside any unified district)\)\s*$/, '').trim();
      if (batch.id.startsWith('S')) {
        const code = /HCAD code `(\d{3})`/.exec(part)?.[1];
        if (code) batch.entries.push({ code, name: '' });
        else if (part.startsWith('plus ')) batch.problems.push(`unread entry: ${part}`);
        else if (part) batch.entries.push({ code: '', name: part });
        continue;
      }
      const e = /^(?:`([0-9A-Z]{3})`|([A-Z]\d{2}))\s+(.+)$/.exec(part);
      if (e) batch.entries.push({ code: e[1] ?? e[2]!, name: e[3]!.trim() });
      else batch.problems.push(part ? `no HCAD code: ${part}` : 'an entry with no code or name (a county polygon with blank attributes)');
    }
    out.set(batch.id, batch);
  }
  return out;
}

const KINDS = {
  MUD: { long: 'Municipal Utility District', id: 'mud' },
  UD: { long: 'Utility District', id: 'ud' },
  PUD: { long: 'Public Utility District', id: 'pud' },
  WCID: { long: 'Water Control and Improvement District', id: 'wcid' },
  FWSD: { long: 'Fresh Water Supply District', id: 'fwsd' },
  WA: { long: 'Water Authority', id: 'wa' },
  DRAINAGE: { long: 'Drainage District', id: 'drainage' },
} as const;

// County prefixes, longest first. `id` set means the prefix joins the kind with no underscore
// (hcmud_489, nwhcmud_12), matching the existing hcmud_489.
const PREFIXES: { re: RegExp; name: string; id?: string }[] = [
  { re: /^(?:NORTHWEST|NW) (?:HARRIS COUNTY|HC)$/, name: 'Northwest Harris County', id: 'nwhc' },
  { re: /^NORTHEAST (?:HARRIS COUNTY|HC)$/, name: 'Northeast Harris County', id: 'nehc' },
  { re: /^SOUTHWEST (?:HARRIS COUNTY|HC)$/, name: 'Southwest Harris County', id: 'swhc' },
  { re: /^WEST (?:HARRIS COUNTY|HC)$/, name: 'West Harris County', id: 'whc' },
  { re: /^(?:HARRIS COUNTY|HC)$/, name: 'Harris County', id: 'hc' },
  { re: /^HARRIS[- ]WALLER (?:CNTY|CO|COUNTIES|COUNTY)$/, name: 'Harris-Waller Counties' },
  { re: /^HARRIS[- ](?:FT|FORT) BEND$/, name: 'Harris-Fort Bend Counties' },
  { re: /^HARRIS-MONTGOMERY CO$/, name: 'Harris-Montgomery Counties' },
  { re: /^HARRIS-BRAZORIA CNTIES$/, name: 'Harris-Brazoria Counties' },
  { re: /^(?:FT|FORT) BEND(?: CO| COUNTY)?$/, name: 'Fort Bend County', id: 'fbc' },
  { re: /^BRAZORIA COUNTY$/, name: 'Brazoria County', id: 'bc' },
];

const WORDS: Record<string, string> = { CRK: 'Creek', CNTRY: 'Country', RD: 'Road', 'C N P': 'CNP' };

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const title = (s: string) =>
  Object.entries(WORDS)
    .reduce((t, [k, v]) => t.replace(new RegExp(`\\b${k}\\b`, 'g'), v), s)
    .split(' ')
    .map((w) => (w === 'CNP' ? w : w.toLowerCase().replace(/(^|-)([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase())))
    .join(' ');

export type WaterDistrict = { id: string; name: string; kind: keyof typeof KINDS };

/** "HARRIS COUNTY WCID 157" -> { id: 'hcwcid_157', name: 'Harris County Water Control and Improvement District No. 157' } */
export function waterDistrict(layerName: string): WaterDistrict {
  const upper = layerName.toUpperCase().replace(/\s+/g, ' ').trim();
  const m = /^(.*?)\s*\b(MUD|UD|PUD|WCID|FWSD|WA|DRAINAGE)\b(?:\s+(\d+[A-Z]?))?(?:\s+(.+))?$/.exec(upper);
  if (!m) throw new Error(`not a water district name: ${layerName}`);
  const [, before, kindKey, numRaw, after] = m as unknown as [string, string, keyof typeof KINDS, string | undefined, string | undefined];
  if (after && numRaw) throw new Error(`unexpected text after the number: ${layerName}`);
  const kind = KINDS[kindKey];
  const num = numRaw?.replace(/^0+(?=\d)/, '').toLowerCase();
  const prefix = PREFIXES.find((p) => p.re.test(before));
  const prefixName = prefix ? prefix.name : title(before);
  // "HC WCID FONDREN ROAD": the district's own name comes after the kind.
  const tail = after ? ` ${title(after)}` : num ? ` No. ${num.toUpperCase()}` : '';
  const name = `${prefixName ? `${prefixName} ` : ''}${kind.long}${tail}`;
  const head = prefix?.id ? `${prefix.id}${kind.id}` : [slug(prefix ? prefix.name : title(before)), kind.id].filter(Boolean).join('_');
  const id = [head, num ?? (after ? slug(after) : '')].filter(Boolean).join('_');
  return { id, name, kind: kindKey };
}

export type DistrictSite = { id: string; website: string; checked_on: string };

/**
 * Hand-checked websites from data/district-sites.yaml (parsed YAML in). A `no_agendas_online` row
 * may have no website (none found); it is skipped here and the page links the Comptroller search.
 */
export function districtSites(rows: unknown): Map<string, DistrictSite> {
  const parsed = z
    .array(z.object({ id: z.string(), website: z.string().url().optional(), checked_on: z.string().date().optional() }).loose())
    .parse(rows ?? []);
  return new Map(
    parsed.flatMap((s): [string, DistrictSite][] => (s.website && s.checked_on ? [[s.id, { id: s.id, website: s.website, checked_on: s.checked_on }]] : [])),
  );
}

const WATER_DESCRIPTION = {
  en: 'A special district under the Texas Water Code that provides water, sewer or drainage services and can set a property tax; exact services and tax details depend on the parcel.',
  es: 'Un distrito especial bajo el Código de Aguas de Texas que presta servicios de agua, drenaje o alcantarillado y puede fijar un impuesto a la propiedad; los servicios e impuestos dependen de la parcela.',
};

// County-layer names known to be misspelled, by HCAD code, each with its source.
export const LAYER_NAME_FIXES: Readonly<Record<string, string>> = {
  // Layer says "LAGO BELLA". H.B. 2687 (85th Leg., 2017) created Lago Bello MUD No. 1, and TCEQ
  // permit WQ0015903001 names "Lago Bello MUD 1A of Harris County"; HCAD's list agrees.
  '011': 'LAGO BELLO MUD 1A',
};

export function waterBody(entry: BatchEntry, sites: ReadonlyMap<string, DistrictSite>): CatalogBody {
  const d = waterDistrict(LAYER_NAME_FIXES[entry.code] ?? entry.name);
  const site = sites.get(d.id)?.website;
  return {
    id: d.id,
    name: d.name,
    type: 'mud',
    category: 'tracked',
    elected_or_appointed: "Board selection details are not loaded; see the district's official notices",
    impact_rank: 90,
    sms_eligible: true,
    tax_set_by_body_id: d.id,
    description_en: WATER_DESCRIPTION.en,
    description_es: WATER_DESCRIPTION.es,
    // No checked website yet: the Comptroller's special-district search is the public record
    // that lists each district's own contact details.
    meeting_info_url: site ?? COMPTROLLER_SEARCH_URL,
    source_url: HCAD_JURISDICTIONS_URL,
  };
}

// The Census name for each batch-list ISD name lives with the lookup, which uses it too (plan 0.5).
export { CENSUS_SCHOOL_NAMES } from '@/lib/lookup/schoolDistricts';

/** A school board row. It needs a checked website: there is no shared fallback for ISDs. */
export function schoolBody(shortName: string, sites: ReadonlyMap<string, DistrictSite>): CatalogBody {
  const census = CENSUS_SCHOOL_NAMES[shortName];
  if (!census) throw new Error(`no Census name for ${shortName}`);
  const id = schoolBoardId(census);
  const site = sites.get(id)?.website;
  if (!site) throw new Error(`${id}: add a checked website to data/district-sites.yaml first`);
  const plain = census.replace(/ (Consolidated )?Independent School District$/, '');
  return {
    id,
    name: `${shortName} Board of Trustees`,
    type: 'school_board',
    category: 'tracked',
    elected_or_appointed: "Board selection details are not loaded; see the district's board page",
    impact_rank: 60,
    sms_eligible: true,
    tax_set_by_body_id: id,
    description_en: `Governs ${shortName} schools, policies, and district budget.`,
    description_es: `Gobierna las escuelas, políticas y presupuesto del distrito escolar ${plain}.`,
    meeting_info_url: site,
    source_url: site,
  };
}

/** HCAD's list names an ISD in capitals ("GOOSE CREEK CISD"); find its code. */
export function schoolCode(shortName: string, jurisdictions: Readonly<Record<string, string>>): string | undefined {
  const want = shortName.toUpperCase();
  return Object.entries(jurisdictions).find(([, n]) => n === want)?.[0];
}

/** A loose check that HCAD's list and the county layer name the same district. */
export function sameDistrict(layerName: string, hcadName: string): boolean {
  const norm = (s: string) =>
    s
      .toUpperCase()
      .replace(/\bHARRIS COUNTY\b/g, 'HC')
      .replace(/\bNORTHWEST\b/g, 'NW')
      .replace(/\b0+(\d)/g, '$1')
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim();
  return norm(layerName) === norm(hcadName);
}
