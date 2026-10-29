# Tax Tech district listings (bucket M15)

`www.taxtech.net/DistrictDocsList/<district>`: the same portal as Utility Tax Service (see
`../utilitytaxservice/README.md`). Its "Meeting Agendas" card links `PDFViewerEx/<district>/<docId>`
with link text "Meeting Agenda for 10-15-2026". Read by `lib/adapters/utilitytaxservice.ts` with
`site: https://www.taxtech.net/` (link-only). Recorded Oct 29, 2026, with inline scripts removed.

| File | Source |
| --- | --- |
| `district-332-docs-list.html` | `hcmud_449` (https://www.taxtech.net/DistrictDocsList/332) |
| `district-187-docs-list.html` | `hcmud_287` (https://www.taxtech.net/DistrictDocsList/187) |

Tests: `tests/unit/mud-m15.test.ts`.
