# mud_agenda minutes golden set

The minutes parser's fixtures (`.plans/mud-code-parser-spec.md` §6, §7 Phase 4). Test:
`tests/unit/mud-minutes.test.ts` (each case, the corrupted cases, and the adapter's results mode).

Each folder `<source>-<meeting date>/` holds:

- `agenda.txt`: the agenda's text layer (`getPdfText()`), for the known items. MUD 489's two cases have
  none: their known items come from `../llm-extract/mud489-2026-07-20` and `../llm-extract/mud489-2026-05-19`.
- `minutes.txt` (text layer) or `minutes.ocr.txt` (Tesseract, `npm run ocr -- --url <pdf>`, `--psm 4`,
  300 dpi). MUD 489 July uses `../llm-extract/minutes/mud489-2026-07-20/source.txt`.
- `meta.json`: the PDF URLs and sha256, the firm, where the text came from, and why the case is in the set.
- `expected.json`: what a person checks: every update (item number, outcome, quote, verified or not),
  the warnings, and which item each minutes section matched.

| Case | Firm | Text | What it covers |
| --- | --- | --- | --- |
| `hcmud_489-2026-07-20` | SPH | text layer | The demo MUD. 14 of 14 voted sections, minutes order differs from the agenda. |
| `hcmud_489-2026-05-18` | SPH | OCR | The May pair (agenda May 19, minutes May 18). Its text layer is in column order and must be refused. |
| `kleinwood_mud-2026-09-24` | Coats Rose | text layer | "voted unanimously to", sub-headings under an item, a heading named differently from its item. |
| `sunbelt_fwsd-2026-09-03` | Radcliffe Bobbitt | text layer | "with all Directors present voting aye, the Board approved". |
| `emerald_forest_ud-2026-04-09` | ABHR | OCR | A scan (no text layer): updates are unverified and go to review (D6). |

Recorded Nov 4, 2026. No PDF is committed. In `emerald_forest_ud-2026-04-09/minutes.ocr.txt` the
names of private homeowners were replaced ("three District homeowners", "a homeowner", "Two
homeowners"); nothing else in any text file was edited.

## Updating

```bash
npx tsx scripts/mud-minutes-golden.ts --print     # show every case's outcomes
npx tsx scripts/mud-minutes-golden.ts --expect    # rewrite expected.json from the parser
```

After `--expect`, read the diff of every `expected.json` against the minutes before committing. The
first `expected.json` files were written by the parser and then read section by section against the
minutes by the agent that built it (Nov 4, 2026); no teammate has checked them yet.

Known imperfections kept on purpose:
- Sections for matters that aren't agenda items (Kleinwood's clubhouse fence, its sales-tax report)
  are warnings, not updates. Minutes never create items.
- An item with several votes gets one update: the highest-ranked outcome (passed, then failed,
  tabled, no action), quoting its first sentence. Kleinwood item 10's quote is the Operator's Report
  vote, not the termination sub-heading's.
- Quotes are verbatim, page furniture included where a page break falls inside the sentence
  (MUD 489 July item 19: "Following -4- 944689v1 discussion").
