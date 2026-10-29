import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { discover, indexUrls, parseIndex } from '@/lib/adapters/discover';
import { createUtilityTaxServiceAdapter, listUrl, parseAgendaList } from '@/lib/adapters/utilitytaxservice';
import { loadSources } from '@/lib/ingest/registry';

// MUD rollout bucket M15. Fixtures recorded Oct 29, 2026.
const golden = (p: string) => readFileSync(join(fileURLToPath(new URL('../golden/', import.meta.url)), p), 'utf8');
const TT332 = golden('taxtech/district-332-docs-list.html');
const TT187 = golden('taxtech/district-187-docs-list.html');
const CIMARRON = golden('cimarron/handler-2026-10.html');
const TAXTECH = 'https://www.taxtech.net/';

afterEach(() => vi.unstubAllGlobals());

describe('Tax Tech listings on the utilitytaxservice adapter (golden)', () => {
  it('MUD 449: "Meeting Agenda for 10-15-2026" links, resolved on the Tax Tech host', () => {
    const listed = parseAgendaList(TT332, TAXTECH);
    expect(listed.length).toBeGreaterThan(5);
    expect(listed[0]).toMatchObject({ date: '2026-10-15', url: 'https://www.taxtech.net/PDFViewerEx/332/30855' });
    expect(listed.every((l) => l.url.startsWith('https://www.taxtech.net/PDFViewerEx/332/'))).toBe(true);
  });

  it('MUD 287: only the Meeting Agendas card, not the Minutes card', () => {
    const listed = parseAgendaList(TT187, TAXTECH);
    expect(listed.map((l) => l.date)).toContain('2026-10-19');
    // The district filed two 2024–25 minutes in its Agendas card; every 2026 link is an agenda.
    expect(listed.filter((l) => l.date >= '2026').every((l) => /^meeting agenda for/i.test(l.label))).toBe(true);
  });

  it('the site option changes the list URL; the default stays Utility Tax Service', () => {
    expect(listUrl('332', TAXTECH)).toBe('https://www.taxtech.net/DistrictDocsList/332');
    expect(listUrl('378')).toBe('https://www.utilitytaxservice.com/DistrictDocsList/378');
  });

  it('adapter run fetches the Tax Tech list (fetch stubbed)', async () => {
    const fetchMock = vi.fn(async () => new Response(TT332, { status: 200, headers: { 'content-type': 'text/html' } }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await createUtilityTaxServiceAdapter().run(
      { id: 'hcmud_449', body_id: 'hcmud_449', adapter: 'utilitytaxservice', config: { site: TAXTECH, district: '332' } } as never,
      { kind: 'agenda' } as never,
      { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-10-31T00:00:00Z') },
    );
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe('https://www.taxtech.net/DistrictDocsList/332');
    expect(r.meetings.map((m) => m.agenda_url)).toEqual(['https://www.taxtech.net/PDFViewerEx/332/30855']);
  });
});

describe('discover index_url month placeholders', () => {
  it('this month and next, in America/Chicago', () => {
    // 03:00 UTC Nov 1 is still Oct 31 in Chicago.
    expect(indexUrls('https://x.gov/h.php?month={m}&year={yyyy}', new Date('2026-11-01T03:00:00Z'))).toEqual([
      'https://x.gov/h.php?month=10&year=2026',
      'https://x.gov/h.php?month=11&year=2026',
    ]);
    expect(indexUrls('https://x.gov/{yyyy}/{mm}/', new Date('2026-12-15T12:00:00Z'))).toEqual(['https://x.gov/2026/12/', 'https://x.gov/2027/01/']);
  });

  it('a URL without placeholders is read once', () => {
    expect(indexUrls('https://x.gov/meetings', new Date())).toEqual(['https://x.gov/meetings']);
  });

  it('Cimarron month page (golden): the dated agenda from its filename', () => {
    const cfg = { index_url: 'https://cimarronmudtx.gov/public-docs/handler.php?month=10&year=2026', link_pattern: '(?i)/public-docs/documents/.+agenda[^/]*[.]pdf$', date_from: 'filename' as const };
    const { docs } = parseIndex(CIMARRON, cfg.index_url, cfg);
    expect(docs.map((d) => d.date)).toEqual(['2026-10-21']);
  });

  it('discover reads both month pages and keeps both months\' agendas (fetch stubbed)', async () => {
    const pages: Record<string, string> = {
      'https://c.gov/h?month=10&year=2026': '<a href="/docs/October 21, 2026 Agenda.pdf">a</a>',
      'https://c.gov/h?month=11&year=2026': '<a href="/docs/November 4, 2026 Agenda.pdf">a</a>',
    };
    vi.stubGlobal('fetch', vi.fn(async (u: string | URL) => new Response(pages[String(u)] ?? '', { status: 200, headers: { 'content-type': 'text/html' } })));
    const r = await discover(
      { index_url: 'https://c.gov/h?month={m}&year={yyyy}', link_pattern: '(?i)agenda[.]pdf$', date_from: 'filename' },
      { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-12-31T00:00:00Z') },
      { now: () => new Date('2026-10-29T12:00:00Z') },
    );
    expect(r.pages.map((p) => p.url)).toEqual(Object.keys(pages));
    expect(r.docs.map((d) => d.date).sort()).toEqual(['2026-10-21', '2026-11-04']);
  });
});

describe('sources.yaml (M15)', () => {
  it('the Tax Tech sources (M15, plus hcmud_477 from M16) name the Tax Tech site and a district code', () => {
    const tt = loadSources().filter((s) => (s.config as { site?: string }).site === TAXTECH);
    expect(tt.map((s) => s.id).sort()).toEqual(['hcmud_287', 'hcmud_449', 'hcmud_477']);
    expect(tt.every((s) => s.adapter === 'utilitytaxservice')).toBe(true);
  });
});
