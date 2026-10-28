# Plan: every MUD and school district in Harris County

Iarush (P2), Oct 27, 2026. Iarush builds all of it, in phases of up to 10 districts each. The batch lists and their checkboxes are in `.plans/district-rollout-batches.md`.

This file proposes work; it doesn't change `Project_Plan.md` or `Technical_Implementation_Plan.md`. The changes it would need there are proposals for the team (§7).

## 1. Decisions (Oct 27)

1. **Every water district counts:** MUD, UD, PUD, WCID, FWSD and WA. Residents can't tell them apart: all are Water Code ch. 49 districts with an elected board that sets a tax. All use `type: mud`.
2. **Full depth for every district.** Each one is:
   - found by the lookup;
   - given a body page;
   - scraped for agendas;
   - covered by stories and alerts.
   - If a district posts no agendas online, its page says so and links its official notice location. Nothing is invented.
3. **Rollout in phases of up to 10 districts.**
   - **Phase 0:** groundwork.
   - **S1–S3:** the 23 new school boards.
   - **W1–W55:** 498 water districts, region by region.
   - **X1–X6:** 60 HCAD codes with no county boundary.
4. **Database:** stay on Supabase's free plan. **No paid plan.** Pack the data so everything fits (§2).

## 2. The database question

**Is there another option instead of Supabase?** There is, but switching doesn't solve the problem and costs more than it saves:
- The app depends on Supabase for:
  - auth;
  - row-level security on every table;
  - PostGIS boundary lookups;
  - SQL functions (`lookup_hcad_parcel`, `lookup_boundary_bodies`, the rate-limit counter);
  - the Supabase client throughout `lib/`.
- Other hosted Postgres services have free limits in the same range. Moving means redoing all of the above.
- What uses the space isn't agendas. HCAD parcel data for 30 ZIPs takes most of the ~435 MB.

**So: pack the data to fit the free plan.** Two facts drive this:
- **The database is mostly HCAD data, not agendas.** On Oct 21 the HCAD tables held 385k parcels and 3.4M tax-code rows (one row per parcel per code). The tax-code index alone was 156 MB. Together they're an estimated ~400 of the ~435 MB.
- **The free plan includes 1 GB of file storage, separate from the 500 MB database.** Anything we only keep as a record can live there.

### 2.1 Pack the HCAD lookup (frees most of the database)

The lookup only needs one thing from HCAD: for a normalized street address, the distinct sets of tax codes there, plus the subdivision name for the HOA match. Store exactly that.

| New table | Columns | Rows |
|---|---|---|
| `hcad_code_sets` | `id int`, `codes text[]` | One per distinct combination of codes. Neighbors share a combination, so this is thousands of rows, not millions. |
| `hcad_subdivisions` | `id int`, `name text` | One per subdivision, taken from the legal description at load time |
| `hcad_addresses` | `addr_key bigint` (64-bit hash of the normalized address), `code_set_id int`, `subdivision_id int` | One per address and code set. A condo building with one code set is one row, not hundreds. |

**What's dropped:**
- **The `account` column.** The lookup doesn't use it.
- **The full legal description.** Only its subdivision is used.
- **`centroid`.** The comment in `route.ts` notes no parcel points are loaded. The Census supplies the point.
- **The address text, replaced by an 8-byte hash.**
  - The lookup is already an exact match, so nothing is lost.
  - A collision across ~1.4M addresses is about 1 in 20 million.
  - HCAD data is public, so the hash is about size, not privacy.

**What it changes:**
- **Size:** about 25 MB for the 30 loaded ZIPs, versus ~400 MB now. **About 100 MB for the whole county.** These are estimates from row sizes; measure the 30-ZIP result before loading more.
- **The whole county fits.** Every Harris County address gets exact tax codes, and the district boundaries (§3) become the fallback for new streets HCAD hasn't recorded yet.
- **Code to change:** `lookup_hcad_parcel` (same output columns, so `route.ts` barely changes), `scripts/load-hcad.ts`, `lib/lookup/hcadStaging.ts`, `.github/workflows/hcad-slice.yml` (a whole-county run), and their tests.
- **Order, so the database never needs room for both copies:**
  1. Build the new tables from the staged files.
  2. Switch the RPC.
  3. Check the demo addresses.
  4. Then `DROP` `hcad_jurisdictions` and the old `hcad_parcels`.
  - Dropping a table frees its space at once. Deleting rows doesn't.
