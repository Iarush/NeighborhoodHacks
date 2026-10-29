import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DiscoveryConfigSchema, firstPdfLink, parseIndex, pickPerDate } from '@/lib/adapters/discover';
import { loadSources } from '@/lib/ingest/registry';

// MUD rollout bucket M13: Triton news-card sites (agendas on tmc.tritoncg.com) and Gatsby sites
// with documents on S3, both handled by discover configs. Fixtures recorded Oct 29, 2026.
const golden = (p: string) => readFileSync(join(fileURLToPath(new URL('../golden/', import.meta.url)), p), 'utf8');
const sources = loadSources();
const cfgOf = (id: string) => DiscoveryConfigSchema.parse(sources.find((s) => s.id === id)!.config);
const docsOf = (file: string, id: string) => {
  const cfg = cfgOf(id);
  return pickPerDate(parseIndex(golden(file), cfg.index_url, cfg).docs).docs;
};

describe('Triton district sites (golden)', () => {
  it('Lake MUD: news cards dated from the link text; the notice page links the agenda PDF', () => {
    const docs = docsOf('tritoncg/lakemud-news.html', 'lake_mud');
    const card = docs.find((d) => d.date === '2026-10-29');
    expect(card?.text).toMatch(/special board meeting$/i);
    expect(docs.some((d) => d.date === '2026-10-15')).toBe(true);
    const pdf = firstPdfLink(golden('tritoncg/lakemud-notice-2026-10-29.html'), card!.url);
    expect(decodeURI(pdf!)).toBe('https://tmc.tritoncg.com/documents/10-29-2026 Special Agenda- Lake MUD.pdf');
  });

  it('Woodcreek MUD: same layout', () => {
    const docs = docsOf('tritoncg/woodcreek-news.html', 'woodcreek_mud');
    const card = docs.find((d) => d.date === '2026-10-15');
    expect(docs.some((d) => d.date === '2026-09-15')).toBe(true);
    const pdf = firstPdfLink(golden('tritoncg/woodcreek-notice-2026-10-15.html'), card!.url);
    expect(decodeURI(pdf!)).toMatch(/^https:\/\/tmc\.tritoncg\.com\/documents\/10-15-2026 Agenda- Woodcreek MUD\.pdf$/);
  });
});

describe('Gatsby sites with S3 documents (golden)', () => {
  it('HC WCID 109: "…MEETING_AGENDA_October_26_2026_….pdf" filenames', () => {
    const docs = docsOf('gatsby-s3/hcwcid109-board-meetings.html', 'hcwcid_109');
    expect(docs.find((d) => d.date === '2026-10-26')?.url).toMatch(/^https:\/\/www\.hcwcid109\.com\/static\/.+AGENDA_October_26_2026_/);
    expect(docs.every((d) => /agenda/i.test(d.filename))).toBe(true);
  });

  it('HC MUD 8: older "…_Agenda_" files and newer "_NTC_" notices; minutes never match', () => {
    const docs = docsOf('gatsby-s3/hcmud8-board-meetings.html', 'hcmud_8');
    expect(docs.find((d) => d.date === '2026-10-28')?.filename).toMatch(/^10_28_26_NTC_/);
    expect(docs.find((d) => d.date === '2026-09-09')?.filename).toMatch(/^2026_09_09_Agenda_/);
    expect(docs.every((d) => !/minutes/i.test(d.filename))).toBe(true);
  });
});
