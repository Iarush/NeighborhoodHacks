import { describe, expect, it } from 'vitest';
import { parseMudAgenda } from '@/lib/adapters/mudAgenda/parse';
import { GENERIC } from '@/lib/adapters/mudAgenda/profiles';
import { GOLDEN_NOW } from '@/tests/golden/mud-agenda/fixtures';

// Rules added from the Phase 6 shadow run (mud-code-parser-spec §7).

const ctx = (opts: { date?: string; ocr?: boolean } = {}) => ({
  source_id: 'x',
  body_id: 'x',
  url: 'https://example.invalid/a.pdf',
  now: GOLDEN_NOW,
  link: { date: opts.date ?? '2026-10-20', type: 'regular' as const },
  ...(opts.ocr ? { ocr: true } : {}),
});
const head = (date = 'Tuesday, October 20, 2026') =>
  `NOTICE OF MEETING\nThe Board of Directors will hold a regular meeting on ${date}, at 6:00 p.m., to discuss and, if appropriate, act upon the following items:\n`;
const close = '\n(SEAL)\nAttorney for the District';

describe('sectioned agendas (CONSENT / REGULAR)', () => {
  it('unmarked capital headings with 1..N in each section', () => {
    const text = head() + 'CONSENT AGENDA: The following items are considered routine.\n1. Approve minutes;\n2. Bookkeeper report;\nREGULAR AGENDA: Items removed from the Consent Agenda.\n1. Public comments;\n2. Engineer report;\n3. Adjourn.' + close;
    const r = parseMudAgenda(text, GENERIC, ctx());
    expect(r.ok).toBe(true);
    expect(r.items.map((i) => [i.agenda_number, i.section, i.title])).toEqual([
      ['1', 'Consent Agenda', 'Approve minutes'],
      ['2', 'Consent Agenda', 'Bookkeeper report'],
      ['1', 'Regular Agenda', 'Public comments'],
      ['2', 'Regular Agenda', 'Engineer report'],
      ['3', 'Regular Agenda', 'Adjourn'],
    ]);
    expect(new Set(r.items.map((i) => i.external_id)).size).toBe(5);
  });

  it('roman top level with lettered sections; a wrapped "Regular Agenda." phrase is not a heading', () => {
    const text = head() + 'I. Receive comments.\nII. CONSENT AGENDA: These items will be removed and placed on the\nRegular Agenda.\nA. Approve minutes.\nB. Pay bills.\nIII. ACTION ITEMS:\nA. Tax rate hearing.\nIV. Adjourn.' + close;
    const r = parseMudAgenda(text, GENERIC, ctx());
    expect(r.ok).toBe(true);
    expect(r.items.map((i) => `${i.agenda_number}|${i.section ?? ''}`)).toEqual(['I|', 'II.A|Consent Agenda', 'II.B|Consent Agenda', 'III.A|Action Items', 'IV|']);
  });

  it('a skipped number inside a section is still rejected', () => {
    const text = head() + 'CONSENT AGENDA:\n1. Approve minutes;\n3. Pay bills;\nREGULAR AGENDA:\n1. Public comments.' + close;
    expect(parseMudAgenda(text, GENERIC, ctx()).ok).toBe(false);
  });
});

describe('OCR item-number repairs', () => {
  it('two garbled markers in a row ("ye", "36") become the numbers the list needs', () => {
    const text = head() + '1. Approve minutes;\n\nye Public comments from residents;\n\n36 Hear the developer report;\n\n4. Adjourn.' + close;
    const r = parseMudAgenda(text, GENERIC, ctx({ ocr: true }));
    expect(r.ok).toBe(true);
    expect(r.items.map((i) => i.title)).toEqual(['Approve minutes', 'Public comments from residents', 'Hear the developer report', 'Adjourn']);
  });

  it('"2:" reads as 2 on OCR text', () => {
    const text = head() + '1. Comments from the public;\n2: Approve minutes;\n3. Adjourn.' + close;
    expect(parseMudAgenda(text, GENERIC, ctx({ ocr: true })).items.map((i) => i.agenda_number)).toEqual(['1', '2', '3']);
  });

  it('a signature stamp after the last item is not read as an item', () => {
    const text = head() + '1. Approve minutes;\n2. Matters for future agendas.\n\nRS ANY, Dis 1%, SCHWARTZ, PAGE & HARDING, L.L.P.\nSS Bee\n25: Zo iss By: :\n(SEAL)\nAttorneys for the District';
    const r = parseMudAgenda(text, GENERIC, ctx({ ocr: true }));
    expect(r.items.map((i) => i.agenda_number)).toEqual(['1', '2']);
  });
});

describe('notice dates', () => {
  it('takes the date after "will meet", not a statute date earlier in the sentence', () => {
    const text = 'NOTICE OF MEETING\nPursuant to an act effective November 1, 1979, the Board will meet in special session at 9:00 a.m. on Friday, November 6, 2026, to act on the following matters:\n1. Public comments;\n2. Adjourn.' + close;
    const r = parseMudAgenda(text, GENERIC, ctx({ date: '2026-11-06' }));
    expect(r.ok).toBe(true);
  });

  it('"October 27 , 2026" and "November 2nd" with no year (year from the link)', () => {
    expect(parseMudAgenda(head('Tuesday, October 27 , 2026') + '1. Public comments;\n2. Adjourn.' + close, GENERIC, ctx({ date: '2026-10-27' })).ok).toBe(true);
    expect(parseMudAgenda(head('MONDAY, November 2nd') + '1. Public comments;\n2. Adjourn.' + close, GENERIC, ctx({ date: '2026-11-02' })).ok).toBe(true);
  });
});
