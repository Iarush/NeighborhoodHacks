import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DiscoveryConfigSchema, parseIndex, pickPerDate } from '@/lib/adapters/discover';
import { loadSources } from '@/lib/ingest/registry';

// MUD rollout bucket M23: Infinity Services (Avada) district sites, handled by discover configs whose
// link_selector keeps the agendas apart from minutes with the same date text. Fixtures recorded Oct 29, 2026.
const golden = (p: string) => readFileSync(join(fileURLToPath(new URL('../golden/', import.meta.url)), p), 'utf8');
const sources = loadSources();
const cfgOf = (id: string) => DiscoveryConfigSchema.parse(sources.find((s) => s.id === id)!.config);
const docsOf = (file: string, id: string) => {
  const cfg = cfgOf(id);
  return pickPerDate(parseIndex(golden(file), cfg.index_url, cfg).docs).docs;
};

describe('Infinity Services district sites (golden)', () => {
  it('HCMUD 360: the "Meeting Agendas" section only, not the minutes below it', () => {
    const docs = docsOf('infinity/hcmud-360-meetings.html', 'hcmud_360');
    expect(docs.find((d) => d.date === '2026-10-19')?.url).toContain('1-v_6yo714t7mDRB8jD3hA5mNUoQWo6Cc');
    expect(docs.find((d) => d.date === '2026-07-20')?.url).toContain('1qrrWQ2J5ERDdAACASsYDCDj0kxdI4bBX');
    expect(docs.some((d) => d.url.includes('1AXlfLUkzqo3hCqEigkeurHGtRuCim7PI'))).toBe(false);
  });

  it('Cypress Hill MUD 1: the first (agendas) tab set, not the minutes tabs', () => {
    const docs = docsOf('infinity/cypress-hill-mud-1-meetings.html', 'cypress_hill_mud_1');
    expect(docs.find((d) => d.date === '2026-10-16')?.url).toContain('1XOk0oK_HLj8lNtceeuD8urSlgdc6tTNo');
    expect(docs.find((d) => d.date === '2026-09-18')?.url).toContain('1f5Li7EaYCfFP905f6_ShGR90RQGKV4bh');
    expect(docs.some((d) => d.url.includes('1xrQ1qZ0TMDlfPkbWmZMVcEi3VLc1K-YG'))).toBe(false);
  });

  it('Cypresswood UD: the Agendas column of the table', () => {
    const docs = docsOf('infinity/cypresswood-ud-district-page.html', 'cypresswood_ud');
    expect(docs.some((d) => d.date === '2026-10-30')).toBe(true);
    expect(docs.some((d) => d.url.includes('1w2NZzYyuxeSRYMOUG5wjCCgoVKrY9ko_'))).toBe(false);
  });
});
