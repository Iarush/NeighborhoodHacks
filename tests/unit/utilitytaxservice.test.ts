import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LINK_ONLY_WARNING,
  createUtilityTaxServiceAdapter,
  mapMeeting,
  parseAgendaList,
  pickPerDate,
} from '@/lib/adapters/utilitytaxservice';
import { loadSources } from '@/lib/ingest/registry';

// Utility Tax Service listings (MUD rollout bucket M12). Fixtures recorded Oct 29, 2026.
const golden = (p: string) => readFileSync(join(fileURLToPath(new URL('../golden/utilitytaxservice/', import.meta.url)), p), 'utf8');
const MUD458 = golden('hcmud458-docs-list.html');
const MUD171 = golden('hcmud171-docs-list.html');

afterEach(() => vi.unstubAllGlobals());

describe('parseAgendaList (golden)', () => {
  it('MUD 458: only the Agendas card, links resolved against <base href="/">', () => {
    const listed = parseAgendaList(MUD458);
    expect(listed[0]).toEqual({
      url: 'https://www.utilitytaxservice.com/PDFViewerEx/378/42624',
      date: '2026-10-12',
      label: 'October 12, 2026',
    });
    // Board of Directors, minutes and tax notices sit in other cards.
    expect(listed.every((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.date))).toBe(true);
    expect(listed.some((l) => /board of directors/i.test(l.label))).toBe(false);
  });

  it('MUD 458: month-only links ("September 2025") are skipped', () => {
    expect(parseAgendaList(MUD458).some((l) => l.url.endsWith('/32315'))).toBe(false);
  });

  it('MUD 171: "10/20/2026" text and the <small> label', () => {
    const first = parseAgendaList(MUD171)[0]!;
    expect(first).toMatchObject({ date: '2026-10-20', label: '10/20/2026 Special Meeting - Internal' });
  });
});

describe('pickPerDate', () => {
  it('prefers the Master copy over the Internal one', () => {
    const picked = pickPerDate(parseAgendaList(MUD171));
    expect(picked.find((l) => l.date === '2026-10-12')?.url).toMatch(/\/42599$/);
    expect(picked.find((l) => l.date === '2026-09-14')?.url).toMatch(/\/42235$/);
  });

  it('keeps an Internal-only date', () => {
    expect(pickPerDate(parseAgendaList(MUD171)).find((l) => l.date === '2026-10-20')?.url).toMatch(/\/42725$/);
  });
});

describe('mapMeeting', () => {
  it('special and cancelled from the label; time stays 00:00 Chicago', () => {
    const special = mapMeeting('s', 'b', { url: 'u', date: '2026-10-20', label: '10/20/2026 Special Meeting - Internal' });
    expect(special).toMatchObject({ type: 'special', status: 'scheduled', date: '2026-10-20T00:00:00-05:00', agenda_url: 'u' });
    expect(mapMeeting('s', 'b', { url: 'u', date: '2026-10-20', label: 'October 20, 2026 Mtg Cancelled' }).status).toBe('cancelled');
  });
});

describe('adapter run (fetch stubbed)', () => {
  const source = { id: 'hcmud_171', body_id: 'hcmud_171', adapter: 'utilitytaxservice' as const, config: { district: '471' } };
  const window = { from: new Date('2026-09-14T05:00:00Z'), to: new Date('2026-12-31T06:00:00Z') };

  it('link-only meetings in the window, no items, and the link_only warning', async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response(MUD171, { status: 200, headers: { 'content-type': 'text/html' } }));
    vi.stubGlobal('fetch', fetchMock);
    const out = await createUtilityTaxServiceAdapter({ http: { minSpacingMs: 0 } as never }).run(source, { kind: 'rotation' }, window);
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://www.utilitytaxservice.com/DistrictDocsList/471');
    expect(out.meetings.map((m) => m.date.slice(0, 10))).toEqual(['2026-10-20', '2026-10-12', '2026-09-14']);
    expect(out.items).toEqual([]);
    expect(out.warnings).toEqual([LINK_ONLY_WARNING]);
  });

  it('results mode does nothing', async () => {
    const out = await createUtilityTaxServiceAdapter().run(source, { kind: 'results', meeting_external_ids: [] } as never, window);
    expect(out.meetings).toEqual([]);
  });
});

describe('sources.yaml', () => {
  it('every utilitytaxservice source names a district code', () => {
    const uts = loadSources().filter((s) => s.adapter === 'utilitytaxservice' && !s.config.site);
    expect(uts.length).toBe(11);
    expect(uts.every((s) => /^[A-Za-z0-9]+$/.test(String(s.config.district)))).toBe(true);
  });
});
