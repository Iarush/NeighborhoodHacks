import { load } from 'cheerio';
import { parseIndex, type DiscoveredDoc } from '@/lib/adapters/discover';

// Pure part of scripts/survey-district-sites.ts (district coverage plan 0.7). Given a district's
// pages, it names the site's vendor and suggests an llm_extract config (index page, link
// pattern, date format) by trying a few patterns with the adapter's own parser. The result is a
// suggestion for a person to check; nothing here writes data/sources.yaml.

/** Board-meeting platforms that have (or may get) their own adapter, keyed by a URL fingerprint. */
const PLATFORMS: [RegExp, string][] = [
  [/meetings\.boardbook\.org/i, 'boardbook'],
  [/\.legistar\.com/i, 'legistar'],
  [/\.primegov\.com/i, 'primegov'],
  [/simbli\.eboardsolutions\.com/i, 'simbli'],
  [/go\.boarddocs\.com/i, 'boarddocs'],
  [/\.diligent\.community|diligentboards\.com/i, 'diligent'],
  [/\.civicclerk\.com/i, 'civicclerk'],
  [/\.granicus\.com/i, 'granicus'],
  // Not a board platform: documents kept as Google Drive files, which the adapter can't fetch as
  // PDFs yet (a vendor template must turn /file/d/<id>/view into a download link).
  [/drive\.google\.com\/file\/d\//i, 'google-drive'],
];

/** Site builders, from asset hosts or the generator tag. Only a grouping hint for the survey. */
const BUILDERS: [RegExp, string][] = [
  [/squarespace/i, 'squarespace'],
  [/wix(static)?\.com|wix\.com/i, 'wix'],
  [/wp-content|wordpress/i, 'wordpress'],
  [/finalsite/i, 'finalsite'],
  [/schoolmessenger|edlio/i, 'edlio'],
  [/apptegy|thrillshare/i, 'apptegy'],
  [/strapi|\/static\/.+\.pdf/i, 'static-pdf'],
  [/godaddy|img1\.wsimg\.com/i, 'godaddy'],
  [/weebly/i, 'weebly'],
];

export type Platform = { platform: string; url: string };

export function boardPlatforms(html: string, baseUrl: string): Platform[] {
  const $ = load(html);
  const out = new Map<string, Platform>();
  $('a[href], iframe[src]').each((_, el) => {
    const raw = $(el).attr('href') ?? $(el).attr('src') ?? '';
    let url: string;
    try {
      url = new URL(raw, baseUrl).toString();
    } catch {
      return;
    }
    const hit = PLATFORMS.find(([re]) => re.test(url));
    if (hit && !out.has(hit[1])) out.set(hit[1], { platform: hit[1], url });
  });
  return [...out.values()];
}

export function siteBuilder(html: string): string {
  const generator = load(html)('meta[name="generator"]').attr('content') ?? '';
  return BUILDERS.find(([re]) => re.test(generator))?.[1] ?? BUILDERS.find(([re]) => re.test(html))?.[1] ?? 'unknown';
}

/** Same-site pages that probably list agendas, best first. */
export function agendaPageLinks(html: string, baseUrl: string, limit = 3): string[] {
  const $ = load(html);
  const host = new URL(baseUrl).host;
  const scored = new Map<string, number>();
  $('a[href]').each((_, a) => {
    let url: URL;
    try {
      url = new URL($(a).attr('href')!, baseUrl);
    } catch {
      return;
    }
    if (url.host !== host || /\.(pdf|docx?|jpe?g|png)$/i.test(url.pathname)) return;
    url.hash = '';
    const key = url.toString();
    if (key === new URL(baseUrl).toString()) return;
    const text = `${$(a).text()} ${url.pathname}`.toLowerCase();
    const score = (/agenda/.test(text) ? 3 : 0) + (/meeting/.test(text) ? 2 : 0) + (/board|notice|minutes/.test(text) ? 1 : 0);
    if (score > 0) scored.set(key, Math.max(score, scored.get(key) ?? 0));
  });
  return [...scored].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([url]) => url);
}

export type ConfigSuggestion = {
  index_url: string;
  link_pattern: string;
  date_from: 'link_text' | 'filename';
  dated: number;
  newest?: string;
  sample?: string;
};

