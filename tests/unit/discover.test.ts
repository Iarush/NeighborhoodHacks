import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
  DiscoveryConfigSchema,
  discover,
  firstPdfLink,
  inWindow,
  parseDocDate,
  parseIndex,
  pickPerDate,
  toRegExp,
  versionSuffix,
  type DiscoveredDoc,
} from '@/lib/adapters/discover';
import { getPdfText, textLayerStats } from '@/lib/adapters/pdfText';
import { ZONE } from '@/lib/ingest/normalize';
import { loadSources } from '@/lib/ingest/registry';

const GOLDEN = fileURLToPath(new URL('../golden/llm-extract/', import.meta.url));
const read = (p: string) => readFileSync(join(GOLDEN, p), 'utf8');
const sources = loadSources();
const cfgOf = (id: string) => DiscoveryConfigSchema.parse(sources.find((s) => s.id === id)!.config);
const LS = cfgOf('lone_star_board');
const MUD = cfgOf('hcmud_489');
const win = (from: string, to: string) => ({
  from: DateTime.fromISO(from, { zone: ZONE }).startOf('day').toJSDate(),
  to: DateTime.fromISO(to, { zone: ZONE }).endOf('day').toJSDate(),
});

describe('parseDocDate', () => {
  const cases: [string, string, boolean?][] = [
    ['October 1, 2026 Regular Meeting Including Tax Rate Public Hearing', '2026-10-01'],
    ['Oct. 1, 2026', '2026-10-01'],
    ['October 30-31, 2015 Board of Trustees Retreat Agenda', '2015-10-30'],
    ['Sept. 14, 2005 Public Hearing', '2005-09-14'],
    ['10/1/2026', '2026-10-01'],
    ['10-01-26', '2026-10-01'],
    ['2026-10-01', '2026-10-01'],
    ['2026 September 16 Special Meeting Set Tax Hearing Agenda_Final_a.pdf', '2026-09-16'],
    ['1710 October 2017 Board Agenda', '2017-10-01', false],
    ['November 6, 2025 Regular Meeting ', '2025-11-06'],
    // the 4 MUD 489 filename styles (§2)
    ['Agenda_October_19_2026_HCMUD_489_5b93c39b1d.pdf', '2026-10-19'],
    ['Special_Agenda_April_9_2026_HCMUD_489_c838005a4d.pdf', '2026-04-09'],
    ['HARRIS_COUNTY_MUNICIPAL_UTILITY_DISTRICT_NO_489_NOTICE_OF_PUBLIC_MEETING_AGENDA_July_20_2026_85fe68f8c7.pdf', '2026-07-20'],
    ['Agenda_September_21_2026_HCMUD_489_1_0563351dfa.pdf', '2026-09-21'],
    ['Minutes_May_18_2026_Approved_HCMUD_489_e276bfac9d.pdf', '2026-05-18'],
    // compact 8 digits (HC WCID 92): YYYYMMDD first, then MMDDYYYY
    ['11022026_AGENDA_HARRIS_COUNTY_WCID_92_f948ef97e9.pdf', '2026-11-02'],
    ['10052026_AMENDED_AGENDA_HC_WCID_92_001_1_2f7cfc7f60.pdf', '2026-10-05'],
    ['Agenda_20261102_final.pdf', '2026-11-02'],
    ['20101020_Agenda.pdf', '2010-10-20'], // MMDDYYYY would be month 20
    ['12202020_Agenda.pdf', '2020-12-20'], // YYYYMMDD would be year 1220
  ];
  for (const [input, date, dayKnown = true] of cases) {
    it(input, () => expect(parseDocDate(input)).toEqual({ date, day_known: dayKnown }));
  }
  it('returns null with no date', () => {
    expect(parseDocDate('Printable Citizen Participation Form')).toBeNull();
    expect(parseDocDate('February 30, 2026')).toBeNull();
    expect(parseDocDate('13022026_AGENDA.pdf')).toBeNull();
    expect(parseDocDate('02301999_AGENDA.pdf')).toBeNull();
  });
});

