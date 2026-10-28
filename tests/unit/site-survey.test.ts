import { describe, expect, it } from 'vitest';
import { agendaPageLinks, betterSuggestion, boardPlatforms, comptrollerKey, guessedDomains, namesDistrict, siteBuilder, suggestConfig } from '@/lib/ingest/siteSurvey';

const base = 'https://www.hcmud165.com/';

describe('site survey (plan 0.7)', () => {
  it('finds board platforms and Drive-hosted documents', () => {
    const html = '<a href="https://meetings.boardbook.org/Public/Organization/1894">Meetings</a><a href="https://drive.google.com/file/d/abc/view">2026-09-03</a>';
    expect(boardPlatforms(html, base).map((p) => p.platform)).toEqual(['boardbook', 'google-drive']);
  });

  it('names the site builder from the generator tag or asset hosts', () => {
    expect(siteBuilder('<meta name="generator" content="WordPress 6.6">')).toBe('wordpress');
    expect(siteBuilder('<link href="https://static1.squarespace.com/x.css">')).toBe('squarespace');
    expect(siteBuilder('<p>hi</p>')).toBe('unknown');
  });

  it('ranks same-site agenda pages and skips files and other hosts', () => {
    const html = '<a href="/about/">About</a><a href="/board/">Board</a><a href="/meetings/">Meeting agendas</a><a href="/x.pdf">Agenda</a><a href="https://other.org/agendas">Agendas</a>';
    expect(agendaPageLinks(html, base)).toEqual(['https://www.hcmud165.com/meetings/', 'https://www.hcmud165.com/board/']);
  });

  it('suggests the pattern and date format that date the most agendas', () => {
    const html = ['October_19_2026', 'September_21_2026', 'August_17_2026'].map((d) => `<a href="/static/Agenda_${d}_HCWCID_159.pdf">Agenda</a>`).join('');
    expect(suggestConfig(html, base)).toMatchObject({ link_pattern: '(?i)agenda[^/]*\\.pdf$', date_from: 'filename', dated: 3, newest: '2026-10-19' });
    const drive = ['2026-09-03', '2026-08-06', '2026-07-02'].map((d, i) => `<a href="https://drive.google.com/file/d/${i}/view">${d}</a>`).join('');
    expect(suggestConfig(drive, base)).toMatchObject({ date_from: 'link_text', dated: 3, newest: '2026-09-03' });
    expect(suggestConfig('<a href="/about">About</a>', base)).toBeUndefined();
  });

  it('prefers the newest list over a longer archive, but not a lone link', () => {
    const current = { index_url: 'a', link_pattern: 'p', date_from: 'filename' as const, dated: 5, newest: '2026-10-21' };
    const archive = { ...current, dated: 26, newest: '2025-12-17' };
    expect(betterSuggestion(current, archive)).toBe(true);
    expect(betterSuggestion({ ...current, dated: 1, newest: '2026-10-28' }, current)).toBe(false);
  });

  it('guesses domains but accepts a page only if it names the same district', () => {
    expect(guessedDomains('hcwcid_157')).toContain('https://www.hcwcid157.org/');
    expect(guessedDomains('hcmud_165')).toContain('https://www.harriscountymud165.com/');
    expect(namesDistrict('<h1>Harris County MUD No. 165</h1>', 'hcmud_165', '')).toBe(true);
    expect(namesDistrict('<h1>Harris County MUD No. 1650</h1>', 'hcmud_165', '')).toBe(false);
    expect(namesDistrict('<h1>Harris County WCID #157</h1>', 'hcmud_157', '')).toBe(false);
  });

  it("matches the Comptroller's '#157' to our 'No. 157'", () => {
    expect(comptrollerKey('Harris County Municipal Utility District #157')).toBe(comptrollerKey('Harris County Municipal Utility District No. 157'));
  });
});
