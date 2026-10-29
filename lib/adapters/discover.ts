import { load, type CheerioAPI } from 'cheerio';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { getText, type HttpOptions } from './http';
import { ZONE } from '@/lib/ingest/normalize';

// Link discovery for llm_extract sources (agent-scraper-spec §8 Step 5, D15).
// Code picks the PDFs from a static index page; the LLM only ever sees the chosen documents.

export const DiscoveryConfigSchema = z
  .object({
    // {yyyy}, {m} and {mm} in the URL: a month page ("handler.php?month={m}&year={yyyy}"); this and next month are read.
    index_url: z.string().url(),
    link_pattern: z.string(),
    // data_file_name: the anchor's data-file-name attribute (Finalsite: the URL is an opaque UUID).
    // line_text: the link's line, from the previous <br> or block start ("2026-10-21 – Regular: Agenda").
    // row_text: the nearest ancestor with a date and no other link (Wix repeaters: "View Document" beside its title).
    date_from: z.enum(['link_text', 'filename', 'data_file_name', 'line_text', 'row_text']).default('link_text'),
    meeting_type_from_text: z.object({ special: z.string() }).partial().optional(),
    follow_notice_page: z.boolean().optional(),
    /** Also match absolute URLs anywhere in the page source (Apptegy's embedded document JSON). */
    embedded_links: z.boolean().optional(),
    /** Also test link_pattern against the anchor text (Google Drive folders: the URL is an opaque ID). */
    match_link_text: z.boolean().optional(),
    /** Which day of a dotted day range ("10.19-20.26") is the meeting. Default first. */
    date_range: z.enum(['first', 'last']).optional(),
    /** Only anchors matching this CSS selector ("td:first-child a": an Agendas column beside Minutes). */
    link_selector: z.string().optional(),
    /** Date from the text of the link's closest ancestor matching this selector (Avada toggles: ".fusion-panel", date in the panel title). */
    date_container: z.string().optional(),
  })
  .loose();
export type DiscoveryConfig = z.infer<typeof DiscoveryConfigSchema>;

export type DiscoveredDoc = {
  url: string;
  /** Anchor text, whitespace-collapsed. */
  text: string;
  /** Decoded last path segment of the URL. */
  filename: string;
  /** Local America/Chicago date, yyyy-MM-dd. */
  date: string;
  /** False when the source only gave a month ("1710 October 2017"); the day is then 01. */
  day_known: boolean;
  type: 'regular' | 'special';
  /** Revision suffix from the filename (`_1`), or 0. */
  version: number;
  /** Position on the index page (document order). */
  index: number;
};

export type DiscoveryResult = {
  /** One document per date: the chosen agenda. */
  docs: DiscoveredDoc[];
  /** Other PDFs for a date that already has a chosen document. Still stored as documents. */
  superseded: DiscoveredDoc[];
  warnings: string[];
  /** Raw index page(s) for `documents`. */
  pages: { url: string; html: string }[];
};

export type DiscoverDeps = { http?: HttpOptions; now?: () => Date };

/** Config regexes are written Python-style ("(?i)…"); JS has no inline flags. */
export function toRegExp(pattern: string): RegExp {
  const m = pattern.match(/^\(\?([a-z]+)\)/);
  if (!m) return new RegExp(pattern);
  const flags = m[1]!.replace(/[^imsu]/g, '');
  return new RegExp(pattern.slice(m[0].length), flags);
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH_RE =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const SEP = '[\\s_.,-]*';

const monthNum = (s: string) => MONTHS[s.toLowerCase().slice(0, s.toLowerCase().startsWith('sept') ? 4 : 3)];

function ymd(y: number, m: number, d: number): string | null {
  const dt = DateTime.fromObject({ year: y, month: m, day: d }, { zone: ZONE });
  return dt.isValid ? dt.toFormat('yyyy-MM-dd') : null;
}

const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));

/**
 * Parse a meeting date from link text or a filename. Accepted forms:
 * `October 1, 2026`, `Oct. 1, 2026`, `Agenda_October_19_2026_…`, `2026 September 16`, `10/1/2026`,
 * `10-01-26`, `Agenda_10_08_26_…`, `2026-10-01`, compact `20261001` or `10012026`, dotted `10.19-20.26`, and month-only `1710 October 2017 Board Agenda`
 * (day_known = false). For a dotted day range, `range: 'last'` takes the end day (Aldine posts the
 * Monday study session and Tuesday vote as one file).
 */
