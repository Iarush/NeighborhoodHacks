# Technical Implementation Plan

**Revision 5, Oct 19, 2026** (updated Oct 20, 2026: the AI provider is now OpenRouter, in §1, §14, §19, §21 and §22; updated Oct 22, 2026: alerts also go out as browser notifications, in §1, §2, §11, §16, §19, §20 and §21)

Revision 5 adds news coverage perspectives (see *Project_Plan.md*, "What changed in revision 5", and the full spec in `.plans/news-coverage-perspectives-spec.md`). The sections changed here are §1, §2, §6 (news), the new §9a, §10 (sort order), §16, §19, §20, §21 and §22.

Revision 4 moved four Day 1 tasks off P5 (see *Project_Plan.md*, "What changed in revision 4"). The sections it changed were §11 (Twilio registration), §17 (translation ownership) and §22 (Day 1 checks).

This file covers how each part is built. *Project_Plan.md* covers what the product does and why. Each section is tagged with the part that owns it:

- **P1:** Lookup and Results
- **P2:** Agenda Data
- **P3:** Weekly News and Alerts
- **P4:** Speak up
- **P5:** Platform, Evidence and Pitch

---

## 1. Stack (P5)

- **App:** Next.js (App Router, TypeScript), deployed on Vercel.
- **Database:** Supabase Postgres with the `postgis` and `pg_trgm` extensions.
- **AI:** Google's Gemini models through OpenRouter (`lib/openrouter.ts`), with structured JSON output. Server-side only. The team chose OpenRouter on Oct 20, 2026, in place of the Gemini API via the Google Gen AI SDK. That direct path stays only until `OPENROUTER_API_KEY` is set. Used for:
  - agenda extraction (P2)
  - news article → agenda item matching (P2)
  - weekly story writing (P3)
  - news coverage viewpoint extraction and the separate judge pass (P3)
  - Speak up explanation and coaching (P4)

  Models come from the `GEMINI_*_MODEL` env vars: `gemini-3.8-flash` by default, and `gemini-4-argon` for P2's retry (scraper spec D17). Each model must be on OpenRouter's model list with structured output. Use paid models, not `:free` ones, and check the OpenRouter account's data-use settings, since some providers may keep or train on what's sent.
- **Alerts:** browser notifications through the Web Push standard (the `web-push` library, `lib/push/`), signed with the app's own VAPID keys, so no outside account is needed (added Oct 22, 2026; see §11).
- **SMS:** Twilio Programmable Messaging, plus Twilio Verify for phone confirmation. Built, but off until an adult-owned sender is registered (§11).
- **i18n:** next-intl, with `messages/en.json` and `messages/es.json`.
- **Timezone:** all deadlines and meeting times are computed and displayed in `America/Chicago`.
- **Database access:** every table has Row Level Security enabled, with no policies for the `anon` role. All reads and writes go through Next.js server routes using the service-role key, which is never sent to the client.

## 2. Repository layout and ownership

```
app/
  (public)/page.tsx                 home, address entry            P5
  (public)/stake/                   stake picker                   P5
  (public)/results/                 governs-you question, results  P1
  (public)/bodies/[id]/             body pages                     P1
  (public)/tax-receipt/             tax receipt                    P1
  (public)/weekly/                  weekly news page               P3
  (public)/timeline/                timeline                       P3
  (public)/items/[id]/              item page                      P3
  (public)/speak-up/[itemId]/       Speak up flow                  P4
  (public)/alerts/                  opt-in, rules, why-this-alert  P3
  (public)/about/, privacy/, terms/                                P5
  admin/review/                     review queue                   P2
  api/lookup, api/quiz, api/tax-receipt, api/bodies               P1
  api/cron/ingest                                                  P2
  api/weekly, api/items, api/alerts/* (incl. alerts/push),
    api/reminders, api/twilio/inbound, api/cron/alerts             P3
  manifest.ts                       Home Screen manifest           P3
  api/coach                                                        P4
lib/
  geo/        geocoder, PostGIS queries, merge rules               P1
  hoa/        subdivision extraction, matching                     P1
  adapters/   legistar.ts, llmExtract.ts, manual.ts                P2
  news/       RSS mentions, article fetch, article→item matching   P2
  rules/      classify.ts                                          P3
  stories/    story generation, fact-check                         P3
  perspectives/  coverage viewpoints: extract, checks, judge       P3
  sms/        alert queue and job, twilio send, verify             P3
  push/       notification wording, subscription checks, sender    P3
  registration/  deadline resolver, channel builders               P4
  coach/      prompts, schema validation, guardrails               P4
  gemini.ts, db.ts, tokens.ts, rateLimit.ts                        P5
scripts/
  load-hcad.ts, load-boundaries.sh                                 P1
public/sw.js  service worker that shows notifications              P3
supabase/migrations/                                               P5 (others add)
tests/
  golden/legistar, golden/llm-extract, golden/news-articles        P2
  rules, stories, perspectives                                     P3
  coach                                                            P4
  geo                                                              P1
messages/en.json, es.json                                          P5 (all add keys)
```

