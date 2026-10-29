import { describe, expect, it } from 'vitest';
import { agendaTime, boardDocsBase, mapMeeting, parseMeetingsList } from '@/lib/adapters/boarddocs';

// Shapes copied from go.boarddocs.com/tx/kisd (Katy ISD) on Oct 28, 2026.
const LIST = JSON.stringify([
  { unique: 'DVZPK864E403', name: 'Regular Board Meeting Agenda', numberdate: '20261026' },
  { unique: 'DX2QEF68F20C', name: 'Special Board Meeting -Strategic Planning', numberdate: '20260831' },
  { unique: '', name: 'broken', numberdate: '2026' },
]);

describe('boarddocs', () => {
  it('parses the meetings list', () => {
    expect(parseMeetingsList(LIST)).toEqual([
      { unique: 'DVZPK864E403', name: 'Regular Board Meeting Agenda', date: '2026-10-26' },
      { unique: 'DX2QEF68F20C', name: 'Special Board Meeting -Strategic Planning', date: '2026-08-31' },
    ]);
  });

  it('reads the opening time from the printed agenda', () => {
    expect(agendaTime('Monday, October 26, 2026 Regular Board Meeting Agenda OPEN MEETING: 5:00 P.M. Notice is')).toBe('5:00 PM');
    expect(agendaTime('no time here')).toBeUndefined();
  });

  it('maps a meeting', () => {
    const [reg, special] = parseMeetingsList(LIST);
    const base = boardDocsBase('tx', 'kisd');
    expect(mapMeeting('katy_isd_board', 'katy_isd_board', base, reg!, '5:00 PM')).toMatchObject({
      date: '2026-10-26T17:00:00-05:00',
      type: 'regular',
      status: 'scheduled',
      agenda_url: 'https://go.boarddocs.com/tx/kisd/Board.nsf/goto?open&id=DVZPK864E403',
    });
    expect(mapMeeting('s', 'b', base, special!).type).toBe('special');
  });
});
