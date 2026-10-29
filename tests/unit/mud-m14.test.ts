import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';
import { DiscoveryConfigSchema, firstPdfLink, parseIndex, pickPerDate, rowText } from '@/lib/adapters/discover';
import { loadSources } from '@/lib/ingest/registry';

// MUD rollout bucket M14: Wix and WordPress district sites, handled by discover configs, plus the
// row_text date source and the Google Drive fallback in firstPdfLink. Fixtures recorded Oct 29, 2026.
const golden = (p: string) => readFileSync(join(fileURLToPath(new URL('../golden/', import.meta.url)), p), 'utf8');
const sources = loadSources();
const cfgOf = (id: string) => DiscoveryConfigSchema.parse(sources.find((s) => s.id === id)!.config);
const docsOf = (file: string, id: string) => {
  const cfg = cfgOf(id);
  return pickPerDate(parseIndex(golden(file), cfg.index_url, cfg).docs).docs;
};

describe('Wix district sites (golden)', () => {
  it('Clear Lake City WA: "View Document" dated from its row, the meeting date before the posting date', () => {
    const docs = docsOf('wix/clcwa-board-information.html', 'clear_lake_city_wa');
    const oct = docs.find((d) => d.date === '2026-10-08');
    expect(oct?.url).toMatch(/^https:\/\/www\.clcwa\.org\/_files\/ugd\/.+\.pdf$/);
    expect(docs.some((d) => d.date === '2026-10-02')).toBe(false);
    expect(docs.find((d) => d.date === '2026-09-08')?.type).toBe('special');
  });

  it('HC WCID 110: only the agendas list, not the minutes list beside it', () => {
    const docs = docsOf('wix/wcid110-board-meetings.html', 'hcwcid_110');
    expect(docs.find((d) => d.date === '2026-10-14')?.url).toContain('6cb4072e298a4640879b4c4ce843447f');
    expect(docs.find((d) => d.date === '2026-11-04')?.type).toBe('special');
  });

  it('HC MUD 238: the newest meeting date links its agenda', () => {
    const docs = docsOf('wix/hcmud238-board-meetings.html', 'hcmud_238');
    expect(docs.find((d) => d.date === '2026-10-27')?.url).toContain('4f3b4b_3d533590fea34b31ab78b588ae6ce190.pdf');
  });
});

describe('WordPress sites with Google Drive agendas (golden)', () => {
  it('Oakmont PUD: dated meeting pages; the meeting page links the agenda on Drive', () => {
    const docs = docsOf('wordpress-mud/oakmont-archives.html', 'oakmont_pud');
    const page = docs.find((d) => d.date === '2026-10-08');
    expect(docs.find((d) => d.date === '2026-09-02')?.type).toBe('special');
    const pdf = firstPdfLink(golden('wordpress-mud/oakmont-meeting-2026-10-08.html'), page!.url);
    expect(pdf).toMatch(/^https:\/\/drive\.google\.com\/file\/d\/1LMgj2JHwbGO06AjYQgJS1fjaopMm5yKA\//);
  });

  it('Interstate MUD: "2026-10-13: Agenda | Minutes" lines; minutes never match', () => {
    const docs = docsOf('wordpress-mud/interstate-mud.html', 'interstate_mud');
    expect(docs.find((d) => d.date === '2026-10-13')?.url).toMatch(/^https:\/\/drive\.google\.com\/file\/d\//);
    expect(docs.every((d) => /^(agenda|english)$/i.test(d.text))).toBe(true);
  });
});

describe('discover additions', () => {
  it('rowText stops at the first ancestor with a date and never crosses into a neighboring row', () => {
    const $ = load(
      '<div id="list"><div><p>October 8 2026 Regular Board Meeting</p><a id="a" href="a.pdf">View Document</a></div>' +
        '<div><a id="b" href="b.pdf">View Document</a></div></div>',
    );
    expect(rowText($, $('#a')[0]!)).toMatch(/^October 8 2026 Regular Board Meeting ?View Document$/);
    expect(rowText($, $('#b')[0]!)).toBe('');
  });

  it('firstPdfLink prefers a .pdf link and falls back to a Drive file link', () => {
    const base = 'https://example.org/meeting/';
    const drive = '<a href="https://drive.google.com/file/d/abc_123/view">Agenda (PDF)</a>';
    expect(firstPdfLink(drive + '<a href="/x.pdf">x</a>', base)).toBe('https://example.org/x.pdf');
    expect(firstPdfLink(drive, base)).toBe('https://drive.google.com/file/d/abc_123/view');
    expect(firstPdfLink('<a href="https://drive.google.com/drive/folders/abc">folder</a>', base)).toBeUndefined();
  });
});