// Tried in order; the one that dates the most documents wins. Broad on purpose: a person narrows
// the pattern before it goes into sources.yaml.
const PATTERNS = ['(?i)agenda[^/]*\\.pdf$', '(?i)agenda', '(?i)\\.pdf$', '(?i)drive\\.google\\.com/file/d/'];
const BROAD = new Set(['(?i)\\.pdf$', '(?i)drive\\.google\\.com/file/d/']);

/** Newest agenda wins (an archive page lists more but older ones); then the most dated links. */
export function betterSuggestion(a: ConfigSuggestion, b: ConfigSuggestion | undefined): boolean {
  if (!b) return true;
  // A lone dated link (a notice, a form) shouldn't beat a real list.
  if ((a.dated >= 3) !== (b.dated >= 3)) return a.dated >= 3;
  if ((a.newest ?? '') !== (b.newest ?? '')) return (a.newest ?? '') > (b.newest ?? '');
  return a.dated > b.dated;
}

/** The best llm_extract config for one page, or undefined when nothing on it parses as a dated agenda. */
export function suggestConfig(html: string, pageUrl: string): ConfigSuggestion | undefined {
  let best: ConfigSuggestion | undefined;
  for (const link_pattern of PATTERNS) {
    for (const date_from of ['filename', 'link_text'] as const) {
      const { docs } = parseIndex(html, pageUrl, { index_url: pageUrl, link_pattern, date_from });
      const agendaDocs = BROAD.has(link_pattern) ? docs.filter((d) => !/minute/i.test(`${d.text} ${d.filename}`)) : docs;
      if (agendaDocs.length === 0) continue;
      const newest = agendaDocs.reduce<DiscoveredDoc>((a, b) => (b.date > a.date ? b : a), agendaDocs[0]!);
      const next = { index_url: pageUrl, link_pattern, date_from, dated: agendaDocs.length, newest: newest.date, sample: newest.filename };
      if (betterSuggestion(next, best)) best = next;
    }
  }
  return best;
}

/** Days from the newest agenda to `today` (yyyy-MM-dd); the batch checker wants it within expected_max_gap_days. */
export function daysSince(date: string, today: string): number {
  return Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000);
}

/** "Harris County Municipal Utility District #157" and "... No. 157" are the same name. */
export function comptrollerKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(no\.?|number)\s*/g, '')
    .replace(/#\s*/g, '')
    .replace(/\b0+(\d)/g, '$1')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const KIND_WORDS: Record<string, string> = {
  mud: '(?:mud|municipal utility district)',
  ud: '(?:ud|utility district)',
  pud: '(?:pud|public utility district)',
  wcid: '(?:wcid|water control (?:and|&) improvement district)',
  fwsd: '(?:fwsd|fresh water supply district)',
};

/** Domains a district's own site often uses ("hcmud165.com"). Only tried, never trusted: see namesDistrict. */
export function guessedDomains(bodyId: string): string[] {
  const m = /^(hc|nwhc|whc)(mud|ud|pud|wcid|fwsd)_(\d+[a-z]?)$/.exec(bodyId);
  const stems = m
    ? [`${m[1]}${m[2]}${m[3]}`, ...(m[1] === 'hc' ? [`harriscounty${m[2]}${m[3]}`] : []), ...(m[1] === 'nwhc' ? [`nwhc${m[2]}${m[3]}`, `northwestharriscounty${m[2]}${m[3]}`] : [])]
    : [bodyId.replace(/_/g, '')];
  return stems.flatMap((s) => [`https://www.${s}.com/`, `https://www.${s}.org/`, `https://www.${s}.net/`]);
}

/** True when the page names this district: its kind and number ("MUD No. 165", "WCID #157"). */
export function namesDistrict(html: string, bodyId: string, name: string): boolean {
  const text = load(html).root().text().replace(/\s+/g, ' ');
  const m = /(mud|ud|pud|wcid|fwsd)_(\d+[a-z]?)$/.exec(bodyId);
  if (m) return new RegExp(`${KIND_WORDS[m[1]!]}\\s*(?:no\\.?|number|#)?\\s*0*${m[2]}(?![0-9])`, 'i').test(text);
  return text.toLowerCase().includes(name.toLowerCase().replace(/ no\. .*$/, ''));
}
