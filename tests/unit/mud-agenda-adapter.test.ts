import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { AdapterResultSchema, type SourceConfig } from '@/lib/adapters/types';
import { createMudAgendaAdapter, runLadder } from '@/lib/adapters/mudAgenda/adapter';
import { getPdfText, getPositionedText, linesFromPositions, pdfTextFromPages } from '@/lib/adapters/pdfText';
import { loadAdapter } from '@/lib/ingest/adapters';
import { documentContentHash } from '@/lib/ingest/hash';
import { ZONE } from '@/lib/ingest/normalize';

// mud-code-parser-spec §7 Phase 2: rung 2 (word positions), rung 4 (loose) and the adapter.

const GOLDEN = join('tests', 'golden');
const read = (p: string) => readFileSync(join(GOLDEN, p), 'utf8');
const MUD489 = 'mud-agenda/hcmud_489-2026-10-19/agenda.txt';

const source: SourceConfig = {
  id: 'hcmud_489',
  body_id: 'hcmud_489',
  adapter: 'mud_agenda',
  config: {
    index_url: 'https://hcmud489.com/board-meetings/',
    link_pattern: '(?i)/static/.+agenda_.+\\.pdf$',
    date_from: 'filename',
    meeting_type_from_text: { special: '(?i)special' },
    default_time: '11:00',
  },
};
const index = read('llm-extract/discovery/mud489-index.html');
const pdfBytes = new Uint8Array([37, 80, 68, 70, 1, 2, 3]);
const pdfHash = documentContentHash(pdfBytes);
const fetchImpl = (async (u: string | URL | Request) =>
  String(u).endsWith('/board-meetings/') ? new Response(index) : new Response(pdfBytes)) as typeof fetch;
const http = { fetchImpl, sleep: async () => {} };
const window = {
  from: DateTime.fromISO('2026-10-18', { zone: ZONE }).toJSDate(),
  to: DateTime.fromISO('2026-11-17', { zone: ZONE }).endOf('day').toJSDate(),
};
const now = () => new Date('2026-10-18T12:00:00Z');
const textLayer = async () => pdfTextFromPages(read(MUD489).split('\f'), pdfHash);
const scanned = async () => pdfTextFromPages(['', '', ''], pdfHash);
const noPositions = async () => null as never;

describe('mud_agenda adapter', () => {
  it('parses a text-layer agenda on rung 1 with the notice time', async () => {
    const r = AdapterResultSchema.parse(await createMudAgendaAdapter({ http, now, pdfText: textLayer, positionedText: noPositions }).run(source, { kind: 'rotation' }, window));
    expect(r.meetings).toHaveLength(1);
    expect(r.meetings[0]!.date).toBe('2026-10-19T11:00:00-05:00');
    expect(r.items).toHaveLength(24);
    expect(r.items.every((i) => i.quote_verified)).toBe(true);
    const pdf = r.documents.find((d) => d.kind === 'pdf_text')!;
    expect(pdf).toMatchObject({ parse_rung: 1, parse_profile: 'sph', needs_ocr: false });
    expect(r.warnings.filter((w) => /parse_failed|needs_ocr/.test(w))).toEqual([]);
  });

  it('skips a PDF whose content hash is unchanged (D11)', async () => {
    const r = await createMudAgendaAdapter({ http, now, pdfText: textLayer }).run(source, { kind: 'rotation' }, window, {
      documentHashes: { 'https://hcmud489.com/static/dfaef0088dbe419a94dafac34a137a29/Agenda_October_19_2026_HCMUD_489_5b93c39b1d.pdf': pdfHash },
    });
    expect(r.items).toEqual([]);
  });

  it('stores a scan link-only with needs_ocr until OCR text exists', async () => {
    const r = AdapterResultSchema.parse(await createMudAgendaAdapter({ http, now, pdfText: scanned, positionedText: noPositions }).run(source, { kind: 'rotation' }, window));
    expect(r.items).toEqual([]);
    expect(r.meetings).toHaveLength(1);
    expect(r.documents.find((d) => d.kind === 'pdf_text')).toMatchObject({ needs_ocr: true });
    expect(r.warnings.some((w) => w.startsWith('needs_ocr: hcmud_489'))).toBe(true);
  });

  it('parses stored OCR text on rung 3; OCR items are not quote-verified (D6 review gate)', async () => {
    const meetingNoOcr = await createMudAgendaAdapter({ http, now, pdfText: scanned }).run(source, { kind: 'rotation' }, window);
    const r = AdapterResultSchema.parse(
      await createMudAgendaAdapter({ http, now, pdfText: scanned }).run(source, { kind: 'rotation' }, window, { documentHashes: {}, ocrTexts: { [pdfHash]: read(MUD489) } }),
    );
    expect(r.items).toHaveLength(24);
    expect(r.items.every((i) => i.quote_verified === false)).toBe(true);
    expect(r.documents.find((d) => d.kind === 'pdf_text')).toMatchObject({ parse_rung: 3, needs_ocr: false });
    // Same meeting external_id as the link-only row, so OCR fills in that meeting instead of adding one.
    expect(r.meetings[0]!.external_id).toBe(meetingNoOcr.meetings[0]!.external_id);
  });

  it('checks no outcomes in results mode yet (minutes are Phase 4)', async () => {
    const r = await createMudAgendaAdapter({ http, now }).run(source, { kind: 'results', meeting_external_ids: ['x'] }, window);
    expect(r.result_updates).toEqual([]);
    expect(r.warnings[0]).toMatch(/Phase 4/);
  });

  it('is registered under the mud_agenda kind', async () => {
    expect(typeof (await loadAdapter('mud_agenda')).run).toBe('function');
  });
});

