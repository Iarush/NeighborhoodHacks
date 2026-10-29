# District sites on the "church" WordPress theme (bucket M18)

Sites with `wp-content/themes/church` list meetings as dated lines ("2026-10-28 – Regular: Agenda | Minutes<br>") with agendas on Google Drive. Handled by `discover` configs (`link_pattern "(?i)^agenda$"`, `match_link_text`, `date_from: line_text`), no dedicated adapter. Recorded Oct 29, 2026.

| File | Source |
| --- | --- |
| `remington-mud-1-meetings.html` | `remington_mud_1` (https://www.remingtonmud1.org/meetings/) |
| `chimney-hill-mud-meeting-documents.html` | `chimney_hill_mud` (https://www.chimneyhillmud.com/meetings/meeting-documents/): its `/meetings/` page holds only the "Upcoming Meetings" widget |

Re-record with `curl -sL -A Mozilla <url> -o <file>`; tests: `tests/unit/mud-m18.test.ts`.
