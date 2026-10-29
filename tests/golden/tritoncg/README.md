# Triton district sites (bucket M13)

District sites built by Triton list each meeting as a news card ("October 15, 2026 Board Meeting").
The card opens a notice page whose first PDF link is the agenda on `tmc.tritoncg.com/documents/`.
Handled by a `discover` config (`match_link_text`, `follow_notice_page`), no dedicated adapter.
Recorded Oct 29, 2026.

| File | Source |
| --- | --- |
| `lakemud-news.html` | `lake_mud` (https://lakemud.com/news) |
| `lakemud-notice-2026-10-29.html` | `lake_mud` (https://lakemud.com/news/october-29-2026-special-board-meeting) |
| `woodcreek-news.html` | `woodcreek_mud` (https://woodcreekmud.com/news) |
| `woodcreek-notice-2026-10-15.html` | `woodcreek_mud` (https://woodcreekmud.com/news/october-15-2026-board-meeting) |

Re-record with `curl -sL -A Mozilla <url> -o <file>`; tests: `tests/unit/mud-m13.test.ts`.