- This is a DB schema change (tech plan §16). Flag it in the handoff.

### 2.2 Move raw agenda text to file storage

- **What's there now:** `documents.raw` holds the full text of every agenda PDF and every AI output, up to 1 MB each (`MAX_DOCUMENT_RAW`).
- **Why it can move:** the app never reads it back. Ingest compares only `url` and `content_hash`. It exists as the admin-only original record (scraper spec, line 408).
- **The change:**
  - Write it gzipped to a **private** Storage bucket: no public or `anon` access, because it can contain private names (scraper spec §5.4).
  - The `documents` row keeps `url`, `content_hash`, `kind` and a `storage_path`.
  - Text compresses about 4–6×.
- **Retention:** delete stored text after 24 months. The source URL stays on the row.
- **Estimated size at full coverage:** roughly 100–150 MB a year in Storage, against 1 GB.

### 2.3 Items: 8 months in the database, archive after that

- **Hot window: 8 months.** Items stay whole in the database for 8 months after their meeting.
  - At full coverage that's an estimated ~110 MB. 10 months would be ~140 MB.
  - Both fit, but 8 leaves more room. The archive means the shorter window loses nothing.
- **After 8 months, a monthly job:**
  1. writes the body's items for that month to a gzipped JSON file in a Storage bucket;
  2. replaces each item with a **stub**: `id`, `meeting_id`, `body_id`, `agenda_number`, `title`, `vote_result`, `source_url`, `archive_path`;
  3. deletes its perspectives.
  - Stubs are an estimated ~15 MB a year, so old links, search and "past decisions" keep working. The full item loads from the archive file.
  - Deleted rows' space is reused by new rows, so the database levels off instead of growing.
- **Archive bucket access:** published items are public records, already redacted ("an employee"). The archive bucket can be read by the server only. Body pages fetch from it on the server, so no bucket policy changes are needed.
- **Make the window a single constant** (`ITEM_HOT_MONTHS = 8`), so it can move later without a code change.

### 2.4 Stop storing what can be rebuilt

- **Template stories:** they're built from the item's facts by `templateStory()`, which is deterministic. Build them when the page is shown instead of saving them in `story_en`/`story_es`. Only AI stories are stored.
- **Housekeeping cleanup**, daily:
  - `rate_limits` and `alert_queue` rows older than 7 days;
  - `alerts_sent` older than 90 days;
  - acknowledged `p2_notices` older than 90 days;
  - expired `demo_cache`.
  - News article text is already deleted after 90 days.

### 2.5 Measure, then watch

1. **First task of Phase 0: get real numbers.**
   - This laptop's `.env.local` (from Oct 19) has no Supabase keys, so ask PlaidMod for the current values, or run the size query below in the Supabase SQL editor.
   - Record the result in the handoff.
   - Query: `select relname, pg_size_pretty(pg_total_relation_size(oid)) from pg_class where relkind = 'r' order by pg_total_relation_size(oid) desc limit 20;`
2. **Size on the admin health page:** the database size and the Storage size.
3. **Stop lines:**
   - Database: pause the rollout at 400 MB and look for the cause before going on.
   - Storage: pause at 800 MB.

### 2.6 Estimated budget (to be replaced by measurements)

| | Now | After 2.1–2.4 (30 ZIPs) | Full coverage, whole county, steady state |
|---|---|---|---|
| HCAD lookup | ~400 MB | ~25 MB | ~100 MB |
| District boundaries | <5 MB | ~5 MB | ~5 MB |
| Items, 8-month window | small (~650 items) | small | ~110 MB |
| Item stubs | 0 | 0 | ~15 MB a year |
| Documents (rows only) | unknown | ~1 MB | ~5 MB |
| Everything else, plus Postgres's own overhead | ~30 MB | ~30 MB | ~40 MB |
| **Database total** | **~435 MB** | **~60 MB** | **~280 MB after a year** |
| Storage (archives + raw text) | 0 | small | ~150–200 MB a year, capped by the 24-month rule |

