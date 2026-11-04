# Spec: regional and state bodies, end to end

Iarush, Nov 4, 2026. This spec turns the plan's "Regional: coming soon" list into tracked bodies with real agendas, results, body pages, weekly stories, news and speak-up recipes. It also adds the Harris County regional water authorities, which the plan already counts as local governments but the catalog doesn't have yet.

**Status: spec only.** Iarush asked for the plan now and no build in this session. Work happens on branch `new-features` and reaches `main` through one pull request (§1, Q12). That's an exception to CLAUDE.md's "main only" rule, at Iarush's request.

Where this spec and `.plans/agent-scraper-spec.md` disagree on these bodies' sources, this spec wins. Everything else in the scraper spec still applies: validation, redaction (§5.4, D9), hashing, IDs, news isolation (D24, D26, D32) and robots.txt (D36). The plan files are **not** changed by this spec. §10 lists the edits it proposes for the team.

## 1. Decisions (interview, Nov 4)

| # | Topic | Decision |
|---|---|---|
| Q1 | Placement | **A separate "Regional and state" tier.** Its own section on `/results` and `/app/districts`, visually distinct from "Your governments" because readers don't elect these bodies directly. Their IDs go in `bodies_token`, so their items reach the Timeline, the Weekly and body pages. |
| Q2 | Statewide filter | **Code filter, no AI.** A TCEQ or PUC item is kept only if its text ties it to Harris County (§5). Everything else is dropped before it is stored. |
| Q3 | SJRA | **Dropped.** Its territory excludes Harris County: no tax and no jurisdiction there. It reaches Harris only through Lake Conroe releases and raw-water sales east of the San Jacinto River. |
| Q5 | Water bodies added | **North, West and Central Harris County Regional Water Authorities, plus North Fort Bend Water Authority's Harris slice** (address-based, in "Your governments"), and **Gulf Coast Authority** (regional tier). Coastal Water Authority and Trinity River Authority are not added. |
| Q4 | TxDOT | **Houston District hearings and public meetings, Harris County projects only.** Each one is a meeting with one item, and the end of the comment period is the deadline. The TxDOT Commission's Austin agenda isn't tracked. |
| Q6, Q9 | H-GAC | **A headless browser that identifies itself honestly, with a manual fallback.** Playwright uses our real bot User-Agent (`NeighborhoodHacks-AgendaBot/0.1`) and obeys robots.txt, with no stealth plugins and no CAPTCHA solving (D36). If Cloudflare still blocks it, the source falls back to the manual adapter and the health check flags it. |
| Q10 | TCEQ | **Both TCEQ sources.** The Commissioners' Agenda PDFs (every two weeks, in Austin), filtered to Harris items, plus TCEQ public meetings and hearings held on Harris County permits. |
| Q11 | PUC | **Utilities that serve Harris.** Items naming CenterPoint (electric or gas), Entergy Texas or a Harris water utility, plus ERCOT-wide rules (reliability, outages, rate design) that reach every Houston bill. |
| Q7 | Alerts | **No urgent alerts from the regional tier.** `sms_eligible = false` for all six regional bodies, so their items go to the Weekly and Timeline only. The water authorities follow the local rule (§4.4). |
| Q8 | Speak up | **A full, hand-checked registration recipe for every new body** (§8). |
| Q13 | Body types | **Four new `BodyType` values:** `mpo`, `state_agency`, `subsidence_district` and `regional_authority`. They aren't added to the quiz list. The water authorities keep the existing `water_authority`. |
| Q14 | Category | **A new `bodies.category` value, `regional`.** The rows move to it. `regional_coming_soon` stays valid for future placeholders. |
| Q15 | Place-based items | **All Harris items, with nearby ones first.** TxDOT and TCEQ local items carry a place, and when the browser profile has the reader's point, items within about 5 miles sort to the top **in the browser**. No reader location goes to the server (§7.3). |
| Q16 | Order | **Catalog first:** Phase 0 checks sources, then catalog and UI, then scrapers from easiest to hardest, then classify, Weekly and news, then speak-up, then end-to-end tests and the PR (§9). |
| Q12 | Ownership | **Iarush builds every phase on `new-features`.** Each shared-contract change is flagged in `agent_handoff.md`, and one PR goes to `main` so each part owner can review their files. |