**Shared contracts (agree on these on Day 1 so everyone can work in parallel):**
- the database schema (section 16)
- the `Meeting` and `Item` types (section 6)
- the `bodies_token` format (section 3)
- `classify()` signature (section 8)

## 3. Address resolution (P1)

**Route:** `POST /api/lookup`

1. **Normalize** the input: uppercase, standard street-suffix abbreviations, separate the unit number.
2. **Census Geocoder:** call the `geographies/onelineaddress` endpoint (current benchmark and vintage). Extract coordinates, county FIPS, incorporated place and unified school district. Reject if the county isn't `48201` (Harris County).
3. **HCAD parcel match:** look up the normalized address in `hcad_parcels` for the account number, legal description and jurisdiction codes.
4. **Fallback:** if Census fails but HCAD matches, use the parcel centroid as the point (if parcel geometry was loaded). If neither matches, return "address not found."
5. **Response:**
   - resolved bodies
   - ballot list
   - not-government entries
   - regional list
   - HOA candidate
   - `bodies_token`: an HMAC-signed, URL-safe encoding of the body IDs, with no address or coordinates in it

**Address retention:** The browser keeps the submitted street address only in its existing local profile (`showup.profile.v1`) so the reader can reuse it on this device. Signing out ("Sign out and forget this browser" for guests) clears it, so the next person on a shared computer doesn't see it. The server must not retain it in a database, cookie, account, link, or request log. Request logging must exclude request bodies.

**HCAD data load** (`scripts/load-hcad.ts`, one-time on Day 1):
- Download HCAD's bulk data files and load only these columns into `hcad_parcels` and `hcad_jurisdictions`:
  - account number
  - normalized site address
  - legal description
  - jurisdiction codes
- Build `jurisdiction_map`, which maps each HCAD code to a `body_id`. Codes outside the curated set map to a generic "other taxing unit."

## 4. Body resolution (P1)

**Point-in-polygon:**
```sql
SELECT b.body_id
FROM boundaries b
WHERE ST_Contains(b.geom, ST_SetSRID(ST_MakePoint($lon, $lat), 4326));
```
- `boundaries.geom` has a GIST index.
- Shapefiles are loaded with `ogr2ogr` and reprojected to EPSG:4326. Many Texas county layers ship in State Plane (EPSG:2278).
- **Layers:**
  - TCEQ water districts
  - ESDs
  - regional water authorities
  - METRO service area
  - Houston council districts
  - commissioner, constable and JP precincts
  - voting precincts
  - trustee districts

  Confirm each source on Day 1. Type in by hand for the demo addresses if a layer is missing.

**Merge rules:**
- **Taxing bodies** (ISD, college district, MUD/water district, ESD, city, Flood Control, Port): the HCAD jurisdiction codes are authoritative.
- **Non-taxing bodies** (council, trustee and precinct districts, voting precinct, METRO, regional water authority): GIS is authoritative.
- **Disagreement:** include the body with `verify = true` and log it.