export function parseDocDate(input: string, range: 'first' | 'last' = 'first'): { date: string; day_known: boolean } | null {
  const s = input.replace(/%20/g, ' ');
  const tries: [RegExp, (m: RegExpMatchArray) => string | null][] = [
    [/(?<!\d)(\d{4})[-_](\d{2})[-_](\d{2})(?!\d)/, (m) => ymd(+m[1]!, +m[2]!, +m[3]!)],
    [new RegExp(`(?<![a-z])${MONTH_RE}\\.?${SEP}(\\d{1,2})(?:-\\d{1,2})?(?:st|nd|rd|th)?${SEP}(\\d{4})(?!\\d)`, 'i'), (m) => ymd(+m[3]!, monthNum(m[1]!)!, +m[2]!)],
    [new RegExp(`(?<!\\d)(\\d{4})${SEP}${MONTH_RE}\\.?${SEP}(\\d{1,2})(?!\\d)`, 'i'), (m) => ymd(+m[1]!, monthNum(m[2]!)!, +m[3]!)],
    [/(?<!\d)(\d{1,2})([/_-])(\d{1,2})\2(\d{4}|\d{2})(?!\d)/, (m) => ymd(fullYear(m[4]!), +m[1]!, +m[3]!)],
    [
      /(?<![\d.])(\d{1,2})\.(\d{1,2})(?:-(\d{1,2}))?\.(\d{4}|\d{2})(?!\d)/,
      (m) => ymd(fullYear(m[4]!), +m[1]!, range === 'last' && m[3] ? +m[3] : +m[2]!),
    ],
  ];
  for (const [re, fn] of tries) {
    const m = s.match(re);
    if (m) {
      const d = fn(m);
      if (d) return { date: d, day_known: true };
    }
  }
  // Compact 8 digits, 20xx years only: YYYYMMDD first, then MMDDYYYY (`11022026_AGENDA_…`).
  const compact = s.match(/(?<!\d)(\d{8})(?!\d)/);
  if (compact) {
    const n = compact[1]!;
    const d =
      (n.startsWith('20') ? ymd(+n.slice(0, 4), +n.slice(4, 6), +n.slice(6, 8)) : null) ??
      (n.slice(4, 6) === '20' ? ymd(+n.slice(4, 8), +n.slice(0, 2), +n.slice(2, 4)) : null);
    if (d) return { date: d, day_known: true };
  }
  const mo = s.match(new RegExp(`(?<![a-z])${MONTH_RE}\\.?${SEP}(\\d{4})(?!\\d)`, 'i'));
  if (mo) {
    const d = ymd(+mo[2]!, monthNum(mo[1]!)!, 1);
    if (d) return { date: d, day_known: false };
  }
  return null;
}

/** `_1` revision suffix before an optional upload hash: `…_HCMUD_489_1_0563351dfa.pdf` -> 1. */
export function versionSuffix(filename: string): number {
  const m = filename.match(/_(\d{1,2})(?:_[0-9a-f]{6,})?\.pdf$/i);
  const n = m ? Number(m[1]) : 0;
  // "…-REVISED.pdf", "UpdatedBoardAgenda.pdf": a re-posted agenda beats the original.
  return /revised|amended|updated/i.test(filename) ? Math.max(n, 1) : n;
}

