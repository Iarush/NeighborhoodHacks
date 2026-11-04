# Spec: a code parser for MUD agendas and minutes (`mud_agenda`)

Iarush (P2), Nov 4, 2026. This replaces the LLM as the way water districts' agenda and minutes PDFs become items and outcomes. Finding the agenda links is already code (`discover`, D15). Only the step after that, PDF to `Item[]` (Step 7) and minutes to outcomes (Step 10), still calls the LLM, and at about 300 MUD agendas a month it would use up the OpenRouter balance ($6.73 left on Nov 4). Where this spec and `.plans/agent-scraper-spec.md` disagree on MUD sources, this spec wins. Everything else in the scraper spec (validation, redaction, hashing, IDs, D9, D24) still applies.

**Status: spec only.** Iarush chose to write the spec now and build in a later session.

## 1. Decisions (interview, Nov 4)

| Topic | Decision |
|---|---|
| Parser shape | **One parser for Texas MUD agendas plus small per-firm profiles.** Agendas follow the template of the district's **law firm**, not its website vendor, so profiles are keyed by firm (§3). |
| Sub-items | **Folded into the parent.** One `Item` per top-level number. The lettered sub-items (`a.`, `(b)`) go into `description` verbatim, in order. |
| Scanned PDFs | **Free OCR (Tesseract), then the same parser.** If OCR text still doesn't parse cleanly, use the rest of the ladder (§4). |
| Failures | **Try hard before the LLM.** Use the no-AI ladder in §4. Only what fails every free step reaches the LLM, under a hard cap. |
| LLM cap | **$1 a month or 20 documents, whichever comes first**, shared by agendas and minutes. Past the cap, documents go link-only until the 1st of the next month (America/Chicago), with a health warning. |
| Confidence | A parse is accepted only if **all three** hold: top-level items numbered 1..N in order; the meeting date in the notice matches the index link's date within 1 day; the boilerplate (§3.3) is recognized and kept out of items. 1- or 2-item special meetings are fine. |
| Review gate | Text-layer items are verbatim from the PDF, so they **skip review** like BoardBook and Legistar. **OCR items keep the D6 gate**: `quote_verified = false`, and every item goes to the review queue. |
| OCR runner | **A GitHub Actions job** (tesseract + poppler), not Vercel. |
| Wiring | **A new adapter kind, `mud_agenda`.** It reuses each source's `discover` config unchanged. Needs one more migration on `sources_adapter_check`. |
| Rollout | **A golden set, then a shadow run.** About 40 hand-checked agendas as fixtures. Then the parser runs over every MUD source's newest agendas, and a source switches to `mud_agenda` only once it passes. |
| Minutes | **Replaced too.** Outcomes come from code matching on the same ladder and under the same cap (§6). |
| Plan files | Iarush approved edits to the tech plan's LLMExtract section and its `sources.adapter` list, the scraper spec and the coverage plan §6 (§10). The tech plan's review-gate line isn't changed; the OCR rule above is written in this spec and the scraper spec instead. |

## 2. Survey (Nov 4, 2026)

This session downloaded the newest 1–2 agendas of every `llm_extract` source (305, of which 296 are water districts) and fingerprinted them. The raw page text is in `tmp/survey/agenda-pdfs/<id>.json` and the per-source results are in `tmp/survey/agenda-structure.json`. Both are gitignored, so rebuild them with Phase 0 if they're gone.

| Result (296 water districts) | Count |
|---|---|
| Text layer, clean "1. 2. 3." numbered list (≥4 in order) | 178 (60%) |
| Text layer, list not recognized by the simple regex | 40 (14%) |
| Scanned, no text layer | 59 (20%), 41 of them on Google Drive. 52 have no text layer on either of the two newest agendas. |
| Fetch failed or no document in the window | 19 |

