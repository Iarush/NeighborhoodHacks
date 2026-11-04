import { describe, expect, it } from 'vitest';
import { FIRM_PROFILES, detectFirm, phone, phrase, profileById } from '@/lib/adapters/mudAgenda/profiles';
import { likelyRung, listShape, numberedRun, summarize, surveyRow } from '@/lib/adapters/mudAgenda/survey';

// mud-code-parser-spec Phase 0: firm fingerprints and the survey's list-shape estimate.

const filler = 'Consider and act upon the matters listed below. '.repeat(8);
const numbered = (n: number) => Array.from({ length: n }, (_, i) => `${i + 1}. Item number ${i + 1} ${filler}`).join('\n');

describe('detectFirm', () => {
  it('recognizes a firm by name or by the disability-notice phone', () => {
    expect(detectFirm('ALLEN BOONE HUMPHRIES ROBINSON LLP\nAttorneys for the District')).toEqual({ id: 'abhr', by: 'name' });
    expect(detectFirm('please contact the District’s attorney at (713) 860-6400 at least three business days')).toEqual({ id: 'abhr', by: 'phone' });
    expect(detectFirm('contact the attorney at 713.623.4531')).toEqual({ id: 'sph', by: 'phone' });
  });

  it('copes with OCR noise and line breaks in the name', () => {
    expect(detectFirm('CoatslRose, P.C.\nAttorneys for the District').id).toBe('coats_rose');
    expect(detectFirm('Radcliffe Adams\nBarner PLLC').id).toBe('radcliffe_bobbitt');
  });

  it('prefers the firm matched last: the signature closes the agenda, other firms appear in items', () => {
    const text = '7. Consider engagement of Norton Rose Fulbright as bond counsel;\n8. Adjourn.\nSchwartz, Page & Harding, L.L.P.\nAttorneys for the District';
    expect(detectFirm(text)).toEqual({ id: 'sph', by: 'name' });
  });

  it('falls back to doc-ID footers, then template wording, then generic', () => {
    expect(detectFirm('Page 1 of 2\n91155-002 603375.1')).toEqual({ id: 'matter_002', by: 'doc_id' });
    expect(detectFirm('ACTIVE 728998873v2\nWINDFERN FOREST UTILITY DISTRICT')).toEqual({ id: 'greenberg_traurig', by: 'doc_id' });
    expect(detectFirm('requested to contact the District’s\nparalegal at (713) 651-5691')).toEqual({ id: 'norton_rose', by: 'template' });
    expect(detectFirm('JRY/yc NORTHWEST HARRIS COUNTY MUNICIPAL UTILITY DISTRICT NO. 19')).toEqual({ id: 'initials_header', by: 'template' });
    expect(detectFirm('NOTICE OF PUBLIC HEARING ON TAX RATE')).toEqual({ id: 'generic', by: 'none' });
  });

  it('a doc ID never outranks a name', () => {
    expect(detectFirm('91155-002 603375.1\nPolley Garza PLLC').id).toBe('polley_garza');
  });

  it('does not read a phone out of a longer number', () => {
    expect(phone('7138606400').test('(713) 860-64001')).toBe(false);
    expect(phone('7138606400').test('1713-860-6400')).toBe(false);
    expect(phone('7138606400').test('(713)860-6400')).toBe(true);
  });

  it('phrase() escapes punctuation and spans line breaks', () => {
    expect(phrase('Sec. 551.071 (a)').test('Sec.\n551.071 (a)')).toBe(true);
    expect(phrase('Sec. 551.071').test('Sec 5510071')).toBe(false);
  });

  it('every profile has a unique id and some way to be detected', () => {
    const ids = FIRM_PROFILES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of FIRM_PROFILES) expect(p.detect.length + (p.phones?.length ?? 0) + (p.doc_id?.length ?? 0) + (p.template?.length ?? 0)).toBeGreaterThan(0);
    expect(profileById('nope').id).toBe('generic');
  });
});

describe('list shape', () => {
  it('counts the in-order run from 1 and skips stray numbers', () => {
    expect(numberedRun('1. A\n2. B\n12. Main St\n3) C\n5. E\n4. D')).toBe(4);
    expect(numberedRun('a. one\nb. two')).toBe(0);
  });

  it('classifies numbered, unnumbered and scanned documents', () => {
    expect(listShape([numbered(5)])).toEqual({ shape: 'numbered', run: 5 });
    expect(listShape([numbered(2)]).shape).toBe('unnumbered');
    expect(listShape(['', ' ']).shape).toBe('scanned');
    expect(['numbered', 'unnumbered', 'scanned', undefined].map((s) => likelyRung(s as never))).toEqual(['1', '2/4', '3', 'none']);
  });
});

describe('survey rows and summary', () => {
  const abhr = `${numbered(6)}\nAllen Boone Humphries Robinson LLP`;

  it('takes the shape from the newest document and the firm from any text-layer one', () => {
    const row = surveyRow({
      id: 'x',
      water_district: true,
      docs: [
        { url: 'old', date: '2026-09-01', pages: [abhr] },
        { url: 'new', date: '2026-10-01', pages: [''] },
      ],
    });
    expect(row).toMatchObject({ shape: 'scanned', rung: '3', firm: { id: 'abhr' }, docs: 2, text_docs: 1, newest_url: 'new' });
  });

  it('summarizes water districts only, with unidentified over text-layer districts', () => {
    const rows = [
      surveyRow({ id: 'a', water_district: true, docs: [{ url: 'a', date: '2026-10-01', pages: [abhr] }] }),
      surveyRow({ id: 'b', water_district: true, docs: [{ url: 'b', date: '2026-10-01', pages: [numbered(4)] }] }),
      surveyRow({ id: 'c', water_district: true, docs: [{ url: 'c', date: '2026-10-01', pages: [''] }] }),
      surveyRow({ id: 'd', water_district: true, docs: [], error: 'fetch failed' }),
      surveyRow({ id: 'isd', water_district: false, docs: [{ url: 'e', date: '2026-10-01', pages: [numbered(4)] }] }),
    ];
    expect(summarize(rows)).toEqual({
      sources: 5,
      water_districts: 4,
      with_document: 3,
      by_shape: { numbered: 2, unnumbered: 0, scanned: 1 },
      by_firm: { abhr: 1, generic: 1 },
      unidentified_text: 1,
      unidentified_share: 0.5,
      failed: 1,
    });
  });
});
