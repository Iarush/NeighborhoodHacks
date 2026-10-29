# Spec: scrapers for every water district (MUD rollout)

Iarush (P2), Oct 28, 2026. This builds the W phases of `.plans/district-coverage-plan.md`: steps 3 and 4 of its §4 checklist for the 498 water districts. Where the two disagree, the coverage plan and `.plans/agent-scraper-spec.md` win, except for the decisions in §1 below, which Iarush made for this rollout.

## 1. Decisions (interview, Oct 28)

| Topic | Decision |
|---|---|
| Scope | All 498 water districts with a county polygon (W1–W55). **The X codes (60 without a boundary) are out of scope.** |
| Buckets | **Survey all 498 first, then regroup them by vendor** into buckets of about equal size. This replaces the region order of W1–W55 for this work. The checkboxes in `district-rollout-batches.md` stay; the bucket file (§3) maps each bucket to its W lines. |
| Adapters | **A dedicated adapter for every vendor**, even a vendor with 1–2 districts. Each adapter gets golden fixtures in `tests/golden/`. Where a site is one-off and has no reusable structure, `llm_extract` with a site template is allowed, and the reason is noted. |
| Adapter ownership | **One vendor per worker.** The bucket that first meets a vendor owns its adapter. Later buckets only add sources that use it. A worker that needs an adapter change sends `ask` to the coordinator. |
| Google Drive | Allowed. Use the public download and folder-embed URLs, with a golden test. When Google changes them, the health checks flag the affected sources. |
| Done bar | **Verified by scrape only.** A source is added after `npm run scrape -- --source <id>` finds an agenda dated within `expected_max_gap_days`. Seeding, ingest, boundaries and live lookups are recorded as blocked (no service-role key, no AI key) and get done later in one pass. |
| Dead ends | Search order: the survey, then the Comptroller's site, then **one** web search for "<district name> agenda". If all three come up empty, set `no_agendas_online` with the reason and `checked_on`. This takes about 5 minutes per district. |
| Parallelism | **One worker at a time** in the same working tree, so the shared files never conflict. Iarush keeps 2 blank terminals open: one runs the active worker; the other is ready for the next worker or a retry. |
| Handoff | The coordinator session dispatches each bucket to an open terminal with Orca orchestration (`worker-start`, `worker_done`). It does not start paid subagents. |
| Commits | **One local commit per bucket**, after the coordinator checks the work. Never pushed. |

## 2. Phase A: survey everything (one worker)

1. Run `scripts/survey-district-sites.ts` for W1 through W55. Keep the reports in `tmp/survey/`.
2. Add a combined report, `tmp/survey/all.json`, with one row per district: id, website, vendor fingerprint, agenda index URL, link pattern, date format, notes.
3. **Vendor fingerprinting:** the survey records the generator meta tag, the theme or CDN paths, the host of the agenda link (drive.google.com, a law firm's or manager's portal domain, BoardBook, CivicPlus and others) and the shared footer text. Group the districts by fingerprint. Firms' portals that host many MUDs count as one vendor.
4. Write `.plans/mud-buckets.md` (§3). Add the hand-checked websites to `data/district-sites.yaml`, checking each one per that file's header rule.

**Done when:** every one of the 498 has a vendor (or `unknown` or `no site`) and a bucket, and the coordinator has checked the bucket file.

## 3. The bucket file: `.plans/mud-buckets.md`

- A table of vendors: vendor, fingerprint, the number of districts and the bucket that owns its adapter.
- The buckets: **about 20 districts each, rounded so a vendor is never split across two buckets unless it has more than 20 districts.** Big vendors are split into consecutive buckets; the first one owns the adapter. Small vendors are combined into mixed buckets of similar size.
- Order: the bucket holding W1 (the demo area, Cy-Fair) goes first, then the buckets with the most districts.
- One line per bucket: ID (`M01`…), vendor(s), district IDs with their W batch, status, commit hash.

## 4. Phase B: one worker per bucket

Each worker does this for its bucket, in order:

1. **Adapter**, if the bucket owns a vendor: write `lib/adapters/<vendor>.ts` (or add to the `discover` config, if the vendor fits it), add golden fixtures from 2 real districts saved to `tests/golden/<vendor>/`, and unit tests. Follow the boundaries in `agent-scraper-spec.md` (no imports from `lib/news`).
2. **Sources:** for each district, scrape, and add it to `data/sources.yaml` only if the scrape passes (§1 done bar). Record the dead ends (§1).
3. **Catalog:** where needed, re-run `scripts/build-district-catalog.ts` for the affected W batches (never hand-edit `bodies.districts.yaml`).
4. **Check:** run `scripts/check-district-batch.ts` on each affected W batch. The file checks must pass. Database checks get recorded as blocked.
5. **Tests:** `npm test`, `npm run typecheck`, `npm run lint`. All must pass, except a known slow test that passes when run alone, as in the earlier handoff entries.
6. **Record:** add a draft `agent_handoff.md` entry (template at the top of that file) and update the bucket's line in `mud-buckets.md`. Don't tick the W boxes. They need the full §4 checklist, which is blocked.
7. `worker_done` with the outcome, `--files-modified`, and a report path. **No commit.** The coordinator commits.

**Do not touch:** the plan files, other buckets' districts, adapters another bucket owns (send `ask` to the coordinator instead), `web/`, or anything outside P2's paths, except the catalog scripts' generated files.

## 5. Coordinator loop (this session)

1. `orca orchestration run-create --objective "MUD scraper rollout"`.
2. Phase A goes to one worker; wait for its `worker_done`; review `mud-buckets.md`.
3. For each bucket: `worker-start` with a self-contained spec (target, change, constraints, ownership, acceptance; built from §4 and its line in the bucket file). Wait for `worker_done`, `question` or `escalation`, and answer any questions. On success: check the diff, rerun `npm test`, run the attribution check (INSTRUCTIONS.md §1), commit locally with a message like `Add MUD sources for bucket M03 (<vendor>)`, record the hash, and release the worker or reuse its terminal for the next bucket.
4. On failure: keep the work, read the report, then either redispatch the bucket's remaining districts or mark them in the bucket file.

## 6. Constraints carried over

- IDs are built from names, never from HCAD codes (`hcmud_<n>`, `hcwcid_<n>`, slugs). Never rename an existing ID.
- Privacy: in closed-session or personnel items, say "an employee", never a name. No AI-written content is stored without its label.
- All times use `America/Chicago`. Meeting times from link-only scrapes stay 00:00 and aren't shown until the AI pass runs.
- The AI cost estimate (coverage plan §6) is still owed before any ingest. It's out of scope here because no ingest happens.

## 7. Open after this spec

- The one pass that needs keys: seeding, boundaries, dry-run and real ingest, live lookups, and ticking the W boxes.
- The X phase.

## Progress log

- 2026-10-28: Spec written from the interview. Next: Phase A worker.
