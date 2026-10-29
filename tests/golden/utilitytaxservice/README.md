# Utility Tax Service district listings (bucket M12)

`www.utilitytaxservice.com/DistrictDocsList/<district>`: a "Meeting Notices and Agendas" card with
links to `PDFViewerEx/<district>/<docId>` (a Blazor viewer; the PDF has no plain download URL). The
date is the link text in two spellings ("October 12, 2026", "10/20/2026"); a `<small>` label marks
special meetings, cancellations and Master/Internal copies. The page sets `<base href="/">`.
Read by `lib/adapters/utilitytaxservice.ts` (link-only). Recorded Oct 29, 2026.

| File | Source |
| --- | --- |
| `hcmud458-docs-list.html` | `hcmud_458` (https://www.utilitytaxservice.com/DistrictDocsList/378) |
| `hcmud171-docs-list.html` | `hcmud_171` (https://www.utilitytaxservice.com/DistrictDocsList/471) |

Re-record with `curl -sL <url> -o <file>`; tests: `tests/unit/utilitytaxservice.test.ts`.
