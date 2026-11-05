import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { createMudAgendaAdapter, readMinutesLadder } from '@/lib/adapters/mudAgenda/adapter';
import { headingText, parseMudMinutes, readingOrderBroken, sectionOutcome, splitMinutes } from '@/lib/adapters/mudAgenda/minutes';
import { pdfTextFromPages } from '@/lib/adapters/pdfText';
import { AdapterResultSchema, ResultUpdateSchema, type SourceConfig } from '@/lib/adapters/types';
import { documentContentHash } from '@/lib/ingest/hash';
import { ZONE } from '@/lib/ingest/normalize';
import { read as readLlm } from '../golden/llm-extract/fixtures';
import { CASES, minutesCase, textLayer } from '../golden/mud-minutes/fixtures';

// mud-code-parser-spec §6 / §7 Phase 4: minutes -> outcomes by code.

describe('golden minutes (tests/golden/mud-minutes)', () => {
  it('has the pairs Phase 4 asks for: MUD 489 July and May, and 3 more firms', () => {
    expect(CASES).toEqual(['emerald_forest_ud-2026-04-09', 'hcmud_489-2026-05-18', 'hcmud_489-2026-07-20', 'kleinwood_mud-2026-09-24', 'sunbelt_fwsd-2026-09-03']);
    expect(new Set(CASES.map((c) => minutesCase(c).meta.firm))).toEqual(new Set(['abhr', 'sph', 'coats_rose', 'radcliffe_bobbitt']));
  });

  for (const name of CASES) {
    it(`${name} matches expected.json`, () => {
      const c = minutesCase(name);
      expect(c.expected, `${name}: run npx tsx scripts/mud-minutes-golden.ts --expect`).not.toBeNull();
      expect(c.actual).toEqual(c.expected);
      for (const u of c.result.updates) {
        ResultUpdateSchema.parse(u);
        // Every update is for a known item; minutes never create items.
        expect(c.known.items.some((i) => i.external_id === u.item_external_id)).toBe(true);
        // The quote is verbatim from the minutes text, and only text-layer quotes count as verified.
        expect(c.text.replace(/\s+/g, ' ')).toContain(u.source_quote!.replace(/\s+/g, ' '));
        expect(u.quote_verified).toBe(!c.ocr);
      }
    });
  }

  it('MUD 489 July 20: all 14 voted sections, in minutes order (Operator\'s Report last)', () => {
    const c = minutesCase('hcmud_489-2026-07-20');
    expect(c.actual.updates.map((u) => `${u.agenda_number}:${u.action}`)).toEqual([
      '2:passed', '4:passed', '5:passed', '6:tabled', '3:no_action', '8:passed', '9:passed', '11:tabled',
      '12:no_action', '14:no_action', '16:passed', '17:passed', '19:passed', '7:passed',
    ]);
    // Reports with nothing to vote on stay awaiting_result.
    for (const n of ['1', '10', '13', '15', '18', '20', '21']) expect(c.actual.updates.some((u) => u.agenda_number === n)).toBe(false);
    expect(c.actual.warnings).toEqual([]);
  });

  it('MUD 489 May 18: the column-order text layer is refused; the OCR text gives the 3 known items', () => {
    const layer = textLayer('hcmud_489-2026-05-18')!;
    expect(readingOrderBroken(layer)).toBe(true);
    const c = minutesCase('hcmud_489-2026-05-18');
    const r = parseMudMinutes(layer, c.known.items, { meeting_external_id: c.known.meeting.external_id, url: c.meta.minutes_url });
    expect(r.unreadable).toBe(true);
    expect(r.updates).toEqual([]);
    expect(c.actual.updates.map((u) => `${u.agenda_number}:${u.action}`)).toEqual(['2:passed', '3:passed', '4:passed']);
    // Only 3 of the agenda's items are known, so the many other voted sections don't trigger the LLM rung.
    expect(c.actual.warnings.some((w) => w.startsWith('minutes_low_match'))).toBe(false);
  });

  it('no stored field but source_quote can carry a director name', () => {
    for (const name of CASES) {
      for (const u of minutesCase(name).result.updates) {
        const { source_quote: _q, ...rest } = u;
        expect(JSON.stringify(rest)).not.toMatch(/Director|McBride|Dillard|Garcia/);
      }
    }
  });
});

