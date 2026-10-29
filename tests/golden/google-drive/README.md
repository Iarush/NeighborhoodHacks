# Google Drive district pages

Index pages for water districts whose agendas are Google Drive files (`drive.google.com/file/d/<id>/view`).
`discover` downloads them through `downloadUrl()` (`uc?export=download`). Recorded Oct 29, 2026.

| File | Source | Layout |
| --- | --- | --- |
| `cbcmud-meetings.html` | `clear_brook_city_mud` (https://cbcmud.com/meetings) | `2026-10-21 – Regular: Agenda \| Minutes<br>`: `date_from: line_text` |
| `districtdirectory-hcmud423.html` | `hcmud_423` (districtdirectory.org) | same layout |
| `sklaw-northgate-crossing-road-ud.html` | `northgate_crossing_road_ud` (sklawdistrictdata.org) | Agendas / Minutes table: `link_selector: "td:first-child a"` |

Re-record with `curl -sL -A Mozilla <url> -o <file>`; tests: `tests/unit/mud-discover.test.ts`.
Drive returns a "Quota exceeded" HTML page for a heavily downloaded file; that shows up as
"Invalid PDF structure" in the scrape warnings and clears on its own.
