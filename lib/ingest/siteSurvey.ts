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

// Vendor fingerprints (MUD rollout spec §2 step 3). Many water districts share a web firm or a
// manager's portal; districts with the same fingerprint can share one adapter.

export type Fingerprint = {
  generator?: string;
  /** WordPress theme folder names, e.g. "astra". */
  themes: string[];
  /** Off-site hosts that serve the page's scripts, styles and images. */
  cdnHosts: string[];
  /** Hosts of the document links (PDFs, Drive files) on the page, most common first. */
  docHosts: string[];
  /** A "website by …" or "powered by …" credit, lower case. */
  credit?: string;
};

function hostOf(raw: string, baseUrl: string): string | undefined {
  try {
    return new URL(raw, baseUrl).host.toLowerCase().replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

/** Common CDNs that say nothing about who built the site. */
const GENERIC_HOSTS = /(^|\.)(googleapis\.com|gstatic\.com|google\.com|googletagmanager\.com|google-analytics\.com|jquery\.com|jsdelivr\.net|cloudflare\.com|cdnjs\.cloudflare\.com|bootstrapcdn\.com|fontawesome\.com|typekit\.net|gravatar\.com|w\.org|wp\.com|youtube\.com|facebook\.net|recaptcha\.net|unpkg\.com|polyfill\.io)$/;

export function fingerprint(html: string, baseUrl: string): Fingerprint {
  const $ = load(html);
  const self = hostOf(baseUrl, baseUrl);
  const generator = $('meta[name="generator"]').attr('content')?.trim() || undefined;
  const themes = new Set<string>();
  for (const m of html.matchAll(/wp-content\/themes\/([a-z0-9_-]+)/gi)) themes.add(m[1]!.toLowerCase());
  const cdn = new Set<string>();
  $('script[src], link[href][rel="stylesheet"], img[src]').each((_, el) => {
    const h = hostOf($(el).attr('src') ?? $(el).attr('href') ?? '', baseUrl);
    if (h && h !== self && !GENERIC_HOSTS.test(h)) cdn.add(h);
  });
  const docs = new Map<string, number>();
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href')!;
    if (!/\.pdf(\?|$)|drive\.google\.com\/(file|drive|open)|docs\.google\.com/i.test(href)) return;
    const h = hostOf(href, baseUrl);
    if (h) docs.set(h, (docs.get(h) ?? 0) + 1);
  });
  const foot = ($('footer').text() || $('body').text().slice(-2000)).replace(/\s+/g, ' ');
  const credit = /\b(?:website|site|web design|designed|developed|built|hosted|powered|managed)(?: and \w+)? by:?\s+([A-Za-z0-9&.' -]{2,40}?)(?=\s*(?:[|©.,]|$|\s{2}|\s(?:all rights|copyright|\d{4})))/i.exec(foot)?.[1]?.trim().toLowerCase();
  return {
    generator,
    themes: [...themes],
    cdnHosts: [...cdn].sort(),
    docHosts: [...docs].sort((a, b) => b[1] - a[1]).map(([h]) => h),
    credit: credit ? cleanCredit(credit) : undefined,
  };
}

/** "infinity services llc privacy policy" → "infinity services". */
export function cleanCredit(credit: string): string | undefined {
  const c = credit.replace(/\s+(?:privacy|facebook|twitter|instagram|linkedin|terms|contact|home|sitemap)\b.*$/, '').replace(/[\s,]+(?:llc|inc|co)\.?$/, '').trim();
  return c.length > 1 ? c : undefined;
}

/** Hosts that stand for one vendor: per-district S3 buckets named website-media-<district>. */
export function vendorHost(host: string): string {
  return /^website-media-[a-z0-9-]+\.s3[.a-z0-9-]*\.amazonaws\.com$/.test(host) ? 'website-media-*.s3.amazonaws.com' : host;
}

/** State agencies whose forms (TCEQ, Secretary of State) many sites link; they host no agendas. */
const AGENCY_HOSTS = /(^|\.)(texas\.gov|state\.tx\.us|tx\.us|gov)$/;

/** Tax offices' and law firms' district listings: the "website" is a page on their site, not the district's own. */
const LISTING_HOSTS = /(^|\.)(utilitytaxservice\.com|bli-tax\.com|sklawdistrictdata\.org|districtdirectory\.org|wheelerassoc\.com)$/;

/** Merge a later page's fingerprint into the site's; the home page's fields come first. */
export function mergeFingerprints(a: Fingerprint, b: Fingerprint): Fingerprint {
  const union = (x: string[], y: string[]) => [...new Set([...x, ...y])];
  return { generator: a.generator ?? b.generator, themes: union(a.themes, b.themes), cdnHosts: union(a.cdnHosts, b.cdnHosts), docHosts: union(a.docHosts, b.docHosts), credit: a.credit ?? b.credit };
}

/** Builder themes that many unrelated sites use, so they don't name a vendor on their own. */
const STOCK_THEMES = /^(twenty\w*|astra|divi|avada|hello-elementor|generatepress|oceanwp|kadence|neve|enfold|salient|bridge|betheme|x|pro|genesis|flatsome|storefront|blocksy|extra|uncode|the7|jupiter|porto|sydney|hestia|go|understrap|bootstrap\w*)$/;

/**
 * One vendor key per district: a board platform first, then a web firm's credit, then an
 * off-site document host (a firm's or manager's portal), then a custom theme, then Drive plus the
 * builder, then the builder alone. `platforms` excludes google-drive, which is a document host.
 */
export function vendorKey(fp: Fingerprint, platforms: string[], builder: string, selfHost: string): string {
  const platform = platforms.find((p) => p !== 'google-drive');
  if (platform) return platform;
  const credit = fp.credit && cleanCredit(fp.credit);
  if (credit) return `credit:${credit}`;
  const portal = fp.docHosts.find((h) => h !== selfHost && !/google\.com$/.test(h) && !AGENCY_HOSTS.test(h));
  if (portal) return `docs:${vendorHost(portal)}`;
  const theme = fp.themes.find((t) => !STOCK_THEMES.test(t));
  if (theme) return `theme:${theme}`;
  const drive = fp.docHosts.some((h) => /google\.com$/.test(h)) || platforms.includes('google-drive');
  if (drive) return `google-drive/${builder}`;
  if (LISTING_HOSTS.test(selfHost)) return `listing:${selfHost}`;
  const generator = fp.generator?.replace(/[\s\d.]+$/, '').toLowerCase();
  if (builder === 'unknown' && generator) return `generator:${generator}`;
  return builder;
}

/**
 * Buckets of about `size` districts (spec §3). A vendor stays in one bucket unless it has more
 * than `size`, when it fills consecutive buckets. The bucket holding `firstId` goes first, then
 * the largest. Input: vendor → district IDs. Output: buckets of [vendor, ids][] parts.
 */
export function bucketize(groups: Map<string, string[]>, firstId: string, size = 20): { vendors: string[]; ids: string[] }[] {
  const out: { vendors: string[]; ids: string[] }[] = [];
  const vendors = [...groups].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const small: [string, string[]][] = [];
  for (const [v, ids] of vendors) {
    if (ids.length <= size) { small.push([v, ids]); continue; }
    const parts = Math.ceil(ids.length / size);
    const per = Math.ceil(ids.length / parts);
    for (let i = 0; i < ids.length; i += per) out.push({ vendors: [v], ids: ids.slice(i, i + per) });
  }
  // First-fit decreasing into mixed buckets.
  const mixed: { vendors: string[]; ids: string[] }[] = [];
  for (const [v, ids] of small) {
    const slot = mixed.find((b) => b.ids.length + ids.length <= size);
    if (slot) { slot.vendors.push(v); slot.ids.push(...ids); } else mixed.push({ vendors: [v], ids: [...ids] });
  }
  out.push(...mixed);
  out.sort((a, b) => Number(b.ids.includes(firstId)) - Number(a.ids.includes(firstId)) || b.ids.length - a.ids.length);
  return out;
}
