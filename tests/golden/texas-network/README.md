# "The Texas Network" district sites (bucket M11)

District sites with the footer credit "the texas network". Most are WordPress (Avada) Meetings
pages whose agenda links read "10-22-26 Agenda"; Minutes links sit beside them with the same dates.
Water District 109's static page links only the date ("10-20-26"), so its source matches the href
(`…/2026/agendas/109-October 20, 2026 Agenda.pdf`). Recorded Oct 29, 2026.

| File | Source |
| --- | --- |
| `kleinwood-meetings.html` | `kleinwood_mud` (https://www.kleinwoodmud.com/meetings/) |
| `hcwcid99-meetings.html` | `hcwcid_99` (https://www.hcwcid99.com/meetings/) |
| `waterdistrict109-meetings.html` | `hcmud_109` (https://www.waterdistrict109.com/meetings/index.html) |

Re-record with `curl -sL -A Mozilla <url> -o <file>`; tests: `tests/unit/mud-m11.test.ts`.