## 2. Source survey (Nov 4, 2026)

Fetched from this session's container (cloud IP) with a plain `curl`. "Verify" means Phase 0 must confirm it before any code depends on it.

| Body | Where meetings are posted | Fetch result | Shape |
|---|---|---|---|
| H-GAC Transportation Policy Council | `h-gac.com/transportation-policy-council/meeting-agendas/<yyyy>-<month>` (one page per month); per-item PDFs at `h-gac.com/getmedia/<guid>/<Month>-<DD>-<YYYY>-Transportation-Policy-Council-Meeting-Item-<NN>`; video on `hgac.new.swagit.com` | **403, Cloudflare "Attention Required"**, even with a browser User-Agent | Monthly, 4th Friday, 9:30 a.m. (2026 schedule page). Agenda is HTML; each item has its own PDF. |
| TxDOT Houston District | `txdot.gov/projects/hearings-meetings.html` → `/projects/hearings-meetings/houston/<yyyy>/<slug>-<mmddyy>.html` | 200 | One page per hearing or meeting: date, place, virtual option, comment deadline. Houston District covers 6 counties, so filter to Harris. |
| TCEQ Commissioners' Agenda | `tceq.texas.gov/agency/decisions/agendas/comm/comm_agendas.html` → `/downloads/agency/decisions/agendas/<yyyy>/<yymmdd>.pdf` (e.g. `261104.pdf`, `261118.pdf`) | 200 | Every two weeks on Wednesdays. Text PDFs listing items with docket numbers and county. Speakers register through the Public Participation Form (512-239-3300, agenda@tceq.texas.gov). |
| TCEQ public meetings and hearings | `tceq.texas.gov/agency/decisions/hearings/events/…` and `@@event_listing` | 200 (verify the listing's filters) | One event per permit, often held in or near Harris County. |
| PUC open meetings | `puc.texas.gov/agency/calendar/openmeetings/` → agendas at `/agency/calendar/agendas/` and `ftp.puc.texas.gov/public/puct-info/agency/om/<mmyyyy>Final.pdf`; video at `adminmonitor.com/tx/puct/open_meeting/<yyyymmdd>/` | 200 (`calendarlist.aspx` is 404) | About every two weeks, in Austin (Travis Building). Items are docket numbers with captions; dockets live on Interchange. Next: Nov 5, Nov 19, Dec 3, Dec 17 (ERCOT calendar; verify on puc.texas.gov). |
| Harris-Galveston Subsidence District | `hgsubsidence.org/about/meetings/` | 200 | WordPress PDFs: `<yyyy>-<mm>-<dd>-Board-Agenda.pdf`, `<yyyy>-<mm>-<dd>-Minutes-RBM.pdf`. The newest agenda is undated (`/2026/10/Board-Agenda.pdf`, `Workshop-Agenda.pdf`), so the date has to come from the link text or the PDF. Monthly, 2nd Wednesday. |
| North Harris County RWA | `nhcrwa.com/wp-content/uploads/<yyyy>/<mm>/Agenda-<m>-<d>-<yy>.pdf`, `Minutes-<m>-<d>-<yyyy>.pdf` | Seen in search results (verify the index page) | Monthly, first Monday. |
| West Harris County RWA | verify (`whcrwa.com`) | — | Board meetings seen for Feb 23 and Jun 10, 2026 (third-party listing; verify). |
| Central Harris County RWA | verify | — | — |
| North Fort Bend WA (Harris slice) | verify (`nfbwa.com`) | — | Check that its boundary really crosses into Harris before adding it. |
| Gulf Coast Authority | verify (`gcatx.org`) | — | Harris, Galveston and Chambers counties. |

Water authority agendas are often drafted by the same law firms as MUD agendas (ABHR, SPH). Try the `mud_agenda` parser profiles on them in shadow mode before falling back to `llm_extract` (see `.plans/mud-code-parser-spec.md`).

## 3. Catalog (`data/bodies.yaml`)

| id | name | type | category | sms_eligible | impact_rank | tax_set_by_body_id |
|---|---|---|---|---|---|---|
| `hgac_tpc` | H-GAC Transportation Policy Council | `mpo` | `regional` | false | 10 | — |
| `txdot_houston` | TxDOT Houston District | `state_agency` | `regional` | false | 20 | — |
| `hgsd` | Harris-Galveston Subsidence District | `subsidence_district` | `regional` | false | 30 | — |
| `gulf_coast_authority` | Gulf Coast Authority | `regional_authority` | `regional` | false | 40 | — |
| `tceq` | Texas Commission on Environmental Quality | `state_agency` | `regional` | false | 50 | — |
| `puc_texas` | Public Utility Commission of Texas | `state_agency` | `regional` | false | 60 | — |
| `nhcrwa` | North Harris County Regional Water Authority | `water_authority` | `tracked` | §4.4 | 85 | — |
| `whcrwa` | West Harris County Regional Water Authority | `water_authority` | `tracked` | §4.4 | 85 | — |
| `chcrwa` | Central Harris County Regional Water Authority | `water_authority` | `tracked` | §4.4 | 85 | — |
| `nfbwa` | North Fort Bend Water Authority | `water_authority` | `tracked` | §4.4 | 85 | — |

Each row also gets `elected_or_appointed`, `description_en`, `description_es`, `meeting_info_url` and `source_url`, plus a new optional field, **`affects_you_en` / `affects_you_es`**: one neutral sentence on how the body reaches a Harris resident. For example, "Sets the delivery rates CenterPoint charges on your electric bill." It is written by hand from official sources. No position, no officials' names (DESIGN.md §10).

Facts to verify in Phase 0 before writing the copy:
- **H-GAC TPC:** the policy board of the Houston-Galveston metropolitan planning organization for the 8-county area (Brazoria, Chambers, Fort Bend, Galveston, Harris, Liberty, Montgomery, Waller). It decides how federal transportation money is spent through the TIP. Members are local elected officials and agency representatives.
- **TxDOT:** a state agency governed by the Texas Transportation Commission, which is appointed by the Governor. The Houston District covers 6 counties.
- **TCEQ:** 3 commissioners appointed by the Governor and confirmed by the Senate. It issues air, water and waste permits.
- **PUC:** commissioners appointed by the Governor. It sets CenterPoint's delivery rates. The existing CenterPoint card already says "Its rates are set by the Public Utility Commission of Texas," so link it to `puc_texas`.
- **HGSD:** a board appointed by the officials named in its enabling law (verify who). It regulates groundwater pumping in Harris and Galveston counties, and its permit fees are passed through to water bills. The City of Houston paid $1,118,000 in 2026 permit fees (May 27, 2026 council agenda).
- **Regional water authorities:** verify whether each board is elected or appointed. They charge the groundwater-reduction fees that appear on MUD and city water bills.
- **Gulf Coast Authority:** verify who appoints its board (believed to be the Governor and the three counties' commissioners courts).

**Remove SJRA** from every regional list and any seed (Q3).

## 4. Contract changes (flag each in the handoff entry when built)

### 4.1 `BodyType` (P1, `lib/contracts/bodyTypes.ts`)
- Add `'mpo' | 'state_agency' | 'subsidence_district' | 'regional_authority'` to `BodyType`. **Not** to `QUIZ_BODY_TYPES`: the "Who governs you?" question stays at 12 choices.
- `components/civic.tsx` `BODY_STYLE`: add an icon and tile for each new type (lucide `Route`, `Landmark`, `Layers`, `Waves` suggested), using tokens only. `components/prototype/civic.tsx` does the same for the demo `BodyIcon`.

### 4.2 Schema (P5 migration; tech plan §16)
- `bodies.category` check: add `'regional'`.
- `bodies`: add `affects_you_en text`, `affects_you_es text` (nullable).
- `sources_adapter_check`: add the new adapter kinds (§5): `hgac`, `txdot_hearings`, `tceq`, `puc_open_meeting`.
- `items`: add `place jsonb` (nullable), shaped `{ lat: number, lon: number, label: string, source: 'notice' | 'geocoded' }`. It locates the **project or facility**, never a person. RLS stays as it is.
- Migration data: update the six rows to `category = 'regional'` and delete `sjra` if it exists.

### 4.3 `Item` type (P2, `lib/adapters/types.ts`)
- Add `place?: { lat: number; lon: number; label: string; source: 'notice' | 'geocoded' }`.
- Add `comment_deadline?: string` (ISO, America/Chicago) for TxDOT and TCEQ items, whose deadline is the written-comment close rather than the meeting.
- `AdapterKindSchema`: add the four kinds.

### 4.4 `classify()` (P3, `lib/rules/classify.ts`)
- The signature doesn't change.
- New `item_type` values: `utility_rate` (PUC rate cases, storm-cost recovery, resiliency plans), `permit` (TCEQ), `transportation_project` (TxDOT, H-GAC TIP amendments) and `groundwater_fee` (HGSD and water authority fee or rate items). All four are `weekly`. Everything else from these bodies is `timeline`.
- The tier stays `sms` only when `body.sms_eligible`, so the regional tier can never send an urgent alert (Q7).
- Water authorities: set `sms_eligible` to match the other local water bodies (true, as for MUD 489) **only if** Phase 0 confirms the reader's own MUD or city pays the fee. Otherwise false. Record the choice in the handoff entry.
- Unit tests for every new rule, plus these near-misses: a PUC docket for an El Paso utility (dropped by the filter, never classified), a TCEQ "Harris" that is a person's surname, and an H-GAC item that is only staff minutes.

### 4.5 `bodies_token` (§3)
- No format change. Every Harris lookup adds the six regional IDs (all of them cover all of Harris). The water authority IDs come from boundaries.
- The token gets about 6 IDs longer. Check that it still fits the cookie and the URL limit.

### 4.6 `LookupPayload` (`lib/contracts/lookup.ts`)
- `regional: LookupBody[]` stays. Each entry now carries `type`, `next_meeting`, `affects_you` and `category: 'regional'`.
- The `'regional_coming_soon'` category is still accepted for placeholders.
- Add `point?: { lat: number; lon: number }`, **rounded to 3 decimals (about 110 m)**. It is returned to the browser only (§7.3).

## 5. Scrapers (P2)

Shared rules for every new adapter:
- `lib/adapters/http.ts` (30-second timeout, 500 ms per host, 2 retries).
- The real User-Agent, and robots.txt checked first.
- Redaction (§5.4).
- Golden fixtures in `tests/golden/<adapter>/` and unit tests with `fetch` blocked.
- An `expected_max_gap_days` setting for the health check.
- Every item's `source_url` is the official document or page.

### 5.1 Harris filter: `lib/ingest/harrisFilter.ts` (pure, shared by TCEQ, PUC and TxDOT)
- **Keep** if the text matches, as whole words and case-insensitive: `Harris County`; `Houston` (but not "Houston County", which is in East Texas); a list of Harris-area cities (`Pasadena`, `Baytown`, `Katy`, `Humble`, `Tomball`, `La Porte`, `Deer Park`, `Bellaire`, `Seabrook`, `Webster`, `Jacinto City`, `Galena Park`, `South Houston`, `Jersey Village`, …, kept in `data/harris-places.yaml`); a Harris ZIP code (770xx–773xx, checked against a ZIP list); or, for the PUC only, `CenterPoint`, `Entergy Texas` or an ERCOT-wide rulemaking (project numbers whose caption names ERCOT and no single utility).
- **Drop** when the only match is inside a personal name, or when another county is named as the location ("in Fort Bend County").
- The filter returns `{ keep, reason }`, and the reason is stored in `documents.raw` metadata for admin debugging.
- Tests: 30 or more labeled captions from real agendas, including the near-misses above.

### 5.2 `hgsd`: `llm_extract` (or `mud_agenda` if a profile fits)
- Index: `https://hgsubsidence.org/about/meetings/`. Link pattern: `(?i)Board-Agenda\.pdf$`.
- Date: from the filename when it's dated, otherwise from the PDF's first page (the notice date). Minutes pattern: `(?i)Minutes-RBM\.pdf$`.
- Workshops (`Workshop-Agenda.pdf`) become `type: special`. `expected_max_gap_days: 45`.

### 5.3 Water authorities: `llm_extract` or `mud_agenda` (shadow first)
- One source each: `nhcrwa`, `whcrwa`, `chcrwa`, `nfbwa`.
- NHCRWA: `nhcrwa.com` uploads, `Agenda-<m>-<d>-<yy>.pdf`, minutes `Minutes-<m>-<d>-<yyyy>.pdf`, `date_from: filename`.
- The others are verified in Phase 0.
- **Boundaries:** add a `boundary-sources.yaml` entry for each authority. Candidates are TCEQ's water district layer, each authority's own service-area map and H-GAC GIS; verify licensing and CRS. Load it with the existing boundary loader as `allowed_body_types: [water_authority]`.
- These are non-taxing bodies, so GIS is authoritative (tech plan §4 merge rule).

### 5.4 `gulf_coast_authority`: `llm_extract`
- Index URL and pattern come from Phase 0. `expected_max_gap_days: 45`.

### 5.5 `tceq`: new adapter kind `tceq` with two modes in one source config
- **`agenda`:** the index is `comm_agendas.html`, PDFs `/<yyyy>/<yymmdd>.pdf`. Parse the item blocks in code: TCEQ agendas are numbered, with a docket number, an applicant and the county, so no LLM is needed. Run the Harris filter on each block. `agenda_url` is the PDF. The meeting is in Austin at 9:30 a.m. unless the PDF says otherwise.
- **`events`:** the event listing filtered to public meetings and hearings. Each Harris event becomes a meeting (type `special`) with one item: permit number, applicant and facility, `comment_deadline` from the notice, and `place` from the facility address (§5.9).
- Applicants who are individuals (e.g. water-rights holders) go through D9 redaction like any private person.
- `expected_max_gap_days: 21` for agendas. Events have no gap check.

### 5.6 `puc_open_meeting`: new adapter kind
- Index: `/agency/calendar/openmeetings/` → the agenda PDF (`ftp.puc.texas.gov/.../om/<mmyyyy>Final.pdf` or `/agency/calendar/agendas/`).
- Parse each agenda line in code: docket or project number, caption. Run the Harris filter in PUC mode.
- `source_url` is the agenda PDF. Each item's `attachments` holds its Interchange docket link (link only, never parsed). `video_url` is the AdminMonitor page when it's present.
- Results: PUC posts its final orders on Interchange, not as minutes, so the first version only marks items `awaiting_result` and leaves outcomes unset (open item §11).
- `expected_max_gap_days: 30`.

### 5.7 `txdot_hearings`: new adapter kind
- Index: `hearings-meetings.html`. Follow the links under `/projects/hearings-meetings/houston/<yyyy>/`.
- Each page gives a meeting (`type: special`, in person or virtual, with the date and time from the page) and one item: the title is the project and its limits, `comment_deadline` is the end of the comment period, and the location comes from the page's county or limits text.
- Keep the page only if the Harris filter matches its county text. Pages for Brazoria, Fort Bend, Galveston, Montgomery and Waller projects are dropped.
- The window covers hearings whose comment period is still open, plus 30 days after (for the Timeline). No gap check.

### 5.8 `hgac`: new adapter kind, run from GitHub Actions
- **Runner:** `.github/workflows/hgac.yml`, a weekly cron plus a manual trigger. Playwright with the pre-installed Chromium, using the real User-Agent, no stealth and no CAPTCHA handling (Q9).
- Fetch `robots.txt` through the same browser first and obey it.
- Load `/transportation-policy-council/meeting-agendas/<yyyy>-<month>` for the current month and the next. Parse the agenda HTML into items (number, title, section) and attach each item's `getmedia` PDF as a link.
- Write an `AdapterResult` JSON artifact. The job posts it to `/api/cron/ingest` with the existing cron secret, so ingest stays on the normal path.
- **Fallback:** if the page is still a Cloudflare challenge (title "Attention Required" or a 403), the run records `warnings: ['blocked_by_cloudflare']`, the health check marks the source red, and the admin enters the meeting as `data/manual/<date>-hgac-tpc.yaml` (the existing ManualAdapter). The **2026 meeting schedule** is entered by hand from the schedule page so the next meeting always shows.
- `expected_max_gap_days: 40`.

### 5.9 Place for TxDOT and TCEQ items
- Geocode the **facility or project** address from the notice with the US Census geocoder, the same service the lookup already uses. Store it in `items.place` with `source: 'geocoded'`.
- No reader data is involved.
- If geocoding fails, leave `place` empty and the item still shows, just without the "near you" sort.

## 6. Ingest, review, health
- Register each source in `data/sources.yaml`, then seed with `npm run ingest -- --seed`.
- Items parsed in code (TCEQ, PUC, TxDOT, H-GAC HTML) skip review, like Legistar. LLM-extracted items (HGSD, water authorities, Gulf Coast Authority) keep the D6 review gate.
- `lib/ingest/health.ts`: add the Cloudflare-blocked state for `hgac`.
- Scheduling: TCEQ, PUC and TxDOT join the daily rotation. HGSD, the water authorities and Gulf Coast Authority join the MUD-style monthly cadence. H-GAC runs from the Action.

## 7. UI (prototype screens stay; change, don't redesign)

### 7.1 `/results` (`app/(public)/results/page.tsx`) and `/app/districts`
- Replace the bare regional list with a **"Regional and state"** section below "Your governments" and "On your ballot". The intro line says (en/es): "You don't vote for these directly, but their decisions reach your address."
- Each card shows `BodyIcon`, name, a "Regional" or "State agency" chip, `affects_you`, the next meeting date (America/Chicago), and a link to the body page.
- The water authorities appear in "Your governments" with the existing "a government you probably didn't know you had" highlight.
- 390px wide with no horizontal scroll; keyboard focus order; 4.5:1 contrast (DESIGN.md §13).

### 7.2 Body pages (`app/(public)/bodies/[id]`, `app/(prototype)/app/districts/[id]`)
- These show the same blocks as tracked bodies: description, who runs it, appointed or elected, next meeting, upcoming items, and the "In the news" box (D26).
- They add a **"How it reaches you"** block (`affects_you`) and an **"Official source"** link.
- For `puc_texas`, add a link back to the CenterPoint card. The CenterPoint card links here.

### 7.3 Timeline, Weekly and "near you" sort
- Regional items carry a "Regional" chip. Items with `comment_deadline` show "Comments due <date>" instead of the meeting date.
- **Nearby first (Q15):** `/api/lookup` returns `point` (3 decimals) in the response. The browser stores it in the existing `showup.profile.v1` record next to the address (already allowed since Oct 23). `SignOutForm` clears it with the rest of the profile.
- Sorting happens in the browser (`lib/prototype/live.ts`) with a haversine distance; items within 5 miles get "Near you".
- The point is never sent back to the server, never put in a URL, cookie or log, and never stored in the DB.
- **Privacy flag:** this extends tech plan §19, which today lets only the street address stay in the browser. It needs the team's agreement before Phase 1 ships (§10).

### 7.4 Alerts page
- No change. Regional bodies don't appear in the urgent-alert follow list. The Weekly digest notification includes their weekly-tier items.

### 7.5 i18n
- Every new string goes in `messages/en.json` and `messages/es.json`, along with each body's `description_es` and `affects_you_es`.

## 8. Speak up recipes (P4, `lib/registration/recipes.ts`)
One recipe per body, hand-checked against the official page, with `last_verified`. Each one's deadline rule uses the existing `DeadlineRule` shape.

| Body | Channel (verify) | Deadline anchor |
|---|---|---|
| H-GAC TPC | Public comment sign-up for the monthly meeting (form or email on the meeting page) | meeting start |
| TxDOT Houston | Written comment by email, mail or the hearing page's online form; in person at the hearing | `comment_deadline` (new anchor `comment_close`) |
| TCEQ agenda | Public Participation Form before the meeting; 512-239-3300, agenda@tceq.texas.gov | meeting start |
| TCEQ public meeting | Oral or written comment at the meeting; written comment through TCEQ eComments with the permit number | `comment_deadline` |
| PUC | Open-meeting public comment registration; written comments filed in the Interchange docket | meeting start |
| HGSD | Board meeting public comment (the agenda's notice) | meeting start |
| Water authorities, Gulf Coast Authority | Board meeting public comment (the agenda's notice) | meeting start |

- New `DeadlineRule.anchor` value: `'comment_close'`. This is a contract change for P4.
- The AI coach rules (tech plan §14) don't change: no ghostwriting, and quotes must be exact substrings of the draft.

## 9. Phases

| Phase | Work | Done when |
|---|---|---|
| **0. Verify** | Re-fetch every §2 source. Confirm every "verify" fact in §2–3. Check robots.txt for each host. Find the water authority boundary layers and Gulf Coast Authority's index. Run the `mud_agenda` profiles over water authority agendas. | Every row in §2 has a confirmed URL and pattern, and the open facts are written into this spec. |
| **1. Catalog and UI** | §3 rows, the §4.1, 4.2 and 4.6 contract changes, the lookup adding regional IDs to the token, the §7.1–7.2 cards and body pages (next meeting entered by hand where no scraper exists yet), i18n. | A Harris lookup shows the regional section and the water authorities. Body pages render at 390px. `npm run typecheck`, `lint` and `test` pass, and the contrast test passes. |
| **2. Scrapers** | Easiest first: HGSD → water authorities → Gulf Coast Authority → TCEQ (agenda, then events) → PUC → TxDOT → H-GAC (with the Action and the fallback). `harrisFilter` and its tests. | Each source has golden fixtures, a clean `npm run scrape -- --source <id>`, an ingest dry run, and its health check green (H-GAC may be red with the manual fallback working). |
| **3. Classify, Weekly, news** | The §4.4 rules and tests. Weekly stories for regional items (with the AI label). `data/news_terms.yaml` aliases for each new body; ambiguous ones (`TCEQ`, `PUC`, `TxDOT`) require `Houston` or `Harris`. | Regional items appear in the Weekly and Timeline with the right tier. News matches in the box only. |
| **4. Speak up** | The §8 recipes and the `comment_close` anchor. | Every new body's speak-up page shows a recipe and no longer says "coming soon". |
| **5. End to end and PR** | A Playwright run for both demo addresses: lookup → regional section → body page → item → speak-up recipe; plus the near-you sort with a stored point. Handoff entry, then a PR to `main`. | All checks green, the PR is open, and part owners are tagged in the handoff entry. |

## 10. Proposed plan-file edits (not made; for the team to approve)
- `Project_Plan.md`, "Regional: coming soon" (line ~118) and Results §3.4: rename it "Regional and state", drop SJRA, add Gulf Coast Authority, and describe the tier as tracked with no urgent alerts.
- `Project_Plan.md` line 257: the new bodies get recipes.
- `Technical_Implementation_Plan.md` §4 "Derived entries → Regional", §8 item types, §16 `bodies.category`, `bodies.affects_you_*`, `items.place` and `sources.adapter`, §19 the browser-only point.
- `.plans/agent-scraper-spec.md` §5.1 and §12: the `place` and `comment_deadline` fields and the four new adapter kinds.

## 11. Open
- Results for PUC and TCEQ: should outcomes come from the next meeting's agenda or minutes, or from Interchange or TCEQ's Commissioners' Integrated Database? The first version leaves them `awaiting_result`.
- `sms_eligible` for the water authorities (§4.4) depends on Phase 0.
- If H-GAC keeps blocking honest automation, ask H-GAC for an allowlist or a feed (not chosen in Q6, but a cheap follow-up).
- The team has to agree to the browser-only reader point (§7.3) before Phase 1 ships.
- The submission deadline (Oct 23) has passed, so this is post-submission work. Confirm with the team that pushing feature work to the public repo during judging is fine.

## Progress log
- **2026-11-04:** Spec written from the interview (Q1–Q16) and the §2 survey. No code changed. The plan stress test for Iarush is done (Oct 28).
