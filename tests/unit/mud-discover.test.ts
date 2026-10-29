import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';
import { DiscoveryConfigSchema, downloadUrl, lineText, parseDocDate, parseIndex, pickPerDate } from '@/lib/adapters/discover';
import { loadSources } from '@/lib/ingest/registry';

// MUD rollout bucket M01: Google Drive district pages (date on the link's line, an Agendas table
// column) and Gatsby "static" sites (m_d_yy filenames). Fixtures recorded Oct 29, 2026.
const golden = (p: string) => readFileSync(join(fileURLToPath(new URL('../golden/', import.meta.url)), p), 'utf8');
const sources = loadSources();
const cfgOf = (id: string) => DiscoveryConfigSchema.parse(sources.find((s) => s.id === id)!.config);
const docsOf = (file: string, id: string) => {
  const cfg = cfgOf(id);
  return pickPerDate(parseIndex(golden(file), cfg.index_url, cfg).docs).docs;
};

describe('parseDocDate: underscore m_d_yy', () => {
  it.each([
    ['Emerald_Agenda_10_08_26_ac6a2066ef.pdf', '2026-10-08'],
    ['Agenda_10_13_26_1_b3d3931329.pdf', '2026-10-13'],
    ['10_20_2026_Agenda_Encanto_4907_2773_4232_1_7eebd0a1d6.pdf', '2026-10-20'],
  ])('%s', (input, date) => expect(parseDocDate(input)?.date).toBe(date));

  it('needs the same separator on both sides', () => {
    expect(parseDocDate('10_08-26')).toBeNull();
  });
});

describe('lineText', () => {
  it('reads back to the previous <br>', () => {
    const $ = load('<p>2026-11-04 – Regular: Agenda | Minutes<br> 2026-10-07 – Regular: <a href="x">Agenda</a> | Minutes<br></p>');
    expect(lineText($, $('a')[0]!)).toBe('2026-10-07 – Regular: Agenda');
  });

  it('climbs out of inline wrappers', () => {
    const $ = load('<div><p>Title</p>Thursday, November 5, 2026 at 6:00 PM • <strong><a href="x">Special Meeting Agenda (PDF)</a></strong></div>');
    expect(lineText($, $('a')[0]!)).toBe('Thursday, November 5, 2026 at 6:00 PM • Special Meeting Agenda (PDF)');
  });
});

describe('Google Drive district pages (golden)', () => {
  it('cbcmud.com: one agenda per line, dated from the line', () => {
    const docs = docsOf('google-drive/cbcmud-meetings.html', 'clear_brook_city_mud');
    const oct = docs.find((d) => d.date === '2026-10-21')!;
    expect(oct.url).toBe('https://drive.google.com/file/d/1Nj2AAHRqStPyH5uMky-vEIQhfQwvcekg/view?usp=sharing');
    expect(downloadUrl(oct.url)).toBe('https://drive.google.com/uc?export=download&id=1Nj2AAHRqStPyH5uMky-vEIQhfQwvcekg');
    // 2026-11-18 is listed with no link yet; Minutes links never match.
    expect(docs.some((d) => d.date === '2026-11-18')).toBe(false);
    expect(docs.every((d) => d.text.toLowerCase() === 'agenda')).toBe(true);
  });

  it('districtdirectory.org (MUD 423): same layout, link text with a trailing space', () => {
    const docs = docsOf('google-drive/districtdirectory-hcmud423.html', 'hcmud_423');
    expect(docs.at(-1)).toMatchObject({ date: '2026-10-26', url: expect.stringContaining('1EyLjLIGWBUTNtRl4WTSc7MeJx05iFqTV') });
  });

  it('sklawdistrictdata.org: link_selector keeps the Agendas column, not same-dated Minutes', () => {
    const docs = docsOf('google-drive/sklaw-northgate-crossing-road-ud.html', 'northgate_crossing_road_ud');
    const sep = docs.find((d) => d.date === '2026-09-11')!;
    expect(sep.url).toContain('1ZEtWoSkPM6aZvCJoYTWS5c0sE4_2izlL');
    expect(docs.find((d) => d.date === '2026-10-16')).toMatchObject({ type: 'special' });
  });
});

describe('Gatsby static-PDF sites (golden)', () => {
  it('Emerald Forest UD: m_d_yy filenames, special meetings typed', () => {
    const docs = docsOf('static-pdf/emerald-forest-board-meetings.html', 'emerald_forest_ud');
    expect(docs.find((d) => d.date === '2026-10-08')?.filename).toMatch(/^Emerald_Agenda_10_08_26_/);
    expect(docs.find((d) => d.date === '2026-08-25')?.type).toBe('special');
  });

  it('Encanto Real UD: m_d_yyyy filenames', () => {
    const docs = docsOf('static-pdf/encanto-real-documents.html', 'encanto_real_ud');
    expect(docs.find((d) => d.date === '2026-10-20')?.filename).toMatch(/^10_20_2026_Agenda_Encanto_/);
    expect(docs.find((d) => d.date === '2026-09-23')?.type).toBe('special');
  });
});