describe('helpers', () => {
  it('toRegExp understands (?i)', () => {
    expect(toRegExp('(?i)/static/.+agenda_.+\\.pdf$').test('/static/x/SPECIAL_AGENDA_April.pdf')).toBe(true);
    expect(toRegExp('\\.pdf$').flags).toBe('');
  });
  it('versionSuffix ignores the hash and district number', () => {
    expect(versionSuffix('Agenda_September_21_2026_HCMUD_489_1_0563351dfa.pdf')).toBe(1);
    expect(versionSuffix('Agenda_October_19_2026_HCMUD_489_5b93c39b1d.pdf')).toBe(0);
  });
  it('firstPdfLink resolves relative links', () => {
    expect(firstPdfLink('<a href="/x.htm">x</a><a href="a/b.pdf">b</a>', 'https://e.org/n/')).toBe('https://e.org/n/a/b.pdf');
  });
});

describe('Lone Star index (golden)', () => {
  const { docs } = parseIndex(read('discovery/lonestar-index.html'), LS.index_url, LS);
  it('parses dated PDF links with absolute URLs', () => {
    expect(docs.length).toBeGreaterThan(200);
    expect(docs.every((d) => d.url.startsWith('http'))).toBe(true);
  });
  it('window filter by parsed date keeps Oct 1 and excludes 2016-2017 links', () => {
    const inWin = docs.filter((d) => inWindow(d, win('2026-09-20', '2026-10-20')));
    expect(inWin.map((d) => d.date)).toEqual(['2026-10-01']);
    expect(inWin[0]!.url).toBe('https://www.lonestar.edu/departments/chancellor/October%201,%202026%20Agenda_Final%20(Website).pdf');
    expect(inWin[0]!.type).toBe('regular');
    expect(docs.some((d) => d.date.startsWith('2016'))).toBe(true);
    expect(inWin.some((d) => /^201[67]/.test(d.date))).toBe(false);
  });
  it('flags special meetings from link text', () => {
    expect(docs.find((d) => d.date === '2026-09-16')!.type).toBe('special');
  });
  it('same-date regular meeting beats the budget workshop', () => {
    const aug = pickPerDate(docs.filter((d) => d.date === '2026-08-06'));
    expect(aug.docs).toHaveLength(1);
    expect(aug.docs[0]!.text).toMatch(/Regular Meeting/);
    expect(aug.superseded[0]!.text).toMatch(/Budget Workshop/);
    expect(aug.warnings).toHaveLength(1);
  });
});

describe('MUD 489 index (golden)', () => {
  const html = read('discovery/mud489-index.html');
  const agendas = parseIndex(html, MUD.index_url, MUD).docs;
  const minutes = parseIndex(html, MUD.index_url, { ...MUD, link_pattern: String(MUD.minutes_link_pattern) }).docs;
  it('separates agenda and minutes links', () => {
    expect(agendas.length).toBeGreaterThanOrEqual(9);
    expect(agendas.every((d) => /agenda/i.test(d.filename) && !/minutes/i.test(d.filename))).toBe(true);
    expect(minutes.length).toBeGreaterThanOrEqual(5);
    expect(minutes.every((d) => /^Minutes_/.test(d.filename))).toBe(true);
    expect(agendas.some((d) => d.url.includes('tceq'))).toBe(false);
  });
  it('finds Agenda_October_19_2026 in an Oct window', () => {
    const inWin = agendas.filter((d) => inWindow(d, win('2026-10-19', '2026-11-18')));
    expect(inWin.map((d) => d.filename)).toEqual(['Agenda_October_19_2026_HCMUD_489_5b93c39b1d.pdf']);
  });
  it('reads the 4 filename styles, special type and the _1 version', () => {
    const by = (date: string) => agendas.find((d) => d.date === date)!;
    expect(by('2026-04-09').type).toBe('special');
    expect(by('2026-07-20').filename).toMatch(/NOTICE_OF_PUBLIC_MEETING_AGENDA/);
    expect(by('2026-09-21').version).toBe(1);
    expect(minutes.find((d) => d.date === '2026-05-18')).toBeDefined();
  });
});

