# mud_agenda golden set

The code parser's fixtures (`.plans/mud-code-parser-spec.md` §7 Phase 1). Tests:
`tests/unit/mud-agenda-parse.test.ts` (each case) and `tests/unit/mud-agenda-adapter.test.ts`
(the ladder, rung 2 on `kleinwood_mud-2026-10-22/agenda.pdf`).

Each folder `<source>-<meeting date>/` holds:

- `agenda.txt`: the agenda's text, pages joined with `\f`.
- `meta.json`: the PDF URL, the index link's date, where the text came from (`text`), and why the
  case is in the set (`note`).
- `expected.json`: the parse a person checks: `ok`, the reasons for a rejection, the firm profile,
  the meeting's date/type/status, and every item's number, title and description.

## Where the text came from

| `text` | Cases | Recorded |
| --- | --- | --- |
| `pdf text layer` | 38 | `getPdfText()` output saved by the Phase 0 survey (`npm run survey:agendas`), Nov 3-4, 2026. `hcmud_489-2026-04-09` is copied from `../llm-extract/mud489-2026-04-09/source.txt`. |
| `tesseract ocr` | 7 | `npm run ocr -- --url <pdf>` (Tesseract 5.3.4, `--psm 4`, 300 dpi), Nov 4, 2026. |
| `hand-written` | 1 | `synthetic_cancelled-2026-11-12`: no cancellation notice turned up in the survey, so this one is made up (a fictional district, no names). |

Only `kleinwood_mud-2026-10-22/agenda.pdf` (150 KB) is a PDF; the rest are text only (rule: no PDF over 1 MB).

## What the set covers

ABHR, Schwartz Page & Harding (including the demo MUD, HC MUD 489, Oct 19, Sep 21 and Apr 9),
Coats Rose, Radcliffe Bobbitt, Norton Rose Fulbright and Johnson Petrov (at least 3 each), the two
unnamed firm templates, 6 agendas whose firm isn't identified, 3+ special meetings with 1-2 items,
7 scans as OCR text, and 1 cancellation. Rejections are cases too: `ok: false` with the reason is
what the parser must say for a list it can't read safely (a jumbled text layer that needs rung 2,
a consent agenda whose numbering restarts, an OCR misread that loses an item number).

The corrupted cases from Step 7 (wrong date, out-of-order numbers, missing boilerplate, an item
swallowed by the §551 paragraph, a private name in a personnel item) are built in the test from
`hcmud_489-2026-10-19` rather than stored as files.

## Updating

```bash
npx tsx scripts/mud-agenda-golden.ts --print      # show every case's parse
npx tsx scripts/mud-agenda-golden.ts --expect     # rewrite expected.json from the parser
```

After `--expect`, read the diff of every `expected.json` against its `agenda.txt` before committing.
The first `expected.json` files were written by the parser and then read item by item against the
agenda text by the agent that built it (Nov 4, 2026); no teammate has checked them yet.

Known imperfections kept on purpose (OCR items always go to the review queue, D6):
`hcmud_182` item 10 ends with an OCR-garbled signature, `encanto_real_ud` item 19 with seal noise.