/** The URL to download a document from: a Drive `/file/d/<id>/view` page becomes its file download. */
export function downloadUrl(url: string): string {
  const id = url.match(/^https:\/\/drive\.google\.com\/file\/d\/([\w-]+)\//)?.[1];
  return id ? `https://drive.google.com/uc?export=download&id=${id}` : url;
}

const lastSegment = (url: string) => {
  const p = new URL(url).pathname;
  const seg = p.slice(p.lastIndexOf('/') + 1);
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
};

const decodedUrl = (url: string) => {
  try {
    return decodeURI(url);
  } catch {
    return url;
  }
};

const INLINE = new Set(['a', 'span', 'strong', 'b', 'em', 'i', 'u', 'small', 'font', 'mark']);
type DomNode = Parameters<CheerioAPI['contains']>[1];
const isInline = (n: DomNode | null) => !!n && 'name' in n && INLINE.has(n.name);

/** Text before an anchor on its line, back to the previous <br> or the start of its block, plus the link text. */
export function lineText($: CheerioAPI, a: DomNode): string {
  const parts: string[] = [$(a).text()];
  for (let node: DomNode | null = a; node; node = isInline(node.parent) ? node.parent : null) {
    for (let prev = node.prev; prev; prev = prev.prev) {
      if ('name' in prev && !isInline(prev)) return parts.reverse().join(' ').replace(/\s+/g, ' ').trim();
      parts.push($(prev).text());
    }
  }
  return parts.reverse().join(' ').replace(/\s+/g, ' ').trim();
}

/** Text of the nearest ancestor that holds a date and no other link; '' when a row boundary comes first. */
export function rowText($: CheerioAPI, a: DomNode, dateRange?: DiscoveryConfig['date_range']): string {
  for (let node = $(a).parent(); node.length && !node.is('body'); node = node.parent()) {
    if (node.find('a[href]').length > 1) return '';
    const text = node.text().replace(/\s+/g, ' ').trim();
    if (parseDocDate(text, dateRange)) return text;
  }
  return '';
}

/** Parse an index page into dated documents (no window filter, no dedup). */
export function parseIndex(html: string, baseUrl: string, cfg: DiscoveryConfig): { docs: DiscoveredDoc[]; undated: string[] } {
  const $ = load(html);
  const linkRe = toRegExp(cfg.link_pattern);
  const specialRe = cfg.meeting_type_from_text?.special ? toRegExp(cfg.meeting_type_from_text.special) : null;
  const docs: DiscoveredDoc[] = [];
  // Links with no parseable date (forms, split anchors on old entries). Not warnings: they are
  // constant page furniture and would only add noise to the health check.
  const undated: string[] = [];
  const seen = new Set<string>();
  const consider = (href: string, text: string, dataName: string, i: number, line = text) => {
    let url: string;
    try {
      url = new URL(href, baseUrl).toString();
    } catch {
      return;
    }
    const matched =
      linkRe.test(decodedUrl(url)) || linkRe.test(href) || (dataName && linkRe.test(dataName)) || (cfg.match_link_text && text && linkRe.test(text));
    if (!matched) return;
    if (seen.has(url)) return;
    seen.add(url);
    const filename = lastSegment(url);
    const dateSource = cfg.date_container
      ? line
      : cfg.date_from === 'filename' ? filename : cfg.date_from === 'data_file_name' ? dataName : cfg.date_from === 'line_text' || cfg.date_from === 'row_text' ? line : text;
    const parsed = parseDocDate(dateSource, cfg.date_range);
    if (!parsed) {
      undated.push(url);
      return;
    }
    docs.push({
      url,
      text,
      filename,
      date: parsed.date,
      day_known: parsed.day_known,
      type:
        specialRe && (specialRe.test(text) || specialRe.test(filename) || specialRe.test(dataName) || (cfg.date_from === 'row_text' && specialRe.test(line)))
          ? 'special'
          : 'regular',
      version: versionSuffix(filename),
      index: i,
    });
  };
  const anchors = $(cfg.link_selector ? `${cfg.link_selector}[href]` : 'a[href]').toArray();
  anchors.forEach((a, i) => {
    const text = $(a).text().replace(/\s+/g, ' ').trim();
    const line = cfg.date_container
      ? $(a).closest(cfg.date_container).text().replace(/\s+/g, ' ').trim()
      : cfg.date_from === 'line_text'
        ? lineText($, a)
        : cfg.date_from === 'row_text'
          ? rowText($, a, cfg.date_range)
          : text;
    consider($(a).attr('href')!.trim(), text, ($(a).attr('data-file-name') ?? '').trim(), i, line);
  });
  if (cfg.embedded_links) {
    // Apptegy (Thrillshare) pages ship their document list as JSON in the page, not as anchors.
    let i = anchors.length;
    for (const m of html.matchAll(/https?:\/\/[^\s"'<>\\]+/g)) consider(m[0], '', '', i++);
  }
  return { docs, undated };
}

/** Keep documents whose (local) date overlaps the window. */
export function inWindow(doc: Pick<DiscoveredDoc, 'date'>, window: { from: Date; to: Date }): boolean {
  const day = DateTime.fromISO(doc.date, { zone: ZONE });
  return day.endOf('day').toMillis() >= window.from.getTime() && day.startOf('day').toMillis() <= window.to.getTime();
}

const SECONDARY = /workshop|retreat|work session/i;

/**
 * One document per date. Highest `_N` revision wins; with no suffixes, a regular/special meeting
 * beats a workshop or retreat, then the last one on the page wins. Others are returned as superseded.
 */
export function pickPerDate(docs: DiscoveredDoc[]): { docs: DiscoveredDoc[]; superseded: DiscoveredDoc[]; warnings: string[] } {
  const byDate = new Map<string, DiscoveredDoc[]>();
  for (const d of docs) byDate.set(d.date, [...(byDate.get(d.date) ?? []), d]);
  const chosen: DiscoveredDoc[] = [];
  const superseded: DiscoveredDoc[] = [];
  const warnings: string[] = [];
  for (const [date, group] of byDate) {
    const best = [...group].sort(
      (a, b) =>
        b.version - a.version ||
        Number(SECONDARY.test(a.text + a.filename)) - Number(SECONDARY.test(b.text + b.filename)) ||
        b.index - a.index,
    )[0]!;
    chosen.push(best);
    if (group.length > 1) {
      const others = group.filter((d) => d !== best);
      superseded.push(...others);
      warnings.push(`${group.length} agenda PDFs for ${date}; using ${best.filename}, also stored: ${others.map((o) => o.filename).join(', ')}`);
    }
  }
  chosen.sort((a, b) => a.date.localeCompare(b.date));
  return { docs: chosen, superseded, warnings };
}

/** First PDF link on a notice page (`follow_notice_page: true`); failing that, its first Google Drive file link. */
export function firstPdfLink(html: string, baseUrl: string): string | undefined {
  const hrefs = load(html)('a[href]')
    .toArray()
    .map((a) => a.attribs.href!);
  const href = hrefs.find((h) => /\.pdf(?:$|[?#])/i.test(h)) ?? hrefs.find((h) => /^https:\/\/drive\.google\.com\/file\/d\/[\w-]+/.test(h));
  return href ? new URL(href, baseUrl).toString() : undefined;
}

/** The index URL with its month placeholders filled for this month and next (America/Chicago); else just the URL. */
export function indexUrls(template: string, now: Date): string[] {
  if (!/\{(yyyy|mm|m)\}/.test(template)) return [template];
  const start = DateTime.fromJSDate(now, { zone: ZONE }).startOf('month');
  return [start, start.plus({ months: 1 })].map((d) =>
    template
      .replaceAll('{yyyy}', String(d.year))
      .replaceAll('{mm}', String(d.month).padStart(2, '0'))
      .replaceAll('{m}', String(d.month)),
  );
}

/** discover(config, window): fetch the index, pick dated PDFs inside the window, one per date. */
export async function discover(
  rawConfig: unknown,
  window: { from: Date; to: Date },
  deps: DiscoverDeps = {},
): Promise<DiscoveryResult> {
  const cfg = DiscoveryConfigSchema.parse(rawConfig);
  const pages: { url: string; html: string }[] = [];
  let docs: DiscoveredDoc[] = [];
  for (const url of indexUrls(cfg.index_url, deps.now?.() ?? new Date())) {
    const html = await getText(url, deps.http);
    pages.push({ url, html });
    docs.push(...parseIndex(html, url, cfg).docs.filter((d) => inWindow(d, window)));
  }
  const warnings: string[] = [];
  if (cfg.follow_notice_page) {
    const followed: DiscoveredDoc[] = [];
    for (const d of docs) {
      const page = await getText(d.url, deps.http);
      pages.push({ url: d.url, html: page });
      const pdf = firstPdfLink(page, d.url);
      if (pdf) followed.push({ ...d, url: pdf, filename: lastSegment(pdf), version: versionSuffix(lastSegment(pdf)) });
      else warnings.push(`notice page has no PDF link: ${d.url}`);
    }
    docs = followed;
  }
  for (const d of docs) if (!d.day_known) warnings.push(`only a month in "${d.text || d.filename}"; day assumed 01`);
  const picked = pickPerDate(docs);
  return { docs: picked.docs, superseded: picked.superseded, warnings: [...warnings, ...picked.warnings], pages };
}