describe('corrupted cases', () => {
  const c = minutesCase('hcmud_489-2026-07-20');
  const ctx = { meeting_external_id: c.known.meeting.external_id, url: c.meta.minutes_url };

  it('a quote that is not in the stored text is rejected (one changed number)', () => {
    const stored = c.text.replace('$43,900.14', '$48,900.14');
    const r = parseMudMinutes(c.text, c.known.items, { ...ctx, fullText: stored });
    // The bioswale quote doesn't carry the figure, so it still verifies; the operator quote with $1,200.00 is altered below.
    const altered = c.text.replace('repair of the six (6) fire hydrants in the total amount of $1,200.00', 'repair of the six (6) fire hydrants in the total amount of $7,200.00');
    const r2 = parseMudMinutes(c.text, c.known.items, { ...ctx, fullText: altered });
    expect(r.updates).toHaveLength(14);
    expect(r2.updates).toHaveLength(13);
    expect(r2.warnings.some((w) => /OPERATOR'S REPORT.*rejected: source_quote not in minutes/.test(w))).toBe(true);
  });

  it('an outcome for an item that does not exist creates no item (bioswale removed from the agenda)', () => {
    const items = c.known.items.filter((i) => i.agenda_number !== '9');
    const r = parseMudMinutes(c.text, items, ctx);
    expect(r.updates.every((u) => items.some((i) => i.external_id === u.item_external_id))).toBe(true);
    expect(r.updates).toHaveLength(13);
    expect(r.warnings.some((w) => /BIOSWALE MANAGEMENT AGREEMENT.*passed not applied: no matching item/.test(w))).toBe(true);
  });

  it('decided items are left alone', () => {
    const items = c.known.items.map((i) => (i.agenda_number === '2' ? { ...i, status: 'decided' as const } : i));
    const r = parseMudMinutes(c.text, items, ctx);
    expect(r.updates.some((u) => u.item_external_id === items.find((i) => i.agenda_number === '2')!.external_id)).toBe(false);
  });

  it('too few matches flags the minutes for the LLM rung (Phase 5)', () => {
    const items = c.known.items.map((i, n) => ({ ...i, title: `Unrelated matter number ${n}`, description: undefined }));
    const r = parseMudMinutes(c.text, items, ctx);
    expect(r.warnings.some((w) => w.startsWith('minutes_low_match:'))).toBe(true);
  });
});

describe('pieces', () => {
  it('reads headings with glued page numbers and doc IDs', () => {
    expect(headingText('944689vlMATTERS RELATIVE TO BRIDGELAND COUNCIL, INC. ("COUNCIL") AND/OR')).toBe('MATTERS RELATIVE TO BRIDGELAND COUNCIL, INC. ("COUNCIL") AND/OR');
    expect(headingText('-2-CAPITAL IMPROVEMENT PLAN')).toBe('CAPITAL IMPROVEMENT PLAN');
    expect(headingText('Exhibit A —')).toBeNull();
    expect(headingText('(SEAL)')).toBeNull();
  });

  it('joins a heading that wraps onto a second line', () => {
    const s = splitMinutes('ADOPTION OF A NEW POSTING LOCATION FOR NOTICE OF DISTRICT\nMEETINGS\nThe Board next considered it.');
    expect(s).toEqual([{ heading: 'ADOPTION OF A NEW POSTING LOCATION FOR NOTICE OF DISTRICT MEETINGS', body: 'The Board next considered it.' }]);
  });

  it('outcome phrases', () => {
    expect(sectionOutcome('Director A moved to approve the report. Director B seconded the motion, which passed unanimously.')).toEqual({
      outcome: 'passed',
      quote: 'Director A moved to approve the report. Director B seconded the motion, which passed unanimously.',
    });
    expect(sectionOutcome('The motion to approve the contract failed for lack of a second.')?.outcome).toBe('failed');
    expect(sectionOutcome('The Board deferred consideration of the item.')?.outcome).toBe('tabled');
    expect(sectionOutcome('It was noted that no action was required.')?.outcome).toBe('no_action');
    // A recommendation is not a vote.
    expect(sectionOutcome('Mr. Edwards recommended that C3 be awarded said project.')).toBeNull();
    // A report alone records no outcome.
    expect(sectionOutcome('Ms. A presented and reviewed the report, a copy of which is attached.')).toBeNull();
    // Any passing vote outranks a declined side request in the same section.
    expect(sectionOutcome('The Board concurred to decline the request. Then, the Board voted unanimously to approve the report.')?.outcome).toBe('passed');
  });

  it('"Exhibit G." ends a sentence; "Mr." does not', () => {
    const q = sectionOutcome('A copy is included in Exhibit G.\nFollowing discussion, it was moved by Mr. A and unanimously carried, that the report be approved.')!.quote;
    expect(q).toBe('Following discussion, it was moved by Mr. A and unanimously carried, that the report be approved.');
  });
});

describe('adapter results mode (rungs 1-3)', () => {
  const source: SourceConfig = {
    id: 'hcmud_489',
    body_id: 'hcmud_489',
    adapter: 'mud_agenda',
    config: {
      index_url: 'https://hcmud489.com/board-meetings/',
      link_pattern: '(?i)/static/.+agenda_.+\\.pdf$',
      date_from: 'filename',
      default_time: '11:00',
      minutes_index_url: 'https://hcmud489.com/board-meetings/',
      minutes_link_pattern: '(?i)/static/.+minutes_.+\\.pdf$',
      minutes_date_tolerance_days: 2,
    },
  };
  const index = readLlm('discovery/mud489-index.html');
  const bytes = new Uint8Array([37, 80, 68, 70, 9, 9]);
  const hash = documentContentHash(bytes);
  // Each minutes PDF is a distinct byte string, so the text stubs can tell them apart.
  const julyBytes = new Uint8Array([37, 80, 68, 70, 7, 20]);
  const mayBytes = new Uint8Array([37, 80, 68, 70, 5, 18]);
  const http = {
    fetchImpl: (async (u: string | URL | Request) => {
      const url = String(u);
      if (url.endsWith('/board-meetings/')) return new Response(index);
      return new Response(url.includes('July_20') ? julyBytes : url.includes('May_18') ? mayBytes : bytes);
    }) as typeof fetch,
    sleep: async () => {},
  };
  const window = { from: DateTime.fromISO('2026-05-01', { zone: ZONE }).toJSDate(), to: DateTime.fromISO('2026-10-18', { zone: ZONE }).toJSDate() };
  const now = () => new Date('2026-10-18T12:00:00Z');
  const july = minutesCase('hcmud_489-2026-07-20');
  const may = minutesCase('hcmud_489-2026-05-18');
  const known = { meetings: [july.known.meeting, may.known.meeting], items: [...july.known.items, ...may.known.items] };
  const mode = { kind: 'results' as const, meeting_external_ids: known.meetings.map((m) => m.external_id), known };
  const textFor = (b: Uint8Array) => (b[4] === 7 ? july.text : textLayer('hcmud_489-2026-05-18')!);

  it('July minutes on rung 1 (text layer, verified); May needs OCR (May 18 minutes match the May 19 agenda)', async () => {
    const pdfText = async (b: Uint8Array) => pdfTextFromPages(textFor(b).split('\f'), documentContentHash(b));
    // Rebuilding the May text from positions doesn't help either (it's no better in the real PDF).
    const positionedText = pdfText;
    const r = AdapterResultSchema.parse(await createMudAgendaAdapter({ http, now, pdfText, positionedText }).run(source, mode, window));
    const julyUpdates = r.result_updates.filter((u) => u.meeting_external_id === july.known.meeting.external_id);
    expect(julyUpdates).toHaveLength(14);
    expect(julyUpdates.every((u) => u.quote_verified)).toBe(true);
    expect(r.result_updates.filter((u) => u.meeting_external_id === may.known.meeting.external_id)).toEqual([]);
    expect(r.warnings.some((w) => /minutes Minutes_May_18_2026.* matched to meeting .* within 2 days/.test(w))).toBe(true);
    expect(r.warnings.some((w) => /^needs_ocr: .*Minutes_May_18_2026/.test(w))).toBe(true);
    const mayDoc = r.documents.find((d) => d.url.includes('Minutes_May_18_2026') && d.kind === 'pdf_text')!;
    expect(mayDoc.needs_ocr).toBe(true);
    expect(r.documents.find((d) => d.url.includes('Minutes_July_20_2026'))).toMatchObject({ parse_rung: 1, needs_ocr: false });
  });

  it('May minutes on rung 3 once OCR text is stored: unverified, for review (D6)', async () => {
    const r = await readMinutesLadder({
      url: may.meta.minutes_url,
      bytes,
      meeting_external_id: may.known.meeting.external_id,
      items: may.known.items,
      pdfText: async () => pdfTextFromPages(textLayer('hcmud_489-2026-05-18')!.split('\f'), hash),
      positionedText: async () => pdfTextFromPages([textLayer('hcmud_489-2026-05-18')!], hash),
      ocrTexts: { [hash]: may.text },
    });
    expect(r.updates).toHaveLength(3);
    expect(r.updates.every((u) => u.quote_verified === false)).toBe(true);
    expect(r.documents[0]).toMatchObject({ parse_rung: 3, needs_ocr: false });
    expect(r.warnings.some((w) => /outcomes read from OCR text; quotes not verified/.test(w))).toBe(true);
  });

  it('a scanned minutes PDF without OCR text waits with needs_ocr', async () => {
    const r = await readMinutesLadder({
      url: 'https://example.org/minutes.pdf',
      bytes,
      meeting_external_id: may.known.meeting.external_id,
      items: may.known.items,
      pdfText: async () => pdfTextFromPages(['', ''], hash),
      positionedText: async () => pdfTextFromPages(['', ''], hash),
    });
    expect(r.updates).toEqual([]);
    expect(r.documents[0]).toMatchObject({ needs_ocr: true, content_hash: hash });
  });
});
