import { describe, expect, it } from 'vitest';
import { parseDocDate, parseIndex } from '@/lib/adapters/discover';

// Finalsite district sites (Huffman ISD, Pearland ISD) link agendas to /fs/resource-manager/view/<uuid>.
// The URL has no date or name, so the date comes from the data-file-name attribute. Markup copied
// from the live pages on Oct 28, 2026.
const BASE = 'https://www.huffmanisd.net/board-of-trustees/agendas-2026-2027';

const HUFFMAN = `
<p><a data-file-name="10-26-2026BoardAgenda.pdf" data-resource-uuid="8648ff73" href="/fs/resource-manager/view/8648ff73-947d-4b63-9cb4-70e04c17aeb6" target="_blank">October 26, 2026</a></p>
<p><a data-file-name="09-03-2026BoardofTrusteeCandidateOrientation.pdf" data-resource-uuid="d1855622" href="/fs/resource-manager/view/d1855622-9e6b-467d-9191-319d693bf02f" target="_blank">September 3, 2026&nbsp;Board of Trustee Candidate Orientation</a></p>
<p><a data-file-name="Agenda08-17-2026.pdf" data-resource-uuid="ad70ec78" href="/fs/resource-manager/view/ad70ec78-fa99-453f-bd8c-677d46877607" target="_blank">August 17, 2026 Called Board Meeting</a></p>
<p><a data-file-name="08-05-2026BoardWorkshop.pdf" data-resource-uuid="778850f1" href="/fs/resource-manager/view/778850f1-5ce1-4421-ac9a-4ee05abc71a8" target="_blank">August 5, 2026, BOARD WORKSHOP</a></p>
`;

const PEARLAND = `
<a data-file-name="2026_07_14_BoardAgenda.pdf" data-resource-uuid="a7191411" href="/fs/resource-manager/view/a7191411-a266-4f76-9a04-251d1e200b4b" target="_blank">Agenda</a>
<a data-file-name="2026_10_13_BoardAgenda.pdf" data-resource-uuid="4b1d39e6" href="/fs/resource-manager/view/4b1d39e6-dd82-49af-868a-94073e6cc492" target="_blank">Agenda</a>
<a data-file-name="2026_10_13_BoardAgenda.pdf" data-resource-uuid="4b1d39e6" href="/fs/resource-manager/view/4b1d39e6-dd82-49af-868a-94073e6cc492" target="_blank">Agenda</a>
`;

describe('data_file_name date source (Finalsite)', () => {
  it('reads Huffman dates and keeps only agenda PDFs', () => {
    const { docs } = parseIndex(HUFFMAN, BASE, {
      index_url: BASE,
      link_pattern: '(?i)agenda',
      date_from: 'data_file_name',
    });
    // Page order; the window and pickPerDate sort later.
    expect(docs.map((d) => d.date)).toEqual(['2026-10-26', '2026-08-17']);
    expect(docs.every((d) => d.day_known)).toBe(true);
  });

  it('reads Pearland underscore dates and dedupes repeated links', () => {
    const { docs } = parseIndex(PEARLAND, 'https://www.pearlandisd.org/board-of-trustees/meeting-schedule', {
      index_url: 'https://www.pearlandisd.org/board-of-trustees/meeting-schedule',
      link_pattern: '(?i)agenda',
      date_from: 'data_file_name',
    });
    expect(docs.map((d) => d.date)).toEqual(['2026-07-14', '2026-10-13']);
  });

  it('keeps link_text and filename behaviour unchanged', () => {
    const html = '<a href="https://x.test/a/10132026-RegularMeeting-Notice.pdf">Oct 13 2026-Regular Meeting-Notice</a>';
    const { docs } = parseIndex(html, 'https://x.test/', {
      index_url: 'https://x.test/',
      link_pattern: '(?i)-notice\\.pdf$',
      date_from: 'link_text',
    });
    expect(docs.map((d) => d.date)).toEqual(['2026-10-13']);
  });
});

describe('parseDocDate underscore form', () => {
  it('accepts yyyy_mm_dd', () => {
    expect(parseDocDate('2026_10_13_BoardAgenda.pdf')).toEqual({ date: '2026-10-13', day_known: true });
  });
});
