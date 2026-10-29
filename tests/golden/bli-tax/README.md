# Bob Leared Interests district pages (bucket M12)

`bli-tax.com/<district-slug>/`: WordPress pages listing agenda PDFs under `/wp-content/uploads/`.
The link text is only the month ("October 2026"), so the date comes from the filename, in several
spellings (`HC-216-Agenda-10.12.2026.pdf`, `NWHCMUD-9-Meeting-Agenda-11.03.2026.pdf`,
`HWC5-Agenda-10-15-26.pdf`, `Agenda-10.20.26-HC-321.pdf`). Handled by a `discover` config.
Recorded Oct 29, 2026.

| File | Source |
| --- | --- |
| `hcmud216.html` | `hcmud_216` (https://bli-tax.com/harris-county-mud-216/) |
| `nwhcmud9.html` | `nwhcmud_9` (https://bli-tax.com/northwest-harris-county-mud-9/) |

Re-record with `curl -sL <url> -o <file>`; tests: `tests/unit/mud-m12.test.ts`.