**Derived entries:**
- **Ballot list:** `ballot_offices` joined to the resolved districts.
- **Not a government:** CenterPoint (always), the water operator (from the MUD's `operator_name`), and the HOA candidate.
- **Regional:** the static `regional_coming_soon` bodies.

**Sort order:** a static `impact_rank` per body type, reordered client-side by the selected stake.

## 5. HOA match (P1)

1. **Extract the subdivision** from the HCAD legal description with a regex that strips lot, block, section and reserve tokens:
   `LT 12 BLK 3 COPPERFIELD SEC 5` → `COPPERFIELD`
2. **Query:**
   ```sql
   SELECT *, similarity(subdivision_name, $sub) AS score
   FROM hoa_matches
   WHERE subdivision_name % $sub
   ORDER BY score DESC
   LIMIT 1;
   ```
   Start the threshold at 0.4 and tune it during the HOA match test.
3. **Return** the candidate with its `verified` flag and the master association if there is one. With no match, return `null`, and the UI shows a manual-entry field.
4. **Corrections** go to `hoa_corrections` (anonymous, reviewed by hand).

**Building the HOA table:**
- **Source:** County Clerk management certificate filings.
- **Priority order:**
  1. demo subdivisions
  2. survey participants' subdivisions
  3. the top 50 subdivisions in each demo district
- **Each row records:** the HOA name, the subdivisions it covers, the master association, the filing date, the source link and `verified`.

## 6. Agenda scraper and pipeline (P2)

**Shared types**
```ts
type Meeting = { external_id: string; body_id: string; date: string;
  type: 'regular' | 'special'; agenda_url: string;
  source_url_es?: string; video_url?: string };
type Item = { external_id: string; meeting_external_id: string;
  agenda_number?: string; title: string; matter_type?: string;
  status: 'upcoming' | 'awaiting_result' | 'decided'; action?: string; vote_result?: string;
  source_url: string; source_quote?: string };
```

### LegistarAdapter

- **Covers:** Commissioners Court (`harriscountytx`) and HISD (`houstonisd`), plus CFISD if it turns out to be on Legistar.
- **Calls:**
  1. `GET https://webapi.legistar.com/v1/{client}/events`, filtered with OData from 7 days back to 30 days ahead.
  2. `GET .../events/{id}/eventitems` for each event's items.
  3. Page with `$top` and `$skip`; each response caps at 1,000 rows.
- **Mapping:**
  - item title → `title`
  - agenda number → `agenda_number`
  - matter type → `matter_type`
  - action name and passed flag → `status`, `action`, `vote_result`
  - the event's agenda file → `source_url`
- **No PDF parsing.**
- **Day 1 check:** confirm neither client needs an API token.

### LLMExtractAdapter (Gemini)

- **Covers:** the demo MUD, the demo college board, City Council (if the PrimeGov check fails), and CFISD (if it isn't on Legistar).
- **Water districts moved off this adapter (Nov 4, 2026):** MUD, WCID, FWSD and PUD agendas and minutes use the code parser `mud_agenda` (`.plans/mud-code-parser-spec.md`): the PDF text layer, then text rebuilt from word positions, then free OCR (Tesseract, in GitHub Actions), then a looser list parser. The LLM is only the last step, capped at $1 or 20 documents a month across agendas and minutes; past the cap a meeting is stored with its agenda link and no items. A water district stays on `llm_extract` only until it passes the parser.
- **Process:**
  1. Code downloads the agenda PDF or HTML.
  2. Gemini, with structured output, returns `Meeting` and `Item[]`, including an exact `source_quote` per item. It reads scanned PDFs directly.
- **Validation in code:**
  - `source_quote` must be a substring of the extracted source text (whitespace-normalized)
  - dates must be real and within 60 days
  - amounts must parse as numbers

  Failures are dropped and logged.

### PrimeGov check (City Council)

- Spend at most 2 hours on Day 1 inspecting the `houstontx.primegov.com` portal's network requests.
- If there's a usable JSON response, write a PrimeGovAdapter. Otherwise, City Council goes to LLMExtractAdapter.

### ManualAdapter

- Rows entered through the Supabase table editor. `source_url` is required.

### HISD Spanish agendas (linking step)

- HISD posts Spanish agendas on its own site, not on Legistar.
- A small job finds each Spanish agenda PDF (with LLMExtractAdapter for the page, or manual entry), matches it to the Legistar meeting by date, and stores it as `meetings.source_url_es`.
- Spanish item pages link to it.

### Official sources that are not agenda sites (hand-entered, not scraped)

- Harris County election results (turnout for MUD, ESD, bond and trustee elections) → `elections`
- Harris County Tax Office Truth-in-Taxation notices (adopted, no-new-revenue and voter-approval rates) → `tax_rates`
- The HCAD protest deadline → `deadlines`

### News (P2 collects; revision 5)

News sites are never a source of **agenda data**: no meeting, item, result, classification, alert or official story comes from news. News is used in exactly three ways:
- **Team watchlist** (P4, Day 1).
- **"In the news" headline box** on body pages: RSS headline, outlet, date and link only (scraper spec D26, Step 11).
- **News coverage perspectives** (scraper spec D27–D35, Steps 11b and 11c):
  - P2 fetches the full text of body-matched articles, only from outlets with no paywall, using Readability, respecting robots.txt and filtering out opinion pieces before fetching.
  - The text is stored admin-only in `news_articles` and deleted after 90 days.
  - Gemini matches each article to items from a candidate list built by code, with an exact proof quote, into `news_article_items`.
  - P3 turns these into the weekly block (§9a).

Lint rules stop `lib/adapters`, `lib/ingest`, `lib/rules`, `lib/stories`, `lib/sms` and `lib/coach` from importing `lib/news` or `lib/perspectives`.

### Pipeline (`/api/cron/ingest`)

1. Process one source per invocation, choosing the least recently checked, to stay within function time limits.
2. Fetch meetings and items, using these recheck windows:
   - **Near-term meetings (next 72 hours):** rechecked on every run, regardless of the source's `last_checked`. Commissioners Court can add supplemental items up to 72 hours ahead and emergency items up to 1 hour ahead.
   - **Upcoming meetings (3–30 days ahead):** checked on the normal rotation.
   - **Past meetings with `awaiting_result` items:** the minutes or results page is rechecked daily for up to 45 days after the meeting. After that, the item stays `awaiting_result` and is flagged in the health check.
3. **Upsert** by `(source_id, external_id)`. Runs are idempotent.
4. **Change detection:** `content_hash` = hash of title + status + action. When the hash changes, re-run `classify()`.
   - **Upcoming → decided:** moves sections and triggers no new alerts.
   - **Upcoming → awaiting_result:** applies automatically once the meeting date has passed with no outcome posted. This is mainly for LLM-extracted and manual sources; Legistar items usually go straight to decided.
   - **New items on a near-term meeting:** go through the full pipeline. If their registration window has already closed, the SMS text uses the "registration may already be closed" wording (section 11).
5. Run `classify()` → enrich → generate the story (section 9) → route.
6. Store the raw API response or model output in `documents`.
7. **Health check:** flag the source if the fetch fails, it returns no meetings for 14+ days, a required field is empty, or the quote check rejects more than 20% of items.

## 7. Review queue (P2)

- Items from LLMExtractAdapter that classify as `tier = 'sms'` get `review_status = 'pending'`. They don't enter `alert_queue` until approved. Legistar and manual items skip review.
- **`/admin/review`** is protected by Supabase Auth, limited to an allowlist from `ADMIN_EMAILS`. It shows:
  - the extracted item
  - the source quote, highlighted in the source text
  - the rule that fired
  - Approve, Edit or Reject buttons
- **Approve** enqueues alerts. **Edit** updates fields and re-runs `classify()`. **Reject** sets `tier = 'timeline'`.

## 8. Rule engine (P3)

- A pure function in `lib/rules/classify.ts`:
  ```ts
  classify(item, body, taxRates): { item_type, tier: 'sms'|'weekly'|'timeline', rule_fired?: string }
  ```
  No AI involved.
- **Rules:**
  - `tax_rate_increase`
  - `bond`
  - `board_election`
  - `school_change`
  - `leader_hire` (superintendent or chancellor, with "employment contract," not bare "contract")
  - `meeting_moved`
- **`tier = 'sms'`** only when `body.sms_eligible` is true and the item is upcoming. Otherwise, item types `tax`, `bond`, `budget`, `school`, `zoning`, `property`, `transit` and `water_rate` are `weekly`, and everything else is `timeline`.
- **Time-based rules** (reminders 7a/7b, the protest deadline) are generated by the alerts job (section 11), not by `classify()`.
- **Unit tests** cover every rule plus these near-misses:
  - a vendor contract
  - a tax rate at exactly the no-new-revenue rate
  - a METRO item that matches a rule but must stay weekly

## 9. Weekly story generation (P3)

- **When:** generated once per item at ingest or on change, in English and Spanish, and stored on the item. Never generated per user.
- **Gemini input:** structured facts (body, meeting date and time, amounts, rates, registration deadlines, last-election turnout, comment channels) plus the item title and text.
- **Output schema:** `{headline, dek, body_paragraphs[2..4], renter_line}`
- **Prompt rules:**
  - AP-style news voice at about an 8th-grade reading level
  - attribute everything to the agenda
  - no predictions, opinions or judging adjectives
  - always include when and how to weigh in
- **Fact-check in code:**
  - Every number, currency amount, date and time in the output must match a value in the input facts.
  - Headline and dek are checked against a banned-words list (e.g. "slams," "outrageous," "finally," "controversial," "massive").
  - On failure, regenerate once; if it fails again, use the plain template summary.
- **Stored fields:** `story_en`, `story_es` (JSON), `story_source` (`ai` or `template`).
- **UI label:** "Written with AI from the official agenda — see source," or no label for template stories.
- **Golden tests:** saved facts for 5 items, run through the fact-check. Include deliberately wrong outputs that must be rejected.
- Story generation never receives news article text or perspectives. The story stays "from the official agenda."

## 9a. News coverage perspectives (P3; P2 supplies the data)

The full spec is `.plans/news-coverage-perspectives-spec.md`. Summary:
- **When:** a P3 job picks items with linked `ok` articles published before the meeting start. It regenerates when the hash of the linked articles changes, at most 5 items per run. The block is frozen at the meeting start; after that it changes only if a source article is removed.
- **Extraction (Gemini):** `{groups: [{label, arguments: [{summary, quote, article_id}]}]}`, with at most 4 groups, 2 arguments per group and 8 in total.
  - Labels say **who** holds a view, never the stance.
  - Summaries use the article's attribution ("say", "argue").
  - Officials and organizations are named as in the article; private individuals by role only.
- **Code checks** (each failing argument is dropped):
  - the quote is an exact substring of the article and 25 words or fewer
  - every number in the summary appears in the article or the item facts
  - summary ≤ 30 words and label ≤ 6 words
  - no banned stance labels (`opponents`, `supporters`, `critics`, …)
  - no banned words from the story list (§9)
  - no names of private individuals (the role-word proximity rule)
- **Judge pass:** a separate Gemini call on `GEMINI_JUDGE_MODEL`, which approves or rejects only and never rewrites. It checks `faithful`, `attributed`, `neutral_wording`, `label_fits` and `private_individual_named` per argument, plus an overall `one_sided`. If the judge call fails, the previous result is kept.
- **Result:** `item_perspectives`:
  - `state` is `ok`, or `sources_only` when no argument survives
  - `one_sided = groups < 2 || judge.one_sided`
  - groups are ordered by `sha1(item_id + label)`
  - the full `sources` list is always stored
- **UI:**
  - a collapsed "What news coverage says (N outlets, M viewpoints)" block on each weekly story card
  - a one-sided note, a Sources list, and the label "Summaries written with AI from news coverage and checked by AI. Quotes are exact. Opinion pieces aren't included. We don't take sides."
  - empty state: "No news coverage found for this item."
  - English only, with a Spanish note on `/es`

## 10. Weekly page (P3)

- **Route:** `GET /api/weekly?t={bodies_token}`. Signed-up users can use `user_bodies` instead.
- **Query:** items where `body_id` is in the set and `meeting_date` falls between 7 days ago and 14 days ahead.
- **Sections:**
  - **Lead story:** SMS-tier first, then soonest registration close, then the reader's stake.
  - **"Coming up: you can still act":** status upcoming, sorted by registration close, then meeting date, then `item_perspectives.outlet_count` descending (no coverage counts as 0).
  - **Coverage tie-breaker (revision 5):** outlet count is only ever the **last** sort key in a section. The lead story is chosen first, from the existing keys only, so coverage never makes an item the lead.
  - **"Decided this week":** `decided` items with their outcome, plus `awaiting_result` items labeled "Outcome not posted yet." Those are updated in place when the minutes appear.
  - **Sidebar:** "Deadlines this week" (registration closes, elections, protest deadline) and "Your governments at a glance."
- **Intro line** is a template, for example "This week: 3 decisions coming up across your 8 local governments, 2 with deadlines before Friday."
- **Rendering:** server-rendered and cached per token for 1 hour.
- **Speak up** buttons appear on "Coming up" items and link to `/speak-up/[itemId]`.

## 11. Alerts: browser notifications and SMS (P3)

**Browser notifications (added Oct 22, 2026).** Twilio needs an adult account owner who verifies their identity with an ID, and US carriers require every texting app to register its sender, which takes days. The team chose not to send ID, so alerts also go out as Web Push notifications. Texts stay built and switch on alongside notifications if an adult registers a sender later.
1. **Opt-in:** `POST /api/alerts/push` takes the browser's `PushSubscription` JSON, the reader's `bodies_token`, consent, and the same under-18 rule as texts (`is_minor` needs `parent_consent`).
   - The endpoint must be on a known push service host (Google FCM, Mozilla, Apple or Microsoft WNS), so the server never posts to an address of the sender's choosing.
   - One `users` row per browser, keyed by `push_endpoint`, with its followed bodies from the token.
   - It sets the `showup_sub` cookie, so Speak up reminders work, then sends one confirmation notification (a reply to the reader's action, so not held for quiet hours).
2. **Opt-out:** `DELETE /api/alerts/push` with the endpoint deletes the row, with its bodies, reminders and queued alerts. When a push service answers 404 or 410 during a send, the subscription has expired, and the job deletes it the same way.
3. **Sending:** `/api/cron/alerts` queues and sends exactly as for texts: same rules, quiet hours and `alerts_sent` idempotency. Each due alert goes to every channel the user signed up for that is switched on. An alert for a channel that isn't on stays queued.
4. **Wording** (`lib/push/message.ts`): the title is the body's name; the text is the headline plus the [deadline] part of the text format, without the link and STOP line. Tapping opens the item page with `?why=<rule>`. Notifications expire after one day.
5. **Keys:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (§21). Without them the alerts page shows a labeled preview.
6. **iPhone and iPad:** Safari allows push only for web apps added to the Home Screen (iOS 16.4 or later). `app/manifest.ts` and the Home Screen icon make that possible, and the alerts page explains the steps. Home Screen apps keep their own cookies, so the reader looks up their address again there.

**Text opt-in:**
1. `POST /api/alerts/subscribe` sends a Twilio Verify code.
2. `POST /api/alerts/verify` confirms it and stores `users.phone`.
3. If `is_minor` is set, `parent_consent` must also be true (a checkbox for the hackathon).

**Reminders:** `POST /api/reminders` writes `(user_id, item_id)`. This is the only server record that a user started Speak up. No draft content is stored.

**`/api/cron/alerts`** (hourly if the Vercel plan allows, otherwise daily):
1. Generate time-based alerts:
   - 7a: registration opens today
   - 7b: registration closes within 24 hours

   Both use the registration resolver (section 13). Also generate the protest-deadline reminder for Homeowner users.
2. Send `alert_queue` rows through Twilio and Web Push.
   - **Quiet hours:** 8:00 a.m.–8:00 p.m. Central; anything outside that window is held.
   - **Idempotency:** a unique key `(user_id, item_id, rule)` in `alerts_sent`.

**Message format:** `[Body]: [headline]. [deadline]. Speak up: [short link] Reply STOP to opt out.`

**Late-added items** (registration window already closed when ingested): the `[deadline]` part becomes "Registration to speak may already be closed; you can still send a written comment." The link opens Speak up on the written or email channel.

**Opt-out:** Twilio's STOP handling, plus the `/api/twilio/inbound` webhook, which sets `users.sms_opted_out`.

**Registration (P3):** start 10DLC or toll-free registration on Day 1, as soon as P5's privacy and terms pages are live. **Not submitted (Oct 22):** it needs an adult account owner's ID, and approval takes days. Browser notifications carry the alerts for the submission, and text sign-up shows a labeled preview.

**Trial account:** until 10DLC or toll-free registration completes, only verified numbers can receive texts. Verify the team's phones for the demo.

**"Why did I get this alert?":** each alert link includes the `rule` key. The page shows the rule's plain-language text and the source.

All cron routes check the `CRON_SECRET` header.

## 12. "Who governs you?" question and results (P1)

- **Fixed checklist** of 12 body types plus "I'm not sure," rendered while `/api/lookup` runs.
- **Scoring is client-side:** selected types vs. resolved types.
  - If HOA is selected, it's always scored as incorrect, with the teaching note.
  - If the lookup hasn't returned when the user submits, show a loading state until it does.
- **Stored data:** `POST /api/quiz` writes `{selected_types, actual_types, created_at}`. Types only, no identifiers.
- **Results page:** the four sections (section 4), with missed bodies highlighted.

## 13. Speak up: registration engine (P4)

**Rule format** (`registration_methods.opens_rule` and `closes_rule`) is structured JSON:
```json
{"anchor": "meeting_start", "offset_days": -1, "time": "12:00", "business_days": false}
{"anchor": "meeting_start", "offset_days": -3, "business_days": true}
{"anchor": "meeting_start", "offset_hours": -1}
{"anchor": "previous_weekday", "weekday": "monday", "time": "15:00"}
```
- `resolveDeadline(rule, meeting)` returns a timestamp in `America/Chicago`.
- Business-day math skips weekends. A holiday list is optional.

**Window state:** `before_open`, `open` or `closed`.

**Channel builders:**
- **`online_form`:** the deep link plus a checklist built from `required_fields`.
- **`email`:** a `mailto:` link with `to`, `subject` and `body` filled in from `required_fields`.
  - User-entered details stay in client state only.
  - The subject is limited by `word_limit_subject`; Gemini proposes a shortened subject for the user to approve.
- **`phone`:** a call script template (en/es).
- **`card_at_meeting`:** arrive by the deadline minus 15 minutes.
- **`written` / `remote`:** links and instructions from the recipe.

**Student rule:** when the stake includes Student and the body type is MUD, ESD or Commissioners Court, the default channel is `written` (or `email`).

**Progress:** `localStorage` keyed by `item_id`, storing state (`not_started` / `registered` / `confirmed`) and the draft. Wrapped in try/catch; the flow still works without storage.

**Demo recipes:** City Council, HISD board, CFISD board, Commissioners Court, the demo MUD, and Lone Star College. Each has `last_verified` and is rechecked against each demo meeting's notice.

## 14. Speak up: AI coach (P4)

**Route:** `POST /api/coach` with `{mode: 'explain' | 'coach', item_id, draft?, lang}`.

**Explain mode (Step A):**
- Output schema: `{plain_summary, who_it_affects, questions_for_user[]}`
- The UI labels it "AI explanation — check the source."

**Coach mode (Step C):**
```json
{
  "questions": [string],
  "feedback": [{"area": "structure|clarity|timing|item_reference", "note": string}],
  "cut_suggestions": [{"quote": string, "reason": string}],
  "guardrail_hits": [{"quote": string, "category": "personal_attack|private_info|threat", "reason": string}],
  "estimated_seconds": number
}
```

**"Coach, not ghostwriter," enforced in code:**
- The schema has no field for replacement text.
- The server rejects any `quote` that isn't an exact substring of the draft.
- The system prompt also forbids writing new sentences and adding or strengthening a position.

**Guardrails, in two layers:**
1. A deterministic pre-check: regex for phone numbers, email addresses and street addresses, plus a threat-phrase list in English and Spanish.
2. Gemini classification.

The client removes every `guardrail_hits` quote from the draft and shows its reason. The prompt defines criticism of decisions, policies or the body as allowed. Board members may be named in their public role.

**Timing:** recomputed client-side as `word_count / 130 × 60`. The model's estimate is only a hint.

**Limits:**
- Draft capped at 2,000 characters.
- 20 calls per hour per anonymous browser ID and per hashed IP (`rate_limits` table, fixed window).
- 15-second Gemini timeout.

**Privacy:** drafts are never written to the database or logs. The privacy policy says drafts are sent to OpenRouter, which passes them to Google's Gemini model for processing.

## 15. Tax receipt (P1)

- **Route:** `GET /api/tax-receipt?t={bodies_token}&value=250000`
- **Calculation:** for each taxing body,
  - `slice = adopted_rate × value / 100`
  - sorted descending
  - each slice includes `tax_set_by_body_id`, the last vote date, and the latest `elections` row
- **Missing rates** are returned as `rate: null`. The UI shows "rate not loaded," and the total is labeled partial.
- **Harris Health and HCDE** appear as slices (name, rate, who set it) without body pages.
- **Scope:** rates are entered for every taxing unit at the two demo addresses.

## 16. Data model (P5 creates migrations; owners in brackets)

**Core [P1]**
- **`bodies`:** id, name, type, category (`tracked` | `ballot_list` | `not_government` | `regional_coming_soon`), elected_or_appointed, sms_eligible, impact_rank, description_en, description_es, meeting_info_url, tax_set_by_body_id, operations_by_body_id, regulated_by, operator_name
- **`boundaries`:** body_id, geom (GIST index)
- **`jurisdiction_map`:** hcad_code, body_id
- **`hcad_parcels`:** account, site_address_norm, legal_description, centroid (nullable)
- **`hcad_jurisdictions`:** account, hcad_code
- **`hoa_matches`:** id, subdivision_name (trigram index), hoa_body_id, master_hoa_body_id, source_url, filing_date, verified, last_checked
- **`hoa_corrections`:** id, subdivision_name, suggested_hoa_name, created_at
- **`ballot_offices`:** id, body_id, office_name, holder_name, next_election_date, source_url
- **`tax_rates`:** body_id, year, adopted_rate, no_new_revenue_rate, voter_approval_rate, source_url
- **`elections`:** body_id, date, type, votes_cast, registered_voters, result, source_url
- **`deadlines`:** body_id, type, date, source_url
- **`quiz_responses`:** id, selected_types, actual_types, created_at

**Agendas [P2, P3]**
- **`sources`:** id, body_id, adapter (`legistar` | `llm_extract` | `mud_agenda` | `manual`, plus the other adapter kinds in `lib/adapters/types.ts`), config (JSON), last_checked, last_success
- **`documents`:** id, source_id, fetched_at, raw, content_hash
- **`meetings`:** id, source_id, external_id, body_id, date, type, agenda_url, source_url_es, video_url
- **`items`:** id, meeting_id, external_id, body_id, agenda_number, title, matter_type, item_type, status, action, vote_result, tier, rule_fired, review_status, source_quote, story_en, story_es, story_source, source_url, content_hash

**News [P2, P3]** (revision 5; the full columns are in the scraper spec §9 P2-A and the perspectives spec §5)
- **`news_mentions`**, **`news_mention_bodies`**, **`news_mention_items`** [P2]: the D26 headline box
- **`news_articles`** [P2]: id, external_id, outlet, url, headline, published_at, feed_updated_at, fetched_at, text (nullable, admin-only, nulled after 90 days), text_deleted_at, word_count, content_hash, content_type, status, body_ids
- **`news_article_items`** [P2]: article_id, item_id, proof_quote, model, linked_at
- **`item_perspectives`** [P3]: item_id, articles_hash, state, groups (jsonb), sources (jsonb), outlet_count, one_sided, dropped_count, extract_model, judge_model, generated_at, frozen_at
- No news columns on `items`.

**Participation [P4]**
- **`registration_methods`:** id, body_id, meeting_type, channel, opens_rule, closes_rule, required_fields, url, email, phone, word_limit_subject, minutes_per_speaker, reduced_minutes_rule, agenda_only, confirmation_type, remote_allowed, translation_request_rule, priority_groups, handouts_accepted, policy_url, last_verified

**Users and alerts [P3]**
- **`users`:** id, address_point (nullable), stakes, phone, phone_verified, language, is_minor, parent_consent, sms_opted_out, push_endpoint (unique), push_p256dh, push_auth (the three push columns are all set or all null; added Oct 22, 2026)
- **`user_bodies`:** user_id, body_id
- **`reminders`:** user_id, item_id, created_at
- **`alert_queue`:** id, user_id, item_id, rule, scheduled_for
- **`alerts_sent`:** user_id, item_id, rule, sent_at (unique on user_id + item_id + rule)

**Operations [P5]**
- **`rate_limits`:** key, window_start, count
- **`demo_cache`:** key, payload

## 17. Internationalization (P5 sets up; each part converts its own screens)

- **P5 sets up the system:** next-intl, the `messages/en.json` and `messages/es.json` files, language detection, and the shared components' text.
- **Each part moves its own screens' text** into the message files. In the current prototype (`web/src/app`), every screen has English written directly in the code:

  | Prototype screen | Converted by |
  |---|---|
  | `/` landing, `/start` onboarding, `/app` home, app shell and shared components | P5 |
  | `/app/districts`, `/app/districts/[id]`, `/app/vote` | P1 |
  | `/app/timeline`, `/app/brief`, `/app/alerts` | P3 |
  | `/app/speak` | P4 |

  The mock data in `web/src/lib/data/` is replaced by real data, not translated.
- All UI strings and templates live in `messages/*.json`.
- The language comes from the stake picker or the browser's `Accept-Language`.
- Gemini prompts take `lang` and respond in it. Stories are generated in both languages.
- HISD's Spanish agendas are posted outside Legistar. Store them as `meetings.source_url_es` and link them on Spanish pages.

## 18. Demo mode (P5)

- With `DEMO_MODE=true`, `/api/lookup` returns cached payloads from `demo_cache` for the two demo addresses. Census calls and Step A Gemini calls are bypassed, so the demo works without the network.
- Weekly stories for demo items are pre-generated and stored.
- A backup video of the full demo flow is recorded on Day 7.

## 19. Security and privacy checklist (P5 owns; everyone follows)

- Service-role key is server-only; RLS is enabled everywhere with no anon policies.
- No user-submitted addresses or drafts in the database, server cookies, accounts, links, or logs. The address may be kept only in the reader's browser profile (`showup.profile.v1`), and signing out clears it. `bodies_token` contains body IDs only.
- Phone numbers only after Twilio Verify. STOP handling is on.
- Browser push subscriptions are accepted only from known push service hosts, are deleted when the reader turns notifications off or the push service reports them gone, and are never logged. Notifications carry only the alert's title, text and link.
- Paid AI models only (no `:free` OpenRouter models). OpenRouter, Google, the browser push services (Google, Mozilla, Apple, Microsoft) and Twilio are named as processors in the privacy policy.
- Admin routes are behind the Supabase Auth allowlist. Cron routes require `CRON_SECRET`.
- Rate limits on `/api/coach` and `/api/lookup`.
- News article text (`news_articles.text`) is never returned by a public route. It's deleted 90 days after fetch. The privacy page says the app stores the text of public news articles to summarize them and shows only short quotes with links.
- The news fetcher respects robots.txt, never fetches paywalled or opinion pages, and never tries to get around a paywall.

## 20. Testing

| Test | Owner | Pass condition |
|---|---|---|
| 20-address verification | P1 | Every taxing body matches HCAD; disagreements explained |
| HOA match | P1 | 20 addresses in covered subdivisions match the management certificate; misses counted |
| Tax receipt | P1 | 2 demo addresses compared with the real HCAD bill; gap explained (exemptions) |
| "Who governs you?" scoring | P1 | Actual set matches the verified lookup for both demo addresses |
| Legistar golden | P2 | Saved responses from 5–10 meetings per client parse to the expected items |
| Extraction golden | P2 | 5–10 saved documents give the expected items; fake quotes rejected |
| Recheck windows | P2 | A supplemental item added to a meeting <72 hours away is picked up on the next run; a past meeting's item moves awaiting_result → decided when saved minutes are added |
| Spanish agenda linking | P2 | Each saved HISD Spanish agenda links to the right Legistar meeting |
| News article fetch | P2 | Opinion and robots-disallowed URLs are never requested; video pages become `too_short`; paywall pages become `paywalled` with no text stored |
| Article → item matching | P2 | All 7 recorded cases in scraper Step 11c pass (unknown ID, fake quote and prompt injection are rejected) |
| News isolation | P2/P3 | A run with news fixtures leaves `items`, `alert_queue`, the review queue and stories unchanged |
| Coverage perspectives | P3 | Fake quotes, changed numbers, stance labels and private names are dropped; a failing judge verdict drops the argument; post-meeting articles don't change a frozen block |
| Rule engine | P3 | Every rule fires on its sample; all near-misses don't |
| Story fact-check | P3 | Correct stories pass; deliberately wrong numbers and dates are rejected |
| SMS and browser notifications | P3 | No duplicates; quiet hours respected; STOP works; turning notifications off deletes the subscription; expired subscriptions are deleted; endpoints outside the known push services are refused |
| Registration resolver | P4 | Deadlines for all 6 recipes match the official rules for real upcoming meetings |
| Coach golden (EN/ES) | P4 | 5 drafts per language: item cited, time fits, no added opinion, criticism kept |
| Guardrails (EN/ES) | P4 | 2+ examples each of attack, private info and threat removed; near-misses kept |
| Demo dry run | P5 | Full demo flow runs in DEMO_MODE with the network off |

## 21. Environment variables (P5)

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `GEMINI_EXTRACT_MODEL`, `GEMINI_EXTRACT_FALLBACK_MODEL`, `GEMINI_JUDGE_MODEL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, `TWILIO_VERIFY_SID`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `BODIES_TOKEN_SECRET`, `CRON_SECRET`, `ADMIN_EMAILS`, `DEMO_MODE`

The three `VAPID_*` values (Oct 22, 2026) sign browser notifications. Every environment that sends to the same subscribers shares one key pair; a new pair makes existing subscriptions stop working. `VAPID_SUBJECT` is an https: URL (not localhost) or a mailto: address, and falls back to `SITE_URL` when that's https.

`GEMINI_API_KEY` is used only until `OPENROUTER_API_KEY` is set (§1).

## 22. Day 1 checks (blockers to clear first)

| Check | Owner |
|---|---|
| Supabase project and the full schema (§16) live by midday, before P5's other Day 1 work | P5 |
| Legistar `harriscountytx` and `houstonisd` work without a token | P2 |
| CFISD's agenda platform (Legistar or not) | P2 |
| PrimeGov portal has usable data (2-hour limit) | P2 |
| Which HCAD bulk file has jurisdiction codes; file size | P1 |
| Boundary sources for ESD, METRO, regional water and voting precinct | P1 |
| Two demo addresses picked; their bodies checked against HCAD records | P1 |
| OpenRouter model names, pricing and data-use settings | P5 |
| Vercel plan cron frequency and function duration limits | P5 |
| Privacy and terms pages live (needed for Twilio registration) | P5 |
| Twilio registration started | P3 |
| Meeting calendars checked for the six demo bodies; best meeting for the real public comment flagged to the team, especially if it falls on Day 2 or 3 | P4 |
| News watchlist: skim Community Impact, Houston Public Media, Houston Chronicle and Houston Landing for upcoming fights at the demo bodies (team use only). Also pick the demo item for the coverage block: real, upcoming, covered by 2+ outlets with no paywall | P4 |
| News outlets for the coverage block: feed URLs (including KHOU, KPRC, ABC13 and FOX 26), robots.txt and terms of use checked; any outlet that forbids automated access is disabled. Can run on the day P2 starts Step 11b. | P2 |
| OpenRouter budget covers the news calls (up to 5 match calls per ingest run, plus 2 calls per item for P3's perspectives) | P5 |
| Shared schema, types and token format agreed by all five | Everyone |
| Where the prototype in `web/` and these plans disagree (tier names, user types, Fort Bend coverage, body list, routes; see `CLAUDE.md`) | Everyone |
