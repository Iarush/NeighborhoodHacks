# Gatsby static-PDF district sites

Water district sites built on Gatsby that serve agenda PDFs from `/static/<hash>/…pdf` with the date
in the filename (`Emerald_Agenda_10_08_26_….pdf`, `10_20_2026_Agenda_Encanto_….pdf`). Recorded Oct 29, 2026.

| File | Source |
| --- | --- |
| `emerald-forest-board-meetings.html` | `emerald_forest_ud` (https://emeraldforestud.com/board-meetings/) |
| `encanto-real-documents.html` | `encanto_real_ud` (https://www.encantorealud.com/documents) |

Re-record with `curl -sL -A Mozilla <url> -o <file>`; tests: `tests/unit/mud-discover.test.ts`.
