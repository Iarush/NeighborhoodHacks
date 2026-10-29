# WordPress district sites with Google Drive agendas (bucket M14)

Handled by `discover` configs, no dedicated adapter. Recorded Oct 29, 2026.

| File | Source |
| --- | --- |
| `oakmont-archives.html` | `oakmont_pud` (https://oakmontpud.org/board/archives/): dated meeting pages |
| `oakmont-meeting-2026-10-08.html` | `oakmont_pud` (https://oakmontpud.org/general-meeting-114/): links the agenda on Google Drive (`follow_notice_page`) |
| `interstate-mud.html` | `interstate_mud` (https://interstatemud.com/interstate-mud/): "2026-10-13: Agenda \| Minutes" lines, agendas on Google Drive |

Re-record with `curl -sL -A Mozilla <url> -o <file>`; tests: `tests/unit/mud-m14.test.ts`.