**Reserve options if the estimates are wrong**, all free:
- The free plan allows two projects, so the HCAD lookup tables could move to a second project of their own.
- Shorten the hot window to 6 months.

### 2.7 How this changes the rollout

- **2.1 comes first** in Phase 0. Every batch's live lookup check (§4, step 5) can then compare the tax-code answer with the map answer for **every** address, not only the 30 ZIPs.
- **Load the whole county after the HCAD tables are packed.** The map-based "may be in" path (0.5) is then only for addresses HCAD doesn't have.

## 3. Phase 0: groundwork (before any batch)

No new districts go live in Phase 0. It builds the tools every batch uses, and it re-runs the 3 districts we already have (CFISD, HISD, MUD 489) through them as a pilot.

| # | Work | Files |
|---|---|---|
| 0.1 | **Database packing (§2), in this order:**<br>1. Measure.<br>2. Pack the HCAD tables (2.1) and load the whole county.<br>3. Move raw text to Storage (2.2).<br>4. Archive items after 8 months (2.3).<br>5. Stop storing template stories, and add the cleanup (2.4).<br>6. Put the sizes on the health page. | new migrations, `lib/lookup/hcadStaging.ts`, `scripts/load-hcad.ts`, `.github/workflows/hcad-slice.yml`, `lib/ingest/run.ts`, `lib/ingest/supabaseStore.ts`, `lib/stories/`, `app/api/cron/` |
| 0.2 | **Catalog builder:** `scripts/build-district-catalog.ts --batch W1` writes the batch's body rows into the generated file `data/bodies.districts.yaml` (regenerate it, never hand-edit it). Inputs: HCAD's list, the county layers, and the [Comptroller's special-district database](https://spdpid.comptroller.texas.gov/) (website, contact, how the board is chosen; districts report these themselves, so label them that way). | new script, `scripts/seed-bodies.ts`, `scripts/seed-hcad-jurisdictions.ts` |
| 0.3 | **One body list.** `lib/ingest/bodies.ts` has its own hard-coded 10. Make it read the YAML files. | `lib/ingest/bodies.ts` |
| 0.4 | **Boundary loader:** add the county MUD and water-district layers to `data/boundary-sources.yaml`. Widen `scripts/load-boundaries.ts` (its layer list allows only City, School and College). Loading is per batch and must keep earlier batches' polygons. | `data/boundary-sources.yaml`, `scripts/load-boundaries.ts`, `lib/lookup/boundaryStaging.ts` |
| 0.5 | **Lookup for addresses HCAD doesn't have** (new streets, since the whole county is loaded in 0.1): water districts and ISDs come from the boundaries, labeled "From the district map, not your tax record. Check your tax bill." Within ~50 m of a district edge, show "may be in". Replace `KNOWN_SCHOOLS` (2 entries) with a table of all 25 Census school-district names. | `app/api/lookup/route.ts`, `lib/lookup/standIn.ts`, new RPC, `/results` |
| 0.6 | **"We don't read this board's agendas yet":** shown on the body page while a district is listed but has no source. The state comes from the `sources` table, so no schema change. | body page, `/app/districts` |
| 0.7 | **Site survey:** `scripts/survey-district-sites.ts --batch W1` fetches each district's site and records the vendor, agenda index URL, link pattern and date format. It writes a report to `tmp/`, never to `sources.yaml`. | new script |
| 0.8 | **Scheduler at ~550 sources:** the near-term sweep visits only sources with a meeting in the next 72 hours. Rotation goes by how overdue a source is. The GitHub Actions ingest runs as a matrix of shards, each its own call under Vercel's 300-second limit. AI stories only for items `classify()` marks notable; the rest get template stories. Tests run 550 fake sources: none starves, and the budget holds. | `lib/ingest/scheduled.ts`, `.github/workflows/ingest.yml` |
| 0.9 | **Batch checker:** `scripts/check-district-batch.ts --batch W1` runs the §4 checklist and prints pass or fail for each district. | new script |
| 0.10 | **Shared-page checks:** logos and photos fall back to the icon and kind photo, never another district's. News matches "MUD <n>" and ISD names by pattern, not 500 listed terms. Speak up uses the generic "written comment to the board" path, with no claimed sign-up rules. | `lib/bodyLogos.ts`, `lib/bodyPhotos.ts`, `data/news_terms.yaml`, `lib/speak/` |

**Phase 0 is done when:**
- The pilot passes the batch checker for CFISD, HISD and MUD 489.
- The whole county's HCAD data is loaded in the packed tables.
- The database is measured under 200 MB.
- `npm test`, typecheck, lint and build pass.

## 4. The checklist every batch follows

For each of the batch's districts:

1. **Catalog.** Run the builder for the batch.
   - Hand-check every name match between HCAD and the county layer.
   - Write the board type only from a source. Expect elected trustees for every ISD except HISD (appointed), and check each district's board page anyway.
   - Seed `bodies` and `jurisdiction_map`. Suffix codes (`(061)`) and "defined area" codes map to their base district.
2. **Boundary.** Load the batch's polygons and re-run the checker:
   - every body has a polygon;
   - every polygon has a body;
   - no unexpected overlaps.
3. **Site survey.** Run it for the batch. Group districts by vendor, and reuse or write one `llm_extract` template per vendor.
   - School boards: reuse `boardbook` or `legistar` if the district is on one. Write a new adapter only for a platform 3 or more districts share, with golden fixtures in `tests/golden/`.
4. **Sources.**
   - A district enters `data/sources.yaml` only after `npm run scrape -- --source <id>` finds an agenda dated within `expected_max_gap_days`.
   - Then run `npm run ingest -- --source <id> --dry-run`, then a real ingest.
   - No agendas online: leave it with no source, so the page says so. Note the reason in the batch's handoff entry.
5. **Live lookup check.** Test one real address per district (a public building, or a parcel looked up on HCAD's public site).
   - The tax-code answer and the map answer must agree. Once 0.1 has loaded the whole county, this applies to every address.
   - Record any misses.
6. **Pages.** Check the body page, `/results` and `/app/districts` at 390 px, by keyboard, with no horizontal scroll.
7. **Record.**
   - Tick the batch in `.plans/district-rollout-batches.md`.
   - Add one handoff entry for the batch: what's live, what failed, and the database size.
   - Commit, but only when you ask for it.

**A batch is done** when all 10 are listed, found by the lookup, and either ingesting or marked "no agendas online" with a reason. Health checks (`lib/ingest/health.ts`) must stay green for a week before the batch after next starts. That leaves one batch in flight while the previous one settles.

## 5. Phase order

| Stage | Phases | Districts | Notes |
|---|---|---|---|
| Groundwork | 0 | pilot: the 3 existing | Nothing new goes live |
| School boards | S1, S2, S3 | 10 + 8 + 5 | Largest Harris County districts first. S3 also maps code `012` to HISD. Few agenda platforms, so the adapters built here are reused. |
| Water districts, Cy-Fair | W1–W13 | 124 | First, because the demo address and the most existing users are there. W1 includes WCID 157 and 159, which share the MUD 489 test address. |
| Katy, Klein, Spring | W14–W31 | 64 + 53 + 44 | The largest MUD regions |
| Waller, Aldine, Humble, Houston, Alief, Tomball | W32–W47 | 156 | |
| Smaller regions | W48–W55 | 73 | Mixed regions, so expect more vendors per batch |
| No county boundary | X1–X6 | 60 | **Reconcile each code first:** it's a part of a district inside a city, a "defined area", dissolved, or in another county. Merge it into its base body or leave it uncovered with the reason. Only real stand-alone districts get built. Their lookup works only from HCAD tax codes, where loaded. |

**Pace:** this is a guess and should be re-estimated after S1 and W1.
- Phase 0: about a week.
- Each S phase: 1–3 days.
- First W batches: about 2 days each. Later batches in a known vendor cluster: closer to half a day.

## 6. Things to watch

- **The HCAD code isn't the MUD number.** Code `189` is MUD 489, and code `489` is MUD 189. Build IDs from names, never codes.
- **ID rules:**
  - Keep `hcmud_489` and use its pattern for the rest (`hcmud_<n>`, `hcwcid_<n>`, `hcfwsd_<n>`, a slug for named districts).
  - School boards are `<slug>_isd_board`, the slug `lib/lookup/standIn.ts` builds from Census names, so both lookup paths land on the same row.
  - Never rename an existing ID.
- **Districts that cross county lines** (Waller, Pearland, Dayton, Fort Bend County MUD 030): describe only the part we know about. Don't claim facts about the rest.
- **Census points are approximate.** That's why the "may be in" rule exists. Never show a map-based district as certain.
- **AI cost:** about 500 districts × ~1 agenda a month, plus minutes and stories. Estimate from OpenRouter prices before W1, set a monthly cap, and check spend at each region boundary.
- **Neutrality and privacy rules apply unchanged.** MUD agendas often have closed sessions and personnel items: "an employee", never a name.

## 7. Proposed plan-file changes (for the team; not made)

- **Tech plan §5:** "Codes outside the curated set map to a generic 'other taxing unit'." Every district now gets its own body. Also add the county water-district layer as a boundary source for Census-matched addresses.
- **Tech plan §16:**
  - `hcad_addresses`, `hcad_code_sets` and `hcad_subdivisions` replace `hcad_parcels` and `hcad_jurisdictions`.
  - `documents.raw` moves to private Storage, with `documents.storage_path` added.
  - Items get `archive_path`, and the 8-month archive rule.
- **Tech plan step 6 ("store the raw API response or model output in `documents`"):** it's now stored in Storage, with a pointer in `documents`.
- **Tech plan §9:** scheduler sharding.
- **Project_Plan scope:** coverage grows from one demo MUD to every district, through the phases above.

## Progress log

- 2026-10-27: Drafted. Iarush chose: all water districts, full depth, phases of 10, stay on Supabase's free plan with no paid upgrade. §2 was rewritten to pack the data instead: HCAD lookup tables, raw text and item archives in Storage, an 8-month window, and no stored template stories. Sizes are estimates until the Phase 0 measurement. Plan stress test still pending for Iarush (see `plan_stress_test.md`).
- 2026-10-28: Stress test done. 0.3 (one body list, `lib/ingest/catalog.ts`) and 0.6 (the "not read yet" notice on `/bodies/[id]` and `/app/districts`) are built. Tests, typecheck and lint pass. Next: 0.2, 0.4, 0.7, 0.9, 0.10. 0.1 is blocked on Supabase keys.
- 2026-10-28 (later): 0.2 built: `scripts/build-district-catalog.ts` (helpers in `lib/ingest/districtCatalog.ts`), with hand-checked websites in `data/district-sites.yaml` and a generated code map `data/hcad-jurisdiction-map.districts.yaml` read by the seed and load scripts. A dry run of all 55 S and W batches passes: 520 bodies, 521 codes. S1 step 1 (catalog) is written. S1's other steps and the pilot wait on 0.4, 0.7, 0.9 and the Supabase keys. Next: 0.9 batch checker, 0.4 boundary loader, 0.7 site survey.
- 2026-10-28 (later still): 0.9 and 0.4 built. `scripts/check-district-batch.ts --batch <id|pilot>` runs the §4 checks it can (catalog, code map, source or a recorded "no agendas online" reason; with keys, seeding, `jurisdiction_map` and boundary). The pilot passes its file checks; S1 fails only on sources, as expected. `load:boundaries` now takes the county layers `HCAD_MUD` and `HCAD_Water_Districts` (one `--batch` at a time, keeping earlier polygons); all 499 county polygons pass staging validation, and the pilot dry run stages MUD 489. Next: 0.7 site survey, 0.10. 0.1, 0.5 and live loads still need Supabase keys.
