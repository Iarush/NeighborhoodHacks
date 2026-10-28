import type { CatalogBody } from '@/lib/ingest/catalog';
import type { BodyTerms } from './match';

// News terms for the district rollout (district coverage plan 0.10), built from each body's
// catalog name by pattern instead of ~500 hand-written entries in data/news_terms.yaml. A body
// with a hand-written entry keeps it. A bare "MUD 165" is never a term: Fort Bend and other
// counties reuse the numbers, so every term carries the district's county prefix or own name.

const KINDS: [string, string][] = [
  ['Municipal Utility District', 'MUD'],
  ['Public Utility District', 'PUD'],
  ['Utility District', 'UD'],
  ['Water Control and Improvement District', 'WCID'],
  ['Fresh Water Supply District', 'FWSD'],
  ['Water Authority', 'Water Authority'],
  ['Drainage District', 'Drainage District'],
];

// Longer prefixes that end in a shorter one ("Northwest Harris County" ends in "Harris County").
const LONGER_PREFIXES = ['Northwest Harris County', 'Northeast Harris County', 'Southwest Harris County', 'West Harris County'];

export function waterTerms(body: Pick<CatalogBody, 'id' | 'name'>): BodyTerms | undefined {
  for (const [long, abbr] of KINDS) {
    const m = new RegExp(`^(.*?)\\s*${long}(?: No\\. (\\w+))?(?: (.+))?$`).exec(body.name);
    if (!m) continue;
    const [, prefix = '', num, rest] = m;
    const tail = num ? [` No. ${num}`, ` ${num}`] : rest ? [` ${rest}`] : [''];
    const heads = [prefix, ...(prefix === 'Harris County' && abbr === 'MUD' ? ['HC'] : [])].filter(Boolean);
    const aliases = new Set<string>([body.name]);
    for (const head of heads.length ? heads : ['']) {
      for (const t of tail) {
        aliases.add(`${head} ${abbr}${t}`.trim());
        aliases.add(`${head} ${long}${t}`.trim());
      }
    }
    if (prefix === 'Harris County' && abbr === 'MUD' && num) aliases.add(`HCMUD ${num}`);
    // "Harris County MUD 12" is inside "Northwest Harris County MUD 12": cancel on the longer name.
    const exclude = LONGER_PREFIXES.filter((p) => p !== prefix && p.endsWith(prefix) && prefix).flatMap((p) => (num ? [`${p} ${abbr} ${num}`, `${p} ${abbr} No. ${num}`] : []));
    // A district named only by its kind ("Utility District") would match far too much.
    if (!prefix && !rest) return undefined;
    return { body_id: body.id, aliases: [...aliases], exclude_terms: exclude };
  }
  return undefined;
}

export function schoolTerms(body: Pick<CatalogBody, 'id' | 'name'>, censusName?: string): BodyTerms {
  const short = body.name.replace(/ Board of Trustees$/, '');
  return { body_id: body.id, aliases: [short, ...(censusName ? [censusName] : [])], exclude_terms: [] };
}

/** Pattern terms for catalog water districts and school boards that have no hand-written entry. */
export function districtTerms(catalog: readonly CatalogBody[], handTerms: readonly BodyTerms[], censusNames: Readonly<Record<string, string>> = {}): BodyTerms[] {
  const hand = new Set(handTerms.map((t) => t.body_id));
  const out: BodyTerms[] = [];
  for (const body of catalog) {
    if (hand.has(body.id) || body.category !== 'tracked') continue;
    if (body.type === 'mud') {
      const t = waterTerms(body);
      if (t) out.push(t);
    } else if (body.type === 'school_board') {
      out.push(schoolTerms(body, censusNames[body.name.replace(/ Board of Trustees$/, '')]));
    }
  }
  return out;
}
