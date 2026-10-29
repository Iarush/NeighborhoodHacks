# Gatsby district sites (bucket M11)

Same `/static/<hash>/…Agenda….pdf` layout as `static-pdf/`, with the date in the filename in several
spellings (`HC_391_Agenda_10_19_26_….pdf`, `Agenda_10_26_26_….pdf`, `4_14_26_Agenda_4913_….pdf`).
Newer sites list agendas under Board Meetings; older Gatsby 2 sites list them under Documents.
Recorded Oct 29, 2026.

| File | Source |
| --- | --- |
| `hcmud391-board-meetings.html` | `hcmud_391` (https://www.hcmud391.org/board-meetings/) |
| `whcmud9-documents.html` | `whcmud_9` (https://www.whcmud9.com/documents/) |

Re-record with `curl -sL -A Mozilla <url> -o <file>`; tests: `tests/unit/mud-m11.test.ts`.