describe('the _1 revision rule', () => {
  const doc = (filename: string, index: number): DiscoveredDoc => ({
    url: `https://x.test/${filename}`, text: '', filename, date: '2026-09-21', day_known: true, type: 'regular', version: versionSuffix(filename), index,
  });
  it('keeps the highest version suffix even if it comes first', () => {
    const r = pickPerDate([doc('Agenda_September_21_2026_HCMUD_489_1_aaaaaaaaaa.pdf', 0), doc('Agenda_September_21_2026_HCMUD_489_bbbbbbbbbb.pdf', 1)]);
    expect(r.docs[0]!.version).toBe(1);
    expect(r.superseded).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/2 agenda PDFs for 2026-09-21/);
  });
  it('keeps the last one on the page without suffixes', () => {
    const r = pickPerDate([doc('a_aaaaaaaaaa.pdf', 0), doc('b_bbbbbbbbbb.pdf', 1)]);
    expect(r.docs[0]!.filename).toBe('b_bbbbbbbbbb.pdf');
  });
});

describe('discover() offline', () => {
  it('fetches the index with the given fetch and returns window docs', async () => {
    const html = read('discovery/mud489-index.html');
    const fetchImpl = (async () => new Response(html, { status: 200 })) as typeof fetch;
    const r = await discover(MUD, win('2026-09-01', '2026-10-31'), { http: { fetchImpl, sleep: async () => {} } });
    expect(r.docs.map((d) => d.date)).toEqual(['2026-09-21', '2026-10-19']);
    expect(r.pages).toHaveLength(1);
  });
  it('follow_notice_page takes the first PDF on each notice page', async () => {
    const index = '<a href="/posts/oct-19">Notice October 19, 2026</a>';
    const notice = '<a href="/static/abc/Agenda_October_19_2026.pdf">agenda</a>';
    const fetchImpl = (async (u: string | URL | Request) =>
      new Response(String(u).endsWith('/posts/oct-19') ? notice : index, { status: 200 })) as typeof fetch;
    const r = await discover(
      { index_url: 'https://m.test/board-meetings/', link_pattern: '/posts/', follow_notice_page: true },
      win('2026-10-01', '2026-10-31'),
      { http: { fetchImpl, sleep: async () => {} } },
    );
    expect(r.docs.map((d) => d.url)).toEqual(['https://m.test/static/abc/Agenda_October_19_2026.pdf']);
  });
});

describe('text layer (D6)', () => {
  it('real agendas have a text layer', () => {
    for (const c of ['lonestar-2026-10-01', 'mud489-2026-10-19', 'mud489-2026-04-09']) {
      const meta = JSON.parse(read(`${c}/meta.json`));
      expect(meta.has_text_layer).toBe(true);
      expect(textLayerStats(read(`${c}/source.txt`).split('\f')).has_text_layer).toBe(true);
    }
  });
  it('an image-only PDF is scanned', async () => {
    const t = await getPdfText(new Uint8Array(readFileSync(join(GOLDEN, 'scanned/image-only.pdf'))));
    expect(t.pages).toHaveLength(2);
    expect(t.has_text_layer).toBe(false);
  });
  it('thresholds: 200 avg chars and 60% of pages over 50 chars', () => {
    const page = (n: number) => 'x'.repeat(n);
    expect(textLayerStats([page(400), page(400), page(0)]).has_text_layer).toBe(true); // avg 266, 67%
    expect(textLayerStats([page(1000), page(0), page(0)]).has_text_layer).toBe(false); // 33% of pages
    expect(textLayerStats([page(150), page(150)]).has_text_layer).toBe(false); // avg 150
    expect(textLayerStats([]).has_text_layer).toBe(false);
  });
});
