# Gatsby district sites with documents on S3 (bucket M13)

Gatsby sites whose documents come from `website-media-*.s3.amazonaws.com` and are served as
`/static/<hash>/<name>_<hash>.pdf`, with the date in the filename (`…AGENDA_October_26_2026_….pdf`,
`2026_09_09_Agenda_….pdf`, `10_28_26_NTC_….pdf`). Same layout as `gatsby/`; handled by a `discover`
config. Recorded Oct 29, 2026.

| File | Source |
| --- | --- |
| `hcwcid109-board-meetings.html` | `hcwcid_109` (https://www.hcwcid109.com/board-meetings/) |
| `hcmud8-board-meetings.html` | `hcmud_8` (https://www.hcmud8.com/board-meetings/) |

Re-record with `curl -sL -A Mozilla <url> -o <file>`; tests: `tests/unit/mud-m13.test.ts`.
