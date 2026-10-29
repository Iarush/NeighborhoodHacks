import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DiscoveryConfigSchema, parseIndex, pickPerDate } from '@/lib/adapters/discover';
import { loadSources } from '@/lib/ingest/registry';

// MUD rollout bucket M18: district sites on the "church" WordPress theme, handled by discover configs
// (dated "2026-10-28 – Regular: Agenda | Minutes" lines, agendas on Google Drive). Fixtures recorded Oct 29, 2026.
const golden = (p: string) => readFileSync(join(fileURLToPath(new URL('../golden/', import.meta.url)), p), 'utf8');
const sources = loadSources();
const cfgOf = (id: string) => DiscoveryConfigSchema.parse(sources.find((s) => s.id === id)!.config);
const docsOf = (file: string, id: string) => {
  const cfg = cfgOf(id);
  return pickPerDate(parseIndex(golden(file), cfg.index_url, cfg).docs).docs;
};

describe('church-theme district sites (golden)', () => {
  it('Remington MUD 1: each dated line links its agenda on Drive; minutes never match', () => {
    const docs = docsOf('church/remington-mud-1-meetings.html', 'remington_mud_1');
    expect(docs.find((d) => d.date === '2026-10-28')?.url).toContain('1Ch5ZU1TyRvh5TtDdWYeS03JMG3Lq72VA');
    expect(docs.some((d) => d.date === '2026-11-25')).toBe(false);
    expect(docs.every((d) => /^agenda$/i.test(d.text))).toBe(true);
  });

  it('Chimney Hill MUD: the meeting-documents page, not the widget-only meetings page', () => {
    const docs = docsOf('church/chimney-hill-mud-meeting-documents.html', 'chimney_hill_mud');
    expect(docs.find((d) => d.date === '2026-10-23')?.url).toContain('1tsx2ET64dG0wdCm0e-Rp9L4i2mXOhD69');
    expect(docs.some((d) => d.date === '2026-11-27')).toBe(false);
  });
});
