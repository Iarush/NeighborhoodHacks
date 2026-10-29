import { describe, expect, it } from 'vitest';
import { createDiligentAdapter, mapMeeting, parseMeetingList, publicAgenda } from '@/lib/adapters/diligent';

// Markup and JSON shapes copied from humbleisd.diligent.community on Oct 28, 2026.
const LIST = `
<a href="/Portal/MeetingInformation.aspx?Id=379" class="meeting-type-item-title">Regular Meeting of the Board of Trustees</a>
<a class="list-link" href="/Portal/MeetingInformation.aspx?Id=379">Regular Meeting of the Board of Trustees - Oct 20 2026</a>
<a class="list-link" href="/Portal/MeetingInformation.aspx?Id=397">Special Meeting of the Board of Trustees - CANCELLED - Sep 14 2026</a>
<a class="list-link" href="/Portal/MeetingInformation.aspx?Id=379">Regular Meeting of the Board of Trustees - Oct 20 2026</a>
`;

describe('diligent', () => {
  it('lists each meeting once with its date', () => {
    expect(parseMeetingList(LIST)).toEqual([
      { id: '379', name: 'Regular Meeting of the Board of Trustees', date: '2026-10-20' },
      { id: '397', name: 'Special Meeting of the Board of Trustees - CANCELLED', date: '2026-09-14' },
    ]);
  });

  it('maps time, type and cancellation', () => {
    const [reg, cancelled] = parseMeetingList(LIST);
    const m = mapMeeting('humble_isd_board', 'humble_isd_board', 'humbleisd', reg!, { Name: reg!.name, Time: '05:00 PM' });
    expect(m).toMatchObject({ date: '2026-10-20T17:00:00-05:00', type: 'regular', status: 'scheduled' });
    expect(m.agenda_url).toBe('https://humbleisd.diligent.community/Portal/MeetingInformation.aspx?Id=379');
    expect(mapMeeting('s', 'b', 'humbleisd', cancelled!, { Time: '05:00 PM' })).toMatchObject({ type: 'special', status: 'cancelled' });
  });

  it('uses only the public HTML agenda', () => {
    expect(
      publicAgenda([
        { Type: 4, IsPublic: false, Format: 'pdf', Id: 2 },
        { Type: 1, IsPublic: true, Format: 'docx', Id: 1, Html: '<p>1. Call to order</p>' },
      ]),
    ).toEqual({ id: 1, text: '1. Call to order' });
    expect(publicAgenda([{ Type: 1, IsPublic: false, Id: 1, Html: '<p>x</p>' }])).toBeUndefined();
  });

  it('returns nothing in results mode', async () => {
    const out = await createDiligentAdapter({ llm: null }).run(
      { id: 's', body_id: 'b', adapter: 'diligent', config: { portal: 'humbleisd' } },
      { kind: 'results', meeting_external_ids: ['x'] },
      { from: new Date(0), to: new Date(0) },
    );
    expect(out.meetings).toEqual([]);
  });
});
