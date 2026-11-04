import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { quoteVerified } from '@/lib/adapters/llmExtract';
import { parseMudAgenda } from '@/lib/adapters/mudAgenda/parse';
import { isNoise, markFurniture, readItemNumber, splitLines } from '@/lib/adapters/mudAgenda/normalize';
import { profileById } from '@/lib/adapters/mudAgenda/profiles';
import { GOLDEN_NOW, goldenCase, type GoldenExpected } from '@/tests/golden/mud-agenda/fixtures';

// mud-code-parser-spec §7 Phase 1: the golden set and the corrupted cases.

const DIR = join('tests', 'golden', 'mud-agenda');
const CASES = readdirSync(DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(DIR, d.name, 'expected.json')))
  .map((d) => d.name)
  .sort();

describe('mud_agenda golden set', () => {
  it('has the cases the spec asks for', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(46);
  });

  for (const name of CASES) {
    it(name, () => {
      const c = goldenCase(join(DIR, name));
      const expected = JSON.parse(readFileSync(join(DIR, name, 'expected.json'), 'utf8')) as GoldenExpected;
      expect(c.actual).toEqual(expected);
      if (!c.result.ok) return;
      for (const item of c.result.items) {
        // Verbatim: every accepted text-layer item carries a quote the existing quote check finds.
        if (c.meta.text === 'tesseract ocr') {
          expect(item.quote_verified).toBe(false);
        } else {
          expect(item.source_quote, `item ${item.agenda_number}`).toBeTruthy();
          expect(quoteVerified(item.source_quote!, c.text), `item ${item.agenda_number}`).toBe(true);
          expect(item.quote_verified).toBe(true);
        }
        // Same ID formula as the LLM path (D11), so switching adapters doesn't duplicate items.
        expect(item.external_id).toMatch(/^[0-9a-f]{40}(#\d+)?$/);
      }
    });
  }
});

describe('mud_agenda corrupted cases (Step 7, adapted)', () => {
  const base = join(DIR, 'hcmud_489-2026-10-19');
  const text = readFileSync(join(base, 'agenda.txt'), 'utf8');
  const sph = profileById('sph');
  const ctx = (date = '2026-10-19') => ({ source_id: 'hcmud_489', body_id: 'hcmud_489', url: 'https://example.invalid/a.pdf', now: GOLDEN_NOW, link: { date, type: 'regular' as const } });

  it('the clean agenda parses', () => {
    expect(parseMudAgenda(text, sph, ctx()).ok).toBe(true);
  });

  it('wrong date: notice and link more than a day apart', () => {
    const r = parseMudAgenda(text, sph, ctx('2026-10-21'));
    expect(r.ok).toBe(false);
    expect(r.reasons.join()).toMatch(/not within 1 day/);
  });

  it('out-of-order numbers', () => {
    const swapped = text.replace('\n3. Bookkeeper', '\n4. Bookkeeper').replace('\n4. Annual review', '\n3. Annual review');
    const r = parseMudAgenda(swapped, sph, ctx());
    expect(r.ok).toBe(false);
    expect(r.reasons.join()).toMatch(/item 3 missing/);
  });

  it('missing boilerplate: unrecognized closing text would be read as part of the last item', () => {
    const cut = text.slice(0, text.indexOf('(SEAL)')) + 'Respectfully posted for the District by\nthe undersigned on the date shown\nat the place set out in this notice\nfor the time required by law\n';
    const r = parseMudAgenda(cut, sph, ctx());
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('closing boilerplate not recognized');
  });

  it('an item swallowed by the §551 paragraph', () => {
    const para =
      'If, during the course of the meeting covered by this Notice, the Board should determine that a\n' +
      'closed or executive session of the Board should be held, it will be held as authorized by\n' +
      'Texas Government Code, Chapter 551, Subchapter D of said Act. 12. Operator\'s Report, including:\n';
    const swallowed = text.replace('12. Operator\'s Report, including:\n', para);
    const r = parseMudAgenda(swallowed, sph, ctx());
    expect(r.ok).toBe(false);
    expect(r.reasons.join()).toMatch(/item 1[23]/);
    expect(r.items.every((i) => !/Subchapter D/.test(i.title + (i.description ?? '')))).toBe(true);
  });

  it('a private name in a personnel item becomes "an employee" (D9)', () => {
    const personnel = text.replace('23. Attorney\'s Report; and', '23. Hearing on the proposed termination of Jane Q. Example, employee; and');
    const r = parseMudAgenda(personnel, sph, ctx());
    const item = r.items.find((i) => i.agenda_number === '23')!;
    expect(item.contains_private_person).toBe(true);
    expect(JSON.stringify(item)).not.toMatch(/Jane|Example/);
    expect(item.title).toMatch(/an employee/);
  });
});

describe('mud_agenda text cleanup (§3.2)', () => {
  it('fixes OCR-style numbers only when they give the expected number', () => {
    expect(readItemNumber('l. Public comments;', 1)).toEqual({ n: 1, marker: 3 });
    expect(readItemNumber('1O. Engineer', 10)?.n).toBe(10);
    expect(readItemNumber('S. Tax report', 5)?.n).toBe(5);
    expect(readItemNumber('S. Tax report', 6)).toBeNull();
    expect(readItemNumber('i. sub-item', 4)).toBeNull();
    expect(readItemNumber('12. Operator', 12)?.n).toBe(12);
  });

  it('drops doc IDs, page numbers and running headers, but not repeated item text', () => {
    const page = (n: number) => `MUD 1\nNOTICE\nItems\n${n}. Approve an order in connection\ntherewith;\nand more ${n}\nwords here ${n}\nlast words ${n}\nfooter ${n}\n`;
    const lines = markFurniture(splitLines(`${page(1)}4934-3202-1463 v.1\f${page(2)}- 2 -`));
    expect(lines.filter((l) => l.dropped).map((l) => l.text)).toEqual(['MUD 1', 'NOTICE', 'Items', '4934-3202-1463 v.1', 'MUD 1', 'NOTICE', 'Items', '- 2 -']);
  });

  it('recognizes seal noise', () => {
    expect(isNoise('UTILITYS.... %')).toBe(true);
    expect(isNoise('90900000000000')).toBe(true);
    expect(isNoise('LLC);')).toBe(false);
    expect(isNoise('a)')).toBe(false);
    expect(isNoise('Monthly report;')).toBe(false);
  });
});
