import { describe, expect, it } from 'vitest';
import { downloadUrl, parseDocDate, parseIndex, pickPerDate } from '@/lib/adapters/discover';
import { meetingFromLink } from '@/lib/adapters/llmExtract';

// Index-page shapes from the S1–S3 school-board rollout, copied from the live pages on Oct 28, 2026.

describe('Apptegy embedded document JSON (Spring ISD)', () => {
  const base = 'https://www.springisd.org/documents/x/864365';
  const html = `<script>window.__DATA__=[,"Signed Agenda Notice - September 15 2026 - Regular Meeting - REVISED","pdf",
"https://files-backend.assets.thrillshare.com/documents/asset/uploaded_file/4570/Sisd/86d2/Signed-Agenda-Notice---September-15-2026---Regular-Meeting---REVISED.pdf?disposition=inline",
"https://files-backend.assets.thrillshare.com/documents/asset/uploaded_file/4570/Sisd/c277/Signed-Agenda-Notice---September-15-2026---Regular-Meeting.pdf?disposition=inline",
"https://files-backend.assets.thrillshare.com/documents/asset/uploaded_file/4570/Sisd/b755/Signed-Agenda-Notice---September-19-2026---Special-Called-Session.pdf?disposition=inline"]</script>`;
  const cfg = {
    index_url: base,
    link_pattern: '(?i)thrillshare\\.com/.+agenda[^/]*\\.pdf',
    embedded_links: true,
    date_from: 'filename' as const,
    meeting_type_from_text: { special: '(?i)special' },
  };

  it('finds URLs outside anchors only when embedded_links is set', () => {
    expect(parseIndex(html, base, { ...cfg, embedded_links: false }).docs).toEqual([]);
    expect(parseIndex(html, base, cfg).docs.map((d) => [d.date, d.type])).toEqual([
      ['2026-09-15', 'regular'],
      ['2026-09-15', 'regular'],
      ['2026-09-19', 'special'],
    ]);
  });

  it('prefers the REVISED agenda on the same date', () => {
    const { docs } = pickPerDate(parseIndex(html, base, cfg).docs);
    expect(docs.find((d) => d.date === '2026-09-15')!.filename).toMatch(/REVISED/);
  });
});

describe('Google Drive folder view (Aldine ISD)', () => {
  const base = 'https://drive.google.com/embeddedfolderview?id=folder';
  const html = `
<a href="https://drive.google.com/file/d/1EoZ/view?usp=drive_web"><div class="flip-entry-title">Posting of Regular Meeting_10.19-20.26.pdf</div></a>
<a href="https://drive.google.com/file/d/1E8d/view?usp=drive_web"><div class="flip-entry-title">Posting of Special Called Meeting_8.17.26.pdf</div></a>
<a href="https://drive.google.com/file/d/1EKN/view?usp=drive_web"><div class="flip-entry-title">Level III Grievance Hearing_5.19.2026_Name.pdf</div></a>`;
  const cfg = {
    index_url: base,
    link_pattern: '(?i)^posting of (regular|special called) meeting',
    match_link_text: true,
    date_from: 'link_text' as const,
    date_range: 'last' as const,
    meeting_type_from_text: { special: '(?i)special' },
  };

  it('matches on link text, takes the vote day, and skips grievance notices', () => {
    expect(parseIndex(html, base, cfg).docs.map((d) => [d.date, d.type, d.url])).toEqual([
      ['2026-10-20', 'regular', 'https://drive.google.com/file/d/1EoZ/view?usp=drive_web'],
      ['2026-08-17', 'special', 'https://drive.google.com/file/d/1E8d/view?usp=drive_web'],
    ]);
  });

  it('downloads Drive view links as the file', () => {
    expect(downloadUrl('https://drive.google.com/file/d/1EoZ_x-9/view?usp=drive_web')).toBe('https://drive.google.com/uc?export=download&id=1EoZ_x-9');
    expect(downloadUrl('https://x.test/a.pdf')).toBe('https://x.test/a.pdf');
  });
});

describe('Edlio agenda list (Deer Park ISD)', () => {
  const base = 'https://www.dpisd.org/apps/pages/index.jsp';
  const html = `
<a class="attachment-type-pdf" href="https://4.files.edl.io/a/164637-x.pdf">September 14, 2026 - Agenda Summary</a>
<a class="attachment-type-pdf" href="https://4.files.edl.io/a/164639-y.pdf">September 14, 2026 - Schools F.I.R.S.T. Hearing</a>
<a class="attachment-type-pdf" href="https://4.files.edl.io/a/204040-z.pdf">August 17, 2026 - Level Three Grievance - Name</a>`;

  it('keeps only agenda summaries', () => {
    const { docs } = parseIndex(html, base, { index_url: base, link_pattern: '(?i)agenda summary|workshop', match_link_text: true, date_from: 'link_text' });
    expect(docs.map((d) => d.url)).toEqual(['https://4.files.edl.io/a/164637-x.pdf']);
  });
});

describe('dates and status', () => {
  it('parses dotted dates and ranges', () => {
    expect(parseDocDate('Meeting_9.14-15.26.pdf')?.date).toBe('2026-09-14');
    expect(parseDocDate('Meeting_9.14-15.26.pdf', 'last')?.date).toBe('2026-09-15');
    expect(parseDocDate('Hearing_9.1.2026.pdf')?.date).toBe('2026-09-01');
  });

  it('marks a cancelled agenda link as cancelled', () => {
    const url = 'https://x.test/Signed-Agenda-Notice---September-1-2026---Work-Session---CANCELED-(Due-to-impending-weather).pdf';
    expect(meetingFromLink('s', 'b', { date: '2026-09-01', type: 'regular', url }).status).toBe('cancelled');
    expect(meetingFromLink('s', 'b', { date: '2026-09-01', type: 'regular', url: 'https://x.test/a.pdf' }).status).toBe('scheduled');
  });
});