**Law firms** (found by name, or by the attorney's phone number in the disability notice, which nearly every agenda carries):

| Firm | Agendas | Notes |
|---|---|---|
| Allen Boone Humphries Robinson (ABHR), (713) 860-6400 | 69 | "to discuss and, if appropriate, act upon the following items:", `1.` items with `a.` sub-items, doc ID footer `4934-3202-1463 v.1` |
| Schwartz, Page & Harding (SPH), (713) 880-3800 | 41 | 12 of these missed the simple regex, so it's the first profile to tune |
| Coats Rose, (713) 651-0111 | 13 | `(a)` sub-items; OCR-layer noise ("l." for "1.", "MLINICIPAL") |
| Radcliffe Bobbitt | 8 | |
| Norton Rose Fulbright | 7 | |
| Johnson Petrov | 6 | 3 of 6 missed the regex |
| Not identified | 74 (+57 scanned) | Phase 0 adds more phone and name fingerprints |

The common shape, seen in every firm's template:
1. Header: `NOTICE OF MEETING` / `NOTICE OF PUBLIC MEETING`, district name, "TO THE BOARD OF DIRECTORS … AND TO ALL OTHER INTERESTED PERSONS".
2. A notice sentence: "will hold a **regular|special** meeting … on **<weekday>, <Month d, yyyy>**, at **<h:mm a.m.>**, at **<place>** … act upon the following [items|matters]:".
3. Numbered items, with lettered sub-items introduced by "including:".
4. Closing: the Open Meetings Act §551 executive-session paragraph, the disability notice with the attorney's phone, `(SEAL)`, the signature ("Attorney for the District"), and a doc-management ID.

Some "text" PDFs are scans with an OCR layer (the MUD 489 PDFs, Coats Rose), so OCR noise also has to be handled on text-layer documents (§3.2).

## 3. The parser: `lib/adapters/mudAgenda/`

Pure functions, no I/O, so it runs the same on Vercel, in GitHub Actions and in tests.

- `parse.ts`: `parseMudAgenda(text: string, profile: FirmProfile, ctx) → ParseResult`
- `profiles.ts`: the firm profiles and `detectFirm(text)`
- `normalize.ts`: text cleanup (§3.2)
- `minutes.ts`: outcome matching (§6)
- `adapter.ts`: the `mud_agenda` adapter (the ladder in §4, link discovery from `discover`)

### 3.1 What it extracts

| Field | From | Notes |
|---|---|---|
| `meeting.type` | "regular" or "special" in the notice sentence | `joint` (e.g. "AJOB") counts as `special` |
| `meeting.date` | the notice-sentence date and time, America/Chicago | This finally gives MUD meetings their real time; link-only scrapes stay at 00:00. If there's no time, use the source's `default_time`. |
| `meeting.status` | `cancel+ed`/`postponed` in the title or header | §5.7 |
| (location) | the place after "at" | Not stored: `Meeting` has no location field, and this spec adds none |
| `meeting.comment_rules_text` | the public-comment sentence, verbatim | e.g. "Public comments (3-minute limit)" |
| `item.agenda_number` | top-level number | `"5"` |
| `item.title` | the top-level line up to "including:" or the first sub-item, verbatim, hyphenation repaired | |
| `item.description` | the sub-items joined verbatim, one per line, with their letters | Never rewritten, so the `$` check always passes |
| `item.source_quote` | the item's full text (title + sub-items) exactly as it appears in the normalized text | So the existing quote check verifies it |
| `item.section` | none | MUD agendas have no sections |
| `item.amounts` | `parseAmounts()` as today | |
| `item.external_id` | **`llmItemExternalId(meeting_external_id, agenda_number, title)`, same as the LLM path (D11)** | So switching a source from `llm_extract` doesn't duplicate its items |

After this come `redactPersonnel()` (D9: "an employee"), `itemStatus()` and the content hash, all unchanged.

### 3.2 Text cleanup (before parsing)

- Repair hyphenation (`-\n`) and join wrapped lines into their item.
- Fix OCR-style numbering only at the start of a line before `. `/`) `: `l`/`I`/`|` → `1`, `O`/`o` → `0`, and `S` → `5` only when the sequence needs that number. Never change text inside an item, so quotes stay exact.
- Drop page headers and footers that repeat on every page (district name, "Page n of m", doc IDs).
- Keep the original text beside the cleaned text. `source_quote` must be a substring of what the quote check sees (`fullText` after the §5.5 normalization). If the cleanup changes a character the check would see, the quote comes from the original text instead.

### 3.3 Boilerplate it must recognize (confidence rule 3)

The §551 executive-session paragraph, the disability/auxiliary-aids notice, `(SEAL)`/`(SELLO)`, the signature block, "EXECUTED this … day of …", doc-management IDs (`\d{4}-\d{4}-\d{4} v\.\d+`, `\d{5}\.\d{6}\\…`), and the Spanish-language duplicate notice some ABHR districts add. The §551 paragraph also feeds the existing closed-session handling. Items it lists as executive-session topics aren't new items.

### 3.4 Firm profiles

A profile is data, not a new parser. It holds:

```ts
type FirmProfile = {
  id: 'abhr' | 'sph' | 'coats_rose' | 'radcliffe_bobbitt' | 'norton_rose' | 'johnson_petrov' | 'generic' | string;
  detect: RegExp[];            // firm name, attorney phone, address
  item_start?: RegExp;         // default /^\s*(\d{1,2})[.)]\s+/m
  sub_item_start?: RegExp;     // default /^\s*(\(?[a-z]\)|[a-z]\.)\s+/m
  list_intro?: RegExp;         // default /act upon the following( items| matters)?:?/i
  extra_boilerplate?: RegExp[];
};
```

`detectFirm` picks the first profile whose `detect` matches, otherwise `generic`. A profile is added only when the shadow run (§7) shows a firm failing the generic rules. The profile id is stored with each document's parse result (in `documents`, next to the content hash) so health checks can count failures by firm.

## 4. The ladder (per document, stop at the first accepted parse)

| Rung | Input text | Runs on | Cost |
|---|---|---|---|
| 1 | The PDF text layer (`getPdfText`, as today) | Vercel | free |
| 2 | **Text rebuilt from word positions.** pdf.js `getTextContent()` x/y per item, grouped into lines by y, ordered by x, with a gap-based column split. Fixes jumbled reading order, merged columns and run-on lines. A new `getPositionedText()` in `pdfText.ts`. | Vercel | free |
| 3 | **OCR**: each page rendered to an image (`pdftoppm -r 300`) and read by `tesseract` (`eng`, plus `spa` for the Spanish notice pages). Your "screenshot" idea. Runs when the document has no text layer, or when rungs 1–2 failed. | GitHub Actions (§5) | free |
| 4 | **Loose parser** on the best text from rungs 1–3: accepts bulleted or unnumbered lists after the list intro, splitting on blank lines or bullets, numbering them 1..N itself. Confidence rule 1 is replaced by "every block after the intro is one item and the boilerplate is found". | wherever the text is | free |
| 5 | **LLM** (the existing `extractDocument`, unchanged), **only under the cap** (§4.1) | Vercel | ≤ $1/month |
| — | Nothing accepted: **link-only meeting** (`meetingFromLink`, as today), plus a `parse_failed` health warning naming the source, firm, rung reached and URL | | free |

Rung 3 isn't synchronous. On Vercel, a document that needs OCR is stored link-only with `needs_ocr`. When the OCR text arrives, the next ingest run parses it (rungs 3–4) and fills in the items. The meeting's `external_id` doesn't change, so it's an update, not a new meeting. The LLM (rung 5) is used only after OCR has been tried, so a scan never goes straight to the LLM.

Items from rung 3, or rung 4 run on OCR text, are OCR items: `quote_verified = false`, and all go to review (§1). Items from rungs 1, 2 and 4 on a text layer are verified by the normal quote check.

### 4.1 The LLM cap

- A new table `llm_spend (month text primary key, docs int, est_usd numeric)` (RLS on, no anon policies). P2's ingest increments it **before** each rung-5 call, using an estimate from page count × the model's OpenRouter price. If the usage the response reports is higher, it adds the difference after the call.
- If `docs >= 20` or `est_usd >= 1.00` for the current Chicago month: skip rung 5, go link-only, warn `llm_cap_reached` once per run.
- Limits come from the env vars `MUD_LLM_MAX_DOCS` (20) and `MUD_LLM_MAX_USD` (1.00). Set either one to `0` to turn the LLM off entirely.
- Each rung-5 document is also logged as a profile to-do (source, firm, URL). The goal is that a document needs the LLM once, and the fix is a profile, not more LLM calls.

## 5. OCR in GitHub Actions: `.github/workflows/ocr.yml`

- **Schedule:** every 3 hours at :45 (after `ingest.yml`'s :15), plus `workflow_dispatch`.
- **No service-role key in GitHub.** The job only talks to the app, with the existing `CRON_SECRET`:
  1. `GET /api/cron/ocr-queue` → up to 15 documents `{ document_id, url, content_hash }` marked `needs_ocr` (and not tried in the last 24 h).
  2. For each: download the PDF (with the Drive `downloadUrl()` rewrite), check that its sha256 equals `content_hash`, `pdftoppm -r 300 -png`, `tesseract <page> - --psm 4`, join the pages with `\f`.
  3. `POST /api/cron/ocr-result` with `{ document_id, content_hash, pages[], mean_confidence }`. The route stores the text as a document of kind `ocr_text` (stored the way `pdf_text` is today, under the district-packing rules) and clears `needs_ocr`.
- **Script:** `scripts/ocr-documents.ts` (`npm run ocr`), which also runs locally with `--url <pdf>` to print OCR text, for building fixtures.
- **Budget:** about 60 scanned agendas a month × ~3 pages × ~5 s ≈ 15 minutes a month, well inside the private-repo free 2,000 minutes. `timeout-minutes: 15`.
- `AdapterDocument.kind` gains `'ocr_text'` (contract change, §9).

## 6. Minutes → outcomes (replaces Step 10's LLM call for `mud_agenda`)

The same text ladder (rungs 1–3) gets the minutes text, then `parseMudMinutes(text, knownItems)`:

1. **Split** the minutes into paragraphs. MUD minutes are narrative ("Upon a motion by Director X, seconded by Director Y, the Board voted unanimously to approve the minutes"), usually in agenda order.
2. **Match** each paragraph to a known item: a quoted item number first ("agenda item 5"). Otherwise use the existing token-overlap match between the paragraph and item titles, threshold 0.5, and the item must not already be matched. Keep the agenda order: a paragraph can't match an item before the previous match unless the overlap is ≥ 0.8.
3. **Outcome** from fixed phrases inside the matched paragraph:
   - `passed`: "voted (unanimously )?to (approve|adopt|authorize|accept)", "approved", "adopted"
   - `failed`: "motion failed", "did not pass"
   - `no_action` with `action = 'tabled'`: "tabled", "deferred", "postponed"
   - `no_action`: "no action (was )?taken", "took no action"
   - Reports ("received the report", "reviewed") are left `awaiting_result`, as they are today. They aren't votes.
4. `source_quote` = the sentence holding the outcome phrase, verbatim. It gets the same quote check, and OCR minutes go to review (D6).
5. **Never name a director** in any stored field other than the verbatim `source_quote`. That's already admin-only, and D9 still applies to anything shown to users.
6. No match, or a paragraph matching two items: warning, no update. **Minutes never create items.**
7. Rung 5 (LLM, under the same shared cap) only for minutes where code matched fewer than half of the meeting's voted items.

## 7. Build phases (in a later session)

Each phase ends with `npm test`, `npm run typecheck`, `npm run lint`, the attribution check (INSTRUCTIONS.md §1), a handoff entry and a local commit, if Iarush asks for one.

**Phase 0: survey script.** Turn this session's throwaway survey into `scripts/survey-agenda-pdfs.ts` (it needs `NODE_USE_ENV_PROXY=1` in the cloud container). Its output goes in `tmp/survey/agenda-pdfs/`, plus a report: firm, text layer yes/no, and which rung each source's newest agenda passes. Add more firm fingerprints until "not identified" is under 10%.

**Phase 1: parser + golden set.** `lib/adapters/mudAgenda/` (§3) and **about 40 golden fixtures** in `tests/golden/mud-agenda/`: at least 3 per named firm, 6 unidentified, 6 scans (as OCR text), 3 special meetings with 1–2 items, the MUD 489 Oct 19 and Apr 9 agendas, and 1 cancelled notice. Each fixture is the page text plus a hand-checked `expected.json` (meeting fields, items with number, title, description). Store the text only, never the PDF over 1 MB (as Step 8). Tests: exact match on items, plus the 5 corrupted cases from Step 7 adapted (wrong date, out-of-order numbers, missing boilerplate, an item swallowed by the §551 paragraph, a private name in a personnel item → "an employee").

**Phase 2: ladder rungs 2 and 4, and the adapter.** `getPositionedText()`, the loose parser, and the `mud_agenda` adapter with link-only fallback and `parse_failed` warnings. Add `mud_agenda` to `AdapterKind`, `GOLDEN_DIR`, `lib/ingest/adapters.ts` and a migration `…_mud_agenda_adapter.sql` for `sources_adapter_check`, as the diligent and utilitytaxservice migrations did. It joins the 3 migrations waiting on `SUPABASE_DB_URL`.

**Phase 3: OCR.** `scripts/ocr-documents.ts`, `ocr.yml`, the two cron routes, the `ocr_text` document kind and the `needs_ocr` flag. Live check on 5 scanned Drive agendas.

**Phase 4: minutes.** `parseMudMinutes` with fixtures: the MUD 489 July 20 minutes/agenda pair and the May pair (date tolerance), 3 more firms' minutes, a corrupted quote, and an outcome for an item that doesn't exist (no new item).

**Phase 5: cap.** `llm_spend` table (migration), the cap check, the env vars, and a test that the 21st document goes link-only.

**Phase 6: shadow run.** Run the parser (no DB writes) over every MUD source's newest two agendas: `npm run scrape -- --source <id>` with a `--adapter mud_agenda` override. The report lists source, firm, rung that passed or `failed`, and item count. Compare item counts against the LLM output where one exists in `documents`. **The target: rungs 1–4 pass for ≥ 95% of sources with a document.** Add profiles for the failures and rerun.

**Phase 7: switch-over.** In `data/sources.yaml`, change `adapter: llm_extract` to `adapter: mud_agenda` for each source that passed in Phase 6. The config stays the same. The rest stay `llm_extract` with a comment saying why, and are counted in the handoff entry. HC MUD 489 (the demo MUD, D25) switches **last**, after checking that the demo address still shows its items. Lone Star, City Council and anything else that isn't a water district stays on `llm_extract`.

## 8. Rules carried over

- IDs: never rename a source or body ID. Item IDs use the D11 formula (§3.1).
- Neutrality: titles and descriptions are verbatim from the agenda, never reworded by code. AI-written labels apply only to stories (P3), as before.
- Privacy: D9 redaction on every item; no names of private people in items; director names appear only inside admin-only `source_quote`s from minutes.
- Time: America/Chicago for meeting times, the cap's month and the OCR schedule.
- D24: agendas and minutes only from the official sources already in `sources.yaml`.
- ESLint: `lib/adapters/mudAgenda` must not import `lib/news` (D26, D32).

## 9. Contract changes (flag in the handoff entry when built)

- **`AdapterKind`** gains `mud_agenda`, and `sources.adapter` (tech plan §16) gains it too. Migration on `sources_adapter_check`.
- **`AdapterDocument.kind`** gains `ocr_text`. **`documents`** gains `needs_ocr boolean default false` and `parse_rung smallint`/`parse_profile text` (or the same keys inside the existing document metadata, if the district-packing migration already has a JSON column; check first).
- **New table `llm_spend`** (§4.1).
- **New routes** `/api/cron/ocr-queue` and `/api/cron/ocr-result` (CRON_SECRET, like `/api/cron/ingest`).
- **P3 (review queue):** expect urgent OCR items from `mud_agenda` with `quote_verified = false` in `/admin/review`, alongside the existing scanned-LLM ones. Text-layer `mud_agenda` items don't go there.
- **P1/P3:** MUD meetings now carry real start times from the notice, so the "time not shown until the AI pass runs" rule (rollout spec §6) no longer applies to `mud_agenda` sources.
- No change to `Meeting`/`Item` (§6), `bodies_token` (§3) or `classify()` (§8).

## 10. Plan-file edits made with this spec (Iarush's approval, Nov 4)

- `Technical_Implementation_Plan.md`: the LLMExtractAdapter section says water districts use `mud_agenda`; `sources.adapter` in §16 lists `mud_agenda`.
- `.plans/agent-scraper-spec.md`: a D37 row and a §12 handoff note (item 24).
- `.plans/district-coverage-plan.md` §6: the AI-cost bullet now points to the code parser and the cap.

## 11. Open

- The tech plan's review-gate line (LLMExtract SMS items wait for review) wasn't edited. Add "and OCR-parsed `mud_agenda` items" if the team agrees.
- Whether `ocr.yml` should also OCR non-MUD scans (Lone Star) later.
- The X phase and the 3 pending migrations are unchanged by this spec.

## Progress log

- 2026-11-04: Spec written from the interview, after a survey of 305 sources' newest agendas (§2). Plan stress test: already done Oct 28 ("Stress test answers: Iarush (P2)" in `agent_handoff.md`); later notes calling it pending were wrong. Next: Phase 0.
- 2026-11-04: Phase 0 done. `npm run survey:agendas` (`scripts/survey-agenda-pdfs.ts`, `--offline` to re-report from saved text) and `lib/adapters/mudAgenda/profiles.ts` (16 profiles). Not identified: 14 of 225 text-layer water districts (6.2%). SPH's phone is (713) 623-4531, not 880-3800 (§2). Next: Phase 1.
