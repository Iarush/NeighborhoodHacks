import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DiscoveryConfigSchema, parseIndex, pickPerDate } from '@/lib/adapters/discover';
import { loadSources } from '@/lib/ingest/registry';

// MUD rollout bucket M11: Gatsby district sites and "the texas network" WordPress sites, both
// handled by discover configs. Fixtures recorded Oct 29, 2026.
const golden = (p: string) => readFileSync(join(fileURLToPath(new URL('../golden/', import.meta.url)), p), 'utf8');
const sources = loadSources();
const cfgOf = (id: string) => DiscoveryConfigSchema.parse(sources.find((s) => s.id === id)!.config);
const docsOf = (file: string, id: string) => {
  const cfg = cfgOf(id);
  return pickPerDate(parseIndex(golden(file), cfg.index_url, cfg).docs).docs;
};

describe('Gatsby district sites (golden)', () => {
  it('MUD 391: Board Meetings page, "HC_391_Agenda_10_19_26" filenames', () => {
    const docs = docsOf('gatsby/hcmud391-board-meetings.html', 'hcmud_391');
    expect(docs.find((d) => d.date === '2026-10-19')?.url).toMatch(/^https:\/\/www\.hcmud391\.org\/static\/.+HC_391_Agenda_10_19_26_/);
    expect(docs.every((d) => /agenda/i.test(d.filename))).toBe(true);
  });

  it('West HC MUD 9: older Gatsby site, agendas under Documents', () => {
    const docs = docsOf('gatsby/whcmud9-documents.html', 'whcmud_9');
    expect(docs.find((d) => d.date === '2026-10-26')?.filename).toMatch(/^Agenda_10_26_26_/);
    expect(docs.some((d) => d.date === '2026-09-28')).toBe(true);
  });
});

describe('"The Texas Network" sites (golden)', () => {
  it('Kleinwood MUD: dated from the "10-22-26 Agenda" link text; Minutes links never match', () => {
    const docs = docsOf('texas-network/kleinwood-meetings.html', 'kleinwood_mud');
    expect(docs.find((d) => d.date === '2026-10-22')?.url).toMatch(/Kleinwood-MUD-Agenda-10-22-26\.pdf$/);
    expect(docs.every((d) => !/minutes/i.test(d.text))).toBe(true);
  });

  it('HC WCID 99: same layout', () => {
    const docs = docsOf('texas-network/hcwcid99-meetings.html', 'hcwcid_99');
    expect(docs.find((d) => d.date === '2026-10-20')?.url).toContain('/2026/10/Agenda-10-20-26');
    expect(docs.find((d) => d.date === '2026-09-15')?.url).toContain('/2026/09/Agenda-9-15-26.pdf');
  });

  it('Water District 109: date-only link text, agenda picked by href', () => {
    const docs = docsOf('texas-network/waterdistrict109-meetings.html', 'hcmud_109');
    expect(decodeURI(docs.find((d) => d.date === '2026-10-20')!.url)).toMatch(/\/2026\/agendas\/109-October 20, 2026 Agenda\.pdf$/);
    expect(docs.every((d) => !/\/minutes\//.test(d.url))).toBe(true);
  });
});
