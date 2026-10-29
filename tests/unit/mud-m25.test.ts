import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DiscoveryConfigSchema, parseIndex, pickPerDate } from '@/lib/adapters/discover';
import { loadSources } from '@/lib/ingest/registry';

// MUD rollout bucket M25: Off Cinco (Avada) district pages. Fixtures recorded Oct 29, 2026.
const golden = (p: string) => readFileSync(join(fileURLToPath(new URL('../golden/', import.meta.url)), p), 'utf8');
const sources = loadSources();
const docsOf = (file: string, id: string) => {
  const cfg = DiscoveryConfigSchema.parse(sources.find((s) => s.id === id)!.config);
  return pickPerDate(parseIndex(golden(file), cfg.index_url, cfg).docs).docs;
};

describe('Off Cinco district pages (golden)', () => {
  it('HCMUD 167: dated lines, agendas only', () => {
    const docs = docsOf('offcinco/hcmud-167-district-page.html', 'hcmud_167');
    expect(docs.find((d) => d.date === '2026-10-21')?.url).toContain('1wYSZ9EETcElHm8SO2Nx1XWPdTohj-viN');
    expect(docs.every((d) => /^agenda$/i.test(d.text))).toBe(true);
  });

  it('Northampton MUD: date from the toggle panel title, not the Agenda Packet', () => {
    const docs = docsOf('offcinco/northampton-mud-meetings.html', 'northampton_mud');
    expect(docs.some((d) => d.date === '2026-11-02')).toBe(true);
    expect(docs.some((d) => d.date === '2026-11-16')).toBe(false);
    expect(docs.every((d) => /^agenda$/i.test(d.text))).toBe(true);
  });
});