describe('rung 2: text rebuilt from word positions', () => {
  it('puts a number column back beside its text', () => {
    const lines = linesFromPositions(
      [
        { str: '1.', x: 72, y: 700, w: 8, h: 11 },
        { str: '2.', x: 72, y: 686, w: 8, h: 11 },
        { str: 'Public comments;', x: 108, y: 700.5, w: 80, h: 11 },
        { str: 'Approve minutes;', x: 108, y: 686, w: 80, h: 11 },
      ],
      612,
    );
    expect(lines).toEqual(['1. Public comments;', '2. Approve minutes;']);
  });

  it('splits a line at a gap wider than a quarter of the page (two columns)', () => {
    expect(linesFromPositions([{ str: 'Left', x: 72, y: 700, w: 20, h: 11 }, { str: 'Right', x: 400, y: 700, w: 25, h: 11 }], 612)).toEqual(['Left', 'Right']);
  });

  it('reads the Kleinwood MUD agenda that rung 1 can not', async () => {
    const bytes = new Uint8Array(readFileSync(join(GOLDEN, 'mud-agenda/kleinwood_mud-2026-10-22/agenda.pdf')));
    const out = await runLadder({
      source_id: 'kleinwood_mud',
      body_id: 'kleinwood_mud',
      doc: { url: 'https://www.kleinwoodmud.com/wp-content/uploads/2026/10/Kleinwood-MUD-Agenda-10-22-26.pdf', date: '2026-10-22', type: 'regular' },
      now: new Date('2026-11-04T12:00:00Z'),
      text: await getPdfText(bytes),
      positioned: () => getPositionedText(bytes),
    });
    expect(out.ok && out.rung).toBe(2);
    if (!out.ok) return;
    expect(out.result.items.map((i) => i.agenda_number)).toEqual(Array.from({ length: 16 }, (_, k) => String(k + 1)));
    expect(out.result.items[4]!.title).toBe("Tax Assessor/Collector's Report");
    expect(out.result.items.every((i) => i.quote_verified)).toBe(true);
  });
});

describe('rung 4: the loose parser', () => {
  const ctx = { source_id: 'x', body_id: 'x', doc: { url: 'https://example.invalid/a.pdf', date: '2026-11-12', type: 'regular' as const }, now: new Date('2026-11-04T12:00:00Z') };
  const notice =
    'NOTICE OF MEETING\nThe Board will hold a regular meeting on Thursday, November 12, 2026, at 6:00 p.m., to act upon the following items:\n';
  const close = 'Persons with disabilities who plan to attend this meeting may contact the District.\n';

  it('numbers bulleted items itself', async () => {
    const text = `${notice}• Public comments\n• Approve minutes of the October meeting\n• Engineer's report, including\nstatus of the water plant\n${close}`;
    const out = await runLadder({ ...ctx, text: pdfTextFromPages([text.padEnd(400, ' ')], 'h') });
    expect(out.ok && out.rung).toBe(4);
    if (out.ok) expect(out.result.items.map((i) => `${i.agenda_number} ${i.title}`)).toEqual(['1 Public comments', '2 Approve minutes of the October meeting', "3 Engineer's report, including status of the water plant"]);
  });

  it('needs stray numbers 1..N to match the blocks it found', async () => {
    const text = `${notice}1.\n2.\n3.\nPublic comments;\nApprove minutes;\n${close}`;
    const out = await runLadder({ ...ctx, text: pdfTextFromPages([text.padEnd(400, ' ')], 'h') });
    expect(out.ok).toBe(false);
  });
});
