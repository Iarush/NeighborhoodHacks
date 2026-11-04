# Agent handoff log

A shared log of changes made in this repo, so the next teammate or agent can catch up without reading every diff. Entries follow `INSTRUCTIONS.md`: record the teammate, never the agent or model.

## Rules for agents

1. **At the start of a session,** read the newest 3–5 entries below, plus any entry that touches the files you're about to change.
2. **After you add, edit or delete anything in the repo,** add one entry before you finish the task or commit. One entry per task, not per file.
3. **Put new entries at the top,** directly under "Entries." Never edit or delete someone else's entry. If an older entry is now wrong, say so in your new entry.
4. **Keep it short.** Aim for under 15 lines, and write for a teammate who hasn't seen the code.
5. **Flag shared-contract changes** in the "Contract changes" line. Other parts are built against these, so a silent change breaks them:
   - DB schema (Technical_Implementation_Plan.md §16)
   - `Meeting` and `Item` types (§6)
   - `bodies_token` format (§3)
   - the `classify()` signature (§8)
   - types in `lib/prototype/types.ts` (the `/app` screens' data shapes; moved from `web/src/lib/data/types.ts`)
6. **On a merge conflict in this file,** keep both entries, newest first.

## Entry template

```markdown
### YYYY-MM-DD: <short title>
- **Who:** <teammate> · <part, e.g. P3 News and Alerts>
- **Branch:** <branch>
- **What changed:** <1–3 sentences on what and why>
- **Files:** <main files or folders touched>
- **Contract changes:** None | <what changed and who it affects>
- **Checked:** <e.g. npm run lint, npx tsc --noEmit, manual check at 390px; or "not run" and why>
- **Open issues / next:** <anything unfinished, broken, or for the next person>
```

---

## Entries

### 2026-11-04: MUD code parser Phase 0: agenda survey script and law-firm fingerprints
- **Who:** Iarush · P2 Scrapers
- **Branch:** main
- **What changed:** Built Phase 0 of `.plans/mud-code-parser-spec.md`. `npm run survey:agendas` fetches the newest 2 agendas of every `llm_extract` source (or `--source <id>`; `--offline` re-reports from saved text) into `tmp/survey/agenda-pdfs/` and writes `tmp/survey/agenda-report.{json,md}`: firm, how it was recognized, list shape and likely rung. `lib/adapters/mudAgenda/profiles.ts` holds the firm profiles and `detectFirm()` (name/phone, then doc-ID footer, then template wording; latest match wins). `survey.ts` holds the list-shape estimate, used until Phase 1's parser exists.
- **Files:** `lib/adapters/mudAgenda/{profiles,survey}.ts`, `scripts/survey-agenda-pdfs.ts`, `package.json` (`survey:agendas`), `tests/unit/mud-agenda-survey.test.ts`, `.plans/mud-code-parser-spec.md` (progress log only), `agent_handoff.md`
- **Contract changes:** None. The spec's `FirmProfile` type gained optional `phones`, `doc_id`, `template` and `template_phones` fields (P2-internal).
- **Checked:** Offline report over the saved survey text: of 297 water districts, 278 have a document (183 numbered, 35 unnumbered, 60 scanned). Not identified: 14 of 225 text-layer districts (6.2%, target < 10%), down from 74. Most of the 14 aren't law-firm agendas (tax-rate notices, a committee agenda, office-manager or president-signed notices). No agenda matches two firms. Live fetch with `NODE_USE_ENV_PROXY=1` for hcmud_489 and bcmud_18 worked. `npm test` passes (1062 + 72). `npm run lint` shows 5 errors, all in UI files this task didn't touch. `npm run typecheck` shows 1 error, in the gitignored `tmp/scratch/hcad/lookup.ts`. All three are clean on the new files. Didn't refetch all 305 sources: the saved text is from today's survey.
- **Open issues / next:** Phase 1 (parser + ~40 golden fixtures). Correction to spec §2: SPH's disability-notice phone is (713) 623-4531 (39 agendas, beside the firm's name). (713) 880-3800 never appears beside a firm name; it's kept as weak SPH evidence. Five profiles are templates whose firm isn't named on the agenda (`matter_002`, `initials_header`, two phone-only ones); `greenberg_traurig` and `hunton` are recognized from the meeting being held at their office.

### 2026-11-04: Spec for a code parser for MUD agendas and minutes (replaces the LLM)
- **Who:** Iarush · P2 Scrapers
- **Branch:** main
- **What changed:** Interviewed Iarush and wrote `.plans/mud-code-parser-spec.md`: a `mud_agenda` adapter (one parser plus per-law-firm profiles), a no-AI ladder (text layer → word-position text → Tesseract OCR in GitHub Actions → loose parser), and the LLM only as a last step capped at $1 or 20 docs a month. Minutes outcomes are replaced too. With Iarush's approval, short notes went into the tech plan (LLMExtract section, `sources.adapter` in §16), the scraper spec (D37, §12 item 24) and the coverage plan §6. Spec only; nothing built.
- **Files:** `.plans/mud-code-parser-spec.md` (new), `Technical_Implementation_Plan.md`, `.plans/agent-scraper-spec.md`, `.plans/district-coverage-plan.md`, `.plans/mud-scrapers-rollout-spec.md`, `agent_handoff.md`
- **Contract changes:** Planned, not built: `mud_agenda` adapter kind (and migration), `ocr_text` document kind, `documents.needs_ocr`, `llm_spend` table, OCR cron routes; OCR items reach P3's review queue. No change to `Meeting`/`Item`, `bodies_token` or `classify()`.
- **Checked:** Surveyed the newest 1–2 agendas of all 305 `llm_extract` sources (296 water districts): 60% clean numbered lists, 14% need more work, 20% scanned; ABHR 69, SPH 41, Coats Rose 13. Raw text in `tmp/survey/agenda-pdfs/` (gitignored). Node's fetch needs `NODE_USE_ENV_PROXY=1` in the cloud container. No code changed, so tests weren't run.
- **Open issues / next:** Phase 0 of the spec. Correction: the plan stress test was done Oct 28 ("Stress test answers: Iarush (P2)"); the Nov 3 and Nov 4 entries calling it pending were wrong.

### 2026-11-04: MUD keyed pass: all water-district boundaries loaded; ingest blocked on migrations
- **Who:** Iarush · P2 Scrapers
- **Branch:** main
- **What changed:** Supabase only: loaded 498 water-district polygons (W1–W55 one batch per call, plus pilot MUD 489) from `MUDandWaterDistricts_HCAD` layers 0+1 fetched Nov 4, merged into one GeoJSON; 13 invalid rings repaired with shapely `make_valid` (areas unchanged). Status added to `.plans/district-rollout-batches.md`, progress-log line in the rollout spec.
- **Files:** `.plans/district-rollout-batches.md`, `.plans/mud-scrapers-rollout-spec.md`, `agent_handoff.md`
- **Contract changes:** None
- **Checked:** `check-district-batch` W1–W55 with keys: 487/497 pass, 10 fail on source only (known pending list). `lookup_boundary_bodies` at a shapely interior point per district: 498/498 correct (the 1 extra feature is the blank, unnamed one). `npm run ingest -- --source hcmud_500 --dry-run`: ok, 1 meeting, 39 items. cypress_hill_mud_1 dry-run: `fetch failed` on its http:// page (once; recheck).
- **Open issues / next:** `SUPABASE_DB_URL` is empty, so the 3 migrations stay unapplied; they block every real ingest and `lookup_boundary_near`. Then: real ingest (OpenRouter key has $6.73 of $10 left), real-address lookups, 390 px page checks, tick W boxes. Gotcha: loading one water layer after the other wipes the first layer's polygons; always use a merged file. X phase and plan stress test still open.

### 2026-11-04: School boards S1-S3: code map and boundaries loaded; ingest blocked on migrations
- **Who:** Iarush · P2 Scrapers
- **Branch:** main
- **What changed:** Supabase only: `seed-hcad-jurisdictions --apply` upserted 530 codes (incl. `012` → `hisd_board`); loaded all 25 Harris County school polygons from HCAD `School.zip` (Oct 5, 2026), one body per RPC call (whole layer hit the statement timeout). Dropped one 3-point sliver ring (Pearland) and repaired HISD, Pearland, Spring with shapely `make_valid` (areas unchanged). Status list updated in `.plans/district-rollout-batches.md`.
- **Files:** `.plans/district-rollout-batches.md`, `agent_handoff.md`
- **Contract changes:** None
- **Checked:** `check-district-batch` S1/S2/S3 with keys: all pass except Katy (no source). Live map lookups: 17 real addresses + 6 interior points, all correct. Real ingest of 22 boards: all failed on `sources_adapter_check`; nothing written.
- **Open issues / next:** Apply migrations `20261028210000_district_packing`, `20261028230000_diligent_adapter`, `20261029010000_utilitytaxservice_adapter` (no `SUPABASE_DB_URL` here); they block all ingest and `lookup_boundary_near`. Then rerun ingest and the 390 px check. Katy decision open. Plan stress test not run.

### 2026-11-03: MUD buckets M26–M29 and Drive-quota rechecks: 47 sources, 6 no agendas online
- **Who:** Iarush · P2 Scrapers
- **Branch:** main (merged from claude/fervent-feynman-cjj72l, now deleted)
- **What changed:**
  - `data/sources.yaml`: 39 sources for M26 (14), M27 (9), M28 (13), M29 (3), all `llm_extract` link-only and reusing the M23/M24/M25 configs. No new adapter or fixtures. hcmud_500 and hcmud_217 use `date_from: filename` on their home pages.
  - 8 earlier rechecks added (hcmud_501, charterwood_mud, barker_cypress_mud, cinco_mud_3/6/9, hunters_glen_mud, hcmud_46): Drive downloads work again.
  - `data/district-sites.yaml`: no agendas online for hcmud_460, hcmud_404, hcwcid_fondren_road, hcmud_552, hcmud_346, hcmud_468.
  - `.plans/mud-buckets.md` statuses and a Rechecks section; progress-log line in the rollout spec.
- **Files:** `data/sources.yaml`, `data/district-sites.yaml`, `.plans/mud-buckets.md`, `.plans/mud-scrapers-rollout-spec.md`, `agent_handoff.md`
- **Contract changes:** None
- **Checked:**
  - Each source scraped with `--from 2026-06-01` (or `2026-08-01`) `--to 2026-12-31` through the proxy (`NODE_USE_ENV_PROXY=1`): every one found an agenda within its gap; newest dates Oct 8 to Nov 10, 2026. nwhcmud_24's paired dates are real executive plus regular meetings.
  - `check-district-batch.ts` on the 26 affected W batches: every M26–M29 district passes. 7 failures are the earlier pending districts (cinco_mud_3/6 now fixed by this change; the rest are listed below). DB checks skipped (no keys).
  - `npx vitest run`: 109 files, 1050 tests passed. `npm run typecheck`: clean. No TS changed, so lint not rerun.
- **Open issues / next:**
  - Still pending: hcmud_165, hcmud_322, hcwcid_50 (after Nov 6), hcmud_273 and hcmud_459 (after Nov 12), baker_road_mud (after Dec 1).
  - The keyed pass (seeding, ingest, boundaries, lookups, ticking W boxes) and the X phase stay open. Plan stress test not run for this teammate.

### 2026-11-03: School board scrape check (S1-S3)
- **Who:** Iarush · P2 Scrapers
- **Branch:** claude/fervent-feynman-cjj72l
- **What changed:** No code or config changes. Ran every school-board source with `npm run scrape -- --source <id> --from 2026-08-20 --to 2026-12-31` (with `NODE_USE_ENV_PROXY=1` so Node's fetch uses the sandbox proxy). All 23 configured boards return meetings (2 to 13 each).
- **Files:** `agent_handoff.md` only. Output is in `tmp/scrape` (untracked).
- **Contract changes:** None
- **Checked:** `check-district-batch.ts` S1, S2, S3: all PASS except Katy ISD (no source). Items were extracted for 15 boards (BoardBook ones, plus HISD and CFISD). 0 items for tomball, spring, huffman, pearland, aldine, deer_park, dayton, humble (`llm_extract`/`diligent`; no AI key here) and for galena_park and waller (their BoardBook meetings list no agenda items).
- **Open issues / next:**
  - **Katy ISD** is still unfinished. Its BoardDocs config is known from the Oct 28 entry (`tx/kisd`, committee `AAUJQK4E4D0E`), but BoardDocs' CloudFront returns 403 to the scraper, so it isn't in `sources.yaml`. The team still has to decide whether to ask Katy ISD or BoardDocs for access or leave it out. Posing as a browser is not an option.
  - S1-S3 stay unticked in `.plans/district-rollout-batches.md`: seeding, boundaries and live lookups need the Supabase service-role key.
  - Re-run the 10 zero-item boards with an AI key.

### 2026-11-03: Rewrite README
- **Who:** Iarush · docs
- **Branch:** claude/fervent-feynman-cjj72l
- **What changed:** Replaced the outdated README with one covering the problem, the solution, every feature, the stack, repo layout, local setup, env variables, current status and limits, roadmap, project rules and contributing notes. Content is drawn from the plan files, `.plans/`, `docs/` and the handoff log.
- **Files:** `README.md`, `agent_handoff.md`
- **Contract changes:** None
- **Checked:** Read against the plan files and the repo tree; commands and env variable names match `package.json` and `.env.example`. No code changed, so tests, lint and typecheck were not run. The status and limits section reflects the Oct 21–29 docs and handoff entries, not a fresh check of production.
- **Open issues / next:** A teammate should confirm the "Current status" and "Known limits" lists against production before the next release.

### 2026-10-29: MUD bucket M24 (`credit:infinity services`): 14 sources, 1 no agendas online
- **Who:** Iarush · P2 Scrapers
- **Branch:** main
- **What changed:**
  - **Vendor:** owned by M23, so no adapter or golden fixtures here. M23's "Meeting Agendas" h3 config (`link_selector 'h3:contains("Agenda") ~ p:not(h3:contains("Minute") ~ p) a'`) fits 11 sites, all at `/meetings/`: shasla_pud, hcmud_154, bammel_ud, hcmud_86, nwhcmud_20, hcwcid_91, nwhcmud_22, hcwcid_136, northwest_park_mud, hcud_14, hcmud_153.
  - **S&K Law pages (3):** hcmud_551, hcmud_44, mount_houston_road_mud self-report sklawdistrictdata.org pages; they use the Agendas column (`td:first-child a`, `date_from: link_text`), like northgate_crossing_road_ud. mount_houston_road_mud's gap is 75 days (Jul 9 to Sep 10, 2026); the rest are 45.
  - **Sources (14)** in `data/sources.yaml` (M24 block at the end), all `llm_extract`, link-only.
  - **No agendas online** (`data/district-sites.yaml`): post_wood_mud. Its districtdata.org page's newest agenda is dated 2023-08-07; the survey and the Comptroller give no other site, and one web search found nothing.
  - `.plans/mud-buckets.md`: updated the M24 line's status.
- **Files:** `data/sources.yaml`, `data/district-sites.yaml`, `.plans/mud-buckets.md`
- **Contract changes:** None
- **Checked:**
  - `npm run scrape -- --source <id> --from 2026-08-20 --to 2026-12-31` for all 14: 2 to 5 agendas each, newest from Oct 2, 2026 (hcmud_86) to Nov 3, 2026 (hcud_14, nwhcmud_20, nwhcmud_22), all inside the gap. Where two PDFs share a date it is a regular agenda plus a tax-rate hearing agenda (checked on hcwcid_91), not minutes. No AI key, so no items extracted.
  - `check-district-batch.ts` on W25, W26, W27, W29, W30, W35, W36, W38: all 15 M24 districts PASS; DB checks skipped (no keys).
  - `npx vitest run`: 108 files, 1048 tests passed. `npm run typecheck`: no errors outside scraper P2/tmp. No TS files changed, so no eslint run needed.
- **Open issues / next:**
  - Seeding, ingest and live lookups are still blocked on keys.

### 2026-10-29: MUD bucket M23 (`credit:infinity services`): 20 sources, 1 no agendas online
- **Who:** Iarush · P2 Scrapers
- **Branch:** main
- **What changed:**
  - **Vendor (owned by M23):** the Infinity Services sites (Avada WordPress) all list agendas as Google Drive links whose text is the date ("2026-10-19 (PDF)"). Minutes use the same link text, so each `discover` config uses `link_selector` to keep only the agendas. No dedicated adapter was needed. There are three layouts:
    - a "Meeting Agendas" h3 section: `h3:contains("Agenda") ~ p:not(h3:contains("Minute") ~ p) a` (17 sites)
    - year tabs: `.fusion-tabs-1 .tab-pane a` (cypress_hill_mud_1, bilma_pud)
    - an Agendas/Minutes table on districtdata.org: `td:first-child a` (cypresswood_ud)
  - **Golden fixtures:** `tests/golden/infinity/` holds one page per layout (hcmud_360, cypress_hill_mud_1, cypresswood_ud) with a README. `tests/unit/mud-m23.test.ts` checks that agendas are found and minutes are left out. It doesn't use the network.
  - **Sources (20)** (`data/sources.yaml`, M23 block at the end), all `llm_extract`, link-only, gap 45: hcwcid_145, cypress_hill_mud_1, hcmud_360, hcmud_364, hcmud_163, hcmud_191, hcmud_186, hcmud_144, hcmud_69, hcmud_179, hcmud_250, bilma_pud, cypresswood_ud, louetta_road_ud, hcmud_168, grant_road_pud, hcmud_208, hcmud_62, hcmud_5, nwhcmud_36.
  - **No agendas online** (`data/district-sites.yaml`): hcmud_183. hcmud183.org now leads to a districtdata.org page that only has alert sign-ups. The Comptroller lists no site for it, and one web search found nothing.
  - `data/district-sites.yaml`: added the sites for hcmud_208 (harriscountymud208.com) and nwhcmud_36 (nwhcmud36.org, not the Comptroller's nwchmud36.org). I checked that each page title names the district.
  - **Catalog:** reran `scripts/build-district-catalog.ts --batch W10 --batch W25`, which updated `meeting_info_url` for those 2 districts in `data/bodies.districts.yaml`. The generator also moved `tax_set_by_body_id` to a different line in other W10/W25 entries; the values are unchanged.
  - `.plans/mud-buckets.md`: updated the M23 line's status.
- **Files:** `data/sources.yaml`, `data/district-sites.yaml`, `data/bodies.districts.yaml` (generated), `.plans/mud-buckets.md`, `tests/golden/infinity/*`, `tests/unit/mud-m23.test.ts`
- **Contract changes:** None
- **Checked:**
  - Ran `npm run scrape -- --source <id> --from 2026-08-20 --to 2026-12-31` for all 20. Each found 2 to 6 agendas. The newest are dated Oct 1, 2026 (bilma_pud) to Nov 6, 2026 (hcmud_186), all within the 45-day gap. With no AI key, no items were extracted.
  - hcmud_208 found nothing on the first run: its server sometimes sends an empty 200 response. It found 3 agendas on the retry.
  - `check-district-batch.ts`, run on W1, W2, W3, W4, W5, W7, W8, W9, W10, W11, W12, W17, W22, W24, W25 and W27: all 21 M23 districts PASS. DB checks are blocked (no keys).
  - `npx vitest run`: 108 files and 1048 tests passed. `npm run typecheck`: no errors outside scraper P2/tmp. eslint is clean on `tests/unit/mud-m23.test.ts`.
- **Open issues / next:**
  - hcmud_208's empty responses could show up as false gaps in health checks.
  - The remaining Infinity Services districts are in M24 and M27. They should reuse these configs.
  - Seeding, ingest and live lookups are still blocked on keys.

### 2026-10-29: MUD bucket M22 (`unknown`): 10 sources, 5 no agendas online
- **Who:** Iarush · P2 Scrapers
- **Branch:** main
- **What changed:**
  - **Vendor check:** M22 owns no vendor. No adapter, fixtures or tests were added.
  - **Sources (10)** (`data/sources.yaml`, M22 block at the end), all `llm_extract`:
    - **M18's church config** (`/meetings/`, `link_pattern "(?i)^agenda$"`, `match_link_text`, `date_from: line_text`, gap 45): hcmud_49, hcmud_290, hcmud_106, hcmud_450 and hcmud_415. hcmud_412 uses the same config with index `/about/meetings/`.
    - **hcmud_152:** link text is the date. `link_selector 'h3:contains("Meeting Agendas") + h5 + p a'` keeps the minutes out, and a lookahead in the pattern drops the tax-hearing notice.
    - **crosby_mud:** the date is in the link text ("10-20-2026 Agenda").
    - **newport_mud:** `date_from: filename`.
    - **hcmud_361 (Wix):** the "Upcoming Meetings" date link points to the newest agenda, so it finds only that one. The gap is 100 days, because its 2026 meetings are up to 70 days apart.
  - **No agendas online** (`data/district-sites.yaml`): hcmud_529, hcmud_407 and hcmud_572 have only taxtech.net tax pages. hcmud_537's site doesn't resolve in DNS. hcmud_473's bamunitax page returns 503 (retried). One web search was run per district and found nothing.
  - `.plans/mud-buckets.md`: the M22 line's status was updated.
- **Files:** `data/sources.yaml`, `data/district-sites.yaml`, `.plans/mud-buckets.md`
- **Contract changes:** None
- **Checked:**
  - `npm run scrape -- --source <id> --from 2026-08-20 --to 2026-12-31` for all 10: each found 1–6 agendas. The newest are between Oct 9 (hcmud_361) and Nov 3 (crosby_mud), 2026, all within their gap.
    - Agenda URLs were spot-checked against the pages for hcmud_152, hcmud_361 and newport_mud.
    - With no AI key, no items were extracted.
  - `check-district-batch.ts`, run on W38, W39, W40, W42, W43, W47, W48, W50 and W51 one at a time: all 15 M22 districts PASS. DB checks are blocked (no keys).
  - `npx vitest run`: 107 files, 1045 tests passed. `npm run typecheck`: no errors outside scraper P2/tmp. No TS files were changed, so there was nothing to lint.
- **Open issues / next:**
  - Recheck hcmud_537 and hcmud_473 if their sites come back.
  - hcmud_361 can only see the newest agenda.
  - Seeding, ingest and live lookups are still blocked on keys.

### 2026-10-29: MUD sources for bucket M21 (church theme)
- **Who:** Iarush · P2 Scrapers
- **Branch:** main
- **What changed:** Added 14 of M21's 15 districts to `data/sources.yaml` (M21 block at the end). All are `llm_extract` with index `<site>/meetings/`, `date_from: line_text`, `match_link_text` and `expected_max_gap_days: 45`, reusing M18's config. 13 use `link_pattern "(?i)^agenda$"`. parkway_ud labels its links "PDF" and puts Minutes PDFs on the same line, so it uses `link_pattern "(?i)^pdf$"` with `link_selector 'a:has(+ a[href*="/meeting-agenda-"])'`. That selector picks the PDF link just before the agenda's "Screen Reader" link. No adapter or code changes.
  - Sources: pine_village_pud, hcmud_120, bissonnet_mud, chelford_one_mud, hcmud_359, chelford_city_mud, north_mission_glen_mud, faulkey_gully_mud, hcmud_481, sagemeadow_ud, bcmud_28, parkway_ud, sheldon_road_mud, hcfwsd_51.
  - Pending: hcwcid_50 has no source yet. Its `/meetings/` page returns 404 (retried). The home page's "Upcoming Meetings" widget lists a meeting on Nov 13, 2026, but its agenda links are commented out until the agenda is posted. Recheck after 2026-11-06 using the home page as the index. This district does post agendas, so it is not marked `no_agendas_online`.
- **Files:** `data/sources.yaml`, `.plans/mud-buckets.md` (M21 line)
- **Contract changes:** None
- **Checked:**
  - `npm run scrape -- --source <id> --from 2026-08-20 --to 2026-12-31` for all 14 sources: each found 2–5 agendas. The newest are between Oct 8 (hcmud_120) and Nov 4 (hcmud_359), 2026, so all are within 45 days. For parkway_ud, the agenda Drive links were checked against the page. The default window (upcoming meetings only) finds 0 for most of these. With no AI key, no items were extracted.
  - `check-district-batch.ts --batch W41,W44,W45,W46,W49,W52,W53`: 14 M21 districts PASS. hcwcid_50 FAILs, as expected while it's pending. Database checks were skipped (no Supabase keys, blocked).
  - `npx vitest run`: 107 files, 1045 tests passed. `npm run typecheck`: no errors outside scraper P2/tmp. No TS files were changed, so there was nothing to lint.
- **Open issues / next:** Recheck hcwcid_50 after 2026-11-06. Its date is in an `<h5>` above the link, so the `date_from` setting needs testing then. Seeding, ingest and live lookups are still blocked on keys.

### 2026-10-29: MUD bucket M20 (`theme:church`): 16 sources, 0 no agendas online
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:**
  - **Vendor check:** M20 owns no vendor. All 16 `theme:church` sites use M18's layout (dated lines with "Agenda | Minutes" links, agendas on Google Drive), so M18's `discover` config was reused. No adapter, fixtures or tests were added.
  - **Sources (16)** (`data/sources.yaml`, M20 block at the end), all `llm_extract` with index `<site>/meetings/`, `link_pattern "(?i)^agenda$"`, `match_link_text`, `date_from: line_text`, `expected_max_gap_days: 45`: hcmud_119, fountainhead_mud, hcmud_180, hcwcid_133, cypress_klein_ud, nwhcmud_6, klein_pud, heatherloch_mud, nwhcmud_23, rankin_road_west_mud, north_forest_mud, hcmud_26, northwood_mud_1, hcud_15, intercontinental_crossing_mud, hcwcid_96.
  - `.plans/mud-buckets.md`: the M20 line's status was updated.
- **Contract changes:** None
- **Checked:**
  - `npm run scrape -- --source <id> --from 2026-08-20 --to 2026-12-31` for all 16: each found 1–6 agendas. The newest are between Oct 6 (intercontinental_crossing_mud) and Nov 9 (nwhcmud_6), 2026, all within 45 days. With no AI key, no items were extracted (`llm_unavailable` warning).
  - `scripts/check-district-batch.ts --batch <W>` run one batch at a time for W22–W25, W28–W30, W35–W38: file checks pass for all 16 M20 districts. The FAILs in those batches are other buckets' districts that aren't done yet. Database checks are blocked (no Supabase/AI keys).
  - `npx vitest run`: 107 files, 1045 tests passed. `npm run typecheck`: no errors outside scraper P2/tmp. No TS files were changed, so there was nothing to lint.
- **Open issues / next:** Items need an ingest run with the AI key, which is blocked on the cost estimate (coverage plan §6). Note: `check-district-batch.ts` takes one `--batch` value per run (extra values are ignored).

### 2026-10-29: MUD bucket M19 (`theme:church`): 16 sources, 0 no agendas online
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:**
  - **Vendor check:** M19 owns no vendor. All 16 `theme:church` sites use M18's layout (dated lines "2026-10-13 – Regular: Agenda | Minutes<br>", agendas on Google Drive), so M18's `discover` config was reused. No adapter, fixtures or tests were added.
  - **Sources (16)** (`data/sources.yaml`, M19 block at the end), all `llm_extract` with `link_pattern "(?i)^agenda$"`, `match_link_text`, `date_from: line_text`, `expected_max_gap_days: 45`: hcmud_264, hcmud_341, rolling_fork_pud, hcmud_156, hcmud_261, hcud_6, weston_mud, hcmud_61, harris_fort_bend_counties_mud_3, dowdell_pud, hcmud_1, cypress_forest_pud, nwhcmud_19, hcmud_368, hcmud_367, hcwcid_114. Index is `<site>/meetings/`, except nwhcmud_19, which uses `/about-us-meetings/` (its `/meetings/` returns 404).
  - `.plans/mud-buckets.md`: the M19 line's status was updated.
- **Contract changes:** None
- **Checked:**
  - `npm run scrape -- --source <id> --from 2026-08-20 --to 2026-12-31` for all 16: each found 2–6 agendas. The newest are between Oct 8 (hcmud_261) and Nov 5 (hcmud_368), 2026, so all are within 45 days. With no AI key, no items were extracted.
  - `scripts/check-district-batch.ts --batch W10 W11 W12 W14 W15 W16 W21 W22`: file checks pass for all 16 M19 districts. The 19 FAILs in those batches are other buckets' districts that aren't done yet. Database checks are blocked (no Supabase/AI keys).
  - `npx vitest run`: 107 files, 1045 tests passed. `npm run typecheck`: no errors outside scraper P2/tmp. No TS files were changed, so there was nothing to lint.
- **Open issues / next:** Items need an ingest run with the AI key, which is blocked on the cost estimate (coverage plan §6).

### 2026-10-29: MUD bucket M18 (`theme:church`): 23 sources, 0 no agendas online
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:**
  - **Vendor check:** every M18 site (the 16 `theme:church` districts plus the 7 moved in from M15/M16, whose fetches now succeed) lists meetings as dated lines ("2026-10-28 – Regular: Agenda | Minutes<br>") with agendas on Google Drive. That is the ABHR layout already handled by `discover` with `date_from: line_text`, so no dedicated adapter was written; the vendor is covered by a config.
  - **Sources (23)** (`data/sources.yaml`, M18 block at the end), all `llm_extract` with `link_pattern "(?i)^agenda$"`, `match_link_text`, `date_from: line_text`, `expected_max_gap_days: 45`: remington_mud_1, nwhcmud_10, hcmud_502, hcmud_102, hcmud_433, lake_forest_ud, rolling_creek_ud, hcmud_230, hcmud_70, cypress_creek_ud, hcmud_239, mills_road_mud, hcmud_18, hcmud_173, prestonwood_forest_ud, hcmud_162, hcmud_374, spencer_road_pud, chimney_hill_mud, hcmud_172, fry_road_mud, castlewood_mud, hcmud_150. Index is `<site>/meetings/`, except chimney_hill_mud (`/meetings/meeting-documents/`; its `/meetings/` page has only the "Upcoming Meetings" widget).
  - **Golden fixtures:** `tests/golden/church/` (remington_mud_1 and chimney_hill_mud pages, README), test `tests/unit/mud-m18.test.ts`.
  - No catalog rebuild needed (all 23 already in `bodies.districts.yaml`); `district-sites.yaml` unchanged.
- **Files:** `data/sources.yaml`, `tests/golden/church/*`, `tests/unit/mud-m18.test.ts`, `.plans/mud-buckets.md` (line M18).
- **Contract changes:** None.
- **Checked:**
  - `npm run scrape -- --source <id> --from 2026-09-14 --to 2026-12-31` for all 23: each found 1–6 agendas, newest between Oct 8 and Nov 6, 2026 (all within 45 days). No AI key, so no items extracted.
  - `check-district-batch.ts --batch W1,W2,W3,W4,W5,W6,W7,W8,W10,W18,W27`: all 23 M18 districts PASS (other buckets' districts in those batches not counted). Database checks skipped (no Supabase keys, blocked).
  - `npx vitest run`: 107 files, 1045 tests passed. `npm run typecheck`: no errors outside scraper P2/tmp. `npx eslint tests/unit/mud-m18.test.ts`: clean.
- **Open issues / next:**
  - With `date_from: line_text`, `meeting_type_from_text` only tests the link text ("Agenda"), so "Special:" on the line isn't detected and these meetings come out `regular` (same for hcmud_36 and the M17 sources). Fix would be in `discover.ts` (test the line for `line_text` as already done for `row_text`); not changed here since the file isn't this bucket's.
  - M19–M22 (`theme:church`) can reuse this config.
  - Seeding, ingest and live lookups blocked (no service-role or AI key). Drive downloads may hit "Quota exceeded" as in earlier buckets. Not committed.

### 2026-10-29: MUD bucket M17 ("no site"): 6 sources, 10 no agendas online
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:**
  - **Sources (6)** (`data/sources.yaml`, M17 block at the end), all `llm_extract` with the hcmud_36 ABHR config (`link_pattern "(?i)^agenda$"`, `match_link_text`, `date_from: line_text`). No new adapter.
    - districtdirectory.org pages: hcmud_544, harris_brazoria_counties_mud_509, bcmud_23 (brazoria-county path), hcmud_421, hcfwsd_47.
    - kings_manor_mud: its own site https://www.kmmud.org/meetings/ (Off Cinco-built, same ABHR layout). Flagged for the coordinator, since M25 owns the Off Cinco credit.
  - **No agendas online (10)** (`data/district-sites.yaml`): hcmud_410, kirkmont_mud, hcmud_148, hcmud_403, royalwood_mud, hcwcid_21, hcmud_53, hcfwsd_6, memorial_villages_wa, hcmud_541. The survey, the Comptroller and districtdirectory.org had nothing (hcmud_53's slug redirects to MUD 530's page). One web search each found only legislative, aggregator, city council or other districts' pages.
  - **Catalog:** ran `scripts/build-district-catalog.ts --batch W55`, which added hcmud_541 and kings_manor_mud to `data/bodies.districts.yaml` and `data/hcad-jurisdiction-map.districts.yaml`.
- **Files:** `data/sources.yaml`, `data/district-sites.yaml`, `data/bodies.districts.yaml` and `data/hcad-jurisdiction-map.districts.yaml` (generated), `.plans/mud-buckets.md` (line M17).
- **Contract changes:** None.
- **Checked:**
  - `npm run scrape -- --source <id> --from 2026-08-20 --to 2026-12-31` for all 6 sources. Newest agendas: hcmud_544 and bcmud_23 Nov 4, hcfwsd_47 Oct 22, harris_brazoria_counties_mud_509 and hcmud_421 Oct 15, kings_manor_mud Oct 8, 2026. All links go to Google Drive. Items weren't extracted because there's no AI key.
  - `check-district-batch.ts --batch W52,W53,W54,W55`: all 16 M17 districts PASS (other buckets' districts in these batches still fail). Database checks skipped (no Supabase keys, blocked).
  - `npx vitest run`: 106 files, 1043 tests passed. `npm run typecheck`: no errors outside scraper P2/tmp. No TS files changed, so there was nothing to lint.
- **Open issues / next:** Seeding, ingest and live lookups are blocked (no service-role or AI key). The Drive downloads may hit "Quota exceeded" as in M02/M05/M08. kings_manor_mud may move to M25 if the coordinator wants the Off Cinco sites together.

### 2026-10-29: MUD bucket M16 ("unknown" sites): 6 sources, 4 no agendas online, 7 moved
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:**
  - **Retried all 17 sites.** 13 now load; 4 didn't. 7 of the ones that load belong to vendors owned by later buckets. The coordinator moved them, and no configs were written for them:
    - M23 (Avada + Infinity Services): hcmud_62, hcmud_5, nwhcmud_36. nwhcmud_36's real site is nwhcmud36.org, not the Comptroller's nwchmud36.org.
    - M18 (theme:church + Off Cinco): fry_road_mud, castlewood_mud, hcmud_150
    - M25 (Off Cinco, theme "reach"): cornerstones_mud
  - **Sources (6)** (`data/sources.yaml`, M16 block at the end), all existing adapters and configs, no new adapter:
    - mayde_creek_mud: Texas Network layout (M11 config), link text "Agenda 10-26-26".
    - west_park_mud, hcmud_304, hcmud_221: Gatsby layout (M11 config), `/static/…Agenda….pdf`, `date_from: filename`.
    - timber_lane_ud: a one-off WordPress page; the href `wp-content/uploads/…/Timber-Lane-Agenda-10-8-26.pdf` is matched.
    - hcmud_477: Tax Tech district 091 on `utilitytaxservice` with `site` (M15 config), link-only.
  - **No agendas online (4)** (`data/district-sites.yaml`): hcmud_478 (its Tax Tech page, A40, lists no agendas; the scraper found none since 2024); hcwcid_132, nwhcmud_28 and northgate_crossing_mud_2 (the Comptroller-listed domains don't resolve: NXDOMAIN on every retry). One web search each found nothing.
  - **Test change:** `tests/unit/mud-m15.test.ts` now expects hcmud_477 among the Tax Tech sources.
- **Files:** `data/sources.yaml`, `data/district-sites.yaml`, `tests/unit/mud-m15.test.ts`, `.plans/mud-buckets.md` (lines M16, M18, M23, M25).
- **Contract changes:** None.
- **Checked:**
  - `npm run scrape -- --source <id> --from 2026-08-20 --to 2026-12-31` for all 6 sources. Newest agendas: hcmud_304 Oct 29, hcmud_477 Oct 28, hcmud_221 Oct 27, mayde_creek_mud and west_park_mud Oct 26, timber_lane_ud Oct 8, 2026. Items weren't extracted because there's no AI key.
  - `check-district-batch.ts --batch W17,W18,W25,W27,W28,W32,W34`: all 10 remaining M16 districts PASS. Database checks were skipped (no Supabase keys, blocked). The moved districts weren't checked.
  - `npx vitest run`: 106 files, 1043 tests passed. `npm run typecheck`: no errors outside the known scraper P2/tmp ones. `npx eslint tests/unit/mud-m15.test.ts`: clean.
- **Open issues / next:** Seeding, ingest, boundaries and live lookups are blocked (no service-role or AI key). The 7 moved districts go to M18, M23 and M25.

### 2026-10-29: MUD bucket M15 ("unknown" sites): 5 sources, 1 no agendas online, 3 pending, 8 moved
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:**
  - **Retried all 17 sites.** 14 now load with curl; the survey's fetches had failed. 8 of them belong to vendors owned by later buckets. The coordinator moved them, and no configs were written for them:
    - M18 (theme:church + Off Cinco): hcmud_374, spencer_road_pud, chimney_hill_mud, hcmud_172
    - M23 (Avada + Infinity Services): hcmud_168, grant_road_pud, hcmud_208
    - M25 (Avada + Off Cinco): hcmud_365
  - **Sources (5):**
    - hcmud_105 and hcmud_81 are hand-built sites with dated PDF filenames. hcmud_81 is HTTP only. Its STP and Cinco Regional agendas are left out, because those are joint bodies.
    - cimarron_mud lists agendas on one page per month (`handler.php?month=10&year=2026`).
    - hcmud_449 and hcmud_287 are on the Tax Tech portal (taxtech.net), the same Blazor portal as Utility Tax Service. They use M12's `utilitytaxservice` adapter with a new `site` option. Like M12's sources they're link-only: the PDF never reaches the scraper, so items are never extracted.
  - **Adapter changes**, both additive and approved by the coordinator:
    - `lib/adapters/utilitytaxservice.ts` (M12): an optional `site` (default: Utility Tax Service).
    - `lib/adapters/discover.ts`: `{yyyy}`, `{m}` and `{mm}` placeholders in `index_url`. They're filled for this month and next in America/Chicago, and both pages are read. `DiscoverDeps` gains an optional `now`.
  - **No agendas online (1):** hcmud_136 (`data/district-sites.yaml`). hcmud136.org shows only "Coming Soon"; a web search found nothing.
  - **Pending (3), left out of sources.yaml:**
    - hcmud_255 (Tax Tech district 108): the newest listed agenda is 9-10-2026, 49 days old, past the 45-day gap. Recheck after 2026-11-12 with the same config as hcmud_449.
    - hcmud_539: bamunitax.com returned 503 on every retry. Recheck after 2026-11-05.
    - horsepen_bayou_mud: a Vue app that reads a private JSON API, so it needs its own adapter. The coordinator agreed.
  - **Golden fixtures:** `tests/golden/taxtech/` (districts 332, 187) and `tests/golden/cimarron/` (month page). Tests are in `tests/unit/mud-m15.test.ts`.
  - **Test change:** the count check in `tests/unit/utilitytaxservice.test.ts` now skips sources that set `site`, so it still counts M12's 11 sources.
- **Files:** `data/sources.yaml` (M15 block at the end), `data/district-sites.yaml`, `lib/adapters/discover.ts`, `lib/adapters/utilitytaxservice.ts`, `tests/unit/mud-m15.test.ts`, `tests/unit/utilitytaxservice.test.ts`, `tests/golden/taxtech/`, `tests/golden/cimarron/`, `.plans/mud-buckets.md` (lines M15, M18, M23, M25).
- **Contract changes:** None to the shared contracts. Two adapter config options were added (`utilitytaxservice.site`, placeholders in discover's `index_url`). Existing configs behave the same.
- **Checked:**
  - `npm run scrape -- --source <id> --from 2026-08-20 --to 2026-12-31` for all 5 sources. Newest agendas: hcmud_105 Oct 27, hcmud_81 Oct 22, cimarron_mud Oct 21, hcmud_449 Oct 15 and hcmud_287 Oct 19, 2026. Items weren't extracted because there's no AI key.
  - `check-district-batch.ts --batch W1,W3,W8,W12,W14,W15`: hcmud_105, hcmud_136, hcmud_449, cimarron_mud, hcmud_81 and hcmud_287 PASS. hcmud_255, hcmud_539 and horsepen_bayou_mud FAIL, as expected while they're pending. Database checks were skipped (no Supabase keys, blocked). The moved districts' batches weren't rechecked.
  - `npx vitest run`: 106 files, 1043 tests passed.
  - `tsc --noEmit`: no errors outside `scraper P2/` and `tmp/`.
  - eslint is clean on the changed TypeScript files.
- **Open issues / next:** recheck hcmud_255 and hcmud_539 on the dates above. horsepen_bayou_mud needs a JSON adapter. M18, M23 and M25 take the moved districts. Seeding, ingest and live lookups are still blocked (keys).

### 2026-10-29: MUD bucket M14 (bli-tax, WordPress and Wix sites): 16 sources, 3 no agendas online, 1 pending
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:**
  - **No vendor adapter.** The 9 `theme:citygov` sites are all Bob Leared (bli-tax.com) pages, so they reuse M12's `discover` config. The 6 `wordpress` and 5 `wix` sites share only a builder, not a layout, so each gets its own `discover` config (`llm_extract`).
  - **Sources (16):**
    - bli-tax: hcmud_155, hcmud_503, hcmud_439, hcmud_158, hcmud_147 and nehcmud_1. hcmud_355 is the same, with `expected_max_gap_days: 70` because it meets about every other month (Jan, Mar, Jul and Sep 2026).
    - WordPress: hcmud_23, nottingham_country_mud, hcmud_132 and hcmud_390 (dated PDF links). interstate_mud has "2026-10-13: Agenda | Minutes" lines with agendas on Google Drive (`line_text`). oakmont_pud has an archive of dated meeting pages; each page links its agenda on Drive (`follow_notice_page`).
    - Wix: hcmud_238, where only the newest date is a link. hcwcid_110 uses `link_selector "#comp-mi92mrnb a"`, because the Minutes list beside the agendas repeats the same dates. That Wix component ID changes if the site is re-edited; the health check will flag it. clear_lake_city_wa uses the new `row_text`.
  - **`lib/adapters/discover.ts`** (owned by another bucket; the coordinator approved these additive changes):
    - New `date_from: 'row_text'`: the nearest ancestor that has a date and no other link. It stops at the first ancestor with a date and returns nothing once it reaches a second link, so it never takes a neighboring row's date. With `row_text`, `meeting_type_from_text.special` is also tested against the row.
    - `firstPdfLink` still prefers a `.pdf` link, and now falls back to the first `drive.google.com/file/d/…` link.
  - **No agendas online (3), in `data/district-sites.yaml`:**
    - hcmud_358 and harris_waller_counties_mud_4: their bli-tax pages list budgets, tax rates and audits but no agendas.
    - hcwcid_74: the "Meeting Agendas" link goes to a SharePoint folder that requires a Microsoft sign-in.
    - For each, the survey and Comptroller entry were checked, and one web search found nothing.
  - **Pending (1): memorial_mud.** Agendas are posted in Wix blog posts, but the file widget's PDF URL isn't in the static HTML, so it needs an adapter that reads the rendered page. It's left out of `sources.yaml`, and the coordinator agreed.
  - Golden fixtures are in `tests/golden/wix/` (clcwa, wcid110, hcmud238, with scripts and styles removed) and `tests/golden/wordpress-mud/` (Oakmont archive and meeting page, Interstate). Tests are in `tests/unit/mud-m14.test.ts`.
- **Files:** `data/sources.yaml` (M14 block at the end), `data/district-sites.yaml` (3 `no_agendas_online`), `lib/adapters/discover.ts`, `tests/unit/mud-m14.test.ts`, `tests/golden/wix/`, `tests/golden/wordpress-mud/`, `.plans/mud-buckets.md` (M14 line).
- **Contract changes:** `DiscoveryConfig.date_from` gains `row_text`, and `firstPdfLink` gains a Drive fallback. Both are additive, so existing configs behave the same.
- **Checked:**
  - `npm run scrape -- --source <id> --from 2026-08-20 --to 2026-12-31` for all 16. Each found agendas dated from Aug 20 to Nov 4, 2026, within each source's gap. Items weren't extracted because there's no AI key.
  - `check-district-batch.ts --batch W8,W11,W14,W15,W16,W20,W21,W23,W37,W38,W41,W44,W45,W49,W53`: 19 of the 20 M14 districts PASS. memorial_mud FAILs, as expected while it's pending. Database checks were skipped (no Supabase keys, blocked).
  - `npx vitest run`: 105 files, 1034 tests passed.
  - `tsc --noEmit`: no errors outside `scraper P2/` and `tmp/`.
  - eslint is clean on `lib/adapters/discover.ts` and `tests/unit/mud-m14.test.ts`.
- **Open issues / next:**
  - memorial_mud needs a rendered-page adapter.
  - hcmud_23's Oct 8 meeting picks the "Supplemental" agenda over the original, which is kept as superseded.
  - Seeding, ingest and live lookups are blocked until keys are available.

### 2026-10-29: Scraper spec v1.4: rule for cancelled and postponed meetings
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:** added §5.7 to `.plans/agent-scraper-spec.md`, at Iarush's request. Every adapter sets `Meeting.status = 'cancelled'` from the source's own labels about the meeting (default pattern covers cancelled, postponed, rescheduled and "not be held"). Text inside an agenda never cancels a meeting. A postponed date counts as cancelled, and the new date is added only when the source posts it. A date change under the same `external_id` is still a move (`previous_date`, `meeting_moved`). Items on a cancelled meeting aren't upcoming. Also added the v1.4 version line and §12 item 23.
- **Files:** `.plans/agent-scraper-spec.md`
- **Contract changes:** none to types or schema (`status` stays `scheduled | cancelled`). Behavior rule for P1, P3 and P4 in §12 item 23.
- **Checked:** spec text only; no code changed, nothing run.
- **Open issues / next:** build the `discover` option `meeting_status_from_text` with its default pattern, and the `pickPerDate` rule that prefers documents not marked cancelled. Bridgestone MUD's Sep 15 "CANCELLED" agenda is still recorded as scheduled until then.

### 2026-10-29: MUD bucket M13 (Triton and Gatsby/S3 sites): 20 sources, 0 no agendas online
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:**
  - **No new adapter.** Both vendors in this bucket fit `discover` configs (`llm_extract`).
    - Triton sites (11): champions_mud, hcmud_222, nwhcmud_16, whcmud_2, louetta_north_pud, hcmud_82, forest_hills_mud, woodcreek_mud, mission_bend_mud_2, kingsbridge_mud, lake_mud. Each meeting is a news card on `<site>/news` ("October 15, 2026 Board Meeting"), and its notice page links the agenda PDF on tmc.tritoncg.com. The config matches whcmud_10's: `match_link_text`, `follow_notice_page`.
    - Gatsby sites with documents on website-media-*.s3.amazonaws.com (9): hcwcid_159, hcmud_284, bridgestone_mud, hcwcid_109, hcwcid_158, hcmud_490, hcmud_504, mission_bend_mud_1, hcmud_8. They use the Board Meetings page, `link_pattern "(?i)agenda[^/]*[.]pdf$"` and `date_from: filename`. Since October, hcmud_8 posts agendas as `10_28_26_NTC_….pdf` notices, so its pattern also matches `_ntc_`.
  - Website rows for all 20 were already in `data/district-sites.yaml` from the survey, so that file is unchanged.
  - Golden fixtures: `tests/golden/tritoncg/` (lake_mud and woodcreek_mud news and notice pages) and `tests/golden/gatsby-s3/` (hcwcid_109, hcmud_8). Network-free tests are in `tests/unit/mud-m13.test.ts`.
- **Files:** `data/sources.yaml` (M13 block at the end), `tests/golden/tritoncg/`, `tests/golden/gatsby-s3/`, `tests/unit/mud-m13.test.ts`, `.plans/mud-buckets.md` (M13 line).
- **Contract changes:** None.
- **Checked:**
  - `npm run scrape -- --source <id> --from 2026-09-14 --to 2026-12-31` for all 20. Each found agendas dated from Sep 9 to Nov 3, 2026, all within 45 days. Items weren't extracted because there's no AI key.
  - `check-district-batch.ts` on W1, W3, W7, W9, W10, W15, W21, W22, W24, W27, W32, W36, W38, W44, W45, W48 and W54: all 20 M13 districts PASS. The remaining failures belong to other buckets. Database checks were skipped (no Supabase keys, blocked).
  - `npx vitest run`: 104 files, 1027 tests passed.
  - `tsc --noEmit`: no errors outside `scraper P2/` and `tmp/`.
  - eslint is clean on `tests/unit/mud-m13.test.ts`.
- **Open issues / next:** Bridgestone's Sep 15 agenda file is named "CANCELLED_…", but discover has no rule for cancelled meetings, so it's recorded as `regular`/`scheduled`. Seeding, ingest and live lookups are blocked until keys are available.

### 2026-10-29: MUD bucket M12 (Utility Tax Service, Bob Leared Interests): 17 sources, 1 no agendas online, 2 pending
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:**
  - **New adapter `utilitytaxservice` (link-only):** `lib/adapters/utilitytaxservice.ts`. Utility Tax Service lists each district's agendas at `www.utilitytaxservice.com/DistrictDocsList/<district>` in a "Meeting Notices and Agendas" card. Each link opens a Syncfusion Blazor PDF viewer (`PDFViewerEx/<district>/<docId>`). The PDF is sent only over the viewer's SignalR connection; about 10 other URL patterns were tried and none returns the file. So the adapter records the meeting date, special/cancelled from the label and the official viewer link, and never extracts items. Times stay 00:00. Every run warns `link_only: …`. Where a date has two copies, it uses the "Master" one over the "Internal" one. It skips month-only links and does nothing in results mode. The coordinator approved this approach.
  - **Registration:** I added one line each to `lib/ingest/adapters.ts` (loader) and `scripts/scrape.ts` (`GOLDEN_DIR`, which `tsc` requires). I also added the value to `AdapterKindSchema` in `lib/adapters/types.ts`. Those files also hold other people's uncommitted edits, which I didn't touch. New additive migration `supabase/migrations/20261029010000_utilitytaxservice_adapter.sql` widens `sources_adapter_check`. **Not yet applied** (no keys).
  - **Sources (17):**
    - `utilitytaxservice` (11): hcmud_559, hcmud_458, hcmud_171, hcmud_457, hcmud_534, hcmud_532, hcmud_547, hcmud_406, hcmud_558, hcmud_518, hcmud_525. Config `district: "<code>"`.
    - bli-tax.com WordPress pages (6, `llm_extract` discover): nwhcmud_9, hcwcid_113, hcmud_216, harris_waller_counties_mud_5, hcmud_321, spanish_cove_pud. The link text is only the month, so they use `link_pattern '(?i)/wp-content/uploads/.+agenda[^/]*[.]pdf$'` with `date_from: filename`.
  - **No agendas online (1):** hcmud_535. Its bli-tax page lists only budget, tax-rate and audit PDFs, and one web search found only a TCEQ permit.
  - **Pending recheck after 2026-11-12 (2, not in sources.yaml, not no_agendas_online):**
    - hcmud_273: newest agenda Sep 8; it skipped some months.
    - hcmud_459: newest dated agenda Sep 10; the October link text is only "October".
    - Both work with `adapter: utilitytaxservice` (`district` "195" / "235"). Their configs are recorded in the bucket line.
  - Website rows for the 19 other districts were added to `data/district-sites.yaml`, plus the no_agendas_online row for hcmud_535.
  - Golden fixtures: `tests/golden/utilitytaxservice/` (hcmud_458, hcmud_171) and `tests/golden/bli-tax/` (hcmud_216, nwhcmud_9). Tests: `tests/unit/utilitytaxservice.test.ts` and `tests/unit/mud-m12.test.ts` (no network).
- **Files:** `lib/adapters/utilitytaxservice.ts` (new), `lib/adapters/types.ts`, `lib/ingest/adapters.ts`, `scripts/scrape.ts` (one line each), `supabase/migrations/20261029010000_utilitytaxservice_adapter.sql` (new), `data/sources.yaml`, `data/district-sites.yaml`, `tests/golden/utilitytaxservice/`, `tests/golden/bli-tax/`, `tests/unit/utilitytaxservice.test.ts`, `tests/unit/mud-m12.test.ts`, `.plans/mud-buckets.md` (M12 line).
- **Contract changes:**
  - `AdapterKind` gains `utilitytaxservice`, and the `sources.adapter` check constraint is widened by the new migration.
  - **Open, for P3 / owner:** meetings from this adapter never have items because the agenda was not read. `Meeting` has no field for that, so the UI can't yet say "agenda not read; open the official link". For now the only marker is the run warning. The coordinator decided not to change the `Meeting` contract in this bucket.
- **Checked:**
  - `npm run scrape -- --source <id> --from 2026-09-14 --to 2026-12-31` for all 19 districts with agendas. The 17 added sources found agendas dated Sep 15 to Nov 3, all within 45 days. hcmud_273 and hcmud_459 found 0 meetings in the window.
  - No AI key, so no items were extracted.
  - `check-district-batch.ts --batch W5,W9,W11,W14,W16,W17,W19,W32,W35,W36,W46,W47,W48,W50,W51`: 18 M12 districts PASS. hcmud_273 and hcmud_459 FAIL (pending, as above). Database checks were skipped (no Supabase keys, blocked).
  - `npx vitest run`: 103 files, 1023 tests passed.
  - `npm run typecheck`: errors only in scraper P2/tmp.
  - eslint on the changed TS files: clean.
- **Open issues / next:**
  - Apply the migration before seeding these sources.
  - Recheck hcmud_273 and hcmud_459 after Nov 12.
  - Getting the agenda text from utilitytaxservice would need a Blazor SignalR client, which is out of scope.
  - Seeding, ingest, boundaries and live lookups are still blocked (no service-role or AI key).

### 2026-10-29: MUD bucket M11 (Gatsby, the Texas Network): 20 sources
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:**
  - **Sources (20, `llm_extract`):** every M11 district posts current agendas.
    - Gatsby (16): hcmud_419, hcmud_493, hcmud_391, windfern_forest_ud, hcmud_286, whcmud_9, west_memorial_mud, hcwcid_119, hcmud_383, hcmud_401, cnp_ud, sunbelt_fwsd, hcud_16, hcmud_278, bcmud_18, hcwcid_70. Same layout as hcmud_489: `link_pattern "(?i)/static/.+agenda.*\\.pdf$"`, `date_from: filename`. Index is Board Meetings, or Documents on the older Gatsby 2 sites (whcmud_9, hcwcid_119, bcmud_18, hcwcid_70). The survey had missed 14 of them because it checked only the home page.
    - The Texas Network (4): kleinwood_mud, hcwcid_99, hcwcid_1 (WordPress Avada, link text "10-22-26 Agenda": `link_pattern "(?i)agenda"`, `match_link_text`) and hcmud_109 (static page, link text is only the date, so `link_pattern "(?i)/(?!ajob)[^/]*agenda\\.pdf$"` on the href, skipping joint "AJOB-…" agendas).
  - **Adapter:** none written. Both vendors fit `discover` configs (spec §4 step 1 allows this). Golden fixtures: `tests/golden/gatsby/` (hcmud_391, whcmud_9) and `tests/golden/texas-network/` (kleinwood_mud, hcwcid_99, hcmud_109), with network-free tests in `tests/unit/mud-m11.test.ts`.
  - **Catalog:** ran `scripts/build-district-catalog.ts --batch W52` because hcwcid_70 (W52) was not in the catalog yet (517 bodies now). The builder also moved `tax_set_by_body_id` to the end of every water body's row (generated output; no values changed).
  - Website rows for all 20 were already in `data/district-sites.yaml`; not changed.
- **Files:** `data/sources.yaml`, `data/bodies.districts.yaml` and `data/hcad-jurisdiction-map.districts.yaml` (generated), `tests/golden/gatsby/`, `tests/golden/texas-network/`, `tests/unit/mud-m11.test.ts`, `.plans/mud-buckets.md` (M11 line).
- **Contract changes:** None.
- **Checked:** `npm run scrape -- --source <id> --from 2026-09-14 --to 2026-12-31` for all 20; newest agendas: hcmud_419 Oct 13, hcmud_493 Oct 27, hcmud_391 Oct 19, windfern_forest_ud Oct 20, hcmud_286 Nov 2, whcmud_9 Oct 26, west_memorial_mud Oct 26, hcwcid_119 Oct 12, hcmud_383 Oct 19, hcmud_401 Oct 19, cnp_ud Oct 15, sunbelt_fwsd Oct 15, hcud_16 Oct 9, hcmud_278 Oct 8, bcmud_18 Oct 27, hcwcid_70 Nov 4, kleinwood_mud Oct 22, hcwcid_99 Oct 20, hcmud_109 Oct 20, hcwcid_1 Oct 13. No AI key, so no items extracted. `check-district-batch.ts --batch W1,W2,W3,W7,W8,W17,W22,W23,W27,W29,W35,W38,W48,W49,W52`: all 20 M11 districts PASS (other buckets' districts in those batches still fail, as expected); database checks skipped (no Supabase keys, blocked). `npx vitest run`: 101 files, 1012 tests passed. `npm run typecheck`: errors only in scraper P2/tmp. `npx eslint tests/unit/mud-m11.test.ts`: clean.
- **Open issues / next:** seeding, ingest, boundaries and live lookups stay blocked (no service-role or AI key). hcud_16 and hcmud_278's newest agendas are Oct 9 and Oct 8, so they reach the 45-day gap around Nov 22 if no new agenda is posted.

### 2026-10-29: MUD bucket M10 (no site): 4 sources, 16 no agendas online
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:**
  - **Sources (4, `llm_extract`):** hcmud_373, hcmud_50 and hcmud_578 had no site in the survey, but their Comptroller districtdirectory.org pages use the ABHR layout ("2026-10-14 – Regular: Agenda | Minutes", Drive links). Config as hcmud_36 (`link_pattern "(?i)^agenda$"`, `match_link_text`, `date_from: line_text`). hcwcid_156 posts "<Month D YYYY> Meeting Notice" PDFs on the Clear Lake City Water Authority's Wix site (clcwa.org/156), found by the web search; config `link_pattern "(?i)meeting notice$"`, `match_link_text`, `expected_max_gap_days: 70` (meets about every other month). Wix belongs to M14, so no adapter was written; it can move to M14's adapter later. Website rows added to `data/district-sites.yaml`.
  - **No agendas online (16):** the_woodlands_road_ud_1, hcmud_213a, spring_meadows_mud, hcmud_528, cedar_bayou_park_ud, hcmud_213b, hcmud_568, hcmud_514, luce_bayou_pud, hcmud_517, hcmud_516, hcmud_515, hcwcid_160, pine_bough_pud, lago_bello_mud_1a, hcfwsd_58. Survey and Comptroller gave no site (districtdirectory.org pages 404, or for hcmud_514 and pine_bough_pud list no meetings). One web search each found only legislative, aggregator or other districts' pages.
  - **Catalog:** ran `scripts/build-district-catalog.ts --batch W1,…,W51` (507 bodies; generated files only).
  - No adapter: M10 owns no vendor.
- **Files:** `data/sources.yaml`, `data/district-sites.yaml`, `data/bodies.districts.yaml` and `data/hcad-jurisdiction-map.districts.yaml` (generated), `.plans/mud-buckets.md` (M10 line).
- **Contract changes:** None.
- **Checked:** `npm run scrape -- --source <id> --from 2026-09-14 --to 2026-12-31`: hcmud_373 (Oct 12, Nov 3), hcmud_50 (Oct 14), hcmud_578 (Oct 1, Oct 29), hcwcid_156 (Sep 17, Oct 15). No AI key, so no items extracted. hcmud_514 and pine_bough_pud scraped 0 meetings and were left out. `check-district-batch.ts --batch W47,W48,W49,W50,W51`: all 20 M10 districts PASS; database checks skipped (no Supabase keys, blocked). `npx vitest run`: 100 files, 1007 tests passed. `npm run typecheck`: 7 errors, all in scraper P2/tmp. No TS files changed, so ESLint had nothing to check.
- **Open issues / next:** seeding, ingest, boundaries and live lookups stay blocked (no service-role or AI key). hcwcid_156 could move to the M14 Wix adapter once it exists.

### 2026-10-29: MUD bucket M09 (no site): 4 sources, 16 no agendas online
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:**
  - **Sources (4, `llm_extract`):** hcmud_393, northpointe_wcid, malcomson_road_ud and hcmud_280 had no site in the survey, but their Comptroller districtdirectory.org pages use the ABHR layout ("2026-10-19 – Regular: Agenda | Minutes", Drive links). Config as hcmud_36 (`link_pattern "(?i)^agenda$"`, `match_link_text`, `date_from: line_text`). Website rows added to `data/district-sites.yaml`.
  - **No agendas online (16):** hcwcid_89, hcmud_90, hcmud_122, hcmud_589, fbcwcid_2, swhcmud_1, whcmud_4, renn_road_mud, whcmud_16, fbcmud_30, harris_montgomery_counties_mud_386, hcmud_416, nwhcmud_15, hcmud_282, hcmud_281, hcmud_583. Survey and Comptroller gave no site (districtdirectory.org pages 404, or for hcmud_589 and swhcmud_1 list no meetings); one web search each found only legislative, aggregator or other districts' pages (nwhcmud_15: aggregator summaries only).
  - **Catalog:** ran `scripts/build-district-catalog.ts --batch W1,…,W47` (422 → 478 bodies; generated files only).
  - No adapter: M09 owns no vendor.
- **Files:** `data/sources.yaml`, `data/district-sites.yaml`, `data/bodies.districts.yaml` and `data/hcad-jurisdiction-map.districts.yaml` (generated), `.plans/mud-buckets.md` (M09 line).
- **Contract changes:** None.
- **Checked:** `npm run scrape -- --source <id> --from 2026-09-14 --to 2026-12-31`: hcmud_393 (2 meetings: Sep 28, Oct 26), northpointe_wcid (2: Sep 16, Oct 21), malcomson_road_ud (2: Sep 21, Oct 19), hcmud_280 (1: Oct 7); no AI key, so no items extracted. `check-district-batch.ts --batch W41,W42,W45,W46,W47`: all 20 M09 districts PASS; other failures belong to other buckets; database checks skipped (no Supabase keys, blocked). `npx vitest run`: 100 files, 1007 tests passed. `npm run typecheck`: 7 errors, all in scraper P2/tmp. No TS files changed, so ESLint had nothing to check.
- **Open issues / next:** seeding, ingest, boundaries and live lookups stay blocked (no service-role or AI key).

### 2026-10-29: MUD bucket M08 (no site): 7 sources, 11 no agendas online, 2 pending recheck
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:**
  - **Sources (7, `llm_extract`):** fallbrook_ud, hcmud_182, hcmud_344, hcmud_494, intercontinental_mud, north_belt_ud and hcmud_231 had no site in the survey, but have districtdirectory.org pages on the ABHR layout ("2026-10-19 – Regular: Agenda | Minutes", Drive links). Config as hcmud_36 (`link_pattern "(?i)^agenda$"`, `match_link_text`, `date_from: line_text`). Website rows added to `data/district-sites.yaml`.
  - **Pending recheck after 2026-10-30 (2):** hunters_glen_mud (hgmud.org/meetings/) and hcmud_46 (hcmud46.org/meetings/) use the same layout with agendas dated Oct 19 and Oct 14, but every Drive download answered "Quota exceeded" on two tries, so the scrape found 0 meetings. Left out of `sources.yaml`; website rows added; working config in the M08 bucket line.
  - **No agendas online (11):** harris_waller_counties_mud_7, hcmud_33, richey_road_mud, north_green_mud, hcmud_11, hcmud_461, pine_forest_mud, trail_of_the_lakes_mud, hcmud_342, el_dorado_ud, hcfwsd_48. Survey and Comptroller gave no site (hcmud_461's districtdirectory.org page lists no meetings); one web search each found only legislative, aggregator or other districts' pages (El Dorado UD: only a homeowners' page with the meeting schedule).
  - **Catalog:** ran `scripts/build-district-catalog.ts --batch W1,…,W40` (402 → 422 bodies; generated files only).
- **Files:** `data/sources.yaml`, `data/district-sites.yaml`, `data/bodies.districts.yaml` and `data/hcad-jurisdiction-map.districts.yaml` (generated), `.plans/mud-buckets.md` (M08 line).
- **Contract changes:** None.
- **Checked:** `npm run scrape -- --source <id> --from 2026-09-14 --to 2026-12-31`: fallbrook_ud (Sep 21, Oct 19), hcmud_182 (Sep 16, Oct 21), hcmud_344 (Sep 17, Oct 15), hcmud_494 (Oct 13), intercontinental_mud (Sep 17, Oct 9), north_belt_ud (Sep 14, Sep 17, Oct 8, Oct 12, Oct 15), hcmud_231 (Sep 16, Oct 21); no AI key, so no items extracted. `check-district-batch.ts --batch W34,…,W40`: 18 of 20 M08 districts PASS; hunters_glen_mud and hcmud_46 FAIL (no source yet, pending recheck); other failures belong to other buckets; database checks skipped (no Supabase keys, blocked). `npx vitest run`: 100 files, 1007 tests passed. `npm run typecheck`: 7 errors, all in scraper P2/tmp. No TS files changed, so ESLint had nothing to check.
- **Open issues / next:** recheck hunters_glen_mud and hcmud_46 once the Drive quota resets; seeding, ingest, boundaries and live lookups stay blocked (no service-role or AI key).

### 2026-10-29: MUD bucket M07 (no site): 6 sources, 14 no agendas online
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:**
  - **Sources (6, `llm_extract`):** hcwcid_164, hcmud_491, hcmud_434, hcmud_576, hcmud_570c and hcmud_565 had no site in the survey, but their Comptroller districtdirectory.org pages use the ABHR layout ("2026-10-13 – Regular: Agenda | Minutes", Drive links). Config as hcmud_36 (`link_pattern "(?i)^agenda$"`, `match_link_text`, `date_from: line_text`). Website rows added to `data/district-sites.yaml`.
  - **No agendas online (14):** hcmud_597, hcmud_377, hcmud_405, hcmud_478b, hcmud_600, hcmud_441, hcmud_380, hcmud_582, hcmud_570a, hcmud_588, hcmud_609, bauer_landing_wcid, harris_waller_counties_mud_10, northwest_frwy_mud. Guessed .com/.org domains don't resolve (northwestfreewaymud.com answers but has no agenda or meeting links); the districtdirectory.org pages are 404, or list no meetings (570a, 588, 609); one web search each found only legislative, aggregator or other districts' pages.
  - **Catalog:** ran `scripts/build-district-catalog.ts --batch W1,…,W34` (372 → 402 bodies; generated files only, no earlier body removed).
  - No adapter: M07 owns no vendor.
- **Files:** `data/sources.yaml`, `data/district-sites.yaml`, `data/bodies.districts.yaml` and `data/hcad-jurisdiction-map.districts.yaml` (generated), `.plans/mud-buckets.md` (M07 line).
- **Contract changes:** None.
- **Checked:** `npm run scrape -- --source <id> --from 2026-09-14 --to 2026-12-31`: hcwcid_164 (Oct 13), hcmud_491 (Sep 15, Oct 20), hcmud_434 (Sep 23, Oct 28), hcmud_576 (Oct 13), hcmud_570c (Oct 8), hcmud_565 (Sep 17, Oct 15); no AI key, so no items extracted. `check-district-batch.ts --batch W32,W33,W34`: all 20 M07 districts PASS; database checks skipped (no Supabase keys, blocked). `npx vitest run`: 100 files, 1007 tests passed. `npm run typecheck`: 7 errors, all in scraper P2/tmp. No TS files changed, so ESLint had nothing to check.
- **Open issues / next:** Seeding, ingest and boundaries are blocked on keys.

### 2026-10-29: MUD bucket M06 (no site): 7 sources, 13 no agendas online
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:**
  - **Sources (7, `llm_extract`):** the survey had no site for any M06 district, but guessed domains and the Comptroller's districtdirectory.org pages found 7. hcmud_200, hcmud_43, hcmud_249 and hcwcid_92 use the hcmud_489 Gatsby layout (`/board-meetings/`, `date_from: filename`). hcmud_36 and hcmud_399 use the ABHR layout on districtdirectory.org (`date_from: line_text`); hcmud36.com stops at Feb 2026. hcmud_189 links Drive agendas titled "Agenda 9/14/2026" on hcmud189.org. Website rows added to `data/district-sites.yaml`.
  - **Adapter change (coordinator approved, additive):** `parseDocDate` in `lib/adapters/discover.ts` now reads compact 8-digit dates, 20xx years only: YYYYMMDD first, then MMDDYYYY. hcwcid_92 names its files `11022026_AGENDA_…`. Tests added to `tests/unit/discover.test.ts`, including the YYYYMMDD-first case and invalid dates.
  - **No agendas online (13):** hcmud_316, hcmud_48, hcmud_96, hcmud_115, hcmud_205, hcmud_215, hcmud_16, hcmud_58, ponderosa_forest_ud, tattor_road_mud, westador_mud, north_park_pud, nwhcmud_21. For each, the survey and Comptroller gave no site with agendas, guessed domains were dead or parked (hcmud58.org is a parked "/lander" page), and one web search found only other districts', legislative or aggregator pages. hcmud_48's districtdirectory.org page lists no meetings.
  - **Catalog:** ran `scripts/build-district-catalog.ts --batch W18,…,W31` (345 → 372 bodies; generated files only).
- **Files:** `data/sources.yaml`, `data/district-sites.yaml`, `lib/adapters/discover.ts`, `tests/unit/discover.test.ts`, `data/bodies.districts.yaml` and `data/hcad-jurisdiction-map.districts.yaml` (generated), `.plans/mud-buckets.md` (M06 line).
- **Contract changes:** None. `parseDocDate` accepts one more date form; nothing it parsed before has changed.
- **Checked:** `npm run scrape -- --source <id> --from 2026-09-14 --to 2026-12-31`: hcmud_200 (Sep 15, Oct 20), hcmud_43 (Sep 17, Oct 13, Oct 22), hcmud_249 (Oct 8), hcwcid_92 (Oct 5, Nov 2), hcmud_36 (Oct 8), hcmud_399 (Sep 15, Oct 20), hcmud_189 (Sep 14). There's no AI key, so no items were extracted. Without `--from`, the scrape finds 0 meetings (the default window is future-only). `check-district-batch.ts --batch W25,…,W31`: all 20 M06 districts PASS; the other failures belong to other buckets; database checks skipped (no Supabase keys, blocked). `npx vitest run`: 100 files, 1007 tests passed. `npm run typecheck`: no errors outside scraper P2/tmp. ESLint is clean on the 2 changed TS files.
- **Open issues / next:** (1) hcmud_189's Sep 14 agenda is at the edge of the 45-day window. Its upcoming Nov 2 agenda is linked as "Agenda (PDF)" with the date on a separate line, so it isn't matched; recheck after Nov 2, 2026. (2) hcmud_399's website row points at its districtdirectory.org page, because hcmud399.org is parked. (3) Seeding, ingest and boundaries are blocked on keys.

### 2026-10-29: MUD bucket M05 (no site): 16 no agendas online, 4 pending recheck
- **Who:** Iarush · P2 Scrapers
- **Branch:** main
- **What changed:** Checked all 20 M05 districts (`no site` vendor, which M02 owns, so this bucket has no adapter). The survey and Comptroller gave no site for any of them, and one web search each was run. 16 have no agendas online and got `no_agendas_online` in `data/district-sites.yaml`. Four have sites and got `website` rows there, but none is in `data/sources.yaml`: Cinco MUD 3, 6 and 9 share cincomuds.org (ABHR Drive layout, newest agendas Oct 15, Oct 15 and Oct 21, 2026), but every Drive download answered "Quota exceeded", so the scrape found 0 meetings. Baker Road MUD's operator page (h2oinnovation.com) links agendas on h2ocustomers.com, but the newest is May 29, 2026, past the 45-day window. Re-ran `scripts/build-district-catalog.ts --batch W18,W19,W20,W22,W23,W24,W25` (315 → 345 bodies; generated files only; every body still has `tax_set_by_body_id`, and the large diff is only git's line alignment).
- **Files:** `data/district-sites.yaml`, `data/bodies.districts.yaml` and `data/hcad-jurisdiction-map.districts.yaml` (generated), `.plans/mud-buckets.md` (M05 line).
- **Contract changes:** None.
- **Checked:** `npm run scrape -- --source cinco_mud_{3,6,9}` with temporary entries, which were then removed: 0 meetings each (Drive quota; parseIndex on the live pages returns dated agendas up to 2026-10-15/10-21, and a direct `uc?export=download` fetch returned the "Quota exceeded" page, retried once later with the same result). `check-district-batch.ts --batch W18,W19,W20,W22,W23,W24,W25`: all 16 `no_agendas_online` districts PASS; the 4 pending ones fail only on "no source", as expected; database checks skipped (no Supabase keys, blocked). `npx vitest run`: 100 files, 1002 tests passed. `npm run typecheck`: no errors outside scraper P2/tmp. ESLint: no TS/JS files changed.
- **Open issues / next:** (1) Retry the Cinco 3/6/9 scrapes when Drive's quota clears, then add them to `data/sources.yaml` with the config in the M05 bucket line. (2) Recheck Baker Road MUD after Dec 1, 2026. (3) The Comptroller step relies on the survey's result (no site); it wasn't re-queried by hand. (4) Other buckets' districts in W18–W25 still fail the batch check; that's theirs.

### 2026-10-29: MUD rollout bucket M04 ("no site"): 1 source, 19 no agendas online
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:**
  - **Source (1, `llm_extract`, existing discover options only, no adapter changes):** westlake_mud_1. The survey had no site, but the guessed domain westlakemud1.com is the district's site (Gatsby layout as hcmud_489; it cites the Harris County Appraisal District). Its `/documents` page lists agenda PDFs whose names mix "AGENDA_2026_08_24_…" and "Agenda_September_28_2026_…"; both parse with `date_from: filename`. Website row added to `data/district-sites.yaml`.
  - **No agendas online (19):** hcmud_25, hcmud_185, hcmud_437, fenske_road_mud, mason_creek_ud, addicks_ud, hcmud_432, hcmud_536, hcmud_569, hcmud_65, whcmud_7, willow_fork_drainage, hcmud_533, hcmud_63, hcmud_465, hcmud_492, katy_west_mud, whcmud_5, green_trails_mud. Survey and Comptroller listing gave no site; guessed domains (.com/.org/.net) were dead or parked (hcmud25.org and hcmud185.org are "/lander" parked pages); one web search each found only legislative, aggregator, City of Katy council or other districts' pages. fenske_road_mud was created by HB 5666 (2025) and may be too new to post. mason_creek_ud has third-party aggregator summaries of 2026 meetings but no official agenda page was found.
  - **Catalog:** ran `scripts/build-district-catalog.ts --batch W8,…,W18` (271 → 315 bodies; generated files only).
- **Files:** `data/sources.yaml`, `data/district-sites.yaml`, `data/bodies.districts.yaml` and `data/hcad-jurisdiction-map.districts.yaml` (generated), `.plans/mud-buckets.md` (M04 line).
- **Contract changes:** None.
- **Checked:** `npm run scrape -- --source westlake_mud_1 --from 2026-09-14 --to 2026-12-31`: 2 meetings (Sep 28, Oct 26 amended agenda) within the 45-day gap; no AI key, so no items. `check-district-batch.ts` W12–W18: all 20 M04 districts pass the file checks; other failures are other buckets' districts; DB checks blocked (no Supabase keys). `npx vitest run` 100 files / 1002 tests pass. `tsc --noEmit` has no errors outside `scraper P2/tmp`. ESLint: no TS files changed.
- **Open issues / next:** mason_creek_ud seems active (aggregator summaries) and may be worth a recheck by hand; seeding, ingest and boundaries blocked on keys.

### 2026-10-29: MUD rollout bucket M03 ("no site"): 0 sources, 19 no agendas online, 1 pending
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:**
  - **No agendas online (19):** hcmud_378, hcmud_396, hcmud_276, whcmud_1, hcwcid_116, whcmud_14, nwhcmud_29, hcmud_379, hcmud_166, hcmud_371, hcmud_376, hcmud_257, hcmud_389, hcmud_220, hcmud_170, hcmud_351, tower_oaks_plaza_mud, white_oak_bend_mud, camfield_mud. Survey and Comptroller listing gave no site; guessed domains (.com/.org/.net/.gov, with and without www) were dead or parked (whcmud1.org, hcmud220.org, hcmud170.org, wobmud.org are "/lander" parked pages); one web search each found only legislative, aggregator or other districts' pages.
  - **Pending recheck (1):** hcmud_322. A Sept 11, 2026 myneighborhoodnews.com item says agendas are posted on the district website (meets 2:30 p.m., fourth Monday). hcmud322.org answers 403 to plain fetches, so the site could not be confirmed and no source or website row was added.
  - **Catalog:** ran `scripts/build-district-catalog.ts --batch W8,W9,W10,W11,W12` (221 → 271 bodies; generated files only).
  - **Test:** `tests/unit/news-match.test.ts` rollout-scale test now builds its terms from the synthetic catalog only (coordinator approved), because the real hcmud_25 added by the W12 catalog build matched the test's "Harris County MUD 25" text.
- **Files:** `data/district-sites.yaml`, `data/bodies.districts.yaml` and `data/hcad-jurisdiction-map.districts.yaml` (generated), `tests/unit/news-match.test.ts`, `.plans/mud-buckets.md` (M03 line).
- **Contract changes:** None.
- **Checked:** no scrapes run (no district site found). `check-district-batch.ts` W6–W12: all M03 districts pass the file checks except hcmud_322 (pending); other failures are other buckets' districts; DB checks blocked (no Supabase keys). `npx vitest run` 100 files / 1002 tests pass. `tsc --noEmit` has no errors outside `scraper P2/tmp`. ESLint clean on `tests/unit/news-match.test.ts`.
- **Open issues / next:** hcmud_322 needs its site checked by hand (403 to automated fetches); seeding, ingest and boundaries blocked on keys.

### 2026-10-29: MUD rollout bucket M02 ("no site"): 3 sources, 16 no agendas online
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:**
  - **Sources (3, all `llm_extract`, existing discover options only, no adapter changes):** whcmud_10 (Triton site; `/news` notice cards "October 15, 2026 Regular Board Meeting" with `match_link_text` + `follow_notice_page` to the PDF on tmc.tritoncg.com; the Triton adapter itself belongs to M13, and the documents page's embedded JSON can't be used because its URLs contain raw spaces), hcmud_370 and hcmud_418 (Gatsby layout as hcmud_489).
  - **Websites found** by guessing domains for these "no site" districts: whcmud10tx.gov, hcmud370.com, hcmud418.com, barkercypressmud.org (added to `data/district-sites.yaml`).
  - **No agendas online (16):** hcwcid_157, hcwcid_155, nwhcmud_12, hcmud_157, whcmud_11, langham_creek_ud, whcmud_21, hcmud_354, hcmud_196, cy_champ_pud, whcmud_15, jackrabbit_road_pud, hcmud_375, hcmud_397, reid_road_mud_1, reid_road_mud_2. Survey and Comptroller listing gave no site, guessed domains were dead (nwhcmud12.org, langhamcreek.com, cychamp.org are parked), and one web search each found only aggregator or legislative pages.
  - **Pending recheck (1), not in sources.yaml:** barker_cypress_mud: ABHR Drive layout (config as hcmud_24, `date_from: line_text`), Oct 12 agenda listed, but Drive answered "Quota exceeded" on download. Retry the scrape.
  - **Catalog:** `build-district-catalog.ts --batch W1,W2,W3,W4,W5,W6` re-run: 221 bodies / 222 codes (30 added for W4–W6, none removed). The generator now writes `tax_set_by_body_id` after `sms_eligible`, so existing bodies show moved lines in the diff.
- **Files:** `data/sources.yaml`, `data/district-sites.yaml`, `data/bodies.districts.yaml` and `data/hcad-jurisdiction-map.districts.yaml` (generated), `.plans/mud-buckets.md` (M02 line).
- **Contract changes:** None.
- **Checked:** `npm run scrape -- --source <id> --from 2026-09-14 --to 2026-12-31`: whcmud_10 (Oct 15), hcmud_370 (Sep 14, Oct 12), hcmud_418 (Sep 22, Oct 27) found agendas in the 45-day gap; no AI key, so no items. `check-district-batch.ts` W1–W6: all M02 districts pass the file checks except barker_cypress_mud (pending); the other failures are other buckets' districts; DB checks blocked (no Supabase keys). `npx vitest run` 100 files / 1002 tests pass. `tsc --noEmit` has no errors outside `scraper P2/tmp`. ESLint: no TS files changed.
- **Open issues / next:** retry barker_cypress_mud when the Drive quota resets; seeding, ingest and boundaries are blocked on keys.

### 2026-10-29 — News term matching scales to the rollout catalog (draft, Orca task task_a7f06829b6fa)

**Why:** with the district catalog at ~199 term sets, `tests/unit/news-match.test.ts` and `news-collect.test.ts` hit vitest's 5 s timeout in the full run. Profiling: `loadTerms()` ~115 ms, but `matchBodies()` ~80 ms per text, because `hasPhrase` compiled a new Unicode regex for every alias on every call.

**Changed (lib/news/match.ts only; no contract change):**
- `matchBodies`/`hasPhrase`: each phrase's regex is compiled once and cached, lazily, only after a prefilter passes. Prefilter: the phrase's lowercase ASCII letter/digit words must all be words of the text (numbered words checked first). This can't drop a real match: each ASCII run in a matching phrase is a whole run in the text (word edges are guarded by the regex's letter/digit lookarounds); `ſ` is folded to `s` because `/iu` does so and `toLowerCase` doesn't. Matching rules and output order are unchanged.
- `loadTerms()` memoizes per (path, withDistricts) and returns a fresh array copy.
- Not done: the brief's "one combined regex" idea; the word prefilter was enough and keeps per-alias `requires`/`exclude_terms` logic untouched.

**Tests:** new `matchBodies at rollout scale` in `tests/unit/news-match.test.ts` builds a synthetic 600-body catalog through `districtTerms()` and matches 50 texts in < 1 s (~300–550 ms observed), checking results too.

**Verified (run locally):** `npx vitest run` 100 files / 1002 tests pass, no timeouts. `eslint` clean on the changed files. `tsc --noEmit` shows no errors outside `scraper P2/tmp`. No edits to plan files, data/, adapters or ingest; no commits.

### 2026-10-29: MUD rollout bucket M01: 15 water-district sources, Drive line dates
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:**
  - **discover (additive):** `date_from: line_text` reads the date from the text before the link on its line (back to the previous `<br>` or block start: `2026-10-21 – Regular: Agenda`). `link_selector` limits matching to a CSS selector (`td:first-child a`: the Agendas column beside same-dated Minutes). `parseDocDate` accepts underscore `m_d_yy`/`m_d_yyyy` (`Emerald_Agenda_10_08_26_….pdf`), with the same separator required on both sides. The earlier uncommitted Finalsite changes in `discover.ts` are untouched.
  - **Sources (15, all `llm_extract`):** ricewood_mud, emerald_forest_ud, encanto_real_ud, hcwcid_36, hcmud_285, northgate_crossing_mud_1 (Gatsby/static PDFs); hcfwsd_61 and hcmud_248 (shared site, "notice of public meeting" pages; the archive page lags a month); hcmud_24, clear_brook_city_mud, hcmud_130, harris_waller_counties_mud_3, hcmud_422, hcmud_423 (one law-firm layout on Google Drive, `line_text`); northgate_crossing_road_ud (Drive table, `link_selector`, `expected_max_gap_days: 120` since it meets about quarterly).
  - **No agendas online (2):** greens_parkway_mud (Comptroller listing page 404, no site, search empty), hcfwsd_45 (Comptroller site is a law firm with no district pages, search empty). These rows have no website, so `scripts/build-district-catalog.ts` now reads the file through the new `districtSites()` in `lib/ingest/districtCatalog.ts`, which skips rows without one (approved by the coordinator).
  - **Pending recheck (3), not in sources.yaml:** hcmud_165 posts each agenda only in "Upcoming Meetings" days before the meeting (none up on Oct 29; recheck after Nov 2). hcmud_501 and charterwood_mud: in-gap Drive agendas found (Oct 7, Oct 27), but Drive answered "Quota exceeded" on download; retry. Configs are in the M01 line of `.plans/mud-buckets.md`.
  - **Catalog:** `build-district-catalog.ts` was re-run for W1, W2, W3, W7, W16, W20, W21, W22, W24, W27, W30, W35, W37, W39, W40, W49, W53 and W54 (191 bodies, 192 codes).
- **Files:** `lib/adapters/discover.ts`, `lib/ingest/districtCatalog.ts`, `scripts/build-district-catalog.ts`, `data/sources.yaml`, `data/district-sites.yaml`, `data/bodies.districts.yaml` and `data/hcad-jurisdiction-map.districts.yaml` (generated), `tests/golden/google-drive/`, `tests/golden/static-pdf/` (new), `tests/unit/mud-discover.test.ts` (new), `tests/unit/district-catalog.test.ts`, `.plans/mud-buckets.md` (M01 line).
- **Contract changes:** None (new optional source-config keys only).
- **Checked:**
  - `npm run scrape -- --source <id> --from 2026-09-14 --to 2026-12-31` for each of the 15: exit 0, each with at least one agenda in the last 45 days; northgate_crossing_road_ud used `--from 2026-07-01` and found Oct 16. There is no AI key, so no items were extracted.
  - `check-district-batch.ts` on the 18 batches: all 17 resolved M01 districts PASS the file checks, the 3 pending ones fail "no source", and DB checks are skipped (no service-role key). Other buckets' districts in those batches still fail, as expected.
  - `npx vitest run`: 999/1001. The two failures are 5 s timeouts in `tests/unit/news-match.test.ts` and `tests/unit/news-collect.test.ts`. Both pass alone (`npx vitest run tests/unit/news`: 79 passed). They got slower when the catalog grew from 23 to 191 bodies.
  - `npm run typecheck`: errors only in `scraper P2/tmp`. ESLint on the changed files: clean.
- **Open issues / next:** Recheck the 3 pending districts. The news-term matching slows as the catalog grows, and the remaining buckets will add about 300 more bodies, so those two tests need a fix (a faster matcher or a longer timeout). Ingest, seeding and boundaries are blocked on keys. Not committed.

### 2026-10-28: MUD rollout Phase A: vendor survey of all water districts and the bucket file
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:**
  - **Fingerprints:** `lib/ingest/siteSurvey.ts` gains `fingerprint()` (generator tag, WordPress theme folders, off-site asset hosts, document-link hosts, footer "website by …" credit), `mergeFingerprints()`, `vendorKey()` (board platform, then credit, then off-site agenda host, then custom theme, then Drive plus builder, then tax-office listing page, then generator, then builder) and `bucketize()` (spec §3). State agency hosts (TCEQ, SOS) are ignored as agenda hosts. Per-district `website-media-*.s3` buckets count as one vendor.
  - **Survey script:** `scripts/survey-district-sites.ts` accepts `--batch W1-W55` and `--combine` (writes `tmp/survey/all.json`, recomputing the vendor from the saved fingerprint). New `scripts/build-mud-buckets.ts` writes `.plans/mud-buckets.md`.
  - **Survey run:** W1–W55 all ran (`tmp/survey/W*.json|md`, logs in `tmp/survey/logs/`). There are 497 districts, not 498: the 498th is a blank, unnamed entry at the end of W48 in `district-rollout-batches.md`, so it has no ID and no bucket.
  - **Vendors:** no site 196, `theme:church` 63, unknown 49 (mostly fetch failures), `credit:infinity services` 43, `credit:off cinco` 41, `generator:gatsby` 16, `listing:utilitytaxservice.com` 13, `docs:tmc.tritoncg.com` 11, S3 website-media 9, `theme:citygov` 9, plus small ones. 31 vendor keys in all, in 29 buckets (M01–M29). M01 holds W1's `hcmud_165`.
  - **district-sites.yaml:** 245 water districts added. For each, the Comptroller's self-reported site was fetched and `namesDistrict()` confirmed that the home page names the district. This was an automated check, not a manual open. Tax-office listing pages were left out.
- **Files:** `lib/ingest/siteSurvey.ts`, `scripts/survey-district-sites.ts`, `scripts/build-mud-buckets.ts` (new), `tests/unit/site-fingerprint.test.ts` (new), `data/district-sites.yaml`, `.plans/mud-buckets.md` (new), `tmp/survey/`.
- **Contract changes:** None.
- **Checked:** `npx vitest run`: 97 files, 978 passed. `npm run test:p4`: 72 passed. `npm run typecheck`: errors only in `scraper P2/tmp/*` (pre-existing, as in earlier entries). `npm run lint`: 5 errors, all pre-existing in files this task didn't touch (`app/(prototype)/app/brief/page.tsx`, `app/(public)/alerts/page.tsx`, `app/(public)/weekly/page.tsx`, `components/prototype/app-onboarding-tour.tsx`, react-hooks rules). ESLint on the changed files is clean.
- **Open issues / next:** The coordinator reviews `.plans/mud-buckets.md`. Generic keys (`wordpress`, `wix`, `unknown`, `no site`) group sites that only share a builder or have no site, so those buckets' workers confirm the adapter fit or set `no_agendas_online`. The 49 unknowns should be re-fetched first (most failed with "fetch failed"). `theme:church` (63) is probably one firm, but that isn't confirmed. Not committed.

### 2026-10-28: MUD scraper rollout spec
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:** New spec `.plans/mud-scrapers-rollout-spec.md` from an interview: survey all 498 water districts, regroup by vendor into buckets of about 20, a dedicated adapter per vendor (Drive fetcher allowed), sources added when a scrape passes (ingest blocked on keys), one Orca worker at a time, one local commit per bucket. X codes are out of scope.
- **Files:** `.plans/mud-scrapers-rollout-spec.md` (new).
- **Contract changes:** None.
- **Checked:** Docs only; nothing run.
- **Open issues / next:** Phase A (the survey of all 498) is dispatched to the first worker.

### 2026-10-28: District coverage: sources for 8 of the 9 unlisted S1–S3 boards (Katy blocked)
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:** Each source below was added after `npm run scrape -- --from 2026-08-01 --to 2026-11-30` found its agendas on this laptop. Platforms and links were found by fetching each site.
  - **Huffman** (Finalsite, llm_extract): 4 meetings. **Pearland** (Finalsite, llm_extract): 3. **Spring** (Apptegy, llm_extract): 8, including Nov 2. **Aldine** (public Google Drive folder behind the site's Use-your-Drive plugin, llm_extract): 4. **Deer Park** (Edlio, llm_extract): 5. **Dayton** (ParentSquare, llm_extract): 4. These have no items and save times as 00:00 until the AI pass reads the PDFs; there's no AI key here.
  - **Channelview** (BoardBook org 791, linked from cvisd.org): 6 meetings, 124 items, real times.
  - **Humble** (new `diligent` adapter, Diligent Community portal): 10 meetings with real times from `meetingData`, including Nov 2 and Nov 17. The public agenda is inline HTML in `meetingDocuments` and goes to the shared `extractDocument`; there are no items without a key.
  - **Katy** (BoardDocs `tx/kisd`, committee `AAUJQK4E4D0E`): the new `boarddocs` adapter works on fixtures, but BoardDocs returns 403 to our bot user agent. I did not pose as a browser in the scraper (one survey curl used a browser UA). Not in `sources.yaml`. It isn't "no agendas online", so no reason is recorded. Needs a decision: ask Katy ISD or BoardDocs for access, or leave it.
  - **Parser (`lib/adapters/discover.ts`), all opt-in except two noted defaults:** `date_from: data_file_name`; `embedded_links`; `match_link_text`; dotted dates (`10.19-20.26`) with `date_range: last`; underscore ISO dates; `downloadUrl()` turns Drive `/file/d/<id>/view` into the file download (also unblocks the Drive MUD cluster). Defaults that changed: a "revised/amended/updated" filename now wins over the original on the same date, and a link whose URL says "canceled/cancelled" makes a cancelled meeting (`llmExtract.ts`).
  - **Privacy:** Aldine's folder and Deer Park's page also list grievance and hearing notices with private people's names in their titles. Both configs match on link text so those files are never fetched. Keep those patterns tight.
  - **Plumbing:** `http.ts` gets an optional `form` (POST) for BoardDocs. `AdapterKind` gains `diligent` and `boarddocs` (adapters map, run/scheduled AI sets, sweep order, no results mode, `scripts/scrape.ts` golden folders).
- **Files:** `lib/adapters/{discover,llmExtract,http,diligent,boarddocs}.ts`, `lib/adapters/types.ts`, `lib/ingest/{adapters,run,scheduled}.ts`, `scripts/scrape.ts`, `data/sources.yaml`, `supabase/migrations/20261028230000_diligent_adapter.sql` (new), tests `tests/unit/{finalsite-links,discover-platforms,diligent,boarddocs}.test.ts` (new).
- **Contract changes:** **DB schema (§16):** the migration widens `sources_adapter_check` to allow `diligent` and `boarddocs`. Apply it before ingesting Humble, or the `sources` upsert fails. Not applied (no keys). `AdapterKind` grew, so any `Record<AdapterKind, …>` needs the two keys.
- **Checked:** `npm test`: 99 files, 988 passed. `check-district-batch --batch S1 --batch S2 --batch S3`: 23 pass the file checks, Katy fails ("no source"); database checks skipped. ESLint on the changed files: clean. `npx tsc --noEmit`: my files are clean; there are 6 errors in `lineText()` in `discover.ts` (lines 150–156), the `line_text` option that someone else was adding to that file during this session. Left untouched.
- **Open issues / next:** Katy access decision. With keys: apply the migration, seed, then ingest (the AI pass fills items and times). Aldine's Drive folder and Dayton's page are per-year, so a new ID is needed in January; the 45-day gap check will flag it. Not committed.

### 2026-10-28: District coverage S1–S3: school-board catalog and sources (steps 1, 3, 4 in part)
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:**
  - **Catalog (step 1):** ran the builder for S2 and S3. `data/bodies.districts.yaml` now has all 23 boards; the code map has 24 codes, including `012` (HOUSTON ISD, formerly NFISD) → `hisd_board`. Every HCAD name matched the batch name.
  - **Sources (steps 3–4):** 14 boards added to `data/sources.yaml`, each after `npm run scrape` found an agenda dated within 45 days:
    - BoardBook, org ID confirmed from the org page title: Klein 921, Alief 770, Spring Branch 889, Pasadena 1894, Clear Creek 1940, Galena Park 1860, Sheldon 1876, Goose Creek 1195, La Porte 767, Crosby 1018, New Caney 2256, Waller 737, Stafford 1043. The newest agendas are dated Oct 5 to Nov 2.
    - Tomball: `llm_extract` on its Finalsite page (`-Notice.pdf` links, dates from link text). Found 4 meetings, the newest on Oct 13. Items weren't extracted because there's no AI key on this laptop.
  - **No source yet (not "no agendas online"):**
    - Katy (BoardDocs: no adapter, and fewer than 3 districts use it);
    - Aldine (BoardBook org 1722 has nothing after Aug 2026);
    - Humble, Spring (Apptegy pages);
    - Channelview (Swagit);
    - Deer Park, Huffman, Dayton, Pearland: no platform found.
  - `tests/unit/news-collect.test.ts` now matches its recorded feeds against hand terms only. With Dayton ISD in the catalog, it correctly matched two new Dayton stories, which broke the golden file.
- **Files:** `data/bodies.districts.yaml`, `data/hcad-jurisdiction-map.districts.yaml` (generated), `data/sources.yaml`, `tests/unit/news-collect.test.ts`, `.plans/district-coverage-plan.md` (progress log).
- **Contract changes:** Additive. `TRACKED_BODIES` gains the 13 S2/S3 boards, so the next `seed-bodies --apply` adds them. The 14 new sources join the scheduled ingest on the next deploy, and their pages stop showing "not read yet" once seeded.
- **Checked:** Run on this laptop, Oct 28:
  - `npm test` (vitest): 94 files, 966 tests, all passed.
  - `seed-bodies --check`: 34 bodies. `seed-hcad-jurisdictions --check`: 33 codes.
  - `check-district-batch` for S1–S3: 14 boards and code 012 pass the file checks. The 9 boards above fail on "no source". Database checks were skipped.
  - Not run: typecheck, lint, build.
- **Open issues / next:**
  - **Blocked on `SUPABASE_SERVICE_ROLE_KEY`, which is empty in `.env.local`:** seeding, step 2 (boundaries), ingest dry run and real ingest, and step 5 (live lookups). Step 2 also needs HCAD's School shapefile reprojected to GeoJSON, and no `ogr2ogr` or `mapshaper` is installed here. Step 6 (pages at 390 px) waits on seeding.
  - **No batch is ticked.**
  - BoardBook listings log "listing row not parsed" for cancelled and "Notice" rows, and Galena Park and Waller log "0 items" for some meetings. Both are harmless but noisy.
  - Tomball posts a Special and a Regular notice on the same date, and `llm_extract` keeps only one per date (the Special). The Regular agenda is skipped.
  - The working tree also has someone's uncommitted 0.1/0.5 work (lookup, HCAD packing migration). This entry didn't touch it.

### 2026-10-28: District coverage: database packing and map lookup code (0.1, 0.5)
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:** Phase 0's remaining code, written without Supabase keys. Nothing has been applied, measured or loaded.
  - **0.1 packing:** migration `20261028210000_district_packing.sql` adds the packed HCAD tables (`hcad_code_sets`, `hcad_subdivisions`, `hcad_addresses`, with the address stored as `hashtextextended`), `load_hcad_packed_batch`, `lookup_hcad_packed` (same columns as `lookup_hcad_parcel`), `documents.storage_path`, `items.archive_path`, private buckets `agenda-text` and `item-archive`, `housekeeping_cleanup()` and `storage_sizes()`. It's additive: the old HCAD tables and RPC stay until the packed load checks out, so the route tries packed first and then the old tables. `npm run load:hcad -- --apply` now loads packed rows (`--legacy` for the old tables). `stage:hcad` and the slice workflow take `zips=all` for the whole county. The CSV limit is now 512 MB.
  - Ingest writes document text gzipped to `agenda-text` instead of `documents.raw`. New `lib/ingest/archive.ts` (`ITEM_HOT_MONTHS = 8`) archives items to `item-archive` as stubs and removes text after 24 months. It runs from `/api/cron/housekeeping`, which `.github/workflows/housekeeping.yml` calls daily (Vercel's two cron slots are taken). `loadItem()` in `lib/weekly/data.ts` reads an archived item back in full. `/admin/review` shows the database and Storage sizes, with the 400/800 MB stop lines.
  - **0.5 map lookup:** with a Census match, water districts and ISDs come from `lookup_boundary_near` (inside, or within 50 m, which shows "may be in"). A map ISD replaces the Census school hint. `/results` shows "From the district map, not your tax record. Check your tax bill." `KNOWN_SCHOOLS` became the 25-name table `lib/lookup/schoolDistricts.ts` (moved from `districtCatalog.ts`, which re-exports it). Body IDs keep their old spelling (`goose_creek_consolidated_isd_board`).
- **Files:** the migration; `app/api/lookup/route.ts`, `lib/contracts/lookup.ts`, `lib/lookup/{standIn,schoolDistricts,hcadStaging,hcadSource}.ts`, `scripts/{load-hcad,stage-hcad}.ts`, `.github/workflows/{hcad-slice,housekeeping}.yml`, `lib/ingest/{archive,supabaseArchive,supabaseStore,districtCatalog}.ts`, `app/api/cron/housekeeping/route.ts`, `lib/weekly/data.ts`, `app/admin/review/page.tsx`, `app/(public)/results/page.tsx`, `messages/{en,es}.json`, tests (`tests/unit/archive.test.ts`, `tests/api/lookup-route.test.ts`, `tests/lookup/hcadStaging.test.ts`).
- **Contract changes:** DB schema (tech plan §16): 3 new tables, 2 new columns, 2 buckets and 5 functions. Additive: `LookupBody.map_match?: 'inside' | 'near'`. Ingest must not run on code with this change before the migration is applied (the document insert writes `storage_path` and uploads to the bucket). `lib/database.types.ts` wasn't regenerated (no keys), so the new columns go through an untyped client.
- **Checked:** On this laptop:
  - `npm test`: 966 tests, 963 passed. Failures:
    - `news-collect` golden: `data/bodies.districts.yaml`, `data/hcad-jurisdiction-map.districts.yaml` and `data/sources.yaml` were changed during this session by something else on this laptop (W2 districts added). This change didn't touch them. With them at HEAD, the news tests pass.
    - `news-isolation`: the ESLint test timed out during the full run and passes on its own.
  - Typecheck has no errors outside `scraper P2/tmp/`. ESLint finds 5 errors, all in files this change didn't touch (brief, alerts, weekly, onboarding tour). `npm run build` fails only on `scraper P2/tmp/` type errors (a local scratch folder).
  - Migrations weren't run against Postgres. The SQL is checked only by `tests/platform/migrations.test.ts`.
- **Open issues / next:**
  - **With keys, in order:** measure (plan §2.5), apply the migration, regenerate types, run the whole-county slice and `load:hcad --apply`, check the demo addresses, then a migration that drops `hcad_parcels`/`hcad_jurisdictions`/`lookup_hcad_parcel` (and the route's fallback). Then run the pilot batch checker and record the database size.
  - **For P3:** plan 2.4's first bullet (build template stories at render instead of storing them) and 0.8's "AI stories only for notable items" are in `lib/stories/` and its readers, and weren't changed. The archive stubs clear `story_en`/`story_es`.
  - `housekeeping_cleanup` skips `demo_cache`: it has no expiry column, and it holds the recorded demo.
  - The map fallback needs ISD boundaries in `boundaries`. Today only City, School and College layers plus the MUD/water layers are loaded per batch.

### 2026-10-28: District coverage: scheduler at ~550 sources (0.8)
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:**
  - `lib/ingest/scheduled.ts`:
    - **Near-term sweep:** once the registry has more than 25 sources (`SWEEP_ALL_MAX`), it visits only sources with a stored meeting in the next 72 hours. Today's 7-source registry still sweeps everything, as spec §9 P2-C says.
    - **Rotation by how overdue a source is:** time since last check divided by `config.check_every_hours` (default 24). With equal intervals this is the old oldest-first order.
    - **AI limit:** up to 2 rotation runs per call that read new PDF text. AI checks that find nothing new no longer count, so they keep rotating. Skipped sources stay most overdue and go first next call.
    - **Shards:** `shard: { index, count }` takes a stable FNV-1a slice of the sources.
  - `IngestStore` gains `sourcesWithMeetingsBetween(from, to)` (memory and Supabase stores).
  - `RunReport` gains `pdf_documents`, the new PDF-text documents among `documents`.
  - `/api/cron/ingest` takes `?shard=k&shards=n` (n ≤ 32; not combined with `source`).
  - `.github/workflows/ingest.yml` runs a 6-shard matrix (3 at a time). A manual single-source run goes from shard 0 only. Vercel's daily cron still calls the route with no shard, which runs the full schedule.
- **Files:** Changed: `lib/ingest/scheduled.ts`, `lib/ingest/store.ts`, `lib/ingest/memoryStore.ts`, `lib/ingest/supabaseStore.ts`, `lib/ingest/run.ts`, `app/api/cron/ingest/route.ts`, `.github/workflows/ingest.yml`, `tests/unit/ingest-scheduled.test.ts`, `.plans/district-coverage-plan.md` (progress log).
- **Contract changes:** Additive. `IngestStore.sourcesWithMeetingsBetween` (any other store implementation must add it), `RunReport.pdf_documents`, and the route's `shard`/`shards` query.
- **Checked:** Run on this laptop, Oct 28:
  - New tests with 550 fake sources and 6 shards: the shards cover every source once; the sweep picks only a source with a meeting within 72 hours. Over 8 calls × 6 shards (one day), every source is reached and each call stays within 270 s, with ~1 in 30 AI checks reading a 60-second agenda.
  - `npm test`: 93 files, 955 tests, all passed. Typecheck: no errors outside `scraper P2/tmp/`. ESLint passes on `lib/ingest`, the route and the test.
  - Not run against Vercel or Supabase.
- **Open issues / next:**
  - **For P3:** plan 0.8 also asks that AI stories be written only for items `classify()` marks notable, with template stories for the rest. That's in `lib/stories/job.ts` and wasn't changed.
  - The workflow's header still says to turn it off after Oct 23. It's on `main` but not pushed. The matrix takes effect with the next push, so decide whether the schedule should still run.
  - Six shards is sized for ~550 sources; today most shards hold one source.

### 2026-10-28: District coverage: shared-page checks (0.10)
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:**
  - **News terms by pattern:** new `lib/news/districtTerms.ts` builds "might come up" terms for every tracked water district and school board in the catalog that has no entry in `data/news_terms.yaml`. `loadTerms()` in `lib/news/match.ts` now returns hand terms plus these (`loadTerms(path, false)` gives hand terms only). Water terms always carry the county prefix or the district's own name ("Harris County MUD 165", "HCMUD 165", "Remington MUD 1"), never a bare "MUD 165", which other counties reuse. "Harris County MUD 12" is cancelled when the text names "Northwest Harris County MUD 12". School terms are the short name and the Census name.
  - **Logos, photos, Speak up:** no code change needed. Rollout bodies get the icon tile, the kind photo (the bayou for water districts, the bus stop for schools) and Speak up's existing "We haven't verified a registration recipe… don't rely on another district's rules" path with the body's own link. New test `tests/unit/district-shared-pages.test.ts` checks all three over the catalog plus every W batch's generated body.
- **Files:** New: `lib/news/districtTerms.ts`, `tests/unit/news-district-terms.test.ts`, `tests/unit/district-shared-pages.test.ts`. Changed: `lib/news/match.ts`, `.plans/district-coverage-plan.md` (progress log).
- **Contract changes:** `loadTerms()` now includes catalog bodies (additive; it reads the body catalog). `lib/news` imports `lib/ingest/catalog` and `districtCatalog`; the import rule only stops the reverse direction.
- **Checked:** Run on this laptop, Oct 28: `npm test` 93 files, 951 tests, all passed; typecheck has no errors outside `scraper P2/tmp/`; ESLint passes on `lib/news`, `lib/ingest` and the new tests.
- **Open issues / next:**
  - For a water district with no checked site, Speak up's "Open the body's website" button opens the Comptroller's search, which isn't the district's own site. The label could say so; that's P4's screen, so it isn't changed here.
  - Phase 0 work that needs no database is done. Next: 0.8 (scheduler at ~550 sources), and 0.1, 0.5 and the pilot's live checks once Supabase keys are on this laptop.

### 2026-10-28: District coverage: site survey (0.7)
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:** `npx tsx scripts/survey-district-sites.ts --batch <id|pilot>` (pure logic in `lib/ingest/siteSurvey.ts`). For each district it finds a site, in this order: `data/district-sites.yaml`, an existing source's `index_url`, the website the district reported to the Comptroller (open-data API `api.comptroller.texas.gov/open-data/v1/spdpid`, labeled self-reported), then common domains (`hcmud165.com`), accepted only if the page names that district's kind and number. It fetches up to 12 pages, two levels deep, names the board platform or site builder, and suggests an `llm_extract` config by trying patterns with the adapter's own `parseIndex`. The newest agenda wins over a longer archive. It writes `tmp/survey/<batch>.md` and `.json` only, never `sources.yaml`. Bodies already on a platform adapter are skipped.
- **Files:** New: `lib/ingest/siteSurvey.ts`, `scripts/survey-district-sites.ts`, `tests/unit/site-survey.test.ts`. Changed: `.plans/district-coverage-plan.md` (progress log).
- **Contract changes:** None.
- **Checked:** Run on this laptop, Oct 28:
  - Pilot: finds MUD 489's index page (9 dated, newest Oct 19); CFISD and HISD shown as on their adapters.
  - W1: a config for 7 of 10 (MUD 165, WCID 159, FWSD 61, WCID 145, MUD 419, MUD 105, plus Remington's site with no dated links). No site found for WCID 157, WCID 155 and NW HC MUD 12.
  - S1: BoardBook found for Pasadena (org 1894) and Clear Creek (org 1940); Tomball and Katy gave PDF lists. The other school sites are script-built and gave nothing.
  - `npm test`: 91 files, 942 tests, all passed. Typecheck: no errors outside `scraper P2/tmp/`. ESLint passes on the new files.
- **Open issues / next:**
  - **Google Drive vendor cluster** (MUD 165, WCID 145, Remington; WordPress pages, dates in link text): `llm_extract` fetches the Drive `/view` page, not the PDF. A vendor template must turn `/file/d/<id>/view` into a download link before these can be sources.
  - WCID 159's suggestion points at a single notice post; its `/board-meetings/` index lists posts, so it likely needs `follow_notice_page`. Every suggestion still needs a person and a `npm run scrape` before `sources.yaml`.
  - The Comptroller's website field is blank for many districts, MUD 489 included.
  - **Next:** 0.10 shared-page fallbacks.

### 2026-10-28: District coverage: batch checker (0.9) and water-district boundary loader (0.4)
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:**
  - **0.9 batch checker:** `npx tsx scripts/check-district-batch.ts --batch <id|pilot>` (pure logic in `lib/ingest/batchCheck.ts`). For each district it checks: in the catalog, HCAD code mapped to it, and a source in `data/sources.yaml` or a recorded `no_agendas_online` reason in `data/district-sites.yaml`. With Supabase keys it also checks the `bodies` row, `jurisdiction_map` and a boundary, and lists polygons for bodies not in the catalog. Without keys those print "skip". It exits non-zero on any failure. Steps 5–6 (a real address, pages at 390 px) stay manual.
  - **0.4 boundary loader:** `data/boundary-sources.yaml` adds `hc-water-districts` (the county's `Permits/MUDandWaterDistricts_HCAD` MapServer, field `code`, fetch command in the comment). `scripts/load-boundaries.ts` accepts layers `HCAD_MUD` and `HCAD_Water_Districts` and a `--batch <id|pilot>` option that limits the load to that batch's bodies. The water layers require `--batch`. The RPC only replaces polygons for the IDs it's given, so earlier batches' polygons stay. `lib/lookup/boundaryStaging.ts` maps both layers to body type `mud`.
- **Files:** New: `lib/ingest/batchCheck.ts`, `scripts/check-district-batch.ts`, `tests/unit/batch-check.test.ts`. Changed: `lib/lookup/boundaryStaging.ts`, `scripts/load-boundaries.ts`, `data/boundary-sources.yaml`, `data/district-sites.yaml` (comment only), `tests/lookup/boundaryStaging.test.ts`, `.plans/district-coverage-plan.md` (progress log).
- **Contract changes:** None. `stageHcadBoundaries()` takes a wider layer type (additive).
- **Checked:** Run on this laptop, Oct 28:
  - Fetched both county layers to `tmp/scratch/hcad/` (452 + 47 features, no transfer limit hit). Every polygon passes staging validation.
  - `load:boundaries --layer HCAD_MUD --batch pilot` dry run: 1 body (MUD 489 from code 189), 1 polygon, 451 unmapped.
  - `check-district-batch --batch pilot --batch S1`: pilot passes the file checks; all 10 S1 boards fail on "no source", as expected.
  - `npm test`: 90 files, 935 tests, all passed. Typecheck: no errors outside `scraper P2/tmp/`. ESLint passes on the changed files.
  - Nothing applied to the database (no service-role key in `.env.local`).
- **Open issues / next:**
  - "No unexpected overlaps" (§4 step 2) isn't checked yet; it needs a PostGIS query once keys are here.
  - The county service shows no edit date, so `release_updated` is the fetch date.
  - **Next:** 0.7 site survey, 0.10 shared-page fallbacks. 0.1, 0.5, the pilot's live checks and S1's seeding need Supabase keys.

### 2026-10-28: District coverage: catalog builder (0.2) and S1's catalog
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:**
  - **0.2 catalog builder:** `scripts/build-district-catalog.ts --batch <id> [--check]` reads the batch list, `data/hcad-jurisdictions.json` and the new hand-checked `data/district-sites.yaml`. It writes the generated `data/bodies.districts.yaml` and `data/hcad-jurisdiction-map.districts.yaml`, keeping earlier batches' rows. It refuses X batches (reconcile by hand first), and it prints each HCAD/layer name pair that differs, for the hand check.
    - IDs come from names, never codes: `hcmud_<n>`, `hcwcid_<n>`, `nwhcmud_<n>`, `whcmud_<n>`, `fbcmud_<n>`, and slugs for named districts (`remington_mud_1`). School IDs use the stand-in lookup's rule (new `schoolBoardId()` in `lib/lookup/standIn.ts`), so Stafford is `stafford_municipal_school_district_board` and Goose Creek is `goose_creek_consolidated_isd_board`.
    - Water districts without a checked site link the Comptroller's special-district search. A school board must have a checked site, or the build fails.
    - Board selection is written as "not loaded" until a source is checked (plan §4.1).
  - **Shared code map:** `lib/ingest/catalog.ts` gains `loadJurisdictionMap()` (hand map plus generated map, no repeated codes). `seed-hcad-jurisdictions`, `load-hcad` and `load-boundaries` use it, and `load-boundaries` now takes body types from the whole catalog.
  - **S1, step 1 only:** the 10 S1 school boards are in the generated files (codes 008, 009, 017, 018, 019, 021, 024, 025, 026, 027). There's no boundary, source or seeding yet, so the batch isn't ticked.
- **Files:** New: `scripts/build-district-catalog.ts`, `lib/ingest/districtCatalog.ts`, `data/district-sites.yaml`, `data/bodies.districts.yaml`, `data/hcad-jurisdiction-map.districts.yaml`, `tests/unit/district-catalog.test.ts`. Changed: `lib/ingest/catalog.ts`, `lib/lookup/standIn.ts`, `scripts/{seed-hcad-jurisdictions,load-hcad,load-boundaries}.ts`, `.plans/district-coverage-plan.md` (progress log).
- **Contract changes:** Additive. `TRACKED_BODIES` now includes the 10 S1 boards, so the next `seed-bodies --apply` and ingest seeding add them. Their pages show "agendas not read yet" until sources exist. The HCAD code map is now two files.
- **Checked:** Run on this laptop, Oct 28:
  - The 23 ISD websites: each one fetched, and its page title names the district.
  - A dry run of every S and W batch: 520 bodies and 521 codes, with no failures.
  - `seed-bodies --check`: 21 bodies. `seed-hcad-jurisdictions --check`: 19 codes.
  - `npm test`: 927 of 928 passed. The failure was `news-isolation`, which timed out after 133 s under the full run's load (it runs ESLint). Run alone, it passes.
  - Typecheck: no errors outside `scraper P2/tmp/`. ESLint passes on the changed files.
  - Nothing checked against the live database (no keys).
- **Open issues / next:**
  - **Lago Bello (W51, code 011): resolved.** The county layer misspells it "LAGO BELLA". H.B. 2687 (85th Leg., 2017), TCEQ permit WQ0015903001 and HCAD's list all say Bello. `LAYER_NAME_FIXES` in `lib/ingest/districtCatalog.ts` corrects it, giving the ID `lago_bello_mud_1a`, and a test covers it.
  - **Name differences to hand-check when their batch comes up:** spelling only (W16, W17, W19, W20, W27, W28, W30, W35, W36, W41, W42, W45, W49, W52, W53).
  - W48 has one county polygon with no code or name. The builder skips it.
  - **Next:** 0.9 batch checker, 0.4 boundary loader, 0.7 site survey. 0.1, 0.5 and the pilot still need Supabase keys.

### 2026-10-28: District coverage Phase 0: one body list and "agendas not read yet"
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:** Phase 0 steps 0.3 and 0.6 of `.plans/district-coverage-plan.md`. Neither needs the database.
  - **0.3, one body list:**
    - New `lib/ingest/catalog.ts` loads and checks `data/bodies.yaml` plus the generated `data/bodies.districts.yaml`. The district file is optional until 0.2 writes it.
    - The loader checks for repeated IDs and that every `tax_set_by_body_id` resolves.
    - `lib/ingest/bodies.ts` no longer hard-codes 10 bodies: `TRACKED_BODIES` is now the catalog's tracked quiz-type rows.
    - `scripts/seed-bodies.ts` uses the same loader.
    - `next.config.ts` ships both YAML files with `/api/cron/ingest`.
  - **0.6, "We don't read this board's agendas yet":**
    - New `lib/ingest/coverage.ts` marks a body covered when a `sources` row names it, directly or through `section_body_map`.
    - `/api/bodies` returns `agenda_coverage`.
    - `/bodies/[id]` shows the notice with a link to the board's official meeting notices (English and Spanish messages).
    - The `/app/districts` list shows "Agendas: Not read yet".
    - `/app/districts/[id]` shows the notice under "Coming up and recently decided".
- **Files:**
  - New: `lib/ingest/catalog.ts`, `lib/ingest/coverage.ts`
  - Changed: `lib/ingest/bodies.ts`, `scripts/seed-bodies.ts`, `next.config.ts`, `app/api/bodies/route.ts`, `components/flow/BodyDetailClient.tsx`, `messages/en.json`, `messages/es.json`, `lib/weekly/data.ts`, `lib/prototype/types.ts`, `lib/prototype/live.ts`, `app/(prototype)/app/districts/page.tsx`, `app/(prototype)/app/districts/[id]/page.tsx`, `tests/unit/ingest-bodies.test.ts`
- **Contract changes:** Additive only; nothing removed.
  - `WeeklyBody` in P3's `lib/weekly/data.ts` gains optional `agendas_read` and `meeting_info_url`. `resolveBodies()` now also reads the `sources` table.
  - The prototype `Body` type gains optional `agendasRead`.
  - Live bodies with no hand-written description now use `meeting_info_url` as their `website`.
  - `/api/bodies` gains `agenda_coverage`.
  - Screens wired to real data: `/app/districts` and `/app/districts/[id]`. Both show the coverage notice, from the `sources` table.
- **Checked:** Run on this laptop, Oct 28:
  - `npm test`: 88 files, 901 tests, all passed.
  - `npm run typecheck`: passed, except 7 errors in the git-ignored local folder `scraper P2/tmp/`, which this work doesn't touch.
  - ESLint on the changed files: passed.
  - `npx tsx scripts/seed-bodies.ts --check`: validated 11 bodies.
  - **Not checked:**
    - the pages in a browser, at 390 px or by keyboard;
    - live data, because there are no Supabase keys on this laptop.
  - The notice shows only with real data: sample mode leaves `agendas_read` unset.
- **Open issues / next:**
  - **Next steps that don't need the database:**
    - 0.2: catalog builder;
    - 0.4: boundary loader;
    - 0.7: site survey;
    - 0.9: batch checker;
    - 0.10: shared-page fallbacks.
  - 0.1, 0.5 and the pilot need Supabase keys.
  - **One notice covers two cases:** "not built yet" and "no agendas online". Telling them apart would need a new field, and the plan says this state comes from `sources` with no schema change.

### 2026-10-28: Stress test answers: Iarush (P2)
- **Who:** Iarush · P2 Agenda Data
- **Dropped:** asked Oct 27–28.
  - Dates passed: Q2, Q3, Q5, Q6, Q10, Q13, Q17, Q18, Q19, Q20, Q21.
  - Already settled: Q8 and Q9. Since Oct 20 the prototype UI is the app's UI.
- **Answers:**
  - Q1: P2.
  - Q4: yes. The district rollout must never break the two demo addresses.
  - Q7: yes.
  - Q11: yes. No problem with the spec's D17 running through OpenRouter.
  - Q12: yes.
  - Q14: yes.
  - Q15: yes.
  - Q16: yes, no problem. The rollout reuses BoardBook and Legistar, with one AI extraction template per website vendor.
- **Differs from the owner:**
  - Q1 only: P2, where the owner is P5.
  - Q16 follows the spec, which replaced the owner's earlier answer.

### 2026-10-27: Plan for every MUD and school district in Harris County
- **Who:** Iarush · P2 Agenda Data
- **Branch:** main
- **What changed:** Added a plan, `.plans/district-coverage-plan.md`, for covering all 23 remaining school districts and 498 water districts (MUD, UD, WCID, FWSD and others), plus 60 HCAD codes to reconcile, at full depth: lookup, body page, agendas, stories and alerts. Iarush builds it in phases of up to 10 districts:
  - Phase 0: groundwork;
  - S1–S3: school boards;
  - W1–W55: water districts, region by region, Cy-Fair first;
  - X1–X6: HCAD codes with no county boundary.
  - The batch lists, with checkboxes, are in `.plans/district-rollout-batches.md`.
  - Nothing is built yet.
- **Files:** `.plans/district-coverage-plan.md`, `.plans/district-rollout-batches.md` (both new)
- **Contract changes:** None yet. Phase 0 plans DB schema changes so everything fits the free plan (no paid Supabase, per Iarush):
  - **HCAD tables:** `hcad_parcels` and `hcad_jurisdictions` replaced by `hcad_addresses` (address hash → code-set ID), `hcad_code_sets` and `hcad_subdivisions`. Estimated ~100 MB for the whole county, versus ~400 MB now for 30 ZIPs.
  - **Raw text:** `documents.raw` moves to a private Storage bucket.
  - **Items:** archived to Storage after 8 months, leaving stubs.
  - **Stories:** template stories built on display, not stored.
  - Also a new lookup RPC and scheduler sharding.
  - Plan-file changes are listed as team proposals (§7).
- **Checked:** Live, Oct 27:
  - Harris County's `Permits/MUDandWaterDistricts_HCAD` MapServer has 452 MUD and 47 water-district polygons keyed by HCAD code.
  - Code `189` is MUD 489, matching our map. HCAD codes aren't MUD numbers: code `489` is MUD 189.
  - Regions come from Census TIGERweb school districts (center of each district's largest piece).
  - No app code or tests run.
- **Open issues / next:**
  - Phase 0, starting with measuring the database. Iarush's `.env.local` (Oct 19) has no Supabase keys, so table sizes couldn't be read this session. Get current values from PlaidMod, or run the size query in plan §2.5 in the SQL editor. The ~400 MB HCAD figure is an estimate from the Oct 21 handoff numbers.
  - Plan stress test: done Oct 28 (see "Stress test answers: Iarush (P2)").

### 2026-10-24: Pages no longer wait for the AI weekly summary
- **Who:** PlaidMod · P5 Platform
- **Branch:** main
- **What changed:**
  - Measured live before the change, after a lookup for 901 Bagby St 77002: `/app` and `/app/brief` took about 9 s to load (5 s to the first byte), `/weekly` about 16 s. The cause was the AI "This week, in short": every `/app` page waited up to 8 s for it, and `/weekly` waited with no limit (up to 15 s). A repeat visit still took about 1.5 s, mostly loading ~760 items.
  - No page waits for the AI summary now. `/app` and `/weekly` render at once with the headline sentences or fact lines, then fetch the summary from the new `GET /api/weekly/summary?t=&lang=` (no `t` means the remembered lookup cookie) and swap it in when it arrives (`components/weekly/useWeeklySummary.ts`, `components/weekly/WeeklyNarrative.tsx`). The answer is `{ points }` or `{ points: null }`, never cached for other readers.
  - The summary is kept in Next's shared cache (`unstable_cache`, 6 hours, `lib/weekly/narrativeCache.ts`), so any server can reuse it, and each server makes one AI call per summary at a time. Failed summaries aren't cached. The model now gets 45 s instead of 15 s: Spanish summaries often ran past 15 s and were dropped.
  - A reader's governments and items are kept in each server's memory for 5 minutes (`lib/weekly/readerItems.ts`, up to 20 readers), and `loadItems` takes `storyLang` to load only the language being shown.
  - `LiveData.weekly.summary` and `toLiveData`'s `summary` argument are gone; `loadLiveData` no longer touches the AI.
- **Files:** `lib/prototype/liveData.ts`, `lib/prototype/live.ts`, `lib/weekly/{data,narrative,narrativeCache,readerItems}.ts`, `app/api/weekly/summary/route.ts` (new), `components/weekly/{useWeeklySummary.ts,WeeklyNarrative.tsx}` (new), `app/(prototype)/app/page.tsx`, `app/(public)/weekly/page.tsx`, tests (`tests/prototype/{liveData,home}.test.ts`, `tests/weekly/{narrative,narrativeCache}.test.ts`, `tests/api/weekly-summary-route.test.ts`), `DESIGN.md` §8
- **Contract changes:** `loadItems` has a new optional `storyLang` (P3's file; without it nothing changes). New route `/api/weekly/summary`.
- **Checked:** The new tests failed first, then passed. `npm test` (897 Vitest + 72 P4), typecheck and build pass; lint passes on the changed files. In a local production build (database reached from a laptop, so slower than Vercel): `/app` loads in 2.2 s on a first visit and 0.14 s on the next; `/weekly` in 1.0 s; the English AI summary appears about 18 s after a first visit and at once after that; the Spanish one now arrives (about 20 s) instead of being dropped. A first try streamed the summary with Suspense, but the browser kept loading until it arrived, so it was replaced by the fetch.
- **Open issues / next:** Live timings after deploy are in the next entry or the push notes. Lint still flags teammates' code: two setState-in-effect calls in `app-onboarding-tour.tsx`, an unused `shortBody` in `app/(prototype)/app/brief/page.tsx`, and unused `index` arguments in `app/(public)/weekly/page.tsx` and `app/(public)/alerts/page.tsx`.

### 2026-10-24: One onboarding walkthrough, starting on the dashboard
- **Who:** PlaidMod · P5 Platform
- **Branch:** main
- **What changed:** There were two walkthroughs. The "Get started · Your governments" card on the results page did nothing on its own: it only pointed at the "Open your dashboard" button under it, and pressing Back mid-tour left it on the results page as "Step 3 of 7" with nothing highlighted. It's removed. The walkthrough is now the dashboard's 7 steps, started by the results page's "Open your dashboard" link (`/app/use?…&onboarding=1&step=1`). Steps are numbered 1–7 inside `app-onboarding-tour.tsx`; the `governments`, `clickDashboard` and `startLabel` messages and the `governmentCTA` attribute are gone.
- **Files:** `components/prototype/app-onboarding-tour.tsx`, `app/(public)/results/page.tsx`, `messages/*.json`, `tests/platform/onboardingTour.test.ts` (new)
- **Contract changes:** None.
- **Checked:** The new test failed first, then passed. `npm test` (878 Vitest + 72 P4), typecheck and build pass. In a local production build with 901 Bagby St 77002: no tour card on the results page; "Open your dashboard" opens Step 1 of 7; Next moves through all 7 pages with the spotlight on each; Done on step 7 closes it; no page errors.
- **Open issues / next:** `npm run lint` still flags two setState-in-effect calls in `app-onboarding-tour.tsx` (lines 46 and 68) and the unused `shortBody` in `app/(prototype)/app/brief/page.tsx`. The spotlight still logs "negative height" SVG errors when its target scrolls off screen. `/start` (the older 4-step setup) is unlinked and still uses the demo lookup.

### 2026-10-24: Standardize arrows on linked government cards
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Replaced the straight right arrows on linked government cards with the shared ArrowCircle treatment, matching the rest of the app: angled by default and straight right on hover.
- **Files:** `app/(public)/results/page.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `PATH=/opt/homebrew/bin:$PATH npm run typecheck` and `git diff --check` passed.
- **Open issues / next:** Browser behavior not manually checked.

### 2026-10-24: Finish onboarding on the current app page
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** The final onboarding action now closes the guide without navigating away from the last app section. It is labeled Done, correcting the earlier behavior that redirected to the landing page.
- **Files:** `components/prototype/app-onboarding-tour.tsx`, `messages/*.json`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `PATH=/opt/homebrew/bin:$PATH npm run typecheck`, English/Spanish JSON parsing, and `git diff --check` passed.
- **Open issues / next:** Browser behavior not manually checked.

### 2026-10-24: Match the dashboard action arrow to app cards
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Reused the app’s ArrowCircle treatment on the Open your dashboard button. It points diagonally by default and rotates to point right when the button is hovered.
- **Files:** `app/(public)/results/page.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `PATH=/opt/homebrew/bin:$PATH npm run typecheck` and `git diff --check` passed.
- **Open issues / next:** Browser behavior not manually checked.

### 2026-10-24: Count only the seven app walkthrough stops
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** The Governments screen is now an unnumbered “Get started” prompt. The dashboard starts the actual walkthrough at Step 1 of 7, and the progress controls show only the seven app sections.
- **Files:** `components/prototype/app-onboarding-tour.tsx`, `messages/*.json`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `PATH=/opt/homebrew/bin:$PATH npm run typecheck`, English/Spanish JSON parsing, and `git diff --check` passed; browser check and tests not run.
- **Open issues / next:** Browser behavior and visual fit remain unverified.

### 2026-10-24: Keep the onboarding target sharp and simplify government actions
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Removed the backdrop blur from the walkthrough overlay so the highlighted control stays sharp. Replaced the separate news, alerts, and tax quick-action buttons on government results with one prominent Open your dashboard button and right arrow.
- **Files:** `components/prototype/app-onboarding-tour.tsx`, `app/(public)/results/page.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `PATH=/opt/homebrew/bin:$PATH npm run typecheck`, English/Spanish JSON parsing, and `git diff --check` passed; browser check and tests not run.
- **Open issues / next:** Browser behavior and visual fit remain unverified.

### 2026-10-24: Start the tab walkthrough from Your governments
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** The persistent walkthrough now starts on completed `/results`, highlights the actual Open your dashboard button, and tells the user “Click Open your dashboard to continue.” Following it opens the dashboard and continues through all seven app sections; `/start` no longer launches this walkthrough, the progress controls remain mounted across routes, and the last Next returns to the normal homepage.
- **Files:** `components/prototype/app-onboarding-tour.tsx`, `app/layout.tsx`, `components/prototype/app-shell.tsx`, `app/(public)/results/page.tsx`, `app/(prototype)/app/use/route.ts`, `app/(prototype)/start/onboarding.tsx`, `messages/*.json`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `PATH=/opt/homebrew/bin:$PATH npm run typecheck`, English/Spanish JSON parsing, and `git diff --check` passed; browser check and tests not run.
- **Open issues / next:** Browser behavior and visual fit remain unverified.

### 2026-10-24: Keep the app tour inside onboarding
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Removed the guide from public results pages. Completing `/start` or choosing Open your dashboard from lookup results launches a seven-stop guide in the persistent app shell for Home, Timeline, Brief, Districts, Speak, Vote, and Alerts; its progress tabs remain visible across routes, and the last Next returns to `/app`.
- **Files:** `components/prototype/app-onboarding-tour.tsx`, `components/prototype/app-shell.tsx`, `app/(prototype)/start/onboarding.tsx`, `app/(prototype)/app/use/route.ts`, `app/(public)/results/page.tsx`, app tab pages, `app/layout.tsx`, `messages/*.json`
- **Contract changes:** None.
- **Checked:** `PATH=/opt/homebrew/bin:$PATH npm run typecheck`, English/Spanish JSON parsing, and `git diff --check` passed; browser check and tests not run.
- **Open issues / next:** Browser behavior and visual fit remain unverified.

### 2026-10-23: Final deploys before submission
- **Who:** PlaidMod · P5 Platform
- **Branch:** main
- **What changed:** No code. Vercel blocks deploys of teammates' commits (private repo), so PlaidMod deployed them by hand tonight with `vercel deploy --prod` from `git archive` copies: 4fcf955, 7c85471 and 2127d88. This push deploys the rest, through b976e55 ("Keep onboarding progress across guided pages").
- **Files:** `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** On 2127d88: `npm test` (875 Vitest + 72 P4) and typecheck pass; Vercel's build passed and the main pages returned 200 live. `npm run lint` has two errors in teammates' code: an unused `shortBody` and a setState-in-effect in `ResultsOnboarding.tsx`.
- **Open issues / next:** `lib/prototype/liveData.ts` still waits up to 8s for the AI weekly summary on a cold cache, so the first `/app` load after a lookup can be slow. The landing-page findings in my earlier entry may be out of date after the new header and footer; they weren't rechecked.

### 2026-10-23: Tighten the results onboarding spotlight
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** The spotlight follows each target's measured radius. The persistent tour now has nine stops across the dashboard overview, weekly summary and upcoming items, alert signup and rules, and tax input and estimate. Progress stays visible across routes; the final Next returns to the landing page. English and Spanish copy covers each stop.
- **Files:** `components/home/ResultsOnboarding.tsx`, `app/layout.tsx`, `app/(public)/results/page.tsx`, `app/(prototype)/app/page.tsx`, `app/(public)/weekly/page.tsx`, `app/(public)/alerts/page.tsx`, `app/(public)/page.tsx`, `components/weekly/NewsChrome.tsx`, `components/flow/TaxReceiptClient.tsx`, `messages/en.json`, `messages/es.json`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `PATH=/opt/homebrew/bin:$PATH npm run typecheck` and `git diff --check` passed; browser check and tests not run.
- **Open issues / next:** Browser behavior and visual fit remain unverified.

### 2026-10-23: The week in short moves onto the dashboard as a few sentences
- **Who:** PlaidMod · P5 Platform
- **Branch:** main
- **What changed:**
  - The dashboard home now opens with "This week, in short" under the greeting, in place of the status line and the link to `/app/tldr`. It's a short paragraph, not a list: "Just decided:" and "Coming up:" followed by up to three headlines in all (at most two decisions), each upcoming one with its day, then when sign-up to speak closes for the soonest one shown. Each headline opens its story sheet, which links to the official source.
  - It uses the items' own headlines and writes no new text. Template "Outcome not posted yet" headlines are skipped. The AI label shows when any headline was written with AI. With nothing to show it says "Nothing new from your local governments this week."
  - `/app/tldr` now forwards to `/app`, and "Week in short" left the sidebar. The page-only helpers (`tldrLine`, `readMinutes`, `tldrFootnote`) and their `AppTldr` messages are gone.
  - Deploy: Vercel blocked the automatic and CLI deploys of Marie Gary Blueberry's commits through 4fcf955 (private repo; a CLI deploy that carries the teammate's commit is blocked too). PlaidMod deployed 4fcf955 with `vercel deploy --prod` from a `git archive` copy. CLAUDE.md now says so.
  - Restored my "Accessibility fixes" entry below, which a merge had shortened to one line.
- **Files:** `app/(prototype)/app/page.tsx`, `app/(prototype)/app/tldr/page.tsx` (redirect), `lib/prototype/tldr.ts` (`tldrPick`, `asSentence`), `components/prototype/app-shell.tsx`, `messages/*.json`, `tests/prototype/{home,tldr,tldrRedirect}.test.ts` (`tldrPage.test.ts` removed), `DESIGN.md` §8, `CLAUDE.md`
- **Contract changes:** None.
- **Checked:** The new tests failed first, then passed. `npm test` (875 Vitest + 72 P4), typecheck and build pass; lint fails only on `app-tour.tsx:44` (above). In a local production build with real data for 901 Bagby St 77002, English at 1280px and Spanish at 390px: three AI headlines (two decided, one coming up) flow as one paragraph with the AI label; Enter on a headline opens its story sheet; `/app/tldr` lands on `/app`; no sideways scroll. The first real-data check showed template headlines ("Vote Oct. 27: ORDINANCE…"), so AI headlines now come first.
- **Open issues / next:** On the live landing page after 4fcf955 (measured in the browser): the transparent footer's About, Privacy and Terms links are about 1.1:1 against the grass at 1280px, well under 4.5:1; at 390px the "Your neighborhood, decoded" eyebrow sits under the header, and the last stack card's text ("And ones you've never heard of") is cut off. The landing photo is a 2.5 MB PNG, and `courthouse-hero.png`, `courthouse-hero-v2.png` and `calm-sea-hero.jpg` are unused. `npm run lint` fails on `components/prototype/app-tour.tsx:44` (setState in an effect). The dashboard home's other text is still English only.
### 2026-10-23: Start the guide on the address results screen
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Added the four-step guide to the actual `/results` flow, spotlighting its dashboard, weekly news, alerts, and property tax actions with progress tabs, Skip, Next, and Done. Added English and Spanish copy; the guide starts automatically whenever a completed lookup opens results, and closing it dismisses it only for that visit.
- **Files:** `app/(public)/results/page.tsx`, `components/home/ResultsOnboarding.tsx`, `messages/*.json`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed; browser check and tests not run.
- **Open issues / next:** `/start` remains a separate prototype route and is not used by the public address lookup flow.

### 2026-10-23: Tighten vertical spacing on address page
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Reduced the address page's top and bottom padding, the gap after its back link, the column gap, and the vertical padding around the government preview.
- **Files:** `app/(public)/address/page.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed; browser check and tests not run.
- **Open issues / next:** None.

### 2026-10-23: Give countdown units more breathing room
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Removed tight letter spacing from the Timeline deadline countdown and added consistent space around each time unit so the numbers and labels read separately.
- **Files:** `app/(prototype)/app/timeline/page.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed; browser check and tests not run.
- **Open issues / next:** None.

### 2026-10-23: Fix landing page phone layout
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Put the landing header back in normal flow on phones so it cannot cover the hero eyebrow. Reduced the mobile preview staircase increments so all six cards remain visible, and updated the final label to “And ones you've never seen before...”
- **Files:** `app/globals.css`, `components/home/GovernmentStack.tsx`, `messages/en.json`, `messages/es.json`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed; browser check and tests not run.
- **Open issues / next:** None.

### 2026-10-23: Guide users through setup in smaller onboarding steps
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Reworked `/start` into four focused steps, moving age and optional name to their own screen, with bottom progress tabs, Skip, and Done. Removed the separate tour that started after onboarding; finishing now opens the dashboard directly.
- **Files:** `app/(prototype)/start/onboarding.tsx`, `components/prototype/app-shell.tsx`, `components/prototype/app-tour.tsx`, `messages/*.json`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `npx tsc --noEmit`, English/Spanish JSON parsing, and `git diff --check` passed; browser check and tests not run.
- **Open issues / next:** None.

### 2026-10-23: Make profile and sign-out easy to find
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Made the top-right profile menu visually explicit with a labeled trigger and dropdown chevron. Moved sign-out near the top of the menu and made it available for guest and signed-in sessions.
- **Files:** `components/prototype/app-shell.tsx`, `messages/en.json`, `messages/es.json`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed; tests not run.
- **Open issues / next:** None.

### 2026-10-23: Vertically center the footer content
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Grouped the footer note with the main message and centered the text group and navigation vertically in a shared footer row; the note no longer sits on a separate lower row.
- **Files:** `components/shell/SiteFooter.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed; browser visual check not run.
- **Open issues / next:** None.

### 2026-10-23: Restore the landing footer cream background
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Restored the landing footer's previous cream fill at the teammate's request, while keeping the stronger hero image treatment and removing the hard fade overlay.
- **Files:** `app/globals.css`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed; browser visual check not run.
- **Open issues / next:** None.

### 2026-10-23: Remove landing footer background band
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Removed the hero's cream fade overlay that created a distinct horizontal grass bar and made the landing footer transparent so the courthouse background continues behind it. Reduced the cream wash over the hero to make the image more visible.
- **Files:** `app/(public)/page.tsx`, `app/globals.css`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed; visual browser check not run.
- **Open issues / next:** None.

### 2026-10-23: Add a four-step app tour after onboarding
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Limited the weekly brief's lead grid to four cards and clamped their headlines to two lines. Kept the existing onboarding, then added an English/Spanish spotlight tour through Home, Weekly brief, Timeline, and Speak up, with bottom progress tabs, Skip, and a final Done action.
- **Files:** `app/(prototype)/app/brief/page.tsx`, `app/(prototype)/app/page.tsx`, `app/(prototype)/app/timeline/page.tsx`, `app/(prototype)/app/speak/speak.tsx`, `app/(prototype)/start/onboarding.tsx`, `components/prototype/app-shell.tsx`, `components/prototype/app-tour.tsx`, `messages/*.json`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `npx tsc --noEmit`, message JSON parsing, and `git diff --check` passed. Browser visual check not run because Chrome access was not approved.
- **Open issues / next:** None.

### 2026-10-23: Enlarge weekly news article cards
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Widened the weekly brief content area, increased the article tile minimum heights, and modestly enlarged headline type so cards read more clearly.
- **Files:** `app/(prototype)/app/brief/page.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed. Browser visual check not run.
- **Open issues / next:** None.

### 2026-10-23: Widen the address page headline
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Removed the narrow 14-character headline cap so the address page title can use its full content column and wrap into two lines on desktop.
- **Files:** `app/(public)/address/page.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed. Browser visual check not run.
- **Open issues / next:** None.

### 2026-10-23: Fade the grass band into the landing footer
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Restored the footer's left/right layout with vertical alignment, and added a fade from the background image into the footer cream to soften the visible grass band at the bottom of the hero.
- **Files:** `components/shell/SiteFooter.tsx`, `app/globals.css`, `app/(public)/page.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `npx tsc --noEmit` and `git diff --check` passed.
- **Open issues / next:** None.

### 2026-10-23: Center the landing footer content
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Centered the tagline and footer links as one compact group and centered the student-project line beneath them.
- **Files:** `components/shell/SiteFooter.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `npx tsc --noEmit` and `git diff --check` passed.
- **Open issues / next:** None.

### 2026-10-23: Smooth the courthouse lawn and footer edge
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Replaced the landing background with a version whose left lawn transition is less stripe-like, and removed the footer's top border that emphasized the image boundary.
- **Files:** `public/photos/courthouse-hero-v4.png`, `app/globals.css`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `npx tsc --noEmit` and `git diff --check` passed. Browser visual check not run.
- **Open issues / next:** None.

### 2026-10-23: Accessibility fixes from a web interface guidelines review
- **Who:** PlaidMod · P5 Platform
- **Branch:** main
- **What changed:** Fixed the top findings from a review of `/app/tldr`, the dashboard home and the app shell:
  - On `/app/tldr`, the Spanish sign-up chip ran 54px past its card at 320px and made the page scroll sideways. It now wraps.
  - Two text pairs were below 4.5:1. "Your next step" on red measured 4.31:1 and is now 5.85:1. The sidebar's "Menu" and "General" labels measured 3.14:1 and are now 6.05:1; the `/70` fading is gone.
  - The two sidebar `<nav>`s are now named "Menu" and "General".
  - The Timeline link's urgent badge now reads as "2 urgent" to screen readers (new `AppShell.nav.urgentCount`).
  - The home status line says "1 thing", not "1 things".
- **Files:** `app/(prototype)/app/tldr/page.tsx`, `components/prototype/app-shell.tsx`, `app/(prototype)/app/page.tsx`, `messages/*.json`, `tests/prototype/tldrPage.test.ts`, `tests/platform/appShellText.test.ts`, `tests/prototype/home.test.ts` (new)
- **Contract changes:** None
- **Checked:** The 6 new tests failed first, then passed. `npm test` (880 Vitest + 72 P4), typecheck, lint and build pass. In a local production build: no sideways scroll at 320px in Spanish, contrast measured from the rendered colors, and the accessibility tree shows "Timeline 2 urgent" and both nav names.
- **Open issues / next:** Still open from the review:
  - The dashboard home's text is English only (about 30 strings), and its election date "Tuesday, Nov 3" is typed by hand.
  - Search renders every update with no cap (a downtown address can have about 760 items).
  - The countdown reads letter by letter to screen readers.
  - Headline buttons on `/app/tldr` could use `aria-haspopup="dialog"`, and its "Official source" links are small tap targets.
  - Adding `aria-keyshortcuts` to the search button would announce Ctrl K.

### 2026-10-23: Use the full ShowUp HTX name in the landing copy
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Updated the landing page description in English and Spanish to use the full product name, ShowUp HTX.
- **Files:** `messages/en.json`, `messages/es.json`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `npx tsc --noEmit` and `git diff --check` passed.
- **Open issues / next:** None.

### 2026-10-23: Remove the foreground stripe and use the cream footer color
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Replaced the courthouse background with a version that uses continuous lawn instead of a hard foreground terrace line, and changed the landing footer to a solid warm cream sampled by eye from the supplied color reference.
- **Files:** `public/photos/courthouse-hero-v2.png`, `app/globals.css`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed. Tests and browser visual check not run.
- **Open issues / next:** Footer tone is a visual approximation of the supplied swatch.

### 2026-10-23: Give the landing footer a compact cream glass surface
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Grouped the footer tagline and links into one row, moved the project note to a smaller second line, tightened padding, and added a translucent cream surface with blur and a subtle top border over the courthouse image.
- **Files:** `components/shell/SiteFooter.tsx`, `app/globals.css`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `npx tsc --noEmit` and `git diff --check` passed. Browser visual check not run.
- **Open issues / next:** None.

### 2026-10-23: Move footer copy closer to the top
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Reduced the footer content's top padding so its text sits higher within the beach-backed footer.
- **Files:** `components/shell/SiteFooter.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed. Tests and browser visual check not run.
- **Open issues / next:** None.

### 2026-10-23: Replace the beach with a courthouse hero background
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Generated a calm, cream-toned courthouse-at-sunrise background and switched the shared landing-page backdrop from the beach to the courthouse, including behind the footer.
- **Files:** `public/photos/courthouse-hero.png`, `app/globals.css`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed. Tests and browser visual check not run.
- **Open issues / next:** None.

### 2026-10-23: Raise the landing footer further
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Shortened the landing hero by another 3rem so its footer begins higher on desktop.
- **Files:** `app/(public)/page.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed. Tests and browser visual check not run.
- **Open issues / next:** None.

### 2026-10-23: Restore beach footer and raise it slightly
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Reverted the landing footer from navy to the beach background treatment and shortened the hero minimum height by 2rem so the footer starts slightly higher.
- **Files:** `app/globals.css`, `app/(public)/page.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed. Tests and browser visual check not run.
- **Open issues / next:** None.

### 2026-10-23: Try a navy landing footer
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Changed the landing-page footer to navy with white links and primary copy, plus muted white project text.
- **Files:** `app/globals.css`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed. Tests and browser visual check not run.
- **Open issues / next:** None.

### 2026-10-23: Blend the landing footer into the beach
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Continued the hero's cream overlays across the footer and removed its landing-only top border to eliminate the visible break at the bottom of the beach scene.
- **Files:** `app/globals.css`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed. Tests and browser visual check not run.
- **Open issues / next:** None.

### 2026-10-23: Use one continuous beach background
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Removed the separate hero image layer so the fixed body beach background shows continuously behind the hero and transparent footer without restarting at the footer boundary.
- **Files:** `app/(public)/page.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `npx tsc --noEmit` and `git diff --check` passed. Browser visual check not run.
- **Open issues / next:** None.

### 2026-10-23: Match the final stack label font size
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Set the “ones you've never heard of” label to the same 16px font size as the other stack labels, retaining its single-line layout.
- **Files:** `components/home/GovernmentStack.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed. Tests and browser visual check not run.
- **Open issues / next:** None.

### 2026-10-23: Keep the beach behind the landing footer and widen the stack
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Expanded the government stack to 560px so the final label fits on one line at desktop sizes. Applied the sea image to the landing page's body background and made its footer transparent so the beach continues behind it.
- **Files:** `components/home/GovernmentStack.tsx`, `components/shell/SiteFooter.tsx`, `app/globals.css`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `npx tsc --noEmit` and `git diff --check` passed. Browser visual check not run.
- **Open issues / next:** On narrow screens, the final card's label shrinks via a responsive font size to stay on one line.

### 2026-10-23: Increase the landing stack step size
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Increased the consistent rightward offset and matching width reduction from 6% to 8% per card, keeping heights and right edges uniform.
- **Files:** `components/home/GovernmentStack.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed. Tests and browser visual check not run.
- **Open issues / next:** None.

### 2026-10-23: Keep landing stack card heights and steps uniform
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Set every government card to the same fixed height and restored matching icon and label sizes. Kept a constant 6% indent and width reduction per row for an even staircase.
- **Files:** `components/home/GovernmentStack.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `npx tsc --noEmit` and `git diff --check` passed. Browser visual check not run.
- **Open issues / next:** None.

### 2026-10-23: Match footer to the regular canvas background
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Applied the shared canvas background treatment to the site footer so it matches the app's regular page backdrop.
- **Files:** `components/shell/SiteFooter.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed. Tests and browser visual check not run.
- **Open issues / next:** None.

### 2026-10-23: Align the landing stack's right edges
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Matched each card's width reduction to its rightward offset so all right edges line up and the left edges form an even staircase. Kept the final card slightly shorter and its label smaller.
- **Files:** `components/home/GovernmentStack.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `npx tsc --noEmit` and `git diff --check` passed. Browser visual check not run.
- **Open issues / next:** None.

### 2026-10-23: Set the landing stack's staircase alignment
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Made each card narrow faster than it shifts right, so the staircase steps inward on both its left and right edges instead of keeping a shared right edge.
- **Files:** `components/home/GovernmentStack.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `npx tsc --noEmit` and `git diff --check` passed. Browser visual check not run.
- **Open issues / next:** None.

### 2026-10-23: Set steady descending stack dimensions
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Replaced scale transforms with direct per-card widths, heights, icon sizes, and label sizes to avoid uneven gaps. The cards now step down evenly through the final card.
- **Files:** `components/home/GovernmentStack.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `npx tsc --noEmit` and `git diff --check` passed. Browser visual check not run.
- **Open issues / next:** None.

### 2026-10-23: Ease the landing stack taper
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Restored the government cards' larger base width, padding, icons, and labels, and reduced the per-card scale change so the final card remains readable while the stack still tapers.
- **Files:** `components/home/GovernmentStack.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed. Tests and browser visual check not run.
- **Open issues / next:** None.

### 2026-10-23: Taper the full government stack
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Made each successive government card shrink in both width and height, with the last card smallest. The stack uses a shared rise animation that respects each card's scale.
- **Files:** `components/home/GovernmentStack.tsx`, `app/globals.css`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `npx tsc --noEmit` and `git diff --check` passed. Browser visual check not run.
- **Open issues / next:** None.

### 2026-10-23: Tighten landing government stack sizing
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Reduced the stack width, card padding, icon size, type size, and vertical gaps together so the descending cards feel balanced and compact.
- **Files:** `components/home/GovernmentStack.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed. Tests and browser visual check not run.
- **Open issues / next:** None.

### 2026-10-23: Continue the government stack size progression
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Continued the staggered card sizing for the final “ones you’ve never heard of” card, making it the smallest in the descending stack. Reduced its padding and type size so the label can wrap on narrow screens.
- **Files:** `components/home/GovernmentStack.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed. Tests and browser visual check not run.
- **Open issues / next:** None.

### 2026-10-23: Remove the oversized landing preview frame
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Removed the large white framed panel and its header around the decorative government stack so the sea remains visible and the cards feel lighter.
- **Files:** `app/(public)/page.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed. Tests and browser visual check not run.
- **Open issues / next:** None.

### 2026-10-23: Increase sea visibility on the landing page
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Reduced the cream overlays across the landing hero so the sea image is clearly visible behind the copy, while keeping a light gradient under the text for readability.
- **Files:** `app/(public)/page.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed. Tests and browser visual check not run.
- **Open issues / next:** None.

### 2026-10-23: Simplify the landing page around a sea backdrop
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Removed the feature cards beneath the hero and rebuilt the top section around the headline, address action, prominent Google sign-up, and a glass government preview. Made the generated cream-toned sea backdrop more visible, extended it behind a translucent header, and removed the extra copy under the buttons. Preserved the latest account-deletion confirmation on the home page after pulling.
- **Files:** `app/(public)/page.tsx`, `app/globals.css`, `components/shell/SiteHeader.tsx`, `messages/en.json`, `messages/es.json`, `public/photos/calm-sea-hero.jpg`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `npx tsc --noEmit` and `git diff --check` passed after the pull and visual adjustments. Tests not run.
- **Open issues / next:** Browser visual check unavailable in this session.

### 2026-10-23: "Week in short", the weekly brief in one minute (`/app/tldr`)
- **Who:** PlaidMod · P5 Platform
- **Branch:** main
- **What changed:** New page `/app/tldr` for readers short on time. It shows one sentence of counts, up to 5 coming-up items and up to 3 decisions, each as a headline plus one line on what it means, with sign-up and vote chips and an "Official source" link. It also has a "Your next step" card for the soonest sign-up deadline and a link to the full brief. It uses the same data and order as `/app/brief` (`buildWeekly` with real data, the demo ranking otherwise). It writes no new text and makes no AI calls, and it ends with the AI label when any summary shown was written with AI. It's on the sidebar ("Week in short") and linked under the dashboard greeting; per DESIGN.md §8 that's a link, not another panel. The line under each headline (`tldrLine`) is the reader's own role line, then the story summary, then the general note. Real stories' general note is the renter line ("Renters can weigh in too…"), which said nothing about the item, so the summary comes before it.
- **Files:** `app/(prototype)/app/tldr/page.tsx`, `lib/prototype/tldr.ts` (new), `components/prototype/app-shell.tsx` (nav), `app/(prototype)/app/page.tsx` (link), `messages/*.json` (`AppTldr`, `AppShell.nav.tldr`), `tests/prototype/tldr.test.ts`, `tests/prototype/tldrPage.test.ts`, `DESIGN.md` §8, `CLAUDE.md`
- **Contract changes:** None. `/app/brief` keeps its own picking code. It could switch to `buildTldr()` later, but I left it alone because it's being changed today.
- **Checked:** The new tests failed first, then passed. `npm test` (870 Vitest + 72 P4), typecheck, lint and build pass. In a local production build with demo data: English at 1280px and Spanish at 390px with no sideways scroll; the home link opens the page and a headline opens its story, with no console errors. Live after the first push, with real data for 901 Bagby St 77002: 23 coming up, 21 open for comment, 7 decided; the next-step card, source links and AI label show, with no console errors or sideways scroll. That check found the renter-line problem above.
- **Open issues / next:** The dashboard home's own text is still English only. Demo items are English in Spanish too, as before.

### 2026-10-23: Screen readers read the news panel's Spanish note in Spanish
- **Who:** PlaidMod · P5 Platform (fix in P3's news coverage panel)
- **Branch:** main
- **What changed:** On Spanish pages, the "What news coverage says" panel is English by design (perspectives spec N13) and is marked `lang="en"`. Its Spanish note, "Esta sección solo está disponible en inglés.", sat inside that marking, so screen readers read it with an English voice. The note now carries `lang="es"`. The panel's other text stays English, as the spec says (that includes `Coverage.sourcesOnly`, which only looks untranslated in `es.json`).
- **Files:** `components/weekly/Coverage.tsx`, `tests/perspectives/coverageLang.test.ts` (new)
- **Contract changes:** None
- **Checked:** The new test renders the open panel in English and Spanish. It failed before the fix, passes with it, and fails again with the fix stashed. `npm test` (853 Vitest + 72 P4), typecheck, lint and build pass. Not checked in a browser or with a screen reader.
- **Open issues / next:** None from this change.

### 2026-10-23: Alerts checkboxes aligned; merge note on the sidebar toggle
- **Who:** sohankamsala · P3 Weekly News and Alerts
- **Branch:** main
- **What changed:**
  - **Checkboxes:** in both alerts sign-up forms (`PushSignup`, `AlertSignup`), the "I'm under 18" checkbox sat in a padded `bg-surface` panel. That panel is invisible on the white UI, so the box looked indented; the padding is removed so every checkbox lines up.
  - **Merge:** while merging origin/main, I kept the teammate's translated toggle labels and the visible "Sidebar" word (now `AppShell.toggle.label`). I changed `toggle.show` and `toggle.hide` to "Show sidebar" and "Hide sidebar" (Spanish: "Mostrar/Ocultar el menú lateral"), so the accessible name contains the visible word.
- **Files:** `components/alerts/{PushSignup,AlertSignup}.tsx`, `components/prototype/app-shell.tsx`, `messages/*.json`
- **Contract changes:** None.
- **Checked:** See the merge commit: `npm test`, lint and typecheck were run after the merge.
- **Open issues / next:** None.

### 2026-10-23: AI summaries on click, a shorter calendar day list, an iPhone lock-screen preview
- **Who:** sohankamsala · P3 Weekly News and Alerts (reuses P4's coach)
- **Branch:** main (local commit; not pushed)
- **What changed:**
  - **AI summary:** opening an item that has no written story now shows an "AI summary" block in the story sheet, using P4's `/api/coach` explain mode (the same as Speak up's "Explain this item"). It shows a plain summary plus who it affects, a "Summarizing with AI" state with bouncing dots while it loads, and the AI label.
    - Answers are cached in sessionStorage per item and language, so reopening costs nothing.
    - If the coach can't explain an item (for example, a decided one), the block hides.
    - The "Why it matters: The agenda item is linked below." placeholder is gone: `why` is empty without a story, and the brief's "For you" line hides too.
  - **Calendar day panel:** deadlines at the same time collapse into one line ("Sign-up closes 8:00 AM · for 18 items"). The panel shows at most 5 items, then "See all N on the timeline".
  - **Alerts preview:** the chat-bubble mockup is now an iPhone lock screen (Dynamic Island, clock, frosted notification banners, flashlight and camera). Its text comes from `lib/push/message.ts` (`itemNotice`, `reminderNotice`), the same code that sends notifications.
  - **Grammar:** "1 minutes per speaker" is now an ICU plural (`AppStory.signupCloses`).
- **Files:** `components/prototype/story-sheet.tsx`, `lib/prototype/live.ts`, `app/(prototype)/app/brief/page.tsx`, `app/(prototype)/app/alerts/alerts.tsx`, `messages/*.json`
- **Contract changes:** None.
- **Checked:**
  - `npm test`, lint and typecheck pass.
  - In the browser on real data: a real AI summary loaded for a Commissioners Court item (the loading state was checked with a 3-second delay), the day panel is collapsed, and the lock screen renders. No console errors.
- **Open issues / next:**
  - **AI summaries and the coach's limit:** each summary uses one coach call. Without `COACH_TRUSTED_IP_HEADER`, all visitors share 20 calls an hour, so set it on Vercel (`x-real-ip`) if it isn't set yet.

### 2026-10-23: Weekly brief: real calendar, compact deadlines, no empty column
- **Who:** sohankamsala · P3 Weekly News and Alerts
- **Branch:** main (local commit; not pushed)
- **What changed:** Below the bento on `/app/brief`, the two-column layout (decided stories plus a side rail) left half the page empty when nothing was decided. Everything now stacks full width:
  - **Deadlines this week:** compact cards with a date block, "Sign-up to speak closes · time", the item's two-line headline (not `buildWeekly`'s long label) and the body.
  - **On the calendar:** a real two-week grid (Sunday to Saturday, Central time) with today marked. Each day shows up to two items (time and title, red edge for urgent) plus "+N more", which links to the timeline. Phones get a day-by-day list instead.
  - **Also decided:** shown only when there's something.
  - **One thing you can do:** a full-width banner. It also fixes "Speak for 1 minutes" (ICU plural).
- **Files:** `app/(prototype)/app/brief/page.tsx`, `messages/*.json` (`AppBrief.signupCloses`, `deadline`, `more`, `speakFor`)
- **Contract changes:** None.
- **Checked:** `npm test`, lint and typecheck pass. In the browser on real data at 1536px and 390px, there's no horizontal scroll and no console errors.
- **Follow-up (same day):** the deadlines section is folded into the calendar, and cells carry less text.
  - **Each cell:** the day number, a red "Sign-up 8:00 AM" tag on deadline days, and one line per meeting (body logo, short name, item count). No item titles.
  - **Day panel:** clicking a day lists its deadlines and items underneath, one line each, with "See all N on the timeline". The next busy day is selected by default.
  - **Phones:** a scrollable row of days with dots, plus the same day panel.
- **Open issues / next:** None.

### 2026-10-23: Shorter titles, a clearer Speak up, no falling books
- **Who:** sohankamsala · P3 Weekly News and Alerts (touches P4's Speak up; P4, please review)
- **Branch:** main (local commit; not pushed)
- **What changed:**
  - **No repeated title:** items without a story showed the shortened official title as the headline, then the full title again as the summary. Now `summary` is empty for those, and a new `Update.officialTitle` holds the full wording. The story sheet and Speak up's Understand step show it under a collapsed "Official agenda text".
  - **Shorter headlines:** `agendaHeadline` now caps at 90 characters and drops a dangling "of", "&" or "to the" before the "…".
  - **Speak up (P4's screen):**
    - The subtitle now says what the page is for: "Tell your local government what you think before it votes".
    - A "What this is for" note explains public comment: speaking at the meeting or sending a written comment.
    - Fixed the agenda list: `line-clamp-2 block` let the `block` class cancel the clamp, so titles ran five or six lines.
  - **Timeline:** the heading is left-aligned again, and the falling books are removed (`falling-books.tsx` deleted, along with the shell's `isolate`).
- **Files:** `lib/prototype/{live,types}.ts`, `lib/weekly/agendaTitle.ts`, `tests/weekly/agendaTitle.test.ts`, `components/prototype/{story-sheet,app-shell}.tsx`, `components/speak/understand.tsx` (P4's), `app/(prototype)/app/speak/speak.tsx` (P4's), `app/(prototype)/app/timeline/page.tsx`, `messages/*.json` (`speak.subtitle`, `speak.whatTitle`, `speak.whatBody`, `speak.officialText`, `AppStory.officialText`)
- **Contract changes:** `Update` gains `officialTitle`, and `summary` is empty for items with no story.
- **Checked:**
  - `npm test` (824), lint and typecheck pass.
  - In the browser on real data, the Speak up list titles stop at two lines, the subtitle and note show, the timeline heading is left-aligned, and no books render. No console errors.
- **Open issues / next:** None.

### 2026-10-23: Falling-books background, centered heading, labeled sidebar toggle
- **Who:** sohankamsala · P3 Weekly News and Alerts
- **Branch:** main (local commit; not pushed)
- **What changed:** on `/app/timeline`:
  - **Falling books:** faint gray books tumble down the background as you scroll (`components/prototype/falling-books.tsx`, Motion `useScroll`, tablet and up). They're scroll-linked and reversible, still with reduced motion, and never take clicks. The shell's wrapper is now `isolate`, so the books sit above the gray page but below the sidebar, top bar and cards.
  - **Heading:** "Timeline" is centered over the timeline column.
  - **Sidebar on each visit:** every visit to the timeline starts with the sidebar hidden. Before, reopening it there kept it open on the next visit.
  - **Toggle label:** the toggle now reads "› Sidebar", and its accessible name is "Show sidebar" or "Hide sidebar".
- **Files:** `components/prototype/falling-books.tsx` (new), `components/prototype/app-shell.tsx`, `app/(prototype)/app/timeline/page.tsx`
- **Contract changes:** None.
- **Checked:**
  - Lint, typecheck and tests pass.
  - In the browser, the books move with scroll, the heading is centered, and after opening the sidebar, going to the brief and coming back, the sidebar is hidden again. No console errors.
- **Follow-up:**
  - The books now fall only through the timeline column. The layer tracks the column with a ResizeObserver and fades out near the top, so none sit under the top bar.
  - Six books instead of nine.
  - The first two tiles' photos load eagerly.
- **Note:** the dev overlay's "1 Issue" is React's dev-only "Failed to execute 'measure' on 'Performance' … negative time stamp" bug, not app code. The remaining LCP warning is a false positive, because many tiles share `cityhall.jpg` and Next matches images by file name.
- **Open issues / next:** None.

### 2026-10-23: Less on the timeline; the left column folds away when the sidebar opens
- **Who:** sohankamsala · P3 Weekly News and Alerts
- **Branch:** main (local commit; not pushed)
- **What changed:** The teammate found `/app/timeline` crowded.
  - **Sidebar open:** opening the sidebar (the › button) now folds away the left column (the big count, the memo and the topics). The column's grid track animates to zero, so the timeline slides left; closing the sidebar brings it back. The shell shares its open state through `useNavOpen()` (`components/prototype/app-shell.tsx`).
  - **Removed:** the "Everything / For you / Coming up / Decided" tabs; the generic tags on photo tiles (only "Urgent" remains); and "Read the weekly brief" in quick actions (the sidebar already links to it).
- **Files:** `app/(prototype)/app/timeline/page.tsx`, `components/prototype/app-shell.tsx`
- **Contract changes:** None.
- **Checked:** Lint and tests pass. In the browser at 1100, 1280, 1440 and 1920px, with the sidebar open and closed, the left column hides and returns, there's no horizontal scroll and there are no console errors.
- **Follow-up (same day):** with the sidebar hidden, the three columns were still crowded.
  - Gutters are now 64px, the side columns are narrower (left 240px, right 272px), and the center tiles are 86% wide.
  - Everything is scaled down: the count (4.5–5.5rem), memo, chips, title, tile headlines (clamped to 3 lines), photos (150–170px tall), countdown and quick actions.
- **Open issues / next:** The `AppTimeline.tabs.*` and `qBrief` message keys are unused now.
### 2026-10-23: Search in /app no longer crashes the page; landing page leftovers fixed
- **Who:** PlaidMod · P5 Platform
- **Branch:** main
- **What changed:**
  - **Search crash (live bug):** opening search in `/app` (the search box or Ctrl/⌘K) replaced the whole page with "This page couldn't load". The app's shadcn `CommandDialog` doesn't wrap its children in cmdk's `<Command>` root, and the search panel put `CommandInput` and `CommandList` straight inside it, so cmdk found no store ("reading 'subscribe'"). The search panel now wraps them in `<Command>`, with a translated dialog title and description. This has likely been broken since the screens moved to the root app (Oct 20).
  - **Landing page leftovers** from the UI polish entry below:
    - The two hero buttons are now the same size (56px, 16px text).
    - `/address` uses `bg-muted` instead of the hex `#f4f6f9`.
    - Icons beside semibold text on `/`, `/address` and the address form render a 2px stroke. Lucide's `absoluteStrokeWidth` needs the `size` prop; a CSS size class alone leaves it at 2 units.
  - **Correction to my guideline review below:** the search list's dates were never English-only. `relDay()` already reads `<html lang>` and formats in Central time; in Spanish they read "1 nov", "Jueves", "Hace 4 días".
- **Files:** `components/prototype/app-shell.tsx`, `app/(public)/page.tsx`, `app/(public)/address/page.tsx`, `components/home/AddressForm.tsx`, `messages/*.json` (`AppShell.search.description`), `tests/platform/appShellText.test.ts`
- **Contract changes:** None. Any other `CommandDialog` must also wrap its contents in `<Command>`.
- **Checked:**
  - Live before the fix: clicking Search on `/app` showed "This page couldn't load" with the same error.
  - The new test failed first, passes with the fix, and fails again with the fix stashed. `npm test` (850 Vitest + 72 P4), typecheck, lint and build pass.
  - Local Chromium, English and Spanish: search opens from the button and from Ctrl K, filters as you type, shows translated headings and dates, with no page errors. Hero buttons are both 56px at 1280px and 390px. Icon strokes are 3 at 16px and 2.4 at 20px (2px rendered).
- **Open issues / next:** The app's colors in `app/manifest.ts` are still the old cream and brick. Lucide icons elsewhere in the app still use the default stroke.

### 2026-10-23: "Delete my account", the app shell in Spanish, and a skip link in /app
- **Who:** PlaidMod · P5 Platform
- **Branch:** main
- **What changed:**
  - **Delete my account:** signed-in readers get "Delete my account" in the account menu. It opens `/account/delete`, which explains what's deleted and asks to confirm.
    - The button posts to `/auth/delete` through `DeleteAccountForm`, which clears the saved address first.
    - The route refuses posts from other sites (Origin and Sec-Fetch-Site checks), guests and team admin accounts (the team removes those by hand).
    - It deletes the Supabase user, whose `account_profiles` row goes with it (on delete cascade). Then it signs out, clears the government and role cookies, and lands on `/?deleted=1`, which shows "Your account is deleted".
    - The privacy page (en/es) now points to the button instead of "ask us on our project page".
    - The menu's sign-out also shows for a signed-in reader before their first lookup.
  - **App shell in Spanish:** the sidebar, sample-data banners, search, account menu and role names now come from the new `AppShell` messages in English and Spanish. Spanish matches existing wording ("Hazte escuchar", "Datos de muestra", "Cerrar sesión").
  - **Motion and guideline pass:**
    - The "signed in" and "account deleted" confirmations on the home page rise in once (`.status-in`: 250ms with the new `--ease-out-strong`; a 200ms fade under reduced motion).
    - `/app` gets the same "Skip to content" link as the public pages.
    - Page headings use balanced wrapping, and the avatar has explicit width and height.
  - **Three small guideline fixes:**
    - The search hint shows ⌘K on Apple devices and Ctrl K elsewhere (`lib/prototype/shortcut.ts`), after hydration.
    - The delete button shows "Deleting your account…" with a spinner once pressed, and ignores a second press.
    - The address placeholder shows an example: "e.g. 901 Bagby St, Houston, TX 77002…".
- **Files:** `app/auth/delete/route.ts`, `app/(public)/account/delete/page.tsx`, `lib/accountDeletion.ts` (new); `components/prototype/{app-shell,sign-out-form}.tsx`, `app/(public)/page.tsx`, `messages/*.json`, `docs/testing-checklist.md`, `app/globals.css`, `app/(public)/address/page.tsx`; tests `accountDeletion`, `appShellText` (new), `signOut`, `messages`
- **Contract changes:** None to the schema. Privacy (§19): readers can now delete their own account. Tech plan §16 and §19 still don't mention `account_profiles` or deletion; not edited, since no teammate asked for a plan change. Every form posting to `/auth/delete` must use `DeleteAccountForm` (a test checks).
- **Checked:**
  - Tests: the new tests failed first, then passed; `npm test` (844 Vitest + 72 P4), typecheck and lint pass.
  - Refusals (local): a post with no Origin, or from another site, goes to `?error=cross_site`; a signed-out post goes to `/signin`.
  - End to end with a throwaway `@example.com` user with a saved profile, in local Chromium: menu, confirm page, deletion, then the home page message, an empty profile and no cookies. In Supabase, the user and its row were gone, with no leftover test users or orphaned rows.
  - Spanish shell in Chromium: no English left in the shell, and no sideways scroll at 390px.
  - Also in Chromium: the confirmation uses `status-rise` normally and `status-fade` under reduced motion. The first Tab in `/app` shows the skip link, and the next Tab after it lands inside the main content. With a second throwaway user: one press sends one request; the button reads "Deleting your account…" with a spinner, and a second press is blocked. The flow still ends deleted. The search hint reads Ctrl K on Windows. No leftover test users or orphaned rows.
- **Open issues / next:** Dates in the search list (`relDay`) and the dashboards' own text are still English (UI owner). Push subscriptions aren't tied to accounts, so deleting an account leaves browser alerts on; turn them off on the Alerts page.

### 2026-10-23: UI polish pass: focus rings, hover tints and shadows work again under the glass style
- **Who:** PlaidMod · P5 Platform
- **Branch:** main
- **What changed:**
  - Marie Gary Blueberry's glass style (below) sat outside every CSS layer, so it beat Tailwind's utilities. The address box and buttons lost their focus rings, white buttons lost their hover tint (the Google button), and cards lost their own shadows (the sign-in card). The edge, depth and blur now live in `@layer components`, and the see-through fill in `@layer utilities`. The glass look stays, and an element's own utilities win. The glass edge is now a shadow ring over a transparent border, so forced-colors mode still draws it.
  - The landing page's feature labels showed raw keys (`Home.feature1Label`); it now uses the existing `featureOneLabel` keys.
  - The header's new "Find my governments" button made every public page scroll sideways at 390px. It now shows from 640px up; the page itself offers the action on phones.
  - `/address` showed the privacy sentence twice; the address form already shows it.
  - Polish: menus, the search list and address suggestions no longer scroll the page behind them. The switch names its transition properties. The results cards' hover zoom animates instead of jumping. The Google avatar gets a faint outline.
- **Files:** `app/globals.css`, `app/(public)/{page,address/page,results/page}.tsx`, `components/shell/SiteHeader.tsx`, `components/home/AddressForm.tsx`, `components/prototype/app-shell.tsx`, `components/ui/{dropdown-menu,command,switch}.tsx`, `tests/platform/cssLayers.test.ts` (new)
- **Contract changes:** None. New rule: don't set box-shadow, border, outline or background in CSS outside a layer; `cssLayers.test.ts` fails if you do.
- **Checked:**
  - Tests and build: the new test failed first, then passed; `npm test` (832 Vitest + 72 P4), typecheck, lint and build pass.
  - Local Chromium: focus rings on the address box and the primary and Google buttons; the Google hover tint; the sign-in card shadow; glass fill and blur on cards.
  - No sideways scroll at 390, 640 and 1280px on `/`, `/address`, `/about` and `/privacy` in English, or at 390px in Spanish (`/signin` included).
- **Open issues / next (left for the landing page's owner):** The hero's two buttons are different sizes (main action 56px, Google 64px), so the secondary outweighs the main one. `/address` uses a hex background (`bg-[#f4f6f9]`), but the rules say tokens only. Lucide icons keep their default stroke beside semibold text.

### 2026-10-23: Apply a shared glass surface style
- **Who:** Marie Gary Blueberry · app-wide visual system
- **Branch:** main
- **What changed:** Added a soft tinted canvas and translucent, blurred treatment to white and surface panels across public and app routes. Added a restrained highlight and depth to denim, ink and brick surfaces while preserving their palette colors and text contrast intent.
- **Files:** `app/globals.css`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `npx tsc --noEmit` and `git diff --check`; tests not run.
- **Open issues / next:** Browser visual check unavailable in this session.

### 2026-10-23: Refresh the landing page and smooth route changes
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Reworked the landing page around a centered hero, large actions and a rounded product preview built from ShowUp's real government stack and existing copy. Added a localized address CTA to the header and a short fade for route changes, disabled for reduced-motion preferences.
- **Files:** `app/(public)/page.tsx`, `app/template.tsx`, `app/globals.css`, `components/shell/SiteHeader.tsx`, `messages/en.json`, `messages/es.json`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `npx tsc --noEmit` and `git diff --check` passed. `npm run build` could not fetch Geist from Google Fonts due unavailable network access; tests not run.
- **Open issues / next:** Browser visual check unavailable in this session; validate the new landing page and route fade when browser access is available.

### 2026-10-23: Enlarge sign-in and align the stack label
- **Who:** Marie Gary Blueberry · public landing page
- **Branch:** main
- **What changed:** Enlarged the Google sign-in action with a wider desktop target and full-width mobile button. Reset the final government-stack label to full width, aligning it with the first card and the stack's shared right edge; this supersedes the prior desktop inset adjustment.
- **Files:** `app/(public)/page.tsx`, `components/home/GovernmentStack.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `npx tsc --noEmit`, `git diff --check`, and local homepage request (200); tests not run.
- **Open issues / next:** Browser visual check unavailable in this session.

### 2026-10-23: Align the final government-stack label
- **Who:** Marie Gary Blueberry · home page layout
- **Branch:** main
- **What changed:** Matched the “ones you’ve never heard of” label’s desktop inset to the last government card so the stack continues its stagger consistently. Mobile remains flush with the stack edge.
- **Files:** `components/home/GovernmentStack.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `npx tsc --noEmit` and `git diff --check` passed; tests not run.
- **Open issues / next:** Browser visual check unavailable in this session.

### 2026-10-23: Anchor and compact the public footer
- **Who:** Marie Gary Blueberry · public site layout
- **Branch:** main
- **What changed:** Made the public shell fill at least the viewport height so the footer sits at the bottom instead of leaving unused space beneath it. Tightened the footer's vertical padding and internal gaps. The planning stress test was skipped for this fix at the teammate's request.
- **Files:** `app/(public)/layout.tsx`, `components/shell/SiteFooter.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `npx tsc --noEmit`, `git diff --check`, and local homepage request (200); tests not run.
- **Open issues / next:** Browser visual check unavailable in this session.

### 2026-10-23: Split the landing page from address lookup
- **Who:** Marie Gary Blueberry · public experience
- **Branch:** main
- **What changed:** Made `/` a full ShowUp landing page with a product hero, clear address lookup and Google sign-in actions, and three feature summaries. Added `/address` for address entry and moved the app's change-address links there.
- **Files:** `app/(public)/page.tsx`, `app/(public)/address/page.tsx`, `components/prototype/app-shell.tsx`, `messages/en.json`, `messages/es.json`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `npx tsc --noEmit`, `git diff --check`, and local requests to `/` and `/address` (both 200); tests not run.
- **Open issues / next:** Browser visual check unavailable in this session.

### 2026-10-23: Make Google sign-in prominent on the landing page
- **Who:** Marie Gary Blueberry · public landing page
- **Branch:** main
- **What changed:** Replaced the small inline Google sign-in link with a larger outlined button and Google icon. The button goes directly to the Google sign-in route and fills the available width on mobile.
- **Files:** `app/(public)/page.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` and `npx tsc --noEmit` passed; tests not run.
- **Open issues / next:** Browser visual check wasn't available.

### 2026-10-23: Enlarge Weekly section headers
- **Who:** Marie Gary Blueberry · P3 News and Alerts
- **Branch:** main
- **What changed:** Increased the Weekly section-rule heading from 12px to 16px, scaling to 18px on desktop, and eased letter spacing so the label is easier to read.
- **Files:** `app/(public)/weekly/page.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` and `npx tsc --noEmit` passed; tests not run.
- **Open issues / next:** Browser visual check wasn't available.

### 2026-10-23: Align Weekly story cards within each row
- **Who:** Marie Gary Blueberry · P3 News and Alerts
- **Branch:** main
- **What changed:** Weekly cards now stretch to the same height as their row, with action buttons and sign-up deadlines aligned along the bottom. This removes the uneven card edges and staggered action spacing.
- **Files:** `app/(public)/weekly/page.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` and `npx tsc --noEmit` passed; tests not run.
- **Open issues / next:** Browser visual check wasn't available.

### 2026-10-23: Show two more stories in the Weekly tile grid
- **Who:** Marie Gary Blueberry · P3 News and Alerts
- **Branch:** main
- **What changed:** Expanded the Weekly tile set from five to seven using two more palette styles. The grid now fills its second desktop row with the next two available upcoming stories.
- **Files:** `app/(public)/weekly/page.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` and `npx tsc --noEmit` passed; tests not run.
- **Open issues / next:** Browser visual check wasn't available.

### 2026-10-23: Signing out clears the saved address; Google sign-in is on
- **Who:** PlaidMod · P5 Platform
- **Branch:** main
- **What changed:**
  - Marie Gary Blueberry's change below ("Remember addresses in this browser only") keeps the street address in `showup.profile.v1`. But "Sign out and forget this browser" left the address there, so the next person on a shared computer saw it. Every sign-out button now uses `SignOutForm`, which clears the profile before posting to `/auth/signout`. The menu also shows the button whenever an address is saved.
  - The sample-data banner told every new visitor "Your address is saved in this browser", because the sample profile (Maya) has an address. It now checks `hasSavedAddress()`.
  - The privacy page (en/es) says signing out removes the saved address. Docs updated at the owner's request: tech plan §3 and §19, DESIGN.md, CLAUDE.md, the testing checklist and readiness.
- **Files:** `components/prototype/sign-out-form.tsx` (new), `components/prototype/app-shell.tsx`, `lib/prototype/profile-storage.ts`, `messages/*.json`, `tests/platform/signOut.test.ts` (new), `tests/platform/messages.test.ts`, the docs above
- **Contract changes:** Privacy (§3, §19): signing out now clears the browser's saved address. New sign-out buttons must use `SignOutForm`; a test fails on any page or component that posts to `/auth/signout` directly.
- **Checked:**
  - Tests and build: the new tests failed first, then passed; `npm test` (830 Vitest + 72 P4), typecheck, lint and build all pass.
  - Local Chromium: banner text for a new visitor and for a saved address; sign-out by mouse and by keyboard lands on `/` with the profile gone.
  - Google sign-in: PlaidMod turned it on (Google Cloud client; Supabase provider; Site URL `https://showup-htx-six.vercel.app`; redirect URLs for `/auth/callback` on the live site and localhost:3000). The live button reaches Google's login screen with Supabase's callback, and a bad code returns to `/signin?error=failed`. A live sign-in created one Google user. Its `account_profiles` row is written after the first signed-in lookup, as designed.
- **Open issues / next:** The app shell's banner and menu text are still English only. Account deletion is still by request. This push also deploys 7c1fd1e, which Vercel had blocked as a teammate commit.

### 2026-10-23: Fill the public weekly story cards with story summaries
- **Who:** Marie Gary Blueberry · P3 News and Alerts
- **Branch:** main
- **What changed:** The previous tile adjustment affected the prototype brief, while the reported screen is the public Weekly page. Public cards now show each available story dek, place the action beneath the text, and use content-sized rows without the extra tall spans.
- **Files:** `app/(public)/weekly/page.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` and `npx tsc --noEmit` passed; tests not run.
- **Open issues / next:** Browser visual check wasn't available.

### 2026-10-23: Repair Harris County meeting information link
- **Who:** Marie Gary Blueberry · government details
- **Branch:** main
- **What changed:** Replaced the retired Commissioners Court URL with Harris County's current agenda portal and added a detail-page fallback so existing database rows with the old URL work immediately. The catalog's source now points to the county's current Office of County Administration meeting-information page.
- **Files:** `data/bodies.yaml`, `components/flow/BodyDetailClient.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** Official Harris County agenda and meeting-information pages verified; `git diff --check` and `npx tsc --noEmit` passed.
- **Open issues / next:** The existing database catalog row can be refreshed with `npm run seed:bodies -- --apply`; the page fallback covers it in the meantime.

### 2026-10-23: Improve government card hover and return navigation
- **Who:** Marie Gary Blueberry · public lookup and government details
- **Branch:** main
- **What changed:** Government result cards now use a straight right arrow and only highlight and slightly enlarge on hover. The government detail link now returns to Your governments and carries the result token, so the lookup page is reachable without re-entering the address.
- **Files:** `app/(public)/results/page.tsx`, `components/flow/BodyDetailClient.tsx`, `messages/en.json`, `messages/es.json`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` and `npx tsc --noEmit` passed; tests not run.
- **Open issues / next:** Browser visual check wasn't available.

### 2026-10-23: Remember addresses in this browser only
- **Who:** Marie Gary Blueberry · P5 privacy and address lookup
- **Branch:** main
- **What changed:** The public lookup now saves the normalized address in the existing `showup.profile.v1` local profile and prefills it on return. Address data remains out of server storage, cookies, links, logs, and account sync; English/Spanish privacy copy and the plan/checklist now reflect browser-only retention. The app keeps sample data clearly labeled until a looked-up government list is available.
- **Files:** `lib/prototype/profile-storage.ts`, `lib/prototype/profile.tsx`, `components/home/AddressForm.tsx`, `components/prototype/address-form.tsx`, `components/prototype/app-shell.tsx`, `components/flow/LookupProvider.tsx`, `messages/en.json`, `messages/es.json`, `Technical_Implementation_Plan.md`, `DESIGN.md`, `docs/testing-checklist.md`, `docs/readiness.md`, `docs/project-pace.md`, `tests/platform/messages.test.ts`, `agent_handoff.md`
- **Contract changes:** User address retention is now browser-local only; no server or account persistence.
- **Checked:** `npx tsc --noEmit` and `git diff --check` passed; tests not run.
- **Open issues / next:** Browser visual check wasn't available.

### 2026-10-23: Keep Speak up navigation visible while scrolling
- **Who:** Marie Gary Blueberry · P4 Speak up
- **Branch:** main
- **What changed:** The back/continue controls now stick to the bottom of the viewport while moving through the long Speak up steps, so the next action stays visible. Removed the panel overflow that would prevent sticky positioning.
- **Files:** `app/(prototype)/app/speak/speak.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed; no tests run.
- **Open issues / next:** Browser visual check wasn't available.

### 2026-10-23: Use the full article content width
- **Who:** Marie Gary Blueberry · P3 News and Alerts
- **Branch:** main
- **What changed:** Removed the remaining max-width limits from article detail content so the headline, story text, meeting details, action panel, source, and coverage fill the available page width.
- **Files:** `app/(public)/items/[id]/page.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed; no tests run.
- **Open issues / next:** Browser visual check wasn't available.

### 2026-10-23: Widen the public article details page
- **Who:** Marie Gary Blueberry · P3 News and Alerts
- **Branch:** main
- **What changed:** Removed the 3xl cap around article details, widened the headline, meeting metadata, and supporting sections, and kept story paragraphs at a narrower reading width.
- **Files:** `app/(public)/items/[id]/page.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed; no tests run.
- **Open issues / next:** Browser visual check wasn't available.

### 2026-10-23: Fill out and shorten weekly story tiles
- **Who:** Marie Gary Blueberry · prototype weekly brief
- **Branch:** main
- **What changed:** Removed the two story tiles' two-row spans to reduce unused height, gave desktop tiles a compact minimum row size, and added the story summary beneath each headline.
- **Files:** `app/(prototype)/app/brief/page.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed; no tests run.
- **Open issues / next:** Browser visual check wasn't available.

### 2026-10-23: Tighten spacing at the bottom of public pages
- **Who:** Marie Gary Blueberry · public site layout
- **Branch:** main
- **What changed:** Reduced bottom padding across public pages and tightened the shared footer gap. Kept each page's top spacing unchanged; shortened the weekly page's closing gap as well.
- **Files:** `app/(public)/*/page.tsx`, `app/(public)/page.tsx`, `components/shell/SiteFooter.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed; no tests run.
- **Open issues / next:** Browser visual check wasn't available.

### 2026-10-23: Add back and home actions to article navigation
- **Who:** Marie Gary Blueberry · P3 News and Alerts
- **Branch:** main
- **What changed:** Added a left-arrow link back to this week's stories and an explicit Home button in the news top navigation. Removed the less-visible text back link from article pages and localized Home in English and Spanish.
- **Files:** `components/weekly/NewsChrome.tsx`, `app/(public)/items/[id]/page.tsx`, `messages/en.json`, `messages/es.json`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed; no tests run.
- **Open issues / next:** None.

### 2026-10-23: Reduce footer height and enlarge home content
- **Who:** Marie Gary Blueberry · home page layout
- **Branch:** main
- **What changed:** Reduced the footer's top gap and padding. Widened the home container and stack, and increased the hero headline, copy, and government-card size.
- **Files:** `components/shell/SiteFooter.tsx`, `app/(public)/page.tsx`, `components/home/GovernmentStack.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** Local `GET /` returns 200.
- **Open issues / next:** Browser visual check wasn't available.

### 2026-10-23: Restore web-push after the local install disappeared
- **Who:** Marie Gary Blueberry · local setup
- **Branch:** main
- **What changed:** The package was still absent from `node_modules` despite npm lock metadata. Forced npm to restore `web-push@3.6.7`; package manifests did not change.
- **Files:** `node_modules/web-push` (restored), `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `npm ls web-push` shows 3.6.7; local `GET /alerts` now returns 200.
- **Open issues / next:** Reload the browser if the old build-error overlay is still visible.

### 2026-10-23: Install the missing local web-push package
- **Who:** Marie Gary Blueberry · local setup
- **Branch:** main
- **What changed:** `web-push` was declared in `package.json` and the lockfile but absent from `node_modules` after pulling. Ran `npm install`; no tracked dependency files changed.
- **Files:** `node_modules/web-push` (installed), `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `npm ls web-push` shows 3.6.7; local `GET /alerts` returns 200.
- **Open issues / next:** None for this error.

### 2026-10-23: Align About content to the page gutter
- **Who:** Marie Gary Blueberry · About page layout
- **Branch:** main
- **What changed:** Moved the About content from a centered narrow column to a narrow column aligned with the shared site container and header gutter.
- **Files:** `app/(public)/about/page.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** `git diff --check` passed.
- **Open issues / next:** Visual check wasn't available. The local dev log showed an unrelated missing `web-push` module error while compiling the alerts page.

### 2026-10-23: Fit all results actions on one row
- **Who:** Marie Gary Blueberry · results page layout
- **Branch:** main
- **What changed:** Reduced horizontal padding on the four results actions from the small-screen breakpoint so they fit together at the width in the screenshot; they can still wrap on narrower screens.
- **Files:** `app/(public)/results/page.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** Next.js compiled the change; local `/results` returned 200.
- **Open issues / next:** Browser access was denied earlier, so the row was not visually inspected.

### 2026-10-23: Make result cards link to government details
- **Who:** Marie Gary Blueberry · results page interaction
- **Branch:** main
- **What changed:** Removed the separate Details link and made each details-eligible government card a full-card link. Added a hover tint, lift and slight scale, plus the shared arrow cue.
- **Files:** `app/(public)/results/page.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** Next.js compiled the change.
- **Open issues / next:** Chrome access was denied, so the hover effect was not visually inspected.

### 2026-10-23: Tighten the results page top spacing
- **Who:** Marie Gary Blueberry · results page layout
- **Branch:** main
- **What changed:** Reduced the results page's top padding by 24px on desktop and 16px on small screens, keeping its bottom spacing intact.
- **Files:** `app/(public)/results/page.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** Next.js compiled the update; local `/results` returned 200.
- **Open issues / next:** None.

### 2026-10-23: Configure local lookup environment
- **Who:** Marie Gary Blueberry · local setup
- **Branch:** main
- **What changed:** Copied the teammate-provided environment file to ignored `.env.local` with owner-only permissions so the local lookup can reach Supabase and sign its response. No values were added to Git.
- **Files:** `.env.local` (ignored), `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** Dev server starts with `.env.local`; `POST /api/lookup` returned 200 and 7 bodies for the non-personal test address `123 Main St, Houston, TX 77004`.
- **Open issues / next:** The test matched Census fallback; the teammate's actual address was not submitted.

### 2026-10-23: Keep the home government stack label on one line
- **Who:** Marie Gary Blueberry · home page layout
- **Branch:** main
- **What changed:** The final government-stack card now stays on one line, with a smaller inset on wider screens, no inset on small screens, and slightly smaller text on narrow screens to fit both languages.
- **Files:** `components/home/GovernmentStack.tsx`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** The running Next.js server compiled the change.
- **Open issues / next:** Browser UI was unavailable for a visual check. The server log also showed an unrelated `POST /api/lookup` 500; not investigated.

### 2026-10-23: Pulled latest main and started the app locally
- **Who:** Marie Gary Blueberry · local setup
- **Branch:** main
- **What changed:** Fast-forwarded local `main` from `e26b379` to `776105f` from `origin/main` and started the Next.js development server.
- **Files:** `agent_handoff.md` (this entry); the pull brought in the upstream changes listed by Git.
- **Contract changes:** None made locally.
- **Checked:** `git pull --ff-only` succeeded; `npm run dev` reports Next.js 16.4.2 ready at `http://localhost:3000`.
- **Open issues / next:** Dev server is running in this session. Turbopack warned that it ignored `/Users/Ishaan/package-lock.json` because it is outside this repository.

### 2026-10-23: Accounts table applied; privacy page covers Google sign-in
- **Who:** PlaidMod · P5 Platform (the P5 steps handed off in sohankamsala's sign-in entry below)
- **Branch:** main
- **What changed:**
  - **Migration:** I applied `account_profiles` to production. Supabase recorded it as version `20261023140515`, so I renamed the file from `20261022230000_account_profiles.sql` to match, like every other migration. The file name in the sign-in entry below is now out of date.
  - **Types:** I regenerated `account_profiles` in `lib/database.types.ts`, and `lib/account.ts` now uses the typed client.
  - **Privacy page** (both languages, effective Oct 23, 2026):
    - A new "Signing in with Google" section says what's saved: the Google email, name and photo link, kept by Supabase, plus body IDs and stakes, never the address. It also says how to ask for deletion.
    - The cookies text now says government IDs stay about six months and that signing out forgets them, and that readers who sign in get a sign-in cookie too.
    - The processors list adds Supabase and Google for sign-in.
  - **Deploy:** this push also deploys sohankamsala's nine Oct 22 commits, which Vercel had blocked because the repo is private.
- **Files:** `supabase/migrations/20261023140515_account_profiles.sql` (renamed), `lib/database.types.ts`, `lib/account.ts`, `app/(public)/privacy/page.tsx`, `messages/{en,es}.json` (`Legal.privacy`), `tests/platform/messages.test.ts`
- **Contract changes:** DB schema: `account_profiles` now exists in production, as designed in the sign-in entry below. Tech plan §16 and §19 don't list it yet; the plan files are unchanged.
- **Checked:**
  - The new privacy test failed first, then passed.
  - `npm test` (824 Vitest plus P4's 72), typecheck, lint and `npm run build` pass.
  - Supabase's security check shows only the expected "RLS on, no policies" notice for the new table, the same as every other table.
- **Open issues / next:**
  - **Google is still off.** The owner still needs to do steps 1–3 of the sign-in entry: the Google Cloud OAuth client, the Supabase provider and the redirect URLs. Then test sign-in on the live site.
  - **Deletion is by request only.** A "Delete my account" button would make it self-service (`auth.admin.deleteUser` cascades to `account_profiles`).

### 2026-10-22: New logo (monogram)
- **Who:** sohankamsala · P3 Weekly News and Alerts (the teammate picked it from six options)
- **Branch:** main (local commit; not pushed)
- **What changed:** The star logo is replaced by a monogram: a heavy Geist "S" on an ink rounded square, with a brick dot.
  - **In the app:** a new `LogoMark` in `components/civic.tsx` (with `light` for dark backgrounds). It's used by `Logo` (site header, app sidebar, onboarding) and by the alerts phone preview.
  - **Icon files:** regenerated from the same design. These are `app/favicon.ico` (16/32/48), `app/apple-icon.png` and `public/icons/icon-192.png` and `icon-512.png`. The install icons are full-bleed, with the S inside the maskable safe zone.
- **Files:** `components/civic.tsx`, `app/(prototype)/app/alerts/alerts.tsx`, `app/favicon.ico`, `app/apple-icon.png`, `public/icons/`, `DESIGN.md`
- **Contract changes:** `LogoMark` is new; `Logo` keeps its props.
- **Checked:** Typecheck, lint and tests pass. I looked at the logo on the site header, the app sidebar and the alerts preview, and at every icon size.
- **Open issues / next:** The Devpost thumbnail and video should use the new mark.

### 2026-10-22: White UI and one font (Geist)
- **Who:** sohankamsala · P3 Weekly News and Alerts (the teammate's call; touches P5's design system)
- **Branch:** main (local commit; not pushed)
- **What changed:**
  - **Color:** cream is gone. `--surface` is white, and the page behind the cards (`--canvas`) is a cool light gray (`#F2F3F4`). The derived grays mix with ink instead of brown. Red (`--brick`), blue (`--denim`) and ink are unchanged. In the `/app` shell, the main area is transparent over the gray, so white cards float on it.
  - **Font:** Geist everywhere, replacing Overpass for the app and Playfair Display and Libre Franklin on news surfaces. `font-headline` and `font-news` still exist as class names but point at Geist. The Overpass "Middot Fix" font-face was removed.
- **Files:** `app/globals.css`, `app/layout.tsx`, `components/prototype/app-shell.tsx`, `DESIGN.md` (tokens table, type section, checklist), `CLAUDE.md`
- **Contract changes:** Design tokens and fonts changed (DESIGN.md is updated). Anything hard-coded to look right on cream should be rechecked.
- **Checked:**
  - `npm test`, including the contrast test, plus lint and typecheck pass.
  - Every screen checked in the browser shows Geist only: `/app`, `/app/timeline`, `/app/brief`, the story sheet, `/weekly` and the home page.
- **Open issues / next:** Template-written stories still show raw headlines like "Vote Oct. 27: ORDINANCE …". `agendaHeadline` only tidies items with no story at all.

### 2026-10-22: Sign in with Google, plus guest mode (no more re-entering the address)
- **Who:** sohankamsala · P3 Weekly News and Alerts (the teammate asked for it; touches P5's area)
- **Branch:** main (local commit; not pushed)
- **What changed:** The home page asked for the address on every visit. The teammate chose Google sign-in plus a guest mode.
  - **Guest mode (works now):** the `showup_bodies` cookie (body IDs only) now lasts 180 days. `/` sends a returning reader straight to `/app`, and "Change address" links to `/?change=1`.
  - **Google sign-in (code ready, provider off):** `/signin` offers "Continue with Google" or "Continue as guest". Routes are `/auth/google`, `/auth/callback` and `/auth/signout`. Signed-in readers get their body IDs and stakes saved to the new `account_profiles` table (never an address), so they follow them to other devices. The callback restores saved governments, or saves the browser's guest ones. Signing out clears the browser's copy. Signing in stays optional (Project_Plan decision 8).
  - **Shell:** the account menu shows the Google name and avatar or "Guest · saved on this browser", with sign-in or sign-out.
  - **Admin safety:** `requireAdmin` now also needs a password sign-in (the JWT's `amr` claim), so a Google session for an allowlisted email can't open `/admin`.
- **Files:** `lib/account.ts` (new), `app/auth/{google,callback,signout}/route.ts` (new), `app/(public)/signin/page.tsx` (new), `app/(public)/page.tsx` (P5's home), `app/(prototype)/app/use/route.ts`, `app/(prototype)/layout.tsx`, `lib/prototype/{profile.tsx,liveData.ts}`, `components/prototype/app-shell.tsx`, `lib/adminAuth.ts` (P5's), `proxy.ts` (P5's), `messages/*.json` (`Account`), `supabase/migrations/20261022230000_account_profiles.sql` (new), `tests/platform/adminPassword.test.ts` (new)
- **Contract changes:**
  - **New table:** `account_profiles`, with RLS on and no policies; server only.
  - **Proxy:** now also runs on `/` and `/app/*` to refresh the Supabase session, and it skips when the Supabase keys are missing.
  - **Admin:** requires a password sign-in.
- **Handed off to PlaidMod (P5):** the migration is **not applied**. This machine has no database connection (`SUPABASE_DB_URL` is empty) and isn't on the Vercel team, so these four steps are yours. Until then, guest mode works, the Google button stays hidden, and saving to an account is skipped without errors.
- **To turn Google on (someone with Supabase and Google Cloud access):**
  1. Google Cloud Console → APIs & Services → Credentials → create a Web OAuth client. Authorized redirect URI: `https://elsvhqqwdxwsuvkbchdq.supabase.co/auth/v1/callback`.
  2. Supabase → Authentication → Providers → Google: enable it and paste the client ID and secret.
  3. Supabase → Authentication → URL Configuration: add `http://localhost:3000/auth/callback` and `https://showup-htx-six.vercel.app/auth/callback` to the redirect URLs.
  4. Apply the `account_profiles` migration.
  The Google button appears by itself once the provider is on: `googleEnabled()` checks Supabase's auth settings every 5 minutes.
- **Checked:**
  - `npm test` (823), lint and typecheck pass.
  - In the browser, the guest flow works: first visit, lookup, return visit straight to the dashboard, change address. `/signin` shows the "not turned on yet" notice and the guest button.
  - The account menu has "Sign out" for signed-in readers and "Sign out and forget this browser" for guests. Both clear this browser's governments.
  - Google sign-in itself is **not verified**, because the provider is off.
- **Open issues / next:**
  - **P5:** regenerate `lib/database.types.ts` after the migration (`lib/account.ts` uses an untyped client until then).
  - **P5:** add sign-in to the privacy page: we store the Google account's email and name (Supabase Auth) plus body IDs and stakes.

### 2026-10-22: Story job picks the weekly window first; one manual run
- **Who:** sohankamsala · P3 Weekly News and Alerts
- **Branch:** main (local commit; not pushed)
- **What changed:**
  - **The job's order:** `supabaseStoryStore.pending` (`lib/stories/job.ts`) never picked the soonest meetings. Its `order(..., { referencedTable: 'meetings' })` only sorts the joined rows, so it chose arbitrary items out of the 643 waiting. It now takes items in the weekly window first (7 days back to 14 ahead): upcoming meetings soonest first, then the past week, then anything else.
  - **Manual run:** with the teammate's go-ahead, I ran `/api/cron/stories` once from a local server against the production database. It wrote 10 stories (9 AI that passed the code fact-check, 1 template, 0 failed), all for HISD's Oct 22 meeting. Most of those are closed-session items, and their stories use "an employee" as required.
- **Files:** `lib/stories/job.ts`
- **Contract changes:** None.
- **Checked:** Typecheck, lint and the story tests (28) pass. I listed the written stories from the database afterwards.
- **Open issues / next:**
  - About 114 window items still need stories (66 City Council, 38 MUD 489, 19 CFISD). The cron writes 10 per run.
  - Closed-session items get stories even though they show only on the timeline tier. Skipping them in `pending` would save credits; that's a team call.

### 2026-10-22: Photos on the weekly brief, readable agenda titles on real data
- **Who:** sohankamsala · P3 Weekly News and Alerts
- **Branch:** main (local commit; not pushed)
- **What changed:** I checked `/app/timeline` and `/app/brief` against the real database (local env, an address lookup, then "Open your dashboard"). Both show real Houston agenda items.
  - **Brief photos:** each bento tile now has its government's photo under a veil of the tile color. "Also decided" stories have a photo thumbnail. Photos come from `lib/bodyPhotos.ts`, with credits shown.
  - **Readable titles:** real items have no stories yet, so cards showed raw titles like "ORDINANCE finding and determining that…". `lib/weekly/agendaTitle.ts` makes a card headline from the official wording. The leading document type becomes a tag ("Ordinance"), the headline stops at the first clause, and all-caps names are put in normal case. Nothing is reworded; the full official title is the story sheet's summary, next to the source link. Written stories replace this automatically.
- **Files:** `lib/weekly/agendaTitle.ts` (new), `tests/weekly/agendaTitle.test.ts` (new), `lib/prototype/live.ts`, `lib/prototype/types.ts` (`docKind`), `app/(prototype)/app/brief/page.tsx`, `app/(prototype)/app/timeline/page.tsx`
- **Contract changes:** `Update` (`lib/prototype/types.ts`) gains an optional `docKind`.
- **Checked:** `npm test` (822), lint and typecheck pass. Both pages loaded with real data in the browser, with no console errors.
- **Open issues / next:**
  - **Stories:** none of these real items have a written story (`story_en` is null). The story job runs from `/api/cron/alerts`. I didn't run it by hand, because it writes to the production database and uses AI credits.
  - **Photos:** every City Council item shows the same City Hall photo. A few more photos per body would add variety.

### 2026-10-22: Scroll motion on the timeline (Motion library)
- **Who:** sohankamsala · P3 Weekly News and Alerts
- **Branch:** main (local commits; not pushed)
- **What changed:** On `/app/timeline`, tiles slide in from their own side as they scroll up (72px), grow from 88% and untilt from 3°, while each photo moves against the scroll (about 150px of travel). Everything is tied to scroll position, so it reverses when you scroll back, and nothing moves with reduced motion. Two lighter CSS-only versions earlier today were too subtle to notice, so this replaces them.
- **New dependency:** `motion` 13.5.1 (motion.dev, pinned exact). It's used only in the timeline page so far. `npm install` also rewrote some `libc` lines in `package-lock.json`, which is npm-version noise.
- **Files:** `app/(prototype)/app/timeline/page.tsx`, `package.json`, `package-lock.json` (`timeline.module.css` from earlier today was removed)
- **Contract changes:** None.
- **Checked:**
  - Lint, typecheck and tests pass.
  - In Chromium, the tile and photo transforms change as you scroll, and with reduced motion they stay at rest.
  - No horizontal scroll at 320–1440px while scrolling: the timeline column clips sideways overflow.
- **Open issues / next:** Not checked in Firefox or Safari. Motion's scroll tracking supports both.

### 2026-10-22: New timeline layout with photos, motion and a hideable sidebar
- **Who:** sohankamsala · P3 Weekly News and Alerts
- **Branch:** main (local commit; not pushed)
- **What changed:** `/app/timeline` has a new layout (the teammate reviewed five static previews and approved this one). The data and behavior are the same as before.
  - **Layout:**
    - **Left:** the count of chances to weigh in this week (counts up), a "This week's big idea" memo (the week's lead story from `buildWeekly`, or the most urgent item), and topic filters.
    - **Center:** a timeline line with day headings. Photo tiles alternate sides; coming-up items run soonest first, then decided items show as compact rows with their result. Tiles load 6 at a time as you scroll and end with "You're all caught up".
    - **Right:** a live countdown to the next sign-up deadline, and quick actions. The government on/off switches moved here, folding open.
  - **Motion:** tiles fade and rise in as they scroll into view; the left column has a staged entrance 100ms apart; the line fills in as you scroll; tiles lift on hover; buttons press to 0.96. Everything uses CSS transitions; with reduced motion it's opacity only.
  - **Sidebar:** hidden on the timeline so the page uses the full screen. A › button in the top bar brings it back, and it's hidden again on the next visit. Other pages are unchanged. I also fixed "Change address" being highlighted on every page.
  - **Photos:** six real Houston photos from Wikimedia Commons (free licenses), in `public/photos/`. `lib/bodyPhotos.ts` picks one by government (City Hall, HISD headquarters, the 1910 courthouse, Brays Bayou) or by kind, with a skyline fallback. Each tile shows the photo credit. These are not article photos; news images were dropped earlier.
- **Files:** `app/(prototype)/app/timeline/page.tsx`, `components/prototype/reveal.tsx` (new), `components/prototype/app-shell.tsx`, `lib/bodyPhotos.ts` (new), `public/photos/`, `messages/*.json` (`AppTimeline`)
- **Contract changes:** None.
- **Checked:**
  - `npm test` (817), lint and typecheck pass.
  - In the browser at 1440, 1024, 390 and 320px, in demo and live mode: no horizontal scroll and no console errors.
  - More tiles load on scroll, the sidebar hides and reopens, and reduced motion shows everything without movement.
  - Spanish has no missing messages.
- **Open issues / next:**
  - **P5:** the sidebar toggle's label is English, like the rest of the shell.
  - **Photo licenses:** the CC BY-SA photo (courthouse) requires that adapted copies share the license. We only resized it. Swap it for another photo if the team would rather not.

### 2026-10-22: Browser notifications live on production
- **Who:** PlaidMod · helping P3 News and Alerts
- **Branch:** main
- **What changed:**
  - Added `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (sensitive) and `VAPID_SUBJECT` to Vercel for Production and Preview. They're the same pair as `.env.local`.
  - Pushed `2794362` (the feature) and `004d0b9`. The second makes the sign-up route log why a confirmation failed, with the status or reason only and never the push address. The sender now keeps the reason for errors that never reached the push service.
- **Files:** `lib/push/send.ts`, `app/api/alerts/push/route.ts`, their tests, `agent_handoff.md`
- **Contract changes:** None
- **Checked:**
  - Live site: `/manifest.webmanifest`, `/icons/icon-192.png` and `/sw.js` return 200. `sw.js` has the no-cache and CSP headers, and `/alerts` carries the public key.
  - The first live sign-up (deploy `c0sm6t2ef`) saved, but its confirmation never showed. That deploy didn't log the reason. A test send from the local keys to the same subscription arrived, so the subscription and keys were fine.
  - On deploy `khriytob3`, two off-and-on cycles each showed the confirmation; the second took 1.6 s from the click. No failure was logged.
  - The test sign-up was turned off; the users, user_bodies, alert_queue and alerts_sent tables have 0 rows.
- **Open issues / next:** The first missed confirmation is unexplained. If it happens again, `vercel logs` shows `push confirmation failed: …`. Still untested: a real alert from the daily job (no item qualifies today), and iPhone or Safari.

### 2026-10-22: Alerts go out as browser notifications (Twilio dropped)
- **Who:** PlaidMod · helping P3 News and Alerts
- **Branch:** main
- **What changed:** Twilio requires the account owner's ID verification, which the team declined, and carrier registration takes days. Alerts now also go out as Web Push browser notifications: the same rules, quiet hours, once-only sending, reminders 7a/7b and protest reminder. The app signs them with its own keys, so no outside account is needed. The texting code is unchanged and off; text sign-up still shows a labeled preview.
  - **Sign-up:** a new "Browser notifications" panel sits above "Text messages" on `/app/alerts` and `/alerts` (`components/alerts/PushSignup.tsx`). It uses the same consent and under-18 parent rule as texts. `POST /api/alerts/push` saves the subscription with the reader's governments, sets `showup_sub` and sends a confirmation. `DELETE` deletes the row.
  - **Sending:** `runAlertsJob` takes an optional `push` sender, and `/api/cron/alerts` passes it when the `VAPID_*` keys are set. Expired subscriptions (404/410) are deleted. Only Google, Mozilla, Apple and Microsoft push hosts are accepted.
  - **iPhone:** `app/manifest.ts`, Home Screen icons and `public/sw.js` (shows notifications only, no caching).
  - **Copy:** "Text alerts" became "Alerts" in the nav, page titles, why-page and links (EN/ES). The privacy and terms pages name the push services. Both pages' effective date is now Oct 22.
- **Files:** `lib/push/*`, `lib/sms/{job,schedule,eligibility,message,subscribers,types,http}.ts`, `app/api/alerts/push/route.ts`, `app/api/cron/alerts/route.ts`, `components/alerts/PushSignup.tsx`, both alerts pages, `components/prototype/app-shell.tsx`, `app/manifest.ts`, `app/apple-icon.png`, `public/{sw.js,icons/}`, `next.config.ts` (sw.js headers), `messages/*.json`, `lib/env.ts`, `.env.example`, `supabase/migrations/20261022201640_push_alerts.sql` (applied), `lib/database.types.ts`, `package.json` (`web-push`), tests in `tests/push/`, `tests/sms/`, `tests/api/push-route.test.ts`. Docs: both plan files, `.plans/p3-twilio-registration.md`, `CLAUDE.md`, `docs/{readiness,project-pace,testing-checklist}.md`.
- **Contract changes:** DB schema: `users` gains `push_endpoint` (unique), `push_p256dh` and `push_auth`, all set or all null (§16). `AlertUser` gains an optional `push`. `AlertsJobResult` gains `removed`. `reminderText` output is unchanged, now built from the shared `reminderSentence`.
- **Checked:**
  - Tests: `npm test` passes (815 Vitest + 72 P4 tests). Typecheck, lint and `npm run build` are clean. New tests were watched failing first.
  - Local built app in Chromium, City Hall lookup: turning notifications on returned 200, and the confirmation arrived through Google's push service and was shown by the service worker. The database got 1 row with no phone, following 7 governments. Turning off removed the row, its governments and the cookie, and the tables are back to 0.
  - The alerts store's reads work on the real schema.
  - `/alerts` in Spanish at 390px has no sideways scroll.
  - Supabase security advisors show nothing new.
- **Open issues / next:**
  - **Vercel:** the three `VAPID_*` keys are in `.env.local` only. Until they're added to Vercel (production and preview, the same pair), the live page shows the notifications preview.
  - No upcoming item is in the alert tier today, so the daily job (16:00 UTC) has nothing to send. A real alert, beyond the confirmation, hasn't been seen yet.
  - Not tested on a real iPhone or in Safari.
  - **For P4:** Speak up's labels still say "SMS reminder" (`speak.saveReminder`, `speak.reminderNote`). Reminders now also reach notification subscribers through `showup_sub`; consider "reminder."
  - The `/alerts/why` route and `?why=` links keep their names; only the visible wording changed.

### 2026-10-21: HCAD data for 6 more ZIPs (30 in all)
- **Who:** PlaidMod · P5 Platform (P1's lookup data)
- **Branch:** main
- **What changed:** Ran the HCAD slice workflow (run 39703086677) for 77020, 77022 and 77026 (City of Houston, HISD) and 77040, 77041 and 77064 (Cypress-Fairbanks). Loaded 78,164 parcels; 536 with no tax codes were skipped. That makes 385,337 parcels and 3,435,567 tax-code rows in 30 ZIPs. The local slice is deleted. No code changed.
- **Files:** `docs/p1-data-loading.md`, `agent_handoff.md`
- **Contract changes:** None
- **Checked:**
  - The new totals equal the earlier ones plus exactly what the workflow staged.
  - By school district, the new parcels are CFISD 41,187, HISD 35,093, Aldine ISD 1,700, and under 200 in other districts.
  - Live, 40 random new addresses: all gave `match: hcad`; 36 got the HISD or CFISD board. A second live sample of 30: all 30 got a board.
  - Local dev server, 110 random new addresses: 106 got a board. 3 are in Aldine ISD or Spring Branch ISD, which we don't track, and are listed as not tracked. 1 was "not found": a street address shared by several accounts, sent without a ZIP (the known test-format case in the entry below).
- **Space:** the quota is at 435 MB of 500. The tax-code index grew from 107 MB back to 156 MB.
- **Open issues / next:**
  - Don't load more ZIPs without freeing space first. An average ZIP adds about 16 MB; another index rebuild (the two runs in `docs/p1-data-loading.md`) would return about 20 MB.
  - **For P1:** HCAD code `012`, HOUSTON ISD (FORMERLY NFISD), isn't in `data/hcad-jurisdiction-map.yaml`. No loaded parcel has it, but in ZIPs where it appears the lookup would list it as untracked instead of showing the HISD board. Source-check it and add it to the map before loading those ZIPs.

### 2026-10-21: Rebuilt the HCAD tax-code index (48 MB freed)
- **Who:** PlaidMod · P5 Platform (P1's lookup data)
- **Branch:** main
- **What changed:**
  - **Index.** PlaidMod rebuilt `hcad_jurisdictions_pkey` in the Supabase SQL editor. The primary key was dropped, then added back in a separate run with the migration's definition, `(account, hcad_code)`. A plain `REINDEX` was ruled out because it keeps the old index until the new one is built, and the quota would have peaked near 499 MB. No schema change.
  - **Space.** The index went from 155 MB to 107 MB. The quota total went from 386 MB to 338 MB of 500.
  - **Log fix.** A merge on Oct 19 (`50aae75`) had pasted a second copy of this file's header into the P5 Task 8 (`bodies_token`) entry, which cut off its ID-format line. The copy is removed and the line restored from before the merge. Nothing else in that entry changed.
- **Files:** `docs/p1-data-loading.md`, `agent_handoff.md`
- **Contract changes:** None
- **Checked:**
  - The primary key is valid, and the 2,760,722 rows are unchanged.
  - The lookup's join uses an index-only scan on the new key.
  - Live: 20 random loaded addresses all gave `match: hcad`. 901 Bagby St gives `hcad` with 7 governments and 3 untracked, the same as before.
  - Disk: about 800 MB of 1 GB. 464 MB of that is the write-ahead log, mostly spare files that Postgres reuses.
- **Correction:** The entry below says 371 MB of 500. That figure was the main database only. The quota counts all the project's databases, including Postgres's two template databases (7 MB each), so the total was 386 MB.
- **Open issues / next:** There's room for about 6 more ZIPs of average size, about 13,000 parcels each. That's an estimate: new loads grow the index faster than the table. To reclaim the space later, repeat the two-run rebuild in `docs/p1-data-loading.md`.

### 2026-10-21: HCAD data for 14 more ZIPs; HCAD matches no longer need a map point
- **Who:** PlaidMod · P5 Platform (P1's lookup data and route)
- **Branch:** main
- **What changed:**
  - **More ZIPs.** Ran the HCAD slice workflow (run 39686003192) for 77009, 77011, 77018, 77023, 77025, 77027, 77030, 77054, 77056 and 77096 (City of Houston, HISD), plus 77065, 77070, 77095 and 77429 (Cypress-Fairbanks). Loaded 164,767 parcels; 1,379 with no tax codes were skipped. That makes 307,173 parcels in 24 ZIPs. The local slice is deleted.
  - **Space.** The database is at 371 MB of the 500 MB free-plan limit, so don't load many more ZIPs. The tax-code index is 155 MB, bigger than its table, because later loads insert between existing accounts.
  - **Route fix.** An HCAD match with no map point used to return 404 "We could not resolve a location for that parcel." That happened whenever the Census couldn't place the address, because the slice loads no parcel points. Tech plan §5 step 4 says "not found" is only for when neither source matches, so the route now answers from the tax codes and skips only the boundary check (no boundaries are loaded anyway).
- **Files:** `app/api/lookup/route.ts`, `tests/api/lookup-route.test.ts`, `docs/p1-data-loading.md`
- **Contract changes (P1):** P1's test "rejects a parcel without any valid Census or HCAD coordinates" is replaced by "confirms an HCAD match the Census cannot place". The response shape is unchanged.
- **Checked:**
  - The new test failed with the old 404, then passed.
  - Shared addresses: 6,571 confirmed and 95 use the Census answer (up from 49, as more ZIPs share street addresses).
  - Live, before the fix: 40 random new addresses gave 34 HCAD-confirmed, 1 Census and 5 with the 404 above. Big campuses and malls (TMC, Galleria, Willowbrook) aren't filed in HCAD under their public street address, so they use the Census answer.
  - Live, after the fix: 40 random loaded addresses gave 37 HCAD-confirmed, 1 Census and 2 "not found". The 2 were sent as "<street>, Houston, TX" with no ZIP, so the Census couldn't place them, and they sit at addresses whose accounts disagree on tracked codes. With a real city and ZIP they get the Census answer.
  - Offline, 2,000 stored addresses all survive the lookup's normalization unchanged. 95 addresses (5,077 parcels, 1.65%) have accounts that disagree on tracked codes; the largest has 1,194 accounts.
- **Open issues / next:** More ZIPs need space first: drop unneeded rows or rebuild the index while there's room.

### 2026-10-21: Lookup fix, part 4: live site switched to the fixed build
- **Who:** PlaidMod · P5 Platform
- **Branch:** main
- **What changed:** PlaidMod promoted `showup-fqf2bmerz` (commit `79f4f91`) to production. The rollback pin to `showup-kljzsrb88` from the entries below no longer applies. No code changed.
- **Files:** `agent_handoff.md`
- **Contract changes:** None
- **Checked (on https://showup-htx-six.vercel.app):**
  - `/api/lookup`: 901 Bagby St and 10707 Mason Rd give `match: hcad` with the same governments as the local test. Pasadena City Hall gives `match: census` and lists Pasadena City Council and Pasadena ISD as not tracked.
  - At 390 px: `/results` shows "Address match verified" with no sideways scroll. "Open your dashboard" turns `/app` to real data with no "Sample data". The downtown address shows 7 governments and 52 things this week.
- **Open issues / next:**
  - The Cypress-area address shows 0 things this week. Its bodies have no upcoming meetings in the database yet (latest: CFISD and MUD 489 Oct 19, Commissioners Court Oct 15, Lone Star Oct 1). The 3-hourly ingest runs are succeeding, so they should appear once the agendas are posted (P2).
  - Opening `/app` directly, without the dashboard link, still shows the demo. That's by design.
  - Promoting a build ends the rollback, so pushes to `main` go live on their own again (Vercel's "Undo a rollback" docs). Teammates' commits still wait for the owner's approval.

### 2026-10-21: Verify OpenRouter, correct coach timing claims and assess deadline pace
- **Who:** BluePhoenix79 · P4 / release verification
- **Branch:** main, based on `79f4f91`
- **What changed:** Tested both configured models and the real coach route through OpenRouter. Live review caught a practice target being described as an official limit and incorrect generated duration prose. Preserved limit verification in the API/model context and made bilingual timing feedback deterministic. Added regression tests, the live results report and a dated owner-by-owner pace assessment; refreshed readiness and the testing guide. User requested commit/push of this work.
- **Files:** `app/api/coach/route.ts`, `lib/coach/{types,shared,service}.ts`, `tests/{coach/integration.test.ts,p4/coach.test.mjs}`, `docs/{openrouter-verification,project-pace,readiness,p4-status,testing-checklist}.md`, `agent_handoff.md`
- **Contract changes:** Internal `CoachItem.minutesVerified` is optional; unknown official minutes are null in provider context, with a separate practice target. Public response schema and database contracts are unchanged.
- **Checked:** Three new timing regressions and the strengthened integration assertion failed before the fix and pass afterward. Fresh full suite: 786 Vitest + 72 P4 (858), lint, typecheck and production build pass; initial full run hit the existing ESLint isolation timeout, then passed on rerun. Independent review found no blocking issue. Both `gemini-3.8-flash` and `gemini-4-argon` return structured JSON via OpenRouter. Ten post-fix EN/ES coach cases all return provider feedback with correct timing/practice labels, exact quotes and no-store; 5.9–12.5s, no local fallback. Twenty coach calls total across before/after checks may exhaust the local shared hourly allowance. No key values printed or edited; no SMS, quiz answers, registrations/comments, ingest or admin mutations submitted.
- **Open issues / next:** Core software works, but planned evidence/demo acceptance is behind: 636 of 646 items need stories, zero coverage/demo-cache rows, tax rates empty and one quiz response of unknown provenance. P4 must verify a current real participation route (Oct 22 HISD hearing is not confirmed open public comment), finish meeting-specific checks and retain real participation evidence. Other owners: stories/coverage, tax data, consenting SMS acceptance, demo/video/submission. Official Devpost deadline is Oct 24 00:00 CDT, after Friday night; older CST label is inaccurate. Legacy address storage and shell translation remain open. Plan stress test remains pending under the existing P4 implementation-spec exception.


### 2026-10-21: Pull current lookup and ingest work; refresh P4 test guide
- **Who:** BluePhoenix79 · P4 / integration verification
- **Branch:** main, fast-forwarded from `1e46631` to `79f4f91`
- **What changed:** Read the lookup, ingest, review and provider handoffs. Preserved the local October 20 audit in a recovery stash, resolved its handoff-only conflict, and replaced outdated readiness claims with current evidence. Added a full testing checklist with P4 steps, EN/ES coaching cases, public addresses and expected results; refreshed P4 status.
- **Files:** `docs/testing-checklist.md`, `docs/readiness.md`, `docs/p4-status.md`, `agent_handoff.md`
- **Contract changes:** None; no product code or environment changes.
- **Checked:** 786 Vitest + 69 P4 tests (855), lint, typecheck and production build pass. First test run hit the existing ESLint isolation timeout; full rerun passed. Live reads: 11 bodies, 7 sources, 6 meetings, 646 items, 142,406 parcels; tax_rates and demo_cache empty. City Hall and Bridgeland HS return HCAD matches; TSU returns Census fallback. Built cron routes reject with 401, review redirects to login, and coach rejects malformed/cross-origin input with 400/403 and no-store. Spanish 390px City Hall results and real P4 flow have no horizontal overflow; Wednesday Council registration stays unknown, synthetic draft restores, practice renders, and the real-item redirect works. No quiz/provider/SMS/admin/ingest or official participation actions performed; lookup uses normal quota bookkeeping.
- **Open issues / next:** OpenRouter and Twilio remain absent in this local env despite P5's owner/deployment setup; privately obtain current config. Finish live EN/ES evaluation and authentic participation. Legacy `/start` still persists the address, shell text remains partly English, and the root palette swapper is absent. Production promotion and tax/demo data remain owner work; see readiness. No commit or push.

### 2026-10-21: Lookup fix, parts 2–3: HCAD data for 10 ZIPs loaded; shared addresses resolved
- **Who:** PlaidMod · P5 Platform (P1's lookup data and RPC, decided by PlaidMod)
- **Branch:** main
- **What changed:**
  - **HCAD data without a laptop download.** New workflow `.github/workflows/hcad-slice.yml` (run by hand). GitHub's runner downloads HCAD's 2026 property files, keeps only the chosen ZIPs and the allowed columns (account, street address, legal description, tax codes; no owner, mail or value fields), dry-runs the loader, and uploads a 4.2 MB private artifact kept for 3 days. Run 39546716606 produced it. I loaded it from this computer with `npm run load:hcad -- --apply`.
  - **Loaded:** 142,406 parcels and 1,285,421 tax-code rows for ZIPs 77002, 77003, 77004, 77006, 77007, 77008, 77019, 77021, 77098 and 77433. The database is 159 MB of 500.
    - 1,853 accounts had no tax codes and were skipped.
    - 1 malformed row in HCAD's countywide file was skipped (`ff75cbc`).
    - Also seeded: P1's body catalog (11 rows; same IDs and texting flags as before, P1's names) and the jurisdiction map (9 codes). All 646 agenda items are unchanged.
  - **Loader and staging:** parcel points are optional (the lookup uses the Census point). `load:hcad` now keeps shared addresses and unmapped codes and skips parcels with no codes (`planHcadLoad`).
  - **Shared street addresses (condos, and one street address in two ZIPs):**
    - New migration `20261021050753_hcad_lookup_code_sets.sql`, applied. `lookup_hcad_parcel` returns one account per different tax-code set at an address, instead of the first 2 accounts. Before this, 219 addresses could get the wrong answer.
    - The route confirms an address when all its accounts share the same *tracked* codes, and lists only the untracked governments every account shares. When tracked codes differ it uses the Census answer instead of returning "not found".
    - Result: 3,750 of 3,799 shared addresses are confirmed; 49 use the Census answer.
  - **Names:**
    - Codes with no name in HCAD's public list are no longer shown. Ten such codes appear in these ZIPs; "HCAD tax code 888" told readers nothing.
    - HCAD abbreviations are spelled out ("Houston Downtown Management District").
- **Files:** `.github/workflows/hcad-slice.yml`, `scripts/{stage-hcad,load-hcad}.ts`, `lib/lookup/{hcadStaging,hcadSource,uncovered}.ts`, `app/api/lookup/route.ts`, `supabase/migrations/20261021050753_hcad_lookup_code_sets.sql`, `docs/p1-data-loading.md`, `tests/lookup/{hcadStaging,uncovered}.test.ts`, `tests/api/lookup-route.test.ts`
- **Contract changes (P1):**
  - `lookup_hcad_parcel` keeps its signature and columns, but its rows now mean "one per tax-code set", with no row limit. `lib/database.types.ts` is unchanged.
  - `uncoveredFromHcadCode` returns `null` for unnamed codes.
  - The route reads the whole `jurisdiction_map` up front.
  - P1's shared-address test now expects the Census answer, not a 404.
- **Checked:**
  - New tests failed first, then passed. `npm test`: 786 Vitest + 69 P4 pass. Typecheck, lint and build pass.
  - Built app against the real database:
    - 901 Bagby St (City Hall, 77002) is confirmed by HCAD, with 7 tracked governments plus the Hospital District, Department of Education and Downtown Management District.
    - 10707 Mason Rd (Bridgeland HS, 77433) is confirmed with CFISD, Lone Star and MUD 489, plus WCID 157, WCID 159 and ESD 9.
    - 3100 Cleburne St (TSU, 77004) has no exact HCAD street match, so it uses the Census answer.
    - Pasadena City Hall is outside the loaded ZIPs, so it uses the Census answer.
  - In the browser at 390 px: `/results` shows "Address match verified" for every body with no sideways scroll, and `/app` shows real City Council and HISD items with no "Sample data".
  - The Supabase security check shows nothing new.
- **Open issues / next:**
  - Production is still pinned to `showup-kljzsrb88` and needs promoting to a build with these changes.
  - Other ZIPs: rerun the workflow with the full list.
  - Boundaries (GIS) aren't loaded and aren't needed for the lookup.
  - ESDs, WCIDs and the countywide Hospital District and Department of Education are listed but not tracked.

### 2026-10-21: Lookup fix, part 1: never fails on governments we don't track; Census fallback
- **Who:** PlaidMod · P5 Platform (changes to P1's lookup, decided by PlaidMod)
- **Branch:** main
- **What changed:** Fixes problems 1 and 3–7 from the review entry below.
  - **Unknown governments:** HCAD codes with no curated body (043 Hospital District, 044 Department of Education, ESDs, other ISDs and cities) and Census places or districts outside the catalog no longer fail the lookup. They're listed in a new `uncovered` array by official name, typed for the quiz, and are never put in the token.
    - Names come from HCAD's public list, in `data/hcad-jurisdictions.json` (708 codes, names only; regenerate with `npx tsx scripts/fetch-hcad-jurisdictions.ts`).
    - The helpers are in `lib/lookup/uncovered.ts`.
  - **No HCAD parcel loaded:** the lookup falls back to the Census answer (city, school district, college district, and the countywide governments), sets `match: 'census'`, and puts every listed body in the token so the dashboard works. `/results` labels these "From the Census, not yet confirmed" and explains why.
  - **Several accounts at one address** (condos) are accepted when their tax codes match.
  - CenterPoint is listed once.
  - **The quiz:** `/api/quiz` also counts `uncovered_types`, which `BodyQuiz` now sends.
- **Files:** `app/api/lookup/route.ts`, `lib/contracts/lookup.ts`, `lib/lookup/uncovered.ts`, `data/hcad-jurisdictions.json`, `scripts/fetch-hcad-jurisdictions.ts`, `app/(public)/results/page.tsx`, `app/api/quiz/route.ts`, `components/flow/BodyQuiz.tsx`, `messages/{en,es}.json` (`Results`), `tests/api/{lookup,quiz}-route.test.ts`, `tests/lookup/uncovered.test.ts`, `tests/platform/lookupState.test.ts`
- **Contract changes:** `LookupResponse` gains `match: 'hcad' | 'census'` and `uncovered: LookupUncovered[]`. P1's tests that encoded fail-closed behavior now encode PlaidMod's decisions (list instead of fail; Census fallback).
- **Checked:**
  - The new tests failed first, then passed. `npm test`: 781 Vitest + 69 P4 pass. Typecheck, lint and build pass.
  - The built app against the real database (no HCAD data loaded yet):
    - 901 Bagby St gives `match: census` with 7 bodies, plus the Hospital District and Department of Education as uncovered.
    - Pasadena City Hall gives the countywide bodies, with Pasadena City Council and Pasadena ISD listed as uncovered.
  - In the browser, `/results` (Spanish, 390 px) shows the Census note, the "other governments" list and one CenterPoint, with no sideways scroll. The quiz wasn't submitted, to keep test rows out of `quiz_responses`.
- **Open issues / next:** Part 2 loads HCAD data for 10 ZIPs (77002, 77003, 77004, 77006, 77007, 77008, 77019, 77021, 77098, 77433) through a GitHub Actions run, so the big files never touch a laptop. `load:hcad` still refuses unknown codes and needs the same change. Production stays pinned to `showup-kljzsrb88` until the lookup is verified with real data.

### 2026-10-21: Review of P1's new lookup: problems not in P1's notes
- **Who:** PlaidMod · P5 Platform (review of `e26b379`, `app/api/lookup/route.ts` and `lib/lookup/`)
- **Branch:** main
- **What changed:** Docs only. These problems are on top of the open items P1 already listed (credentials, data loading, demo addresses, the unmapped-code decision). PlaidMod (P5) is fixing these next, so P1 doesn't need to.
- **Files:** `agent_handoff.md`
- **Contract changes:** None yet.
- **Checked:** Static review. HCAD's official code list was checked at `public.hcad.org/resources/jurlist.asp` on Oct 21. A local run against the real database returned 500 for 901 Bagby St (no HCAD data loaded).
- **Open issues / next, most severe first:**
  1. **Every real address fails.** Codes 043 (HARRIS COUNTY HOSPITAL DISTRICT) and 044 (HARRIS COUNTY DEPARTMENT OF EDUCATION) are countywide, so they should appear on every parcel (worth confirming against one real record). Neither is in `data/hcad-jurisdiction-map.yaml`, and any unmapped code throws "Some local taxing jurisdictions are not configured yet".
  2. **Unincorporated addresses fail.** They carry an ESD code (for example 633 = ESD 9, 640 = ESD 14), none is mapped, and the catalog has no ESD bodies. MUD 489 is unincorporated, so the demo MUD address would fail.
  3. **Anywhere outside Houston, HISD and CFISD fails with a 500 "Try again later".** Unmapped ISD and city codes cause it, and so do Census hints such as `katy_isd_board` or `pasadena_city_council` that aren't in the 11-entry catalog. Retrying can't help, and the classmate survey would hit this for most other addresses.
  4. **Only addresses whose HCAD data is loaded work.** P1 plans to load only the demo ZIP codes (the 500 MB limit), and there's no fallback. The previous Census-only lookup worked countywide.
  5. **Condos and townhomes fail.** Unit numbers are stripped, so several accounts share one key, and two or more matches throw "could not match that address to one parcel". These accounts normally have the same tax codes.
  6. **CenterPoint appears twice** once the catalog is seeded: it's hard-coded in the route and also read from `bodies` (`category: not_government`), giving duplicate cards and React keys.
  7. **The real reason never reaches the screen.** `components/flow/LookupProvider.tsx` (P5) keeps only the error code, so coverage gaps show as a generic server error.
  - P1's route tests mock a database in which every code is mapped, so none of these show up in the tests.

### 2026-10-21: P1's lookup migration applied; database types regenerated
- **Who:** PlaidMod · P5 Platform
- **Branch:** main
- **What changed:**
  - Applied P1's `p1_lookup_support` migration to Supabase. It recorded as version `20261021040012`, so I renamed the file from `20261020160000_p1_lookup_support.sql` to match. P1's entries that use the old name are out of date.
  - The migration adds `tax_rates.last_vote_date` and the service-role-only functions `load_hcad_batch`, `replace_hcad_boundary_layer`, `lookup_hcad_parcel`, `lookup_boundary_bodies` and `lookup_hoa_candidates`.
  - `lib/database.types.ts` now has the new column and functions, matching Supabase's generated types.
  - `docs/p1-data-loading.md` names the new file.
- **Files:** `supabase/migrations/20261021040012_p1_lookup_support.sql` (renamed), `lib/database.types.ts`, `docs/p1-data-loading.md`
- **Contract changes:** As in P1's entries: the new `tax_rates` column and the five functions. No new tables.
- **Checked:**
  - The migration applied cleanly. Its tables and columns were checked against `core.sql` first.
  - SQL: 0 tables without RLS, 0 policies. All five functions are `security invoker`, `anon` and `authenticated` can't execute them, and `service_role` can.
  - The security advisor shows nothing new (only the expected "RLS enabled, no policy" notices and the leaked-password setting).
  - `npm test`: 772 Vitest + 69 P4 pass. Typecheck and lint pass.
- **Open issues / next:**
  - **Production is pinned to `showup-kljzsrb88`** (a Vercel rollback after `3fc2599`). P1's new lookup still returns 500 for every address, because the HCAD parcels, `jurisdiction_map` and boundaries are empty. Promote a newer deploy only once the lookup works against the real database.
  - **For P1:**
    - run `npm run seed:bodies` and the HCAD / boundary loaders (`docs/p1-data-loading.md`)
    - pick the two demo addresses
    - get the team's decision on unmapped HCAD codes (fail closed vs. "other taxing unit")
  - P1 needs a copy of `.env.local`; ask PlaidMod privately.

### 2026-10-21: OpenRouter key is live; the Gemini key is gone
- **Who:** PlaidMod · P5 Platform
- **Branch:** main
- **What changed:**
  - **`OPENROUTER_API_KEY`:** set in the owner's `.env.local` and on Vercel (production and preview, stored as sensitive).
  - **Removed:** `GEMINI_API_KEY` and `GOOGLE_GENAI_USE_VERTEXAI`, from both.
  - **Live site:** redeployed. Every AI call (P2 extraction and news links, P3 stories and coverage, P4 coach) now goes through OpenRouter.
  - **Repo:** `.env.example` marks the Gemini-direct lines "not used"; `CLAUDE.md` says the key is set; `scripts/gemini-smoke.ts` now reports "OpenRouter" when that key is set.
- **Files:** `.env.example`, `CLAUDE.md`, `scripts/gemini-smoke.ts`
- **Contract changes:** None. Teammates' local `.env.local` copies need the new key; ask PlaidMod for it privately. Leave the Gemini lines blank.
- **Checked:**
  - The key is valid and on a paid plan, with a $10 spending cap.
  - With the Gemini key hidden from the process, these calls all worked: `generateJson` with `gemini-3.8-flash` and with `gemini-4-argon` (D17's fallback, which Vertex doesn't serve), and P2's `geminiFromEnv()` client.
  - After the redeploy, `/api/coach` answered from the AI (`provider: gemini`), and `/api/cron/stories` wrote 10 stories (9 AI, 1 template, 0 failed).
  - Cost so far: $0.08, about 0.8¢ a story.
- **Open issues / next:**
  - About 540 items still need stories. At 10 per run that takes many runs, and roughly $4–5 of the $10 cap. Raise the key's limit on OpenRouter if agenda reading and coverage also need room.
  - P3: putting upcoming meetings first in the story queue is still open (see the P2 Phase 2 part 1 entry).

### 2026-10-20: Pull OpenRouter changes and audit remaining readiness
- **Who:** BluePhoenix79 · P4 / integration audit
- **Branch:** main, clean fast-forward through `1e46631`
- **What changed:** Read the new provider/privacy/IP-limit handoffs and checked the root app against live table counts and actual routes. Added `docs/readiness.md` with prioritized owners, evidence needed and the legacy `/start` address-storage mismatch. No product-code or credential changes.
- **Files:** `docs/readiness.md`, `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** 650 Vitest + 69 P4 tests (719), lint, typecheck and production build pass. Initial isolation-test timeout passed on the next full run. Built privacy/terms/Speak pages return 200; Spanish privacy text includes OpenRouter and coach cookie. Alerts cron rejects unauthorized requests (401); ingest and review routes return 404. Supabase reads succeed; ten civic/demo tables checked are empty.
- **Open issues / next:** Priorities: persisted ingestion and seeded data; real P1 lookup/quiz/tax receipt; OpenRouter key and live model checks; Twilio or explicit preview; review route; wired demo replay; evidence. Local provider remains Gemini-direct because the OpenRouter key is absent. `/start` still persists the address despite privacy copy. Deployment settings were not independently checked. No messages, submissions, writes to civic data, commit or push performed.

### 2026-10-20: P2 Phase 2, part 3: review queue, 3-hourly schedule, pitch line for D37
- **Who:** PlaidMod · P5 Platform, for P2
- **Branch:** main
- **What changed:**
  - **`/admin/review`** (spec P2-E, minimal): pending items with the quote, a "scanned, quote unverified" banner, the official source link, and Approve and Reject. Reject also sets tier `timeline`. A source health panel sits on top. Logic lives in `lib/review.ts`, and every action calls `requireAdmin()` and updates only rows that are still pending.
  - **`.github/workflows/ingest.yml`:** calls `/api/cron/ingest` every 3 hours, plus a manual run with an optional source and mode.
  - **Health fix:** `health()` no longer flags the manual source for having no meetings.
- **Files:** `app/admin/review/{page,actions}.tsx|ts`, `lib/review.ts`, `messages/{en,es}.json` (`Admin.review`), `lib/ingest/health.ts`, `.github/workflows/ingest.yml`, `.plans/scraper-progress.md`, `tests/platform/review.test.ts`, `tests/unit/health.test.ts`
- **Contract changes:** None.
- **Checked:**
  - The new tests failed first, then passed.
  - `npm test`: 721 Vitest + 69 P4 pass. Typecheck, lint and build pass, with no tracing warnings.
  - In the browser, `/admin/review` redirects to the login page when signed out (307). Signed in, it shows the health panel and an empty queue (no item needs review right now) in Spanish, with no sideways scroll at 390 px.
  - Approve and Reject weren't clicked against live data: the database edit that would have created a test item was blocked, so they're covered by unit tests only.
- **Open issues / next:**
  - **The owner should approve this replacement for the pitch answer in spec §12.22:** "For news sites we follow each site's robots.txt, name our bot, show only short quotes with links, and never get around paywalls. Government agendas are public records, so we fetch them even where a portal's robots.txt asks general crawlers to stay out (Houston's PrimeGov portal, Lone Star College's PDFs). We name our bot, wait between requests, check a few times a day, and link every item to the official source."
  - Disable the GitHub schedule after Oct 23.
  - **Not built:** review Edit and notices, the "Run now" button, the news read route, and the `news_articles` migration.

### 2026-10-20: P2 Phase 2, part 2: scheduled ingest route
- **Who:** PlaidMod · P5 Platform, for P2
- **Branch:** main
- **What changed:**
  - **New route `GET`/`POST /api/cron/ingest`** (spec P2-C). It runs `runScheduled` (`lib/ingest/scheduled.ts`) within 270 s:
    1. seed
    2. near-term sweep of every source (BoardBook skipped 00:00–05:00 Central; AI sources read at most 1 new document)
    3. rotation of the oldest-checked source
    4. results for up to 3 past meetings
    5. more rotation while time remains, at most one AI source per call
  - **Query options:** `?source=<id>&mode=rotation|near_term|results&meetings=a,b` runs one source.
  - **Auth and output:** it requires `CRON_SECRET` and returns counts and flags only. Vercel's daily cron already points here (`vercel.json`).
  - **Bundling:** `next.config.ts` ships `data/sources.yaml` and `data/manual/` with the route. Ignore comments on the two run-time file reads (`lib/adapters/manual.ts`, `lib/ingest/registry.ts`) stop Turbopack tracing the whole project: 681 traced files down to 151.
- **Files:** `app/api/cron/ingest/route.ts`, `next.config.ts`, `lib/adapters/manual.ts`, `lib/ingest/registry.ts`, `tests/unit/ingest-route.test.ts`
- **Contract changes:** None. The route path matches `vercel.json`.
- **Checked:**
  - The route tests failed first, then passed.
  - `npm test`: 715 Vitest + 69 P4 pass. Typecheck, lint and build pass, and the build shows no tracing warnings.
  - Part 1 is live: for 901 Bagby St, `/api/weekly` returns a City Council lead plus 6 coming up, with PrimeGov source links.
- **Open issues / next:** Part 3: the review page and the GitHub workflow.

### 2026-10-20: P2 Phase 2, part 1: agendas are saved to Supabase
- **Who:** PlaidMod · P5 Platform, building P2's Phase 2 at the owner's request (Iarush asked for help)
- **Branch:** main
- **What changed:**
  - **The robots.txt problem.** It wasn't specific to Gemini: our own bot downloads every page, and the model only reads what we pass it. The `*` group blocks every bot on City Council's PrimeGov site and on Lone Star's PDFs. Owner decision D37 (in `.plans/scraper-progress.md`): keep fetching these government records politely. News still follows D36.
  - **New ingest pipeline** (spec P2-B): `lib/ingest/run.ts`, with the store in `store.ts`, `supabaseStore.ts` and `memoryStore.ts` (tests). It upserts meetings and items, classifies with P3's `classify()`, sets review status, marks removed items, moves upcoming → awaiting_result, applies outcomes and stores documents. A second identical run writes nothing.
  - **Seeding:** `lib/ingest/bodies.ts` and `seed.ts` insert 10 body rows (insert-only) and mirror `data/sources.yaml` into `sources`.
  - **CLI:** `npm run ingest`.
  - **Adapter list:** `ADAPTERS` moved from `scripts/scrape.ts` to `lib/ingest/adapters.ts`.
  - **Adapters:** `llmExtract.ts` and `primegov.ts` accept `max_llm_docs`.
  - **Live backfill:** 646 items across 6 sources; per-source counts are in the progress log.
  - **Fixes to other parts' readers, which capped or dropped rows once real data arrived** (new `lib/paging.ts`):
    - P3's `loadItems` (`lib/weekly/data.ts`) took 500 unordered rows, so City Council and HISD vanished behind 493 Commissioners Court items. It now pages through all rows.
    - P3's `loadPerspectives` now asks for IDs in batches.
    - P4's `loadRegistrationWindows` now pages.
- **Files:**
  - `lib/ingest/{run,store,supabaseStore,memoryStore,bodies,seed,adapters}.ts`
  - `lib/paging.ts`, `scripts/ingest.ts`, `scripts/scrape.ts`, `lib/adapters/{llmExtract,primegov}.ts`
  - `lib/weekly/data.ts`, `lib/perspectives/job.ts`, `lib/registration/server.ts`
  - `package.json`, `CLAUDE.md`, `.plans/scraper-progress.md`
  - tests: `tests/unit/ingest-{run,scheduled,bodies}.test.ts`, `tests/platform/paging.test.ts`, plus new cases in the llmExtract and primegov tests
- **Contract changes:**
  - **For P1:** `bodies` now has rows for `houston_city_council`, `commissioners_court`, `flood_control`, `port_houston`, `hisd_board`, `cfisd_board`, `hcc_board`, `lone_star_board`, `hcmud_489` and `hcad`. They're inserted only when missing and never overwritten, so fill in the other columns freely, but don't rename the IDs.
  - **`sources`:** the table mirrors the YAML, and `sources.last_checked` now means "last rotation run".
  - **`items`:** the meeting columns and `review_status` follow spec P2-B.
- **Checked:**
  - New tests failed first, then passed. Breaking the retry rule on purpose made its test fail.
  - `npm test`: 709 Vitest + 69 P4 pass. Typecheck, lint and build pass.
  - Live, against Supabase: each source run twice, and the second run wrote nothing. SQL found 0 duplicate items or meetings and no names in redacted titles.
  - On production, the lookup for 901 Bagby St returned real bodies. `/api/weekly` showed no upcoming items because of the 500-row cap. Run locally with the fix, it gives a City Council lead story plus 6 coming up.
- **Open issues / next:**
  - Part 2: the `/api/cron/ingest` route and scheduler. Part 3: the review page, the GitHub workflow and the D37 pitch line.
  - **P3:** the story job takes the oldest meeting first, 10 per run, and every flagged item gets a story, so 493 past Commissioners Court items sit in front of upcoming ones. Consider putting upcoming meetings first.
  - BoardBook pages hash differently on every fetch, so each run stores 2 new document rows.
  - `gemini-4-argon` returns 404 on Vertex (fine once the OpenRouter key is set). The backfill used `gemini-3.1-pro-preview` as the fallback.
  - **Iarush:** pull before editing `lib/adapters/llmExtract.ts`, `lib/adapters/primegov.ts`, `scripts/scrape.ts` or `lib/ingest/`.
### 2026-10-20: Prepare P1 lookup implementation for P5 setup
- **Who:** Marie Gary Blueberry · P1 Lookup and Results
- **Branch:** main
- **What changed:** Prepared the P1 lookup and results implementation, source-backed jurisdiction loaders, route-level tests, and body, quiz, and tax-receipt flows for handoff to P5. P5 Supabase credentials, migration application, and source-data loading are still needed to continue live verification.
- **Files:** P1 lookup routes, contracts, data loaders, migration, results/body/quiz/tax-receipt UI and tests; `agent_handoff.md`.
- **Contract changes:** See the P1 implementation entry below; P5 must apply the migration and regenerate database types.
- **Checked:** `npm test` (701 Vitest + 69 P4 tests), `npm run typecheck`, `npm run lint`, and `git diff --check` passed. Live Supabase lookup is unverified because no local credentials are configured.
- **Open issues / next:** P5 to provide Supabase credentials, apply the P1 migration, and coordinate source data loading; then run live lookup and browser checks.

### 2026-10-20: Close P1 lookup test and data-loader blockers
- **Who:** Marie Gary Blueberry · P1 Lookup and Results
- **Branch:** main
- **What changed:** Added route-level `/api/lookup` tests, HCAD real-property TSV-to-sanitized staging, dry-run/apply HCAD and City/School/College boundary loaders, a source-backed map for nine HCAD codes, and source-loading instructions. Lookup now fails closed for unmapped HCAD codes or missing catalog bodies; boundary replacement is atomic per full mapped layer and validates the manifest/vintage/source URL.
- **Files:** `app/api/lookup/route.ts`, `lib/lookup/{hcadSource,hcadStaging,boundaryStaging}.ts`, `scripts/{stage-hcad,load-hcad,load-boundaries,seed-hcad-jurisdictions}.ts`, `data/{hcad-jurisdiction-map,boundary-sources}.yaml`, P1 migration, `docs/p1-data-loading.md`, route and staging tests, `package.json`.
- **Contract changes:** P1 migration adds `load_hcad_batch` and atomic `replace_hcad_boundary_layer` RPCs. P5 must apply it and regenerate `database.types.ts`; permissions remain service-role-only.
- **Checked:** `npm test` (701 Vitest + 69 P4 tests), `npm run typecheck`, `npm run lint`, jurisdiction/body seed checks, and `git diff --check` passed. Synthetic HCAD TSV+GeoJSON successfully ran through staging and HCAD loader dry run; fixture stayed under ignored scratch. Local HTTP smoke checks returned 200 for `/`, `/start`, `/results`, and `/app/districts`. No real HCAD data or live lookup was run.
- **Open issues / next:** `.env.local` and Supabase credentials are absent, so migration, seeds, live lookup, and PostGIS loader RPCs remain unapplied/unverified. P1 still needs the two demo ZIPs/addresses and must verify all their codes; only nine HCAD codes are mapped. HCAD City/School/College layers do not cover Houston council districts, ESD/METRO/precinct, or regional water bodies. The plan's generic “other taxing unit” mapping conflicts with safe fail-closed code handling and needs a team choice. Visual browser testing still needs an approved Chrome session.

### 2026-10-20: Implement P1 lookup, results, quiz, and tax surfaces
- **Who:** Marie Gary Blueberry · P1 Lookup and Results
- **Branch:** main
- **What changed:** Replaced Census-only lookup with Census/HCAD/GIS merge logic, including countywide HCAD, signed body-ID access, HOA candidate review states, quiz scoring/write route, sourced tax receipt and body detail pages. Updated assigned prototype district/vote screens and added a dry-run-first canonical body catalog seed.
- **Files:** `app/api/lookup`, `app/api/quiz`, `app/api/tax-receipt`, `app/api/bodies`, public results/body/receipt pages, `lib/lookup`, `lib/quiz.ts`, `lib/taxReceipt.ts`, `data/bodies.yaml`, `scripts/seed-bodies.ts`, P1 support migration, EN/ES messages and tests.
- **Contract changes:** Added `tax_rates.last_vote_date` and service-role-only HCAD, boundary, and HOA lookup RPCs. P5 must apply the migration and regenerate `database.types.ts`.
- **Checked:** `npm test` (676 Vitest + 69 P4 tests), `npm run typecheck`, `npm run lint`, `git diff --check`, and `npm run seed:bodies -- --check` passed. `npm run build` is blocked because Google Fonts requests fail in this environment.
- **Open issues / next:** No live Supabase env or migration run; canonical seed was not applied. HCAD/boundary loaders, verified jurisdiction map, address selection, GIS coverage, demo cache/data, and live/PostgREST/browser checks remain. Do not claim end-to-end acceptance until sourced data is loaded and both demo addresses are verified.

### 2026-10-20: Review P1 baseline against implementation plans
- **Who:** Marie Gary Blueberry · P1 Lookup and Results
- **Branch:** main
- **What changed:** Reviewed current P1 code against the product/technical plans and `tmp/scratch/ishaan_implementation_plan.md`; application code and plan files unchanged. Current lookup remains Census-only; HCAD/GIS resolution, quiz submission/scoring, HOA, tax receipt and public body APIs/pages are pending.
- **Files:** `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** Static inspection of lookup, contracts, tokens, demo helpers, core migration, prototype data bridge and Districts/Vote screens. Targeted Vitest command did not run: no root `node_modules` or local Vitest; stopped the pending `npx` invocation without test output. No live data or browser verification.
- **Open issues / next:** Missing live tax/turnout fields currently produce false “No separate tax”/appointed-board claims. Vote filters prototype `-mud-` IDs, excluding canonical `hcmud_489`, then claims no measures. Lookup does not use demo cache. Coordinate `last_vote_date`, spatial/HOA query support and the missing P2 news read route; await the other session's implementation details for focused review. Demo addresses and 20-address evidence remain unverified in this review.

### 2026-10-20: Add ignored P1 implementation plan
- **Who:** Marie Gary Blueberry · P1 Lookup and Results
- **Branch:** main (`1e46631`)
- **What changed:** Added the decision-ready P1 implementation plan in the existing ignored scratch area. It clarifies P1/P5 database responsibilities, data flow, demo-first sequence, the editable $250K reference value, and acceptance checks.
- **Files:** `tmp/scratch/ishaan_implementation_plan.md`, `agent_handoff.md`
- **Contract changes:** None; planning document only.
- **Checked:** `tmp/` ignore rule and current P1 routes/contracts inspected; documentation only.
- **Open issues / next:** Q10 adult account owner remains pending and does not block P1. The demo addresses still need to be selected and verified during implementation.

### 2026-10-20: Stress test answers: Marie Gary Blueberry (P1)
- **Who:** Marie Gary Blueberry · P1 Lookup and Results
- **Branch:** main (`1e46631`)
- **What changed:** Recorded the teammate's plan stress-test answers. Q1 P1; Q2–Q9 yes; Q10 adult account owner still pending; Q11–Q16 yes (P2 spec and manual-entry fallback as stated); Q17 dropped because its Monday date passed; Q18 yes; Q19 yes to Twilio API with labeled preview fallback; Q20 yes to Wed evening survey only after live lookup, aim 15/minimum 10 by Thu noon; Q21 willing to register for Oct 27 City Council, not speak.
- **Files:** `agent_handoff.md`
- **Contract changes:** None.
- **Checked:** Compared against the answers received in chat and `plan_stress_test.md`; docs only.
- **Open issues / next:** Q10 remains pending and does not block P1. Survey waits for real Census + HCAD lookup. City Council evidence should say "registered," not "spoke."

### 2026-10-20: Pull latest main and remove local review note
- **Who:** Marie Gary Blueberry · P1 Lookup and Results
- **Branch:** main (`1e46631`)
- **What changed:** Removed the earlier local P1 review entry at the teammate's request, then fast-forwarded from `origin/main`. The pulled update routes shared AI calls through OpenRouter when configured and retains direct Gemini fallback.
- **Files:** upstream changes to `.env.example`, `CLAUDE.md`, `Technical_Implementation_Plan.md`, `agent_handoff.md`, shared AI adapters/routes, messages, and tests.
- **Contract changes:** Provider configuration adds `OPENROUTER_API_KEY`; Gemini model environment variables stay in use.
- **Checked:** `git pull --ff-only origin main` succeeded, updating `7ca1b60` to `1e46631`; branch matched `origin/main` immediately after pull.
- **Open issues / next:** The worktree now contains only this required handoff note. Refresh the P1 plan against the updated code and plan; OpenRouter availability depends on configuration.

### 2026-10-20: Tech plan now names OpenRouter as the AI provider
- **Who:** PlaidMod · P5 Platform
- **Branch:** main
- **What changed:** At PlaidMod's request, `Technical_Implementation_Plan.md` now says AI calls use Google's Gemini models through OpenRouter. The revision line lists the sections changed. This closes the "Tech plan §1" open item in the entry below.
  - **§1:** names the provider and the default models (`gemini-3.8-flash`, and `gemini-4-argon` for D17), and says to use paid models and check OpenRouter's data-use settings.
  - **§14:** the privacy line says drafts go to OpenRouter, then Google.
  - **§19:** paid models only; OpenRouter, Google and Twilio are named as processors.
  - **§21:** the env var list has `OPENROUTER_API_KEY`, and `GEMINI_API_KEY` is marked temporary.
  - **§22:** the model, pricing and budget checks name OpenRouter.
- **Files:** `Technical_Implementation_Plan.md`
- **Contract changes:** None.
- **Checked:** Docs only; no code changed.
- **Open issues / next:** None from this change.

### 2026-10-20: OpenRouter confirmed as the AI provider; coach IP limit and privacy page fixed
- **Who:** PlaidMod · P5 Platform
- **Branch:** main
- **What changed:**
  - **OpenRouter:** PlaidMod confirmed it for every AI call, which replaces tech plan §1's Gemini direct and answers Iarush's entry below. Gemini direct stays only until `OPENROUTER_API_KEY` is set.
  - **Fallback model:** P2's default `gemini-pro-latest` isn't on OpenRouter. It's now `gemini-4-argon`, Google's flagship, which is on OpenRouter's model list (checked Oct 20) with structured output and PDF input; the Google SDK takes the same name.
  - **Coach IP limit:** with no trusted header, every visitor on Vercel shared one IP budget, so the whole site got 20 coach calls an hour. `COACH_TRUSTED_IP_HEADER=x-real-ip` is now set in Vercel production and preview, and the handler trims the value.
  - **Privacy page:** names the cookies actually set (`showup_coach_id`, `showup_bodies`, `showup_sub`; `showup_bid` was never set), Photon/OpenStreetMap street suggestions, and OpenRouter. Its date is now Oct 20; the terms page keeps Oct 19.
- **Files:** `lib/adapters/gemini.ts`, `lib/coach/http.ts`, `app/api/coach/route.ts`, `lib/env.ts`, `.env.example`, `messages/{en,es}.json`, `components/legal/LegalDocument.tsx`, `CLAUDE.md`, `tests/platform/openrouter.test.ts`, `tests/coach/integration.test.ts`
- **Contract changes:**
  - None to the schema or types.
  - `Legal.effective` is now `Legal.privacy.effective` and `Legal.terms.effective`.
  - New env var `COACH_TRUSTED_IP_HEADER` (P4).
  - Older entries that call OpenRouter optional, or Gemini the provider, are out of date.
- **Checked:**
  - The 2 new tests failed first, then passed.
  - `npm test`: 650 Vitest + 69 P4 tests pass. Typecheck, lint and build pass.
  - The built `/privacy` (en, es) and `/terms` pages show the new text and dates.
  - `google/gemini-3.8-flash` and Vercel's judge model `google/gemini-3.5-flash-lite` are on OpenRouter with structured output.
  - No live OpenRouter call was made (no key yet).
- **Open issues / next:**
  - When the key arrives: add it to `.env.local` and Vercel, remove `GEMINI_API_KEY` and `GOOGLE_GENAI_USE_VERTEXAI`, and make one live call.
  - P3: the news spec wants a Pro judge. 3.5 Flash Lite was picked because Pro wasn't usable on Vertex, and `gemini-4-argon` is available now.
  - Tech plan §1 still says Gemini direct.
  - `BROWSER_ID_COOKIE`/`readBrowserId` in `lib/rateLimit.ts` are unused, because P4 uses its own cookie.

### 2026-10-20: Route LLM calls through OpenRouter when its key is set
- **Who:** Iarush
- **Branch:** main
- **What changed:** Added an OpenRouter transport (`lib/openrouter.ts`). When `OPENROUTER_API_KEY` is set, every LLM call (shared `generateJson` for stories/coach/perspectives, and P2's `geminiFromEnv()` for extraction, minutes and news linking) goes to OpenRouter; otherwise Gemini is used as before. Routes now gate on `llmConfigured()` (either key). Model IDs still come from `GEMINI_*_MODEL`; bare IDs get a `google/` prefix.
- **Files:** `lib/openrouter.ts`, `lib/gemini.ts`, `lib/adapters/gemini.ts`, `lib/env.ts`, coach/cron routes, `llm_unavailable` warning text in P2 adapters + tests, `.env.example`, `tests/platform/openrouter.test.ts`.
- **Contract changes:** None to schema/types. New env var `OPENROUTER_API_KEY`. Deviates from tech plan §1 (Gemini direct): the team should confirm. `llm_unavailable` warning text changed (P2).
- **Checked:** `npm test` 648 Vitest (incl. 5 new OpenRouter tests) + 69 P4 pass; ESLint clean. `tsc --noEmit` errors only in pre-existing `scraper P2/tmp/` scripts, none in changed files. No live OpenRouter call made.
- **Open issues / next:** Add `OPENROUTER_API_KEY` to `.env.local` and Vercel. `gemini-pro-latest` (P2 fallback default) is likely not an OpenRouter ID; set `GEMINI_EXTRACT_FALLBACK_MODEL` to a real one. `lib/coach/gemini.ts` (test-only) unchanged.

### 2026-10-20: Validate configured P4 and prepare publication
- **Who:** BluePhoenix79 · P4 Speak up
- **Branch:** main
- **What changed:** Validated the newly supplied local configuration without exposing values. Restored the tracked environment template after it was renamed. Final review fixed Council weekday applicability before offering methods, explicit channel changes now clear prior confirmation, and normal picker defaults exclude past/outcome-pending meetings. Kept explicit historical links available.
- **Files:** P4 modules/screens/tests, root message and data bridges, `docs/p4-status.md`; original merge details below.
- **Contract changes:** No additional shared contracts beyond the prior merge entry.
- **Checked:** 643 Vitest + 69 P4 tests (712 total), lint, typecheck and production build pass. New regressions failed before fixes and pass afterward; independent re-review found no remaining issues in the fixes. Built browser confirms Tuesday Council methods remain available and Wednesday voting items show unknown registration guidance. Configured Gemini structured output and EN/ES coaching pass, including HTTP 200/no-store through the built API. Supabase tables and atomic counter RPC pass; reminders without verified subscription return 401.
- **Open issues / next:** Civic data tables are empty; populate them through the ingestion workflow before claiming real agenda coverage. Twilio is unset; no SMS, registration or public comment was sent. Full provider golden/load testing and MUD rule verification remain open. Local environment values stay ignored. Commit/push authorized by the teammate after checks; recovery stash retained.

### 2026-10-20: Merge upstream platform, scraper and news with P4
- **Who:** BluePhoenix79 · P4 Speak up
- **Branch:** main, pulled through `748dd41`
- **What changed:** Preserved local work in a recovery stash, fast-forwarded upstream and resolved CLAUDE/handoff conflicts while retaining both histories. Migrated P4 to the root app, restored `web/` to the upstream reference, and connected shared SDK/model configuration, database rate counters, root locales/logos/body IDs, live item loading, P3 deep links, reminder requests and known bounds for the alerts cron. Unknown/special meetings stay conservative; late texts no longer promise unverified written alternatives.
- **Files:** `app/(prototype)/app/speak`, `/speak-up/[itemId]`, `/api/coach`, `components/speak`, `lib/{coach,registration,speak}`, P3 data/screen bridges, root messages/tests/docs/tooling.
- **Contract changes:** `Update` gains optional `meetingType` and `agendaNumber`; `comment.minutes` is nullable for unverified allocations. Dashboard/brief/story consumers handle unknown limits. No DB schema, bodies_token, classify or Meeting/Item changes.
- **Checked:** 642 Vitest + 67 P4 tests (709 total), ESLint, typecheck and production build pass. An initial isolation-test timeout passed on rerun. Built app browser: four-step demo, Spanish toggle, draft reload persistence, no overflow at 390px, correct P3-item redirect. Built API returns 400 for malformed input and 403 cross-origin. No unresolved conflicts or whitespace errors.
- **Open issues / next:** Add environment values at the root and restart. Live Gemini, real database quotas/reminders/SMS and real public-comment evidence remain unverified. MUD rules still need confirmation. Dependency install reported 9 high advisories in upstream dependencies; no unrequested dependency updates made. Recovery stash retained. Environment files untouched and ignored; nothing committed or pushed.

### 2026-10-20: P4 verification and documentation audit
- **Who:** BluePhoenix79 · P4 Speak up
- **Branch:** main
- **What changed:** Re-read repository instructions, handoffs, product/technical plans and P4 modules against acceptance requirements. Fixed corrupt saved browser IDs passing client validation but failing server UUIDv4 validation, with a regression observed failing before and passing after the fix. Corrected stale no-API guidance and documented expired research deadlines and incomplete acceptance criteria.
- **Files:** `CLAUDE.md`, `web/README.md`, `.plans/p4-implementation.md`, `web/docs/p4-status.md`, `web/src/lib/speak/client.ts`, `web/tests/speak-client.test.mjs`
- **Contract changes:** None.
- **Checked:** Fresh 72/72 tests, ESLint and TypeScript pass. Production build fails fetching Overpass, Libre Franklin and Playfair Display from Google Fonts. Dev server reaches ready; browser navigation times out and direct localhost HTTP is socket-denied.
- **Open issues / next:** Full P4 acceptance remains incomplete: MUD recipe verification, live provider golden evaluation, shared P3/P5 services and actual participation evidence. Subject shortening is deterministic; phone guidance is abbreviated. No live provider or interactive browser success claimed; no commit, push, registration or public comment submitted.

### 2026-10-20: `item_perspectives` table added; prototype-UI rule confirmed
- **Who:** PlaidMod · P5 Platform
- **Branch:** main
- **What changed:**
  - Applied P3's `item_perspectives` migration to Supabase. Supabase recorded it as version `20261020054945`, so the file is renamed to match. The old file name in the 2026-10-19 P3 entry is out of date.
  - Added the table to `lib/database.types.ts`, from Supabase's generated types. Nothing else in that file changed.
  - **PlaidMod confirmed the Oct 20 rule change:** the prototype UI is the app's UI (see "The prototype UI is now the app's UI" below). Older entries that call `web/` throwaway are out of date.
- **Files:** `supabase/migrations/20261020054945_item_perspectives.sql` (renamed), `lib/database.types.ts`
- **Contract changes:** DB schema: new P3 table `item_perspectives`, with RLS on and no policies.
- **Checked:**
  - Supabase: 0 tables without RLS, 0 policies, and the new table is empty.
  - The security advisor shows only the expected "RLS enabled, no policy" notices.
  - `npm test` (636/636, including the migrations RLS checks), typecheck and lint pass.
- **Open issues / next:**
  - **P3:** `lib/perspectives/job.ts` can use `db()` instead of its untyped client, now that the types include the table.
  - **Deploy:** Vercel blocked sohankamsala's push (`540e161`), because the repo is private, and it can't be redeployed. It goes live with PlaidMod's next push or a CLI deploy by PlaidMod.

### 2026-10-20: P3's app screens follow the plan, in English and Spanish
- **Who:** sohankamsala · P3 Weekly News and Alerts
- **Branch:** main (local commit; not pushed)
- **What changed:** P3's `/app` screens (brief, timeline, alerts and the story sheet) now follow the plan and are translated.
  - **`/app/brief`:** with real data, it uses `buildWeekly()` (plan §10): lead story, "Coming up", "Decided" with "Outcome not posted yet", a "Deadlines this week" sidebar and the template intro line. Decided stories carry the "What news coverage says" block (§9a). The demo keeps its own ordering.
  - **Story sheet:** shows the coverage block, the Spanish story on Spanish pages, the AI label in the page's language, and "Outcome not posted yet".
  - **`/app/timeline`:** the "Decided" tab includes items still waiting on minutes.
  - **`/app/alerts`:** the phone preview now uses the real text code (`itemAlertText`, `reminderText`). The copy matches §11: quiet hours are 8 p.m.–8 a.m. Central with no exception, and STOP stops texts. Before, it said 9 p.m., "unless a vote happens that night" and "we delete your number within 24 hours", none of which the code does.
  - **Time zone:** every date in the `/app` screens (`lib/prototype/format.ts`) is shown in America/Chicago, in the page's language.
  - **Translation (tech plan §17):** P3's screens use new message namespaces `AppBrief`, `AppTimeline`, `AppStory`, `AppAlerts` and `AppLabels`, in en and es.
  - **Text bug fixed:** Spanish texts ended times with "p.m.." (`lib/sms/message.ts`). There's a new regression test.
- **Files:** `app/(prototype)/app/{brief,timeline,alerts}/`, `components/prototype/{story-sheet,civic}.tsx`, `lib/prototype/{live,liveData,profile,format,types}.ts`, `lib/sms/message.ts`, `messages/*.json`, `tests/prototype/live.test.ts`, `tests/sms/sms.test.ts`
- **Contract changes:** The `lib/prototype/types.ts` `Update` type gains `coverage` and `outcomePending`. `LiveData` gains `weekly`. `TierPill` in `components/prototype/civic.tsx` is now translated.
- **Checked:**
  - `npm test` (636), lint and typecheck pass.
  - In the browser, brief, timeline, alerts and the story sheet in en and es, demo and live: no console errors or missing messages.
  - No horizontal scroll at 320–1920px (en) or at 320 and 390px (es).
- **Open issues / next:**
  - **P5:** the shell (sidebar, banner, search) and the sheet's "Close" label are still English (§17: P5's).
  - **Demo data:** demo stories stay English, since the plan replaces mock data rather than translating it.
  - **P3's earlier pages:** `/weekly`, `/timeline` and `/alerts` still exist alongside `/app/*`; see the entry above.
  - **Twilio registration:** still not started. It needs an adult account owner.
  - **P4:** `registration_closes_at` stays null until P4's resolver exists, so real items show no sign-up deadlines yet.

### 2026-10-20: Official logos for governments
- **Who:** sohankamsala · P3 Weekly News and Alerts
- **Branch:** main (local commit; not pushed)
- **What changed:** The app showed only generic icons, so it looked made up even where the data is real. Each body now shows its official logo or seal wherever it appears: home page stack, `/results`, `/weekly`, `/timeline`, the `/app` sidebar, dashboard, districts, body pages, brief tiles, story sheet, speak and vote.
  - **Bodies with logos:** HISD, Cy-Fair ISD, City of Houston (seal), Harris County, Flood Control, HCC, Lone Star, Harris Health, MUD 489 and CenterPoint. Bodies without one keep their icon tile.
  - **Source:** each file was downloaded once from the body's own website and is served from `public/logos/`, so readers' browsers never contact those sites. `lib/bodyLogos.ts` lists the source of each file.
  - Brief tiles now clamp long headlines so the button always shows; real headlines are longer than the demo ones.
- **Files:** `public/logos/`, `lib/bodyLogos.ts`, `components/civic.tsx` (new `LogoTile`; `BodyIcon` takes an optional `id`), `components/prototype/civic.tsx`, `components/home/GovernmentStack.tsx` (P5's), `app/(prototype)/**`, `app/(public)/{results,weekly,timeline}/page.tsx`
- **Contract changes:** None. `BodyIcon`'s new `id` prop is optional.
- **Checked:** `npm test`, lint and typecheck pass. A browser sweep of 9 pages, in demo and live mode at 320–1920px, found no broken images, console errors or horizontal scroll.
- **Open issues / next:**
  - **Missing logos:** Port Houston (its site blocks downloads) and HCAD (no usable mark).
  - **Logo use:** logos are shown only to identify the body. If the team would rather not use agency marks, delete the entries in `lib/bodyLogos.ts` and the icons come back.

### 2026-10-20: The prototype UI is now the app's UI (`/app`, `/start`)
- **Who:** sohankamsala · P3 Weekly News and Alerts
- **Branch:** main (local commit; not pushed)
- **What changed:** The team decided to use the prototype's finished UI instead of rebuilding it. Its screens were moved from `web/` into the root app as they were, and their demo data is now being replaced with real data screen by screen.
  - **Routes:** `/app` (dashboard), `/app/brief`, `/app/timeline`, `/app/districts`, `/app/districts/[id]`, `/app/speak`, `/app/vote`, `/app/alerts` and `/start`, all with the prototype's sidebar shell.
  - **Real data so far:**
    - After an address lookup, `/results` has "Open your dashboard". It goes through `/app/use?t=<bodies_token>`, which keeps the token in an httpOnly `showup_bodies` cookie (body IDs only).
    - With that cookie, every `/app` screen shows the reader's real bodies and P3's real items (`lib/weekly/data.ts`: `classify()` tiers, stories, the AI label and source links).
    - `/app/alerts` uses P3's real Twilio sign-up (`AlertSignup`).
    - Without the cookie, the screens show the demo neighborhood with its "Sample data" label. Without Supabase, they show P3's labeled sample items.
  - **Still demo data:** body descriptions beyond what's known for 7 bodies, `/app/speak`, `/app/vote` and `/start` onboarding.
- **Files:** `app/(prototype)/`, `components/prototype/`, `lib/prototype/` (`live.ts` maps real data onto the screens, `liveData.ts` loads it), `app/(public)/results/page.tsx`, `tests/prototype/`, and the docs: `CLAUDE.md`, `AGENTS.md`, `web/AGENTS.md`, `DESIGN.md` (top note), `README.md`, plus the contract list at the top of this file.
- **Contract changes:**
  - **Docs:** `CLAUDE.md` and `AGENTS.md` used to say `web/` was throwaway. They now say its UI is the app's UI and its sample data gets replaced. Earlier entries that call `web/` throwaway are out of date.
  - **New cookie:** `showup_bodies` holds a `bodies_token`.
  - The `lib/prototype/types.ts` `Update` type gains `aiWritten` and `itemPath`.
- **PlaidMod, please confirm:** this reverses the old "don't build on `web/`" rule. Tech plan §17 already assigns each part its prototype screens to convert (P1: districts and vote; P3: timeline, brief and alerts; P4: speak; P5: home, onboarding and shell). Change it back if you disagree.
- **Checked:** `npm test`, lint and typecheck pass. In the browser, I went from the address box through the stake picker and results to the dashboard, then opened every `/app` screen and a story. There were no console errors and no horizontal scroll at 1366px or 390px.
- **Open issues / next:**
  - **Everyone:** the screen text is still English in code. Move it into `messages/*.json` per tech plan §17.
  - **P1:** body pages need real descriptions; `toBody()` in `lib/prototype/live.ts` leaves them empty rather than inventing them.
  - **P4:** `/app/speak` builds a comment from a template; check it against the "never ghostwrites" rule before wiring it to real data.
  - **P5:** `/weekly`, `/timeline` and `/alerts` (P3's earlier pages) duplicate `/app/brief`, `/app/timeline` and `/app/alerts`. Decide whether to redirect them; text links still go to `/items/[id]`, which stays.
  - The dev palette picker wasn't carried over.

### 2026-10-19: Address suggestions and a stand-in /api/lookup
- **Who:** sohankamsala · P3 Weekly News and Alerts (filling a P1 gap)
- **Branch:** main (local commit; not pushed)
- **What changed:** The home address box failed for every address because P1's `/api/lookup` doesn't exist yet.
  - **Dropdown:** the box now suggests streets as you type (ARIA combobox: arrow keys, Enter, Escape). Suggestions come from Photon (OpenStreetMap), limited to Harris County. Only the street words are sent; the house number stays in the browser.
  - **Stand-in lookup:** `POST /api/lookup` follows `lib/contracts/lookup.ts`. It geocodes with the Census Geocoder and returns the bodies it can infer: city council, county, flood control, port, school board, college board and HCAD. It can't find MUDs, ESDs, METRO or HOAs. It returns `outside_harris` for other counties.
  - **Temporary `/results`:** lists the bodies with links to `/weekly?t=` and `/alerts?t=`.
  - Nothing about the address is stored or logged.
- **Files:** `components/home/AddressForm.tsx`, `lib/lookup/` (`suggest.ts`, `census.ts`, `standIn.ts`), `app/api/address/suggest/route.ts`, `app/api/lookup/route.ts`, `app/(public)/results/page.tsx`, `messages/*.json` (`Home.suggestions*`, `Home.addNumber`, `Results`), `tests/lookup/`
- **Contract changes:** None. The route matches P1's draft contract. **P1:** replace the body of `app/api/lookup/route.ts` and `lib/lookup/standIn.ts` with your lookup; the home page and stake picker won't need changes.
- **Checked:** `npm test`, lint and typecheck pass. In the browser, typing "16915 Apple River" shows the right street, Enter goes to `/stake`, and the lookup returns the Cy-Fair bodies.
- **Open issues / next:**
  - Without `BODIES_TOKEN_SECRET`, the lookup returns an `unsigned-preview` token (never in production).
  - Photon is a free public service with no SLA. If it's down, the dropdown stays empty and typing still works.

### 2026-10-19: Wider page layout on large screens
- **Who:** sohankamsala · P3 Weekly News and Alerts
- **Branch:** main (local commit; not pushed)
- **What changed:** On a 1920px screen the site sat in a narrow 1024px column with wide empty margins.
  - The header, footer, home page and every P3 page now use `max-w-7xl` (1280px) with `md:px-8`, and 1440px at `2xl` (≥1536px).
  - At `xl`, the home headline and lede are larger so the hero fills the wider column.
  - Reading pages (`/items/[id]`, `/timeline`, `/alerts/why`) keep a `max-w-3xl` text column, aligned to the same left edge as the header instead of centered, so the tabs line up with the logo.
  - Headlines are smaller below 640px, so a story isn't eight lines of title on a 320px phone.
  - `/alerts` overflowed at 320px because of an unbreakable link in the sample texts; it now wraps.
- **Files:** `components/shell/SiteHeader.tsx`, `components/shell/SiteFooter.tsx`, `app/(public)/page.tsx` (P5's), and P3's pages under `app/(public)/` (`weekly`, `timeline`, `items/[id]`, `alerts`, `alerts/why`), plus `components/weekly/Coverage.tsx`
- **Contract changes:** None. **PlaidMod:** these are your shell and home files; change them back if you'd rather.
- **Checked:** A Playwright sweep of 9 pages at 9 widths (320, 375, 414, 768, 1024, 1280, 1440, 1920 and 2560) found no horizontal scroll and no content past the viewport edge. Screenshots at 320, 768, 1024, 1920 and 2560 were reviewed. `npm test`, lint and typecheck pass.
- **Open issues / next:** None.

### 2026-10-19: P3 pages, APIs, alerts and news coverage perspectives
- **Who:** sohankamsala · P3 Weekly News and Alerts
- **Branch:** main (local commits; not pushed)
- **What changed:** Finished P3's user-facing side on top of the core logic:
  - **Pages:** `/weekly` (bento brief; the teammate picked this layout), `/items/[id]`, `/timeline`, `/alerts` (opt-in, published rules, text preview) and `/alerts/why`
  - **API routes:** `/api/weekly`, `/api/items/[id]`, `/api/alerts/subscribe` and `/verify`, `/api/reminders`, `/api/twilio/inbound`, `/api/cron/alerts` and `/api/cron/stories`
  - **Story job:** writes stories for items with `needs_story = true`
  - **Perspectives (§9a):** extract, code checks, judge, freeze, removal, the `item_perspectives` migration and the "What news coverage says" block
  - **Messages:** `News`, `Weekly`, `Timeline`, `Item`, `Alerts` and `Coverage` keys in `messages/en.json` and `es.json`
- **Sample data:** without the Supabase keys, the pages show labeled sample data (`lib/weekly/sample.ts`) run through the real `classify()` and template stories. Sample coverage uses placeholder outlets, never real ones.
- **Contract changes:**
  - **New migration:** `supabase/migrations/20261019230000_item_perspectives.sql` (P3 table). P5 applies it and regenerates `lib/database.types.ts`. Until then, perspectives code uses an untyped client.
  - **New cookie:** `showup_sub`, a signed `users.id` (HMAC with `BODIES_TOKEN_SECRET`), set after phone verification. **P4:** call `POST /api/reminders {item_id}`; it returns 401 `not_subscribed` without the cookie.
  - **ESLint:** `lib/rules`, `lib/stories` and `lib/sms` can't import `lib/news` or `lib/perspectives` (perspectives spec §8).
  - **Cron:** `/api/cron/alerts` now runs the story job and the perspectives job before alerts. `vercel.json` is unchanged.
- **Checked:**
  - `npm test` 611/611, `npm run lint` and typecheck pass.
  - In the browser, at 1366px and 390px (no horizontal scroll), all five pages render in English and Spanish with no console errors or missing message keys.
  - Alerts sign-up errors and the preview state were tested in the browser.
  - No live Supabase, Gemini or Twilio calls were made, because there are no keys on this machine.
- **Open issues / next:**
  - **P5:** apply the `item_perspectives` migration.
  - **P5:** the cron needs `SITE_URL` set so text links and the Twilio signature URL are right.
  - **P5:** `GEMINI_JUDGE_MODEL=gemini-3.5-flash-lite` (already on Vercel) is P3's choice: a different model from the 3.8 Flash extractor, as the spec asks, and Pro isn't usable on Vertex.
  - **P4:** `registration_closes_at` is null for real items until P4's registration resolver exists. The weekly page, texts and 7a/7b reminders read it from `lib/weekly/data.ts` and the `windows` argument of `runAlertsJob`.
  - **P2:** the perspectives job reads `news_article_items` and `news_articles` (spec §5). Until those tables are migrated, it logs a warning and the weekly page shows "No news coverage found."
  - **P1:** pages need `?t=<bodies_token>` from the results page. There's no `/api/lookup` yet, which is why the home address box currently says "We couldn't find that address" for every address.
  - **Twilio:** still not registered (needs an adult account owner). Without keys, sign-up shows a labeled preview and nothing is sent or saved.
  - **Spec deviation:** bento tiles are whole-card links, so they show only "N news outlets"; the full coverage disclosure appears on the rest of "Coming up," on "Decided," and on item pages.
  - **Stress test:** still deferred for sohankamsala.

### 2026-10-19: P3 core logic: rule engine, stories, SMS, weekly builder
- **Who:** sohankamsala · P3 Weekly News and Alerts
- **Branch:** main (uncommitted)
- **What changed:** Built P3's server logic as tested library code in P5's root app (tech plan §2). Covered:
  - `classify()` with all six rules (§8)
  - story writing with code fact-check and template fallback, using P5's `lib/gemini.ts` (§9)
  - SMS logic: consent, quiet hours, message format with the late-added wording, reminders 7a/7b, protest reminder, send dedupe, Twilio REST client, STOP/HELP keywords and webhook signature check (§11)
  - the weekly page and timeline section builder (§10)
  - Twilio registration paperwork, ready to paste
- **Files:** `lib/rules/`, `lib/stories/`, `lib/sms/`, `lib/weekly/`, `tests/{rules,stories,sms,weekly}/`, `.plans/p3-twilio-registration.md`
- **Contract changes:**
  - **`classify` is the real `Classifier` for ingest:** P2 can swap `classifyStub` for `classify` from `lib/rules/classify.ts`. A test checks it's assignable to `Classifier` and accepts P2's `Item`. An optional 4th argument, `{date, previous_date}`, drives `meeting_moved`. It reads `no_new_revenue_rate` from the untyped `taxRates`.
  - Personnel and closed-session items always return `tier: 'timeline'` and `item_type: 'personnel'`, never `sms` (scraper spec §5.3).
  - **The story job must write stories for every `needs_story` item, whatever its tier,** so personnel items still get one (D9).
  - Uses the shared `BodyType` (`lib/contracts/bodyTypes.ts`) and `Stake` (`lib/stakes.ts`) for lead-story ordering.
- **Checked:** `npm test` passes (46 files, 586 tests, including 83 new P3 tests). `npm run typecheck` is clean, and `eslint` is clean on the P3 folders. No live Gemini or Twilio calls were made; both are tested with fakes.
- **Open issues / next:**
  - **Next for P3:** wire these into routes and screens:
    - routes: `api/weekly`, `api/items`, `api/alerts/subscribe` and `verify`, `api/reminders`, `api/twilio/inbound`, `api/cron/alerts`
    - the story job that writes stories for `needs_story` items
    - pages: `/weekly`, `/timeline`, `/items/[id]` and `/alerts` (opt-in, rules, why-this-text)
    - en/es message keys for all of the above
  - **P2:** ingest can import `classify` now. Pass the meeting's `{date, previous_date}` as the 4th argument so `meeting_moved` works.
  - **P5 / schema:** the HCAD protest reminder has no item, so it's queued with `item_id = null`. Because `alerts_sent` treats nulls as equal, a user gets at most one protest reminder ever, not one per year. That's fine for the hackathon; a `year` column would fix it later.
  - **P5:** reminder 7b needs the alerts job to run more than once a day. Vercel Hobby cron is daily, so trigger `/api/cron/alerts` from the GitHub Actions schedule too.
  - **Twilio registration not submitted.** It needs an adult account owner plus the SMS wording in `.plans/p3-twilio-registration.md` §4 on P5's live privacy and terms pages. If it isn't approved by Thursday, fall back to a labeled "preview" of texts.
  - **Stress test:** deferred for sohankamsala, who asked to start P3 work first. Run it at the next session.

### 2026-10-19: Trimmed crowding on the prototype's Districts and Vote screens
- **Who:** sohankamsala · prototype owner (part not yet confirmed)
- **Branch:** main (uncommitted)
- **What changed:** In the `web/` prototype, removed the description column from the Districts list and folded Vote's two info cards ("Bring a photo ID", "Register at school") into one line. This finishes the declutter pass whose home and timeline trims are already in `main`.
- **Files:** `web/src/app/app/districts/page.tsx`, `web/src/app/app/vote/page.tsx`
- **Contract changes:** None
- **Checked:** `npm run lint` and `npx tsc --noEmit` pass. Checked both screens at 1440px in a local browser; 390px not checked.
- **Open issues / next:**
  - **Attribution leak:** commit `cfa43fe` ("Add ShowUp HTX web app prototype and design system") is on `origin/main` with a `Co-Authored-By` AI trailer. It was made before `INSTRUCTIONS.md` existed. Fixing it means rewriting published history, so it needs a team decision.
  - On Vote, the eligibility timeline's "Today" and "Can register" labels overlap when registration opens the next day.
  - The plan stress test hasn't been run for sohankamsala yet.

### 2026-10-19: Admin accounts, and a script for admins to set their own password
- **Who:** PlaidMod · P5 Platform, Evidence and Pitch
- **Branch:** main
- **What changed:**
  - **The team's five emails** are now in `ADMIN_EMAILS`, in the owner's `.env.local` and on Vercel.
  - **Each has a confirmed Supabase account** with a temporary shared password, set by the owner. Ask PlaidMod for it; it isn't written anywhere in the repo.
  - **Each admin can change their password** with `npm run admin -- set-password <email>`. The password is typed twice and never shown, and must be 12–72 characters.
  - **No email step:** Supabase's built-in email can't send setup links to people outside the Supabase organization, so the script uses the secret key from `.env.local` instead.
  - **`npm run admin -- create-all`** creates any missing accounts after someone is added to `ADMIN_EMAILS`.
- **Files:** `lib/adminAccounts.ts`, `scripts/admin-account.ts`, `tests/platform/adminAccounts.test.ts`, `package.json` (`admin` script), `CLAUDE.md`, `.env.example`
- **Contract changes:** None
- **Checked:**
  - `npm test` 503/503, typecheck and lint pass.
  - Against the real project, a throwaway account was created, given a password, signed in, rejected a wrong password, then deleted.
  - `set-password` refuses an email not on the list, and refuses to run where the password would show on screen.
- **Open issues / next:**
  - **Everyone changes the shared password** with `set-password` before the repo goes public. The login page is public, and admin emails show up in commit history.
  - The owner turns off public sign-ups in Supabase (**Authentication → Sign In / Providers**).
  - **P3 chooses `GEMINI_JUDGE_MODEL`.** Vercel has `gemini-3.5-flash-lite`, which works on Vertex; ask P5 to change it.

### 2026-10-19: Supabase secret key and Gemini settings added to Vercel
- **Who:** PlaidMod · P5 Platform, Evidence and Pitch
- **Branch:** main (no code changes)
- **What changed:** Vercel Production and Preview now have:
  - `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` (a Vertex AI key), both Sensitive, so their values can't be read back from Vercel
  - `GOOGLE_GENAI_USE_VERTEXAI=true`, `GEMINI_EXTRACT_MODEL=gemini-3.8-flash` and `GEMINI_JUDGE_MODEL=gemini-3.5-flash-lite`

  The owner's `.env.local` has the same values.
- **Files:** this log only
- **Contract changes:** None
- **Checked:**
  - The Supabase key returned HTTP 200 from the REST API.
  - `npx tsx scripts/gemini-smoke.ts` returned `{ ok: true }` on Vertex AI for `gemini-3.8-flash` and `gemini-3.5-flash-lite`.
  - **`gemini-pro-latest` returns 404 NOT_FOUND on Vertex,** so P2's default fallback model fails there.
  - `vercel env ls` lists all five variables for both environments.
- **Open issues / next:**
  - **P2:** set `GEMINI_EXTRACT_FALLBACK_MODEL` to a Pro model ID that Vertex lists, check it with `npx tsx scripts/gemini-smoke.ts --model <id>`, then ask P5 to add it to Vercel.
  - No live page uses the database or Gemini yet, so nothing was redeployed. The next deploy picks these up.
  - Teammates who need the keys locally get them from P5 privately. Because they're Sensitive, `vercel env pull` leaves them out.

### 2026-10-19: P2's scraper merged into `main` and moved into the root app
- **Who:** PlaidMod · P5 Platform, Evidence and Pitch
- **Branch:** main (merged `scrapper` at `c6a6990`)
- **What changed:**
  - **The merge** keeps both sides of this log and the branch's newer revision 5 of both plan files. The one line kept from `main` is the body-page "In the news" bullet.
  - **The code moved, unchanged,** from `scraper P2/` into the layout in scraper spec §6: `lib/adapters/`, `lib/ingest/`, `lib/news/`, `data/`, `scripts/`, `tests/unit/`, `tests/golden/` and `vitest.live.config.ts`.
  - **P2's dependencies and scripts** (`test:live`, `scrape`, `news`) are now in the root `package.json`, and the lockfile was regenerated. The root keeps ESLint 9 and TypeScript 5.9, which Next 16.4.2 needs; the branch used 10 and 6.
  - **Root configs:** ESLint now uses P2's full news-isolation patterns and P2's `^_` unused-variable rule. Vitest excludes `tests/live/`. `GEMINI_JUDGE_MODEL` is added to `.env.example` and `lib/env.ts`.
- **Two fixes to P2's files:**
  - **`tests/unit/news-article.test.ts`:** the fake-timer Crawl-delay test now calls `resetHostSpacing()` first. Leftover real-clock spacing made it pass only when run before Oct 19 12:00 UTC.
  - **`lib/adapters/gemini.ts`:** the `*FromEnv` functions now take a plain string map, because Next's `ProcessEnv` type requires `NODE_ENV`. This is a type change only.
- **Files:** P2's folders above, `package.json`, `package-lock.json`, `eslint.config.mjs`, `vitest.config.ts`, `.env.example`, `lib/env.ts`, `CLAUDE.md`
- **Contract changes (P2):**
  - Work on `main` from the repo root from now on. The scripts read the root `.env.local`.
  - Phase 2 can import `@/lib/db`. P1's `bodies` seed is the only Phase 2 prerequisite still missing.
  - The v1.3 tables (`news_articles`, `news_article_items`, the 11c and `health()` state) still need migrations: P2 writes them, P5 applies them.
- **Checked:** `npm test` 492/492 (P5's 128, P2's 364; UTC, network blocked), typecheck, lint (0 warnings) and build. `npm run scrape -- --source no_such_source` loads `data/sources.yaml` and makes no network calls.
- **Open issues / next:**
  - No live runs yet (no Gemini key).
  - `gemini-pro-latest` won't work on Vertex (see the Vertex entry below).

### 2026-10-19: Gemini can run on Vertex AI; `.env.local` laid out for every key
- **Who:** PlaidMod · P5 Platform, Evidence and Pitch
- **Branch:** main
- **What changed:**
  - **Vertex AI needs no change to either Gemini client.**
    - `lib/gemini.ts` and P2's `lib/adapters/gemini.ts` both call `new GoogleGenAI({ apiKey })`.
    - With `GOOGLE_GENAI_USE_VERTEXAI=true`, `@google/genai` 2.30.0 sends the same call to Vertex AI (`aiplatform.googleapis.com`), using the key. Without it, the call goes to the Gemini API.
  - **`.env.example`:** adds `GOOGLE_GENAI_USE_VERTEXAI=true`, plus where to get the Gemini, Supabase secret and Twilio keys.
  - **`scripts/gemini-smoke.ts`:** a new `--model <id>` option checks that a model ID works, and the output names the backend it used.
  - **The owner's `.env.local`** now follows the template. Every existing value is kept, and the blank lines are the keys still to fill in.
- **Files:** `.env.example`, `scripts/gemini-smoke.ts`
- **Contract changes (P2, P3, P4):**
  - **The team's Gemini key will be a Vertex AI key.** Wherever `GEMINI_API_KEY` is set, also set `GOOGLE_GENAI_USE_VERTEXAI=true`. That includes `scraper P2/.env.local`, because P2's scripts load that file. If the switch is missing, the Vertex key goes to the Gemini API and the call fails.
  - **P2: `gemini-pro-latest` is a Gemini API alias.**
    - Vertex's model list (Gemini Enterprise Agent Platform > Model versions) has no `-latest` aliases.
    - Its only long-lived Pro text model, `gemini-2.5-pro`, retires Oct 20, 2026.
    - Pick the extraction fallback (and P3's judge model) from that list, then check it with `npx tsx scripts/gemini-smoke.ts --model <id>`.
    - `gemini-3.8-flash` is GA on Vertex.
  - **FYI:** Google's 3.8 Flash guide says the backend ignores `temperature` for this model; determinism comes from `thinking_level` and the response schema. Both clients send `temperature: 0`, which is harmless.
- **Checked:**
  - `npm test` (128/128), typecheck and lint pass.
  - A probe with a fake `fetch` (no network) confirmed both endpoints: `generativelanguage.googleapis.com` when the switch is unset, and `aiplatform.googleapis.com` when it's `true`. Both send the key in the `x-goog-api-key` header.
  - Without a key, the smoke script stops with `MissingEnvError`.
  - No live call yet, because there's no key.
- **Open issues / next:**
  - The owner adds the Vertex key and runs the smoke test.
  - The owner shares the key privately with P2 for `scraper P2/.env.local`.
  - The Gemini key and the switch need adding to Vercel, after the owner approves.
  - **Free keys may lack 3.8 Flash:** Google's express-mode page (the free 90-day trial) doesn't list `gemini-3.8-flash`, so a key without billing may not reach it.

### 2026-10-19: P5 final review fixes (rate limits, demo cache, admin cookies, privacy page)
- **Who:** PlaidMod · P5 Platform, Evidence and Pitch
- **Branch:** main
- **What changed:** A fresh whole-branch review of P5 found no critical issues. These five are fixed:
  - **Rate limiter:**
    - `checkRateLimit` now throws `MissingEnvError` when a key is missing, instead of quietly allowing every call.
    - On a database error it still allows the call, and now logs a warning. The warning never includes the key.
  - **Demo cache:**
    - `lookupDemoKey` is now an HMAC keyed with `IP_HASH_SECRET`, so a cache key can't be matched against `hcad_parcels` addresses.
    - `DEMO_RECORD` is ignored on production deployments (`VERCEL_ENV=production`).
  - **Admin session cookies** are now `httpOnly`, `sameSite=lax`, and `Secure` in production (`lib/supabase/cookieOptions.ts`).
  - **Privacy page:** it now says the address goes to the U.S. Census Bureau's address lookup, and lists the Census Bureau among the services that process data.
  - **`lib/database.types.ts`:** I regenerated it from the database. It matches the committed file exactly, so it needed no change.
- **Files:** `lib/rateLimit.ts`, `lib/demo.ts`, `lib/env.ts` (`VERCEL_ENV`), `lib/supabase/{cookieOptions,server}.ts`, `proxy.ts`, `messages/*.json`, `.env.example`, `tests/platform/{rateLimit,demo,authCookies,messages}.test.ts`
- **Contract changes:**
  - **P1, `lookupDemoKey(address, secret?)`:**
    - Pass your own normalized address. Otherwise "Dr" and "Drive" give different keys, and demo mode misses the cache.
    - Cache only the final lookup response (body IDs and sections), never raw Census or HCAD output.
  - **P1 and P4:** `checkRateLimit` now throws when `SUPABASE_SERVICE_ROLE_KEY` is missing. That key must be on Vercel before your routes ship.
  - **P1:** `/results` must live under `app/(public)/`, because `useLookup()` throws outside that folder. It must also handle the `error` state, not just `idle`: if a lookup fails while someone presses Continue, they can still land on `/results`.
  - **P2:** call `await requireAdmin()` outside any `try/catch`. Its redirect and its 404 work by throwing.
- **Checked:**
  - `npm test` (128/128), typecheck, lint and build pass. Each new test failed before its fix.
  - None of the secrets appear in `.next/static`.
  - The server role can run `increment_rate_limit`: `has_function_privilege` returns true.
- **Open issues / next:**
  - **The new cookie flags can't be checked in a browser yet:** nobody can sign in until the admin accounts exist.
  - **Deferred small items:**
    - `readBrowserId` can throw on a malformed cookie.
    - Old rate-limit rows are cleaned up only on about 1 call in 100.
    - IPv6 addresses aren't grouped by /64.
    - The migration test misses some patterns.
    - The time-zone wiring has no test.
    - **`scripts/quiz-report.ts` reads at most 1,000 rows** and filters them in JavaScript. Fix this before using its numbers in the pitch.
    - The lookup `fetch` has no timeout.
    - The admin sign-in has no rate limit.
    - The `rate_limited` copy is wrong, and the news fonts are preloaded on every page.

### 2026-10-19: P5 Task 17: classmate quiz report
- **Who:** PlaidMod · P5 Platform, Evidence and Pitch
- **Branch:** main
- **What changed:** `lib/quizReport.ts` turns `quiz_responses` into the plan's evidence lines, for example "14 of 18 (78%) didn't know they had a MUD." `scripts/quiz-report.ts --since <ISO> --until <ISO>` prints them along with "Results from N people who used our app." The time window leaves out the team's own test runs.
- **Files:** `lib/quizReport.ts`, `scripts/quiz-report.ts`, `tests/platform/quizReport.test.ts`
- **Contract changes:** None. The report reads P1's `quiz_responses` (`selected_types`, `actual_types`, `created_at`) and prints type keys until P1's display names exist.
- **Checked:** `npm test` (121/121, including the plan's 14-of-18 example, rounding, and the window edges), typecheck and lint pass. Running the script needs `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
- **Open issues / next:** All 17 P5 tasks are coded. Next comes a whole-branch review, then the owner's dashboard steps (the secret key, admin accounts, turning off sign-ups) and the non-code checklist in `.plans/p5-platform-plan.md`.

### 2026-10-19: P5 Task 16: admin sign-in for the review queue
- **Who:** PlaidMod · P5 Platform, Evidence and Pitch
- **Branch:** main
- **What changed:**
  - `/admin/login` has an email-and-password form. It uses passwords, not email links, because Supabase's built-in email reaches only team members, 2 an hour.
  - `/admin` shows "Signed in as …", a link to `/admin/review` (P2's page) and a sign-out button.
  - `proxy.ts` (Next 16's request hook) refreshes the session on `/admin/*` only. It never touches `/api`, so cron calls can't be redirected.
  - `requireAdmin()` checks the signed-in user with Supabase Auth and the `ADMIN_EMAILS` allowlist. Signed out goes to the login page; not on the list gets a 404.
- **Files:** `proxy.ts`, `lib/supabase/server.ts`, `lib/adminAuth.ts`, `app/admin/{page.tsx,actions.ts,login/page.tsx}`, `components/admin/LoginForm.tsx`, `messages/*.json` (`Admin`), `tests/platform/adminAuth.test.ts`
- **Contract changes (P2):**
  - **Call `await requireAdmin()` first in `/admin/review` and in every one of its server actions and route handlers.** A layout check alone isn't enough.
  - After that, read and write with `db()`. The signed-in user's own Supabase client still sees nothing, because of RLS.
- **Checked:**
  - `npm test` (114/114), typecheck, lint and build pass (the build lists "Proxy").
  - Signed out, `/admin` returns 307 to `/admin/login`.
  - `/api/cron/ingest` with the secret returns 404 (no route yet), not a redirect.
  - A wrong email or password shows the inline error, using the real Supabase sign-in.
  - Login pages send `Cache-Control: private, no-store`.
- **Open issues / next:**
  - **Owner, in the Supabase dashboard:** turn off public sign-ups and create a password account for each `ADMIN_EMAILS` address. After that, a successful sign-in still needs testing.
  - Add the fifth teammate's email to `ADMIN_EMAILS` when known.

### 2026-10-19: P5 Task 15: demo mode caching
- **Who:** PlaidMod · P5 Platform, Evidence and Pitch
- **Branch:** main
- **What changed:** `lib/demo.ts` has `demoCached(key, compute)`.
  - **With `DEMO_MODE=true`,** it returns the cached answer from `demo_cache` and never calls the outside service. A missing answer throws `DemoCacheMissError`, naming the key, so gaps show up in the dry run instead of silently using the network.
  - **With `DEMO_RECORD=true`,** live answers are saved as you click through the demo once.
  - `lookupDemoKey(address)` is a hash, so not even the demo addresses are stored.
- **Files:** `lib/demo.ts`, `tests/platform/demo.test.ts`
- **Contract changes (how to use it):**
  - **P1 (`/api/lookup`):** wrap the Census/HCAD work in `demoCached(lookupDemoKey(address), () => resolveLive(address))`, and skip writing `quiz_responses` when `isDemoMode()`.
  - **P4 (coach, Step A):** wrap the Gemini explain call in `demoCached(\`explain:${itemId}:${lang}\`, …)`.
  - **Meaning of demo mode:** "no Census, Gemini or Twilio calls." The database stays reachable, so §20's "network off" can't fully hold. **Production keeps `DEMO_MODE=false`,** because judges may open the live site. Record the video locally or on a preview deploy with `DEMO_MODE=true`.
- **Checked:** `npm test` (110/110), typecheck and lint pass.
- **Open issues / next:** Task 16 (admin sign-in) is next.

### 2026-10-19: P5 Task 14: stake picker
- **Who:** PlaidMod · P5 Platform, Evidence and Pitch
- **Branch:** main
- **What changed:** `/stake` asks "Which of these describe you?"
  - **Cards:** four toggle cards (Student, Parent, Renter, Homeowner; pick any, `aria-pressed`), the note "First-time voters: pick Student." and a language choice.
  - **Continue** saves the choice in the `showup_stakes` cookie, then goes to `/results` while a lookup is running or done, or home when there's no lookup (a reload or a direct visit). **Skip** goes the same way without saving.
  - **Status:** while loading, the page says "Finding your governments…". A failed lookup shows the error with "Try another address."
- **Files:** `lib/stakes.ts`, `app/actions/stakes.ts`, `components/stake/StakePicker.tsx`, `app/(public)/stake/page.tsx`, `messages/*.json` (`Stake`), `tests/platform/stakes.test.ts`
- **Contract changes (P1, P3, P4):**
  - Read stakes with `parseStakes(cookieValue)` from `@/lib/stakes`. On the server, use `parseStakes((await cookies()).get(STAKES_COOKIE)?.value)`. It returns `Stake[]` (`'student' | 'parent' | 'renter' | 'homeowner'`) in display order.
  - In the browser the cookie shows URL-encoded (`student%2Crenter`). `parseStakes` handles both forms.
  - No stakes means the visitor skipped, so use defaults.
- **Checked:**
  - `npm test` (104/104), typecheck, lint and build pass.
  - In a browser at 390px:
    - a direct visit works and Continue goes home
    - Space and Enter toggle the cards
    - Continue saves the cookie
    - home → address → `/stake` keeps the lookup state and shows the error (expected until P1's route exists)
    - saved stakes come back on return
    - switching to Español keeps the selections
    - nothing scrolls sideways
- **Open issues / next:** Task 15 (demo mode) is next.

### 2026-10-19: P5 Task 13: home page and the address lookup flow
- **Who:** PlaidMod · P5 Platform, Evidence and Pitch
- **Branch:** main
- **What changed:**
  - **Home (`/`):** the headline "Who governs your block?", the address form, a privacy note, and a stack of government "layers" that settles in on load (turned off under reduced motion). The page is in English and Spanish.
  - **Submitting:** the form checks the address on submit (empty or over 200 characters shows an inline error, cleared on edit). It then starts the lookup and goes to `/stake`.
  - **`LookupProvider`** (in `app/(public)/layout.tsx`) keeps the lookup running across home → stake picker → results. The address stays in memory only: never in storage, a cookie or the URL. The form also posts rather than using GET, so a submit before the JavaScript loads can't put the address in a URL.
- **Files:** `lib/contracts/lookup.ts`, `lib/address.ts`, `lib/flow/lookupState.ts`, `components/flow/LookupProvider.tsx`, `components/home/{AddressForm,GovernmentStack}.tsx`, `app/(public)/page.tsx`, `app/(public)/layout.tsx`, `messages/*.json` (`Home`, `Lookup`)
- **Contract changes (draft for P1's sign-off):** `lib/contracts/lookup.ts`.
  - **Request:** `POST /api/lookup` with `{ address }`.
  - **Success:** `{ bodies_token, bodies, ballot, not_government, regional, hoa }`.
  - **Errors:** `{ error: { code, message } }` with codes `invalid_address` 400, `not_found` 404, `outside_harris` 422, `rate_limited` 429, `server_error` 500. The messages for each code are in `messages/*.json` → `Lookup.errors`.
  - **P1's `/results`:** use `useLookup()` from `@/components/flow/LookupProvider`. It returns `state` (`idle | loading | done | error`), `start` and `reset`. While it's loading, show the "Who governs you?" question. If someone opens `/results` directly with `idle`, send them home.
- **Checked:**
  - `npm test` (94/94: address normalizing and limits; the reducer ignores stale answers from a double submit and answers after a reset), typecheck, lint and build pass.
  - In a browser at 1440px and 390px:
    - no sideways scrolling
    - an empty submit shows "Enter your street address, city and ZIP." with `aria-invalid`, and typing clears it
    - a real address sends `POST /api/lookup` and goes to `/stake`, with no address in any URL (both 404 for now: P1's route and P5 Task 14)
- **Open issues / next:** Task 14 (the stake picker) is next.

### 2026-10-19: P5 Task 12: rate limiting and the browser ID
- **Who:** PlaidMod · P5 Platform, Evidence and Pitch
- **Branch:** main
- **What changed:** `lib/rateLimit.ts` and a new database function, `increment_rate_limit` (security invoker, fixed `search_path`, execute revoked from public, anon and authenticated).
  - **`checkRateLimit(key, rule)`** counts one call in a fixed window. It returns `{ allowed, remaining, resetAt }`. If the database can't be reached, it returns `allowed: true, degraded: true` so the demo keeps working.
  - **Presets:** `RATE_LIMITS.lookupPerIp` (120 an hour, so a whole class can share a school IP), `coachPerBrowser` and `coachPerIp` (20 an hour, per §14).
  - **IPs:** `hashIp(ip)` scrambles an IP with `IP_HASH_SECRET` plus the Chicago date, so raw IPs are never stored. `clientIp(req)` reads the visitor's IP.
  - **Browser ID:** `BROWSER_ID_COOKIE = 'showup_bid'`. `readBrowserId(req)` returns null unless the cookie is a UUID; `newBrowserId()` makes one.
  - About 1 call in 100 also deletes windows older than two days, matching the privacy page.
- **Files:** `supabase/migrations/20261019112411_rate_limit_fn.sql`, `lib/rateLimit.ts`, `lib/database.types.ts` (function type), `tests/platform/rateLimit.test.ts`, `tests/platform/migrations.test.ts`
- **Contract changes:**
  - **P1 (`/api/lookup`):** `checkRateLimit(\`lookup:ip:${hashIp(clientIp(req))}\`, RATE_LIMITS.lookupPerIp)`. Return 429 `rate_limited` when it's not allowed.
  - **P4 (`/api/coach`):** check both `coach:browser:<id>` and `coach:ip:<hash>`. Set the `showup_bid` cookie (httpOnly, `sameSite=lax`, 1 year) when `readBrowserId` returns null. Note that §14's 20 an hour **per IP** may block a class on shared Wi-Fi. Consider raising `coachPerIp`.
  - **Every new SQL function** must be `security invoker` and revoke execute from public, anon and authenticated. `npm test` checks this.
- **Checked:**
  - `npm test` (83/83; the new function check failed first on a version without the security lines), typecheck and lint pass.
  - In the database: calling the function twice returns 1 then 2; `anon` and `authenticated` can't run it; `get_advisors` shows only the expected notices. The test row was deleted.
- **Open issues / next:** Task 13 (home page and the lookup flow) is next.

### 2026-10-19: P5 Task 11: site shell and security headers
- **Who:** PlaidMod · P5 Platform, Evidence and Pitch
- **Branch:** main
- **What changed:** Every page under `app/(public)/` now gets the shell:
  - a "Skip to content" link, first in tab order
  - a header with the logo, an About link and the English/Español toggle
  - a footer with "We summarize. We never recommend." and links to About, Privacy and Terms

  The language toggle is a plain form that calls a server action (`switchLocale`), so it works even before the page's JavaScript loads. Next.js re-renders the page in the new language, and the visitor stays on the same page. Every route also sends the four security headers.
- **Files:** `app/(public)/layout.tsx`, `components/shell/{SiteHeader,SiteFooter,LanguageToggle}.tsx`, `app/actions/locale.ts`, `next.config.ts`, `components/civic.tsx` (the logo now reads as "ShowUp HTX"), `messages/*.json` (`Shell` namespace)
- **Contract changes:** None.
  - **For pages in `app/(public)/`:** use a single `<main id="main">` per page; the skip link targets it.
  - **For other screens** (stake picker, Speak up), you can drop in `<LanguageToggle />` from `@/components/shell/LanguageToggle`. It's a server component.
- **Checked:**
  - `npm test` (70/70), typecheck, lint and build pass.
  - `curl -sI` shows `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` and `Permissions-Policy`.
  - In a browser at 390px and 1440px:
    - nothing scrolls sideways (both languages)
    - the first Tab reaches "Skip to content", which floats over the page
    - Español switches the header, footer and page, and sets `<html lang="es">`; the choice survives a reload
    - clicking right after the page loads still works (the first version, a client-side button, ignored early clicks)
- **Open issues / next:** Task 12 (rate limiting) is next.

### 2026-10-19: P5 Task 10: design system brought into the app
- **Who:** PlaidMod · P5 Platform, Evidence and Pitch
- **Branch:** main
- **What changed:**
  - **Brought over from `web/`:** the color tokens (`app/globals.css`), the fonts (Overpass, plus Playfair and Libre Franklin for news), all 25 shadcn components (`components/ui/`), `cn()`, the favicon and `DESIGN.md`. `DESIGN.md` now sits at the root, with a top note marking its prototype-only sections.
  - **Fixed along the way:**
    - corner sizes now match DESIGN.md (`rounded-2xl` is 16px, `rounded-xl` is 12px)
    - inputs are 44px pills with a denim focus ring
    - toasts no longer need next-themes
  - **New shared pieces** in `components/civic.tsx`: `Panel`, `SectionTitle`, `Chip`, `ArrowCircle`, `Logo`, `BodyIcon` and `TierPill`.
  - The palette dev tool stayed behind.
- **Files:** `app/globals.css`, `app/layout.tsx`, `app/favicon.ico`, `components/ui/*`, `components/civic.tsx`, `components.json`, `lib/utils.ts`, `lib/contrast.ts`, `lib/contracts/bodyTypes.ts`, `DESIGN.md`, `CLAUDE.md`, `AGENTS.md`, `README.md`, `messages/*.json` (`Civic` namespace), tests
- **Contract changes:** **Draft for P1's sign-off:** `lib/contracts/bodyTypes.ts`. It lists the plan's 12 "Who governs you?" types as `QUIZ_BODY_TYPES`: `city_council`, `commissioners_court`, `school_board`, `college_board`, `mud`, `esd`, `water_authority`, `flood_control`, `port`, `metro`, `hcad`, `hoa`. `BodyType` is those plus `other`. `BodyIcon` and the quiz both use them. P1: if `bodies.type` should use different keys, change this file in one place.
- **Checked:**
  - `npm test` (70/70, including a contrast test that fails if a base color drops white-on-denim, white-on-brick or ink-on-white below 4.5:1), typecheck, lint and build all pass.
  - In a browser, on a temporary sample page that was then deleted:
    - pill buttons (40px), cards 24px, inputs 44px pills
    - `rounded-2xl` 16px and `rounded-xl` 12px
    - Overpass loaded, all 13 `BodyIcon` types rendered
    - `TierPill` shows "Urgent" for `sms` only, and the input shows a denim focus ring
- **Open issues / next:**
  - Task 11 (site shell) is next.
  - Earlier note: GitHub repo secret `CRON_SECRET` and variable `APP_URL` are now set, for P2's scheduler.

### 2026-10-19: P5 Task 9: cron request check and schedules
- **Who:** PlaidMod · P5 Platform, Evidence and Pitch
- **Branch:** main
- **What changed:**
  - `lib/cron.ts` has `isAuthorizedCron(req)` and `unauthorizedCronResponse()` (a 401 with a JSON error). If `CRON_SECRET` is unset, every request is rejected, including `Bearer undefined`.
  - `vercel.json` schedules both daily jobs (Hobby runs each at most once a day):
    - `/api/cron/ingest` at 12:00 UTC, about 6–8 AM Central. That stays clear of BoardBook's midnight–5 AM maintenance window.
    - `/api/cron/alerts` at 16:00 UTC, about 10 AM–noon Central, inside the 8 AM–8 PM quiet-hours window on both sides of Nov 1.
- **Files:** `lib/cron.ts`, `vercel.json`, `tests/platform/cron.test.ts`
- **Contract changes (P2 and P3, please read):**
  - Cron routes **export both `GET` and `POST`**. The first line of each is `if (!isAuthorizedCron(req)) return unauthorizedCronResponse()`.
  - Callers send `Authorization: Bearer <CRON_SECRET>`. Vercel cron does this itself.
  - **P2's GitHub Actions** command is `curl -fsS -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/ingest"`, with `CRON_SECRET` as a repo secret and `APP_URL` as a repo variable.
  - Runs can be missed or fire twice, so make the jobs safe to repeat.
  - **Don't add a second `vercel.json`;** edit this one.
- **Checked:** `npm test` (64/64), typecheck and lint pass.
- **Open issues / next:** The GitHub `CRON_SECRET` secret and `APP_URL` variable are waiting on the owner's OK.

### 2026-10-19: P5 Task 8: signed `bodies_token` for results links
- **Who:** PlaidMod · P5 Platform, Evidence and Pitch
- **Branch:** main
- **What changed:** `lib/tokens.ts` has two functions:
  - `signBodiesToken(ids)` signs a list of body IDs.
  - `verifyBodiesToken(token)` returns the IDs, or **null** if the token is missing, cut off, edited, signed with another secret, or in an unknown version.
- **Files:** `lib/tokens.ts`, `tests/platform/tokens.test.ts`
- **Contract changes (shared, §3):**
  - **Format:** `<payload>.<signature>`. The payload is base64url JSON `{"v":1,"b":[sorted unique ids]}`, and the signature is base64url HMAC-SHA256 with `BODIES_TOKEN_SECRET`.
  - **Body IDs:** 1 to 64 IDs, each matching `^[a-z0-9][a-z0-9_-]{0,63}$`.
  - The same set always gives the same token, so P3 can cache the weekly page by token.
  - **P1** signs the token in `/api/lookup`. **P3** verifies it on `/weekly?t=`. When `verifyBodiesToken` returns null, show "enter your address again" instead of an error.
- **Checked:** `npm test -- tokens` (13/13), typecheck and lint pass.
- **Open issues / next:** Task 9 (the cron check and `vercel.json`) is next.

### 2026-10-19: P5 Task 7: shared Gemini client
- **Who:** PlaidMod · P5 Platform, Evidence and Pitch
- **Branch:** main
- **What changed:** `lib/gemini.ts` is the one Gemini client for P2, P3 and P4.
  - `generateJson({ schema, contents, system?, model?, temperature?, timeoutMs? })` asks for structured JSON and returns it after validating it against your zod schema. Gemini receives the schema with `$schema` removed, temperature defaults to 0 and the timeout to 120 s.
  - **Errors:** a timeout throws `GeminiTimeoutError` (Google still bills a call cancelled on our side). Output that isn't JSON, or doesn't match the schema, throws `GeminiOutputError` with `issues` and `raw`.
  - **Models:** `geminiModel('default' | 'extract' | 'extract_fallback')` reads `GEMINI_MODEL` (default `gemini-3.8-flash`) and `GEMINI_EXTRACT_MODEL` (falls back to the default). `GEMINI_EXTRACT_FALLBACK_MODEL` has no default, so leaving it unset throws.
  - **PDFs:** `pdfPart(bytes)` builds inline PDF data and throws `PdfTooLargeError` at 20 MiB or more.
  - **Testing:** `createGemini(fakeClient)` lets you test without the network.
- **Files:** `lib/gemini.ts`, `scripts/gemini-smoke.ts`, `tests/platform/gemini.test.ts`
- **Contract changes:** None. **P2:** per spec §6 this file exists, so use it instead of writing `lib/adapters/gemini.ts`. Pass `model: geminiModel('extract')`, and retry with `geminiModel('extract_fallback')` per D17.
- **Checked:** `npm test` (43/43), typecheck and lint pass. The live smoke test (`npx tsx scripts/gemini-smoke.ts`) is waiting on the paid `GEMINI_API_KEY`.
- **Open issues / next:** Once the adult account owner has the paid key, add it to `.env.local` and Vercel and run the smoke test.

### 2026-10-19: P5 Task 6: deployed to Vercel
- **Who:** PlaidMod · P5 Platform, Evidence and Pitch
- **Branch:** main
- **What changed:**
  - **Live site: https://showup-htx-six.vercel.app.** Vercel project `showup-htx` on the `majority-illusion` team. A new "NeighborhoodHacks" team needed a payment method, so the owner chose the existing free team.
  - It's connected to the GitHub repo, so pushes to `main` deploy. Because the repo is private, deploys of teammates' commits wait for the owner's approval in Vercel.
  - Env vars are set for production and preview: `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SITE_URL`, `BODIES_TOKEN_SECRET`, `CRON_SECRET`, `IP_HASH_SECRET`, `ADMIN_EMAILS` and `DEMO_MODE=false`.
  - Updated the README and `CLAUDE.md`.
- **Files:** `README.md`, `CLAUDE.md`, `.gitignore`
- **Contract changes:** None.
- **Checked:** `/`, `/about`, `/privacy` and `/terms` return 200 on production, and `/privacy` comes back in Spanish for `es-US`.
- **Open issues / next:**
  - **P3:** for Twilio registration, privacy is https://showup-htx-six.vercel.app/privacy and terms is https://showup-htx-six.vercel.app/terms. The contact link on them 404s while the repo is private.
  - **Still missing on Vercel:** `SUPABASE_SERVICE_ROLE_KEY` (the owner pastes it from the Supabase dashboard), the Gemini variables (once the paid key exists) and Twilio's (P3).
  - `ADMIN_EMAILS` has four of the five teammates; the fifth teammate's email is still needed.

### 2026-10-19: P5 Task 5: about, privacy and terms pages (English and Spanish)
- **Who:** PlaidMod · P5 Platform, Evidence and Pitch
- **Branch:** main
- **What changed:** Added `/about`, `/privacy` and `/terms` in both languages. The privacy page covers everything the plan and Twilio need:
  - your address isn't saved
  - the cookies (`NEXT_LOCALE`, `showup_stakes`, `showup_bid`) and the hashed IPs
  - anonymous quiz answers
  - drafts sent to Google's Gemini API
  - the text program ("ShowUp HTX alerts," message frequency, "Msg & data rates may apply," STOP and HELP, parent consent under 18)
  - "we do not share your mobile number … for marketing"
  - the services that handle data (Supabase, Vercel, Google, Twilio)
  - news headline links

  Styling is plain for now; the design tokens arrive in P5 Task 10.
- **Files:** `app/(public)/{about,privacy,terms}/page.tsx`, `components/legal/LegalDocument.tsx`, `lib/brand.ts` (`APP_NAME`, `CONTACT_URL`), `messages/en.json`, `messages/es.json`
- **Contract changes:** None.
- **Checked:**
  - `npm test` (32/32, including en/es message parity), typecheck, lint and build pass.
  - On a production server, all three pages return 200 and switch to Spanish for `es-MX`.
  - In a browser at 390px, none of the six page/language combinations scrolls sideways.
- **Open issues / next:**
  - **The contact link (GitHub Issues) returns 404 for anyone logged out, because the repo is private.** Twilio's reviewers will hit that. P3: if Twilio asks for a working contact, we need a team email or a public repo before you submit.
  - The Spanish name for "Speak up" is "Habla" on these pages. P4, rename it if you choose another.
  - There's no favicon yet (it shows as a console 404); it comes with Task 10.

### 2026-10-19: P5 Task 4: English/Spanish translations and Chicago time
- **Who:** PlaidMod · P5 Platform, Evidence and Pitch
- **Branch:** main
- **What changed:**
  - next-intl is set up without a language in the URL. The language comes from the `NEXT_LOCALE` cookie, then the browser's `Accept-Language` header, then English (`pickLocale` in `lib/i18n.ts`).
  - Every page gets `timeZone: 'America/Chicago'`, and `<html lang>` follows the language.
  - `setLocale` (in `app/actions/locale.ts`) saves the choice.
- **Files:** `i18n/request.ts`, `lib/i18n.ts`, `app/actions/locale.ts`, `messages/en.json`, `messages/es.json`, `next.config.ts`, `app/layout.tsx`, `app/(public)/page.tsx`, `tests/platform/i18n.test.ts`, `tests/platform/messages.test.ts`
- **Contract changes:** None to the schema. **For every part:**
  - Put all screen text in both `messages/en.json` and `messages/es.json`, under your own top-level namespace (`Results`, `Weekly`, `SpeakUp`, `Alerts` and so on). Use `useTranslations('Ns')` in client components, or `await getTranslations('Ns')` on the server.
  - `npm test` fails if a key exists in only one file, if any message is empty, or if the `{placeholders}` differ between the two.
  - Format dates, times and money with next-intl (`useFormatter()` or `getFormatter()`). The Chicago time zone is already applied.
  - Pages are now rendered per request, because the language is read from the request.
- **Checked:**
  - `npm test` (32/32), typecheck, lint and `npm run build` pass.
  - On a live production server, `Accept-Language: es-US` gives `<html lang="es">` with the Spanish description, and `en-US` gives English. A `NEXT_LOCALE=es` cookie overrides an English header.
- **Open issues / next:** Task 5 (about, privacy and terms pages) is next.

### 2026-10-19: P5 Task 3: env access and the server database client
- **Who:** PlaidMod · P5 Platform, Evidence and Pitch
- **Branch:** main
- **What changed:**
  - `lib/env.ts` reads environment variables through `getEnv(name)`, which throws a clear `MissingEnvError`. It also has `getOptionalEnv`, `isDemoMode`, `isDemoRecord`, `adminEmails` and `assertServer`.
  - `lib/db.ts` exports `db()`, the one shared Supabase client with the secret key. It throws if anything calls it in a browser.
  - `.env.example` lists every variable and which part uses it.
- **Files:** `lib/env.ts`, `lib/db.ts`, `.env.example`, `tests/platform/env.test.ts`, `tests/platform/db.test.ts`
- **Contract changes:** New env vars beyond §21 (plan files not edited):
  - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (admin sign-in)
  - `SITE_URL`
  - `GEMINI_MODEL`, `GEMINI_EXTRACT_MODEL` and `GEMINI_EXTRACT_FALLBACK_MODEL`
  - `IP_HASH_SECRET`, `DEMO_RECORD`
  - `SUPABASE_DB_URL` (local only)

  **Usage:** import `db` from `@/lib/db` in server code and scripts. It works under plain `tsx` too: load `.env.local` with dotenv first. Never import it into a client component. **P2:** your Phase 2 gate for `lib/db.ts` is met.
- **Checked:** `npm test` (17/17), `npm run typecheck` and `npm run lint` pass.
- **Open issues / next:** Ask P5 for the secret key and other values for your `.env.local`. They're never posted in the repo or chat.

### 2026-10-19: P5 Task 2: Supabase database is live (28 tables, RLS on everywhere)
- **Who:** PlaidMod · P5 Platform, Evidence and Pitch
- **Branch:** main
- **What changed:**
  - Created Supabase project `showup-htx` (ID `elsvhqqwdxwsuvkbchdq`, us-east-1, free plan; URL `https://elsvhqqwdxwsuvkbchdq.supabase.co`).
  - Applied the full §16 schema plus P2's additions in six migrations. Every table has RLS on with **no policies**, so the public key reads and writes nothing; only server code with the secret key can.
  - Generated types are in `lib/database.types.ts`.
- **Files:** `supabase/migrations/*.sql`, `lib/database.types.ts`, `tests/platform/migrations.test.ts`
- **Contract changes (shared; please read):**
  - **Keys:** `bodies.id` and `sources.id` are text slugs (e.g. `hcmud_489`). **P1: confirm your body slugs.** Every other table has a uuid `id`. Body foreign keys use `on update cascade`.
  - **Value lists** use text plus a `check` constraint, not Postgres enums. Examples: `items.status`, `tier`, `vote_result`, `review_status`; `sources.adapter` (`legistar | boardbook | primegov | llm_extract | manual`).
  - **New `items.source_id`** (not in §16): P2's upsert key `(source_id, external_id)` needs it. `meetings` has the same unique key.
  - **`items.review_status` is nullable,** because Legistar, BoardBook and manual items skip review. Suggested rule for P2 and P3: an item may text only when `tier = 'sms'` and `coalesce(review_status, 'approved') = 'approved'`.
  - **`alert_queue.item_id` and `alerts_sent.item_id` are nullable,** for the HCAD protest reminder. `alerts_sent` is `unique nulls not distinct (user_id, item_id, rule)`, so a reminder with no item still can't be sent twice; tested.
  - **Geometry** is `extensions.geometry(MultiPolygon, 4326)` for `boundaries.geom` (use `ogr2ogr -nlt PROMOTE_TO_MULTI`), and `Point` for centroids. PostGIS and pg_trgm live in the `extensions` schema.
  - **Loading order:** `hcad_jurisdictions.account` references `hcad_parcels`, so load parcels first.
- **How to add a migration:** write a new file in `supabase/migrations/` and ask P5 to apply it. P5 applies it through the Supabase connection and renames the file to the version the database records. Never `create policy`; `npm test` checks every migration for RLS.
- **Checked:**
  - In the database: 28 tables, 0 without RLS, 0 policies, extensions in `extensions`.
  - With the publishable key: reading `bodies` or `users` returns `[]`, and inserts get 401 or an RLS error.
  - `get_advisors` (security) shows only the expected "RLS enabled, no policy" notices.
  - `npm test` (6/6), `npm run typecheck` and `npm run lint` pass.
- **Open issues / next:**
  - **P1:** the free plan holds 500 MB, and a full HCAD load (about 1.5 million accounts, times their tax codes) likely won't fit. Load only the ZIPs the demo and the classmate survey need. For bulk loads, use the session-pooler connection string (Supabase dashboard → Connect) as a local-only `SUPABASE_DB_URL`.
  - P5 Task 3 (`lib/env.ts`, `lib/db.ts`) is next.

### 2026-10-19: P5 Task 1: root Next.js app and shared tooling
- **Who:** PlaidMod · P5 Platform, Evidence and Pitch
- **Branch:** main
- **What changed:** The real app now lives at the repo root, on Next.js 16.4.2, with Tailwind through `@tailwindcss/postcss`, vitest, ESLint and strict TypeScript, using the `@/*` → `./*` alias. `.gitattributes` forces LF line endings, and the root `.gitignore` keeps out `.env*`, `.next`, `.vercel` and the like. P5's full plan is in `.plans/p5-platform-plan.md`.
- **Files:** `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `.gitattributes`, `.gitignore`, `app/`, `tests/`, `CLAUDE.md` (Commands), `AGENTS.md` (Next's rules block), `.plans/p5-platform-plan.md`
- **Contract changes:** None to the schema or types. **For P2:** the root `package.json`, `tsconfig.json`, `eslint.config.mjs` and `vitest.config.ts` now exist.
  - Rebase `scrapper` onto `main` and add your dependencies and scripts (`test:live`, `scrape`, `news`) to these files rather than creating new ones.
  - `"type": "module"` is set. Your news-isolation `no-restricted-imports` rule is already in `eslint.config.mjs`.
  - `npm test` blocks `fetch`, so put live tests in a `vitest.live.config.ts`.
- **Checked:** `npm run typecheck`, `npm run lint`, `npm test` (1/1) and `npm run build` all pass. `next dev` served `/` with status 200.
- **Open issues / next:** Task 2 (Supabase project and schema) is next.

### 2026-10-19: P2 scraper Phase 1 complete (steps 2–13)
- **Who:** Iarush · P2 Agenda Data
- **Branch:** scrapper
- **What changed:** Standalone scraper library (no DB, no Next.js): Legistar (Commissioners Court, HISD), BoardBook (CFISD), PrimeGov (City Council), LLM extraction (Lone Star, HC MUD 489) and manual YAML adapters; results from minutes; news headline collector, article fetcher and article→item matching; pure `health()`. Per-step details, smoke tables and a "Handoff to P5/P3" section are in `.plans/scraper-progress.md`. Also moved the step 0/1 entries, which had been inserted above this file's title, down here unchanged.
- **Files:** `lib/adapters/`, `lib/ingest/`, `lib/news/`, `scripts/`, `data/`, `tests/`, `.plans/scraper-progress.md`
- **Contract changes:** `Meeting`/`Item` per scraper spec §12.1 (`Item.status` upcoming|awaiting_result|decided, `Meeting` end_date/status/minutes_url/comment_rules_text, `vote_result` passed|failed|no_action, `AdapterResult.result_updates`). Additions: optional `is_demo` on Meeting/Item; `RunMode` results takes optional `known`; no `content_hash` on Item/Meeting types (computed at write time); `health()` returns `details`; redaction also covers embedded names and 3+ name lists ("several employees"). DB columns per spec P2-A (P5). Affects P3 and P5.
- **Checked:** npm run typecheck, npm run lint, npm test (364 passed); live smoke of every source (table in progress log).
- **Open issues / next:** No GEMINI_API_KEY: all LLM fixtures hand-written, model ids unverified, live LLM smokes owed. Live BoardBook smoke and BoardBook results mode owed (session was in the 00:00–05:00 window). 5 outlets `fetch_articles: false` (terms of use); Houston Landing disabled. Phase 2 waits for P5's platform.

### 2026-10-19: P2 scraper step 1: shared types, ingest utilities, scrape CLI shell
- **Who:** Iarush · P2 Agenda Data
- **Branch:** scrapper
- **What changed:** Added the scraper's shared types (zod schemas for Meeting, Item, AdapterResult, news types), an HTTP helper, text/date normalization (America/Chicago), hashing, amount parsing, personnel redaction, section attribution, validation, a classify stub, the source registry with the news-domain guard, and the `npm run scrape` CLI shell (no adapters yet).
- **Files:** `lib/adapters/`, `lib/ingest/`, `scripts/scrape.ts`, `data/sources.yaml`, `tests/unit/`, `.plans/scraper-progress.md`
- **Contract changes:** `Meeting`/`Item` extended per scraper spec §5.1/§12 (end_date, status, minutes_url, comment_rules_text, body_id, section, description, amounts with optional `kind: 'rate'`, attachments, contains_private_person, quote_verified). Affects P3 and P5.
- **Checked:** npm run typecheck, npm run lint, npm test (66 passed)
- **Open issues / next:** Step 2 (LegistarAdapter). `lib/rules/classify.ts` untouched (P3 owns it).

### 2026-10-19: P2 scraper step 0: root TypeScript project setup
- **Who:** Iarush · P2 Agenda Data
- **Branch:** scrapper
- **What changed:** Added a root Node/TypeScript project for the standalone scraper library (separate from `web/`): package.json scripts, strict tsconfig, vitest, eslint, `.env.example`, `.gitignore`, and the progress log `.plans/scraper-progress.md`.
- **Files:** `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`, `vitest.live.config.ts`, `eslint.config.js`, `.env.example`, `.gitignore`, `.plans/scraper-progress.md`, `tests/unit/setup.test.ts`
- **Contract changes:** None
- **Checked:** npm run typecheck, npm run lint, npm test (1 passed)
- **Open issues / next:** P5 must merge root deps into the Next.js package.json later. Root configs exclude `web/`.

### 2026-10-19: Plan revision 5: news coverage perspectives
- **Who:** Iarush · part not set yet
- **Branch:** main
- **What changed:** Added a core feature, a "What news coverage says" block on weekly stories. It shows the viewpoints Houston outlets report on an agenda decision, grouped by stakeholder, each with a summary, an exact quote and a source link, plus a one-sided note. P2 now fetches article text from outlets with no paywall (stored admin-only, deleted after 90 days) and uses Gemini to match articles to items. P3 extracts viewpoints, runs code checks and a separate Gemini judge pass, and renders the block. News still never feeds items, classify, alerts, the review queue or story text; its only other effect is a weekly sort tie-breaker by outlet count.
- **Files:** `.plans/news-coverage-perspectives-spec.md` (new), `.plans/agent-scraper-spec.md` (v1.3: D27–D35, Steps 11b and 11c, P2-A, §10, §12), `Project_Plan.md`, `Technical_Implementation_Plan.md` (§1, §2, §6, new §9a, §10, §16, §19–§22)
- **Contract changes:** DB schema §16 gains `news_articles`, `news_article_items` (P2) and `item_perspectives` (P3), plus the existing D26 news tables. No news columns on `items`. The new env var `GEMINI_JUDGE_MODEL` affects P5. `Meeting`, `Item`, `bodies_token` and `classify()` are unchanged. The weekly sort order (§10) gains a last tie-break key, which affects P3.
- **Checked:** Docs only; no code changed.
- **Open issues / next:** TV station RSS feeds verified working on Oct 19 (KHOU, KPRC, ABC13, FOX 26). HPM, Community Impact and ABC13 block `Google-Extended` (Gemini) in robots.txt, and Click2Houston and FOX 26 block other AI crawlers. The owner chose the literal reading (scraper D36): obey only the `*` group or our own bot's group, so every outlet is fetched. P5 should prepare a pitch answer (scraper spec §12, item 22). Outlet terms of use are still unchecked, and Houston Landing still fails TLS. P5 needs to confirm the Gemini budget. P4's watchlist must find a real demo item with 2+ outlets covering it. Article storage is a copyright exposure the team accepted; recheck the outlets' terms.

### 2026-10-18: P4 registration, coaching and rehearsal
- **Who:** BluePhoenix79 · P4 Speak up
- **Branch:** main
- **What changed:** Replaced generated speeches with a bilingual understand → register → user-authored draft → rehearse flow. Added six source-checked recipe records, Chicago/DST/method deadlines, verified-only written alternatives, browser progress, registration confirmation, guardrails with undo and optional server-side coaching. Calendar and news-watchlist findings are documented.
- **Files:** `web/src/app/app/speak/`, `web/src/app/api/coach/`, `web/src/components/speak/`, `web/src/lib/{registration,coach,speak}/`, `web/messages/`, `web/tests/`, `web/docs/p4-*.md`, `web/tsconfig.json`, `.plans/p4-implementation.md`, `CLAUDE.md`
- **Contract changes:** No global data types, DB schema, Meeting/Item, bodies_token or classify changes. New P4-only registration and coach types; atomic RateLimitStore boundary awaits P5. Scope-local EN/ES messages await P5's global i18n provider.
- **Checked:** 71 tests, lint and TypeScript passed. Independent review fixes cover picker/API eligibility, method-specific cutoffs, policy-criticism near-misses, shared speaking targets and selected-method opening state. Live browser/API checks were blocked by approval capacity/socket permissions; live Gemini has no configured key.
- **Open issues / next:** See `web/docs/p4-status.md`. Teammate must verify MUD489's current participation rules and deliver a real comment; no submissions were made. P5/P3 must connect shared rate limits, real data, i18n and SMS reminders. Gemini uses native REST because SDK install approval failed. Original production-build limitations remain. No commit or push was attempted for P4.

### 2026-10-18: Plan revision 5: news "might come up" box (settled Iarush's way)
- **Who:** PlaidMod · P5 Platform, Evidence and Pitch
- **Branch:** main
- **What changed:**
  - **The news box:** for this one conflict, the owner sided with Iarush. P2's scraper spec (§12.12, D26) asked for the plan lines saying news is never a data source to change, so the plan files now say: news shows headline links on body pages labeled "may come up at a future meeting," and never feeds items, alerts or stories. The "In the news" box moved from stretch goals to the body pages. This is a one-time call, not a general rule that Iarush's documents override the owner's answers.
  - **Stress test:** it no longer interrupts agents running autonomously under a `.plans/` spec. They note it as pending and ask at the next interactive session.
- **Files:** `Project_Plan.md`, `Technical_Implementation_Plan.md` (§6), `CLAUDE.md`, `AGENTS.md`, `web/AGENTS.md`, `plan_stress_test.md`, `agent_handoff.md`
- **Contract changes:** None. The news box's display contract is in the scraper spec's Step 11 (P1 renders it on body pages).
- **Checked:** Docs only. The scraper spec was not touched.
- **Open issues / next:** P5's privacy and terms pages should mention third-party news headlines and links (scraper spec §12.14).

### 2026-10-18: Added the plan stress test for every teammate
- **Who:** PlaidMod · P5 Platform, Evidence and Pitch
- **Branch:** main
- **What changed:** Added `plan_stress_test.md`: the questions from the owner's planning review, rewritten so each teammate's agent asks its own teammate once and records the answers here, with the owner's answers alongside for comparison. Added a root `AGENTS.md` so Codex, Cursor and other agents started at the root find the rules. `CLAUDE.md` and `web/AGENTS.md` now point to the stress test too.
- **Merged with teammates' pushes:**
  - BluePhoenix79's `CLAUDE.md` changes are kept: four palette bases including `--ink`, presets in `palette.ts`, and `npm test`.
  - Iarush's `.plans/agent-scraper-spec.md` (v1.2) is now treated as the authority for P2 in `CLAUDE.md`, `AGENTS.md` and the stress test (Q11, Q12, Q15, Q16).
- **Files:** `plan_stress_test.md`, `AGENTS.md`, `CLAUDE.md`, `web/AGENTS.md`, `agent_handoff.md`
- **Contract changes:** None
- **Checked:** Docs only; no code changed. The plan files and the scraper spec were not touched.
- **Open issues / next:**
  - Each teammate's agent should run the stress test at its next session. PlaidMod is already marked done.
  - BluePhoenix79 has been building in `web/`, but the owner says `web/` is test-only. Worth a direct conversation.
  - The scraper spec's §12.12 asks for three plan lines to change (the news "might come up" box), but the owner says not to change the plan files. The team needs to settle this.

### 2026-10-18: Planning review: owner's instructions, research, answers (plan files not changed)
- **Who:** PlaidMod · P5 Platform, Evidence and Pitch
- **Branch:** main
- **What changed:** Went through the plan question by question, backed by research. Only this log, `CLAUDE.md` and `web/AGENTS.md` changed. The plan files were deliberately left as they are. **Where anything below differs from the plan (including part specs in `.plans/`), the plan wins until the team updates it.** This entry is longer than usual because the owner asked for everything to be recorded here.
- **Owner's standing instructions (apply to every agent):**
  - Follow `INSTRUCTIONS.md` no matter what. It stays unchanged.
  - The website in `web/` was only for testing. Don't build on it; follow the implementation plan. This settles the revision 4 Day 1 "prototype vs. plan" item. It also makes the tech plan's §17 table of prototype screens moot.
  - Don't change `Project_Plan.md` or `Technical_Implementation_Plan.md` unless asked.
  - Gemini's 18+ terms: the team has this handled. Don't raise it.
- **Research facts (checked Oct 18):**
  - **Hackathon:** Neighborhood Hacks 2026 is online and for high schoolers. Teams of up to 5; each member registers on Devpost.
    - **Submissions close Fri Oct 23, 11:59 PM CST.** There's no live demo: judges see the Devpost write-up, a 2–6 min video and the public repo.
    - The write-up must answer "What is the specific problem, and how do you know it's real?"
    - Rubric: Community Relevance 25%, Impact 20%, Technical 20%, Creativity 15%, Presentation 10%, Accessibility 10%.
    - Rules §4: AI tools must be disclosed in the written description. §9: misrepresenting AI use can disqualify. https://neighborhoodhacks.org/rules/
  - **Twilio:** a trial account can send only preset templates, not custom alert text. Real alerts need a paid account plus Sole Proprietor 10DLC registration, which needs a real US mobile number, an address, and privacy and terms URLs. Campaign review can take several days. Twilio Verify works on a trial (verified numbers only).
  - **Vercel Hobby:** cron runs at most once a day, within ±59 min of the set time. Functions max out at 300 s.
  - **Gemini:** Google may use free-tier content and have humans review it; the paid tier doesn't. Current models are `gemini-3.8-flash` and `gemini-3.5-flash-lite`. Structured JSON output is supported.
  - **Legistar:** `harriscountytx` and `houstonisd` both work without a token. HISD's data is complete. Commissioners Court's is missing upcoming meetings (Oct 29, Nov 12).
  - **Meetings before the deadline:**
    - CFISD, Mon Oct 19, 6 PM (sign up by noon Oct 19).
    - City Council, Tue Oct 20, 2 PM (sign up by 3 PM Oct 19).
    - HISD, Thu Oct 22, 5 PM. Its agenda is only five teacher employment hearings, so it's not suitable for the real comment.
    - **City Council's Tue Oct 27, 5 PM session already takes sign-ups on its online form, on any topic.**
    - Commissioners Court (Oct 29), HCC (Oct 28) and Lone Star (Nov 5) are all after the deadline.
- **Answers the owner agreed to (team notes; not in the plan):**
  1. The owner is P5. The name is ShowUp HTX.
  2. "Done" means the demo flow works end to end for the two demo addresses, plus the evidence. **After the demo flow works:**
     - the other four registration recipes
     - reminders 7a/7b and the protest reminder
     - the timeline
     - the "Why did I get this text?" page
     - health checks and the 45-day recheck
     - HISD Spanish agenda linking
     - the HOA top-50 list
     - Spanish coach tests
     - Port, METRO and water authority stories
  3. No classmate survey until the real lookup (Census + HCAD) works.
  4. The paid Gemini tier is owned by an adult (an 18+ teammate or a parent), along with any paid Twilio account.
  5. The Devpost write-up discloses AI use, and a teammate writes that section. This is the owner's answer to `INSTRUCTIONS.md`'s stop-and-ask rule.
  6. Schedule to the real deadline:
     - Mon: setup and checks.
     - Tue–Wed: build.
     - Thu: freeze at noon, fix bugs, record the video.
     - Fri: write-up; submit by 6 PM CST.
  7. A ~4 min video replaces the pitch slides and the backup video.
  8. All five teammates must be eligible and registered on Devpost. Confirm.
  9. Speak up may fill in only a factual opener (name, who you are, area, item). The user writes their position, experience, ask and closing.
  10. Build the new app at the repo root using the tech plan's §2 layout. Leave `web/` untouched, and delete it before submission once sohankamsala agrees.
  11. Carry over only the prototype's design system: `DESIGN.md`, color tokens, fonts and the shadcn components.
  12. Stay on Vercel Hobby, and trigger jobs by hand with `CRON_SECRET`.
  13. Use one model everywhere: `gemini-3.8-flash`.
  14. **Agenda data:**
      - Legistar for HISD.
      - Gemini extraction for the demo MUD.
      - Manual entry for everything else.
      - Skip PrimeGov.
      - Review items by flipping `review_status` in Supabase's table editor.
  15. **Real comment:** not HISD on Oct 22 (personnel hearings). Skip CFISD on Mon Oct 19 unless a CFISD teammate already has a topic.
- **Still open (owner unsure):**
  - Paid Twilio with Sole Proprietor registration, falling back to a labeled "preview" mockup.
  - Classmate survey Wed evening to Thu noon, with at least 10 people.
  - A teammate registering with the app for City Council on Oct 27, then speaking.
- **Files:** `agent_handoff.md`, `CLAUDE.md`, `web/AGENTS.md`
- **Contract changes:** None.
- **Checked:** Docs only; no code changed. Research came from web sources and read-only API calls; nothing was registered or submitted.
- **Open issues / next:**
  - Revision 4 of the plan still lists "prototype vs. plan" as an open Day 1 item, and §17 still has the prototype-screen table. Both are settled or moot per the owner, but the plan text wasn't edited.
  - Iarush's `.plans/agent-scraper-spec.md` (v1.2) was pushed during this review and wins for P2. It replaces answer 14 (agenda data), the P2 parts of answers 2, 12 and 13, and the "Skip PrimeGov" line. Under the spec:
    - Sources: Legistar for Commissioners Court and HISD, BoardBook for CFISD, PrimeGov plus Gemini for City Council, Gemini for Lone Star and HC MUD 489, and YAML manual entry.
    - Scheduling: GitHub Actions every 30 minutes, with a daily Vercel backup.
    - Model: Flash, retrying on Pro when validation drops too many items.
    - Health checks and results-from-minutes are built in Phase 1.

### 2026-10-18: UI polish and palette studio
- **Who:** BluePhoenix79 · UI/platform (part not assigned)
- **Branch:** main
- **What changed:** Improved dashboard hierarchy and phone layouts, widened news tiles at intermediate sizes, and added motion/focus polish. Expanded the existing dev picker into a six-preset palette studio with four editable tokens, validated saved colors, core contrast checks, CSS export and reset.
- **Files:** `web/src/app/`, shared UI components, `web/src/lib/palette.ts`, `web/tests/palette.test.mjs`, `web/DESIGN.md`, `web/docs/ui/`, `web/package.json`, `CLAUDE.md`
- **Contract changes:** None to schema, Meeting/Item, bodies_token, classify, or data/types.ts. Design tokens now allow ink as a fourth editable palette base.
- **Checked:** Pulled through `839e4a5` with autostash; no conflicts. `npm test` (5 passed), `npm run lint` and `npx tsc --noEmit` passed after pulling. Desktop palette/preset and Escape checked; phone dashboard and Brief inspected. Screenshots and detailed verification limits are in `web/docs/ui/README.md`.
- **Open issues / next:** Production builds previously failed on Google Fonts access and a CSS worker startup error. Browser persistence/clipboard checks remain unverified because approval tools timed out. Prototype/plan reconciliation remains open; scraper spec v1.2 overrides several parent-plan details and is not implemented by this UI change.

### 2026-10-18: Plan revision 4: rebalanced P5
- **Who:** PlaidMod · part not set yet
- **Branch:** main
- **What changed:** P5's Day 1 was overloaded, and every other part waits on it. Moved meeting calendar checks and the news watchlist to P4, Twilio registration to P3, and demo address picking to P1. Each part now converts its own screens' text for English/Spanish, and P5 only sets up the system. P5 does the database schema first on Day 1. Added a timing-risk note for the real public comment and a Day 1 "Everyone" decision on where the prototype and the plan disagree.
- **Files:** `Project_Plan.md`, `Technical_Implementation_Plan.md` (§11, §17, §22)
- **Contract changes:** None. Ownership and schedule only; no schema, type or token changes.
- **Checked:** Docs only; no code changed.
- **Open issues / next:** P1, P3 and P4 each picked up a Day 1 task; check that your Day 1 still fits. The prototype vs. plan decision is still open.

### 2026-10-18: Added INSTRUCTIONS.md (binding agent rules)
- **Who:** PlaidMod · part not set yet
- **Branch:** main
- **What changed:** Added `INSTRUCTIONS.md`, adapted from the owner's existing agent rules: no AI attribution anywhere (commits, PRs, docs, handoff entries), plus rules for when to commit or push. Removed the NASA-specific parts. `CLAUDE.md` now imports it and `web/AGENTS.md` points to it. Removed the "agent and model" field from this log's template to match.
- **Files:** `INSTRUCTIONS.md`, `CLAUDE.md`, `web/AGENTS.md`, `agent_handoff.md`
- **Contract changes:** None
- **Checked:** Docs only; no code changed.
- **Open issues / next:** If the hackathon's submission rules ask about AI use, that conflicts with `INSTRUCTIONS.md` §1. Agents must stop and ask rather than fill it in.

### 2026-10-18: Added agent guidance and this handoff log
- **Who:** PlaidMod · part not set yet
- **Branch:** main
- **What changed:** Added `CLAUDE.md` with commands, how the prototype is built, where it differs from the plans, and the design and neutrality rules. Added this log, and a rule in `CLAUDE.md` and `web/AGENTS.md` telling every agent to write an entry here.
- **Files:** `CLAUDE.md`, `agent_handoff.md`, `web/AGENTS.md`
- **Contract changes:** None
- **Checked:** Docs only; no code changed.
- **Open issues / next:** The prototype and Project_Plan rev 3 disagree on tier names, personas, county coverage, body list and route layout (see `CLAUDE.md`, "Prototype vs. plan"). The team needs to decide which side wins.
