import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DiscoveryConfigSchema, parseIndex, pickPerDate } from '@/lib/adapters/discover';
import { loadSources } from '@/lib/ingest/registry';

// MUD rollout bucket M12: Bob Leared Interests (bli-tax.com) district pages, handled by discover
// configs. Fixtures recorded Oct 29, 2026.
const golden = (p: string) => readFileSync(join(fileURLToPath(new URL('../golden/', import.meta.url)), p), 'utf8');
const sources = loadSources();
const cfgOf = (id: string) => DiscoveryConfigSchema.parse(sources.find((s) => s.id === id)!.config);
const docsOf = (file: string, id: string) => {
  const cfg = cfgOf(id);
  return pickPerDate(parseIndex(golden(file), cfg.index_url, cfg).docs).docs;
};

describe('bli-tax.com district pages (golden)', () => {
  it('HC MUD 216: dated from "HC-216-Agenda-10.12.2026.pdf", not the "October 2026" link text', () => {
    const docs = docsOf('bli-tax/hcmud216.html', 'hcmud_216');
    expect(docs.find((d) => d.date === '2026-10-12')?.url).toMatch(/HC-216-Agenda-10\.12\.2026\.pdf$/);
    expect(docs.every((d) => /agenda/i.test(d.filename))).toBe(true);
  });

  it('NW HC MUD 9: "Meeting-Agenda-11.03.2026" filenames; budget and audit PDFs never match', () => {
    const docs = docsOf('bli-tax/nwhcmud9.html', 'nwhcmud_9');
    expect(docs.find((d) => d.date === '2026-11-03')?.url).toMatch(/NWHCMUD-9-Meeting-Agenda-11\.03\.2026\.pdf$/);
    expect(docs.some((d) => /budget|audit/i.test(d.filename))).toBe(false);
  });
});
