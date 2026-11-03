# ShowUp HTX

**Type your Houston-area address. See every local government that affects you, what each one is deciding next, and how to speak up before the vote.**

ShowUp HTX is a civic-tech web app built by a five-person high school team for Neighborhood Hacks 2026.

- **Live site:** https://showup-htx-six.vercel.app
- **Specs:** [`Project_Plan.md`](Project_Plan.md) (what and why), [`Technical_Implementation_Plan.md`](Technical_Implementation_Plan.md) (how), [`.plans/`](.plans) (per-part specs)
- **Design system and content rules:** [`DESIGN.md`](DESIGN.md)
- **Security policy:** [`SECURITY.md`](SECURITY.md)

---

## The problem

Houston-area residents live under a stack of overlapping local governments, and most can name only one or two. Depending on the address, that stack can include:

- City Council
- Harris County Commissioners Court, which also sets the tax rates for Flood Control and the Port of Houston Authority
- a school board and a community college board
- a Municipal Utility District (MUD), a small special district that sets part of your property tax, issues bonds and holds elections very few people vote in (Harris County alone has hundreds)
- a regional water authority, an Emergency Services District (ESD), METRO and the appraisal district (HCAD)

Organizations that aren't governments shape daily life just as much. An HOA can fine you or put a lien on your home. CenterPoint's delivery rates are set by a state regulator.

Decisions about people's money, schools and neighborhoods are made in meetings almost nobody hears about until it's too late to act. Even engaged voters struggle: in a February 2026 University of Houston Hobby School survey, 54% to 77% of likely primary voters were still undecided in several countywide races. Students know even less. And in HISD, the state replaced the elected board, so public comment is one of the few ways left to be heard.

## The solution

ShowUp HTX turns one address into a map of power and a path to action:

1. **Find** every government and quasi-government for that address, including the ones you've never heard of.
2. **Follow** what each is deciding next, in plain English, from the official agenda.
3. **Act** with a guided "Speak up" flow that gets you registered to comment and ready to deliver it.

**Our rule: we summarize, we never recommend.** The app never tells anyone what position to take, never invents officials' names or quotes, and links every story and agenda item to its source.

---

## Features

### Address lookup and "Who governs you?"
- Enter an address and get every body that covers it. The lookup uses the Census Geocoder and HCAD bulk data, and falls back to a clearly labeled Census-only result when HCAD has no match.
- An optional, anonymous "Which of these govern you?" question shows people how many of their governments they already knew.
- Results come in four sections: your governments (MUDs, ESDs and water authorities highlighted as "a government you probably didn't know you had"), your ballot, not-a-government (HOA, CenterPoint, your MUD's water operator), and regional bodies coming soon.
- Each body page shows a plain-English description, who sets its tax, whether it is elected or appointed, its next meeting, and an "In the news" headline box (headline, outlet and link only).

### Agenda tracking
- Official agendas are read automatically on a schedule, from Legistar, BoardDocs, Diligent and BoardBook systems, from district websites using AI extraction, and by manual entry as a fallback.
- Every extracted item keeps a quote from the source, and AI-extracted items that could trigger an alert go through an admin review queue first.
- Meetings in the next 72 hours are rechecked on every run to catch late-added items. Past meetings are rechecked until their results are posted.
- Coverage is growing from the original demo bodies toward every school board and water district in Harris County (see the roadmap).

### Weekly report, styled as a local news page
- One short story per agenda item, in English and Spanish, written by AI from database facts.
- Code checks every number and date against those facts and screens headlines for loaded words. A story that fails falls back to a plain template.
- Sections: a lead story, "Coming up: you can still act", "Decided this week" and a deadlines sidebar.
- Every AI-written story is labeled: "Written with AI from the official agenda — see source."
- A collapsed **"What news coverage says"** block groups the viewpoints Houston outlets report on an item, each with a summary, an exact quote and a source link. When coverage is one-sided, it says so.

### Speak up tool
Takes you from "I saw this on the agenda" to "I'm registered and ready."
- **Find your point:** a plain-language explanation of the item, plus questions about how it affects you. It never suggests a side.
- **Register:** shows only the channels the body accepts (online form, email, phone, written comment, card at the meeting), with window status and a confirmation check. The app never registers or submits for you.
- **Coach your draft:** feedback on structure, clarity and timing, plus guardrails against personal attacks, private information about other people, and threats. **The coach never ghostwrites.** Its output has no field for replacement text, and any quote it returns must be an exact substring of your draft.
- **Practice and go:** a rehearse-aloud timer and a checklist.
- Works in English and Spanish. Students are pointed to written comment by default for MUDs, ESDs and Commissioners Court.

### Alerts
- Browser notifications (Web Push) for the items that matter most: tax rates above the no-new-revenue rate, bond votes, elections, school closures and boundary changes, superintendent or chancellor contracts, and date changes to those meetings. Reminders for registration opening and closing, and the HCAD protest deadline for homeowners.
- Published rules, quiet hours (8 a.m. to 8 p.m. Central), opt-in only, parent consent for under-18s, and a "Why did I get this alert?" page.
- Text messages (Twilio) are built but switched off, because a sender needs an adult's ID verification and days of carrier registration. Text sign-up shows a labeled preview.
- On iPhone and iPad, notifications work once the site is added to the Home Screen (iOS 16.4 or later).

### Tax receipt: "who sets each dollar"
A stacked bar shows each taxing body's slice of a typical yearly bill (default home value $250K, adjustable), with who set the rate and the source link. It is labeled as an estimate before exemptions.

### Dashboard, timeline and stake picker
Pick Student, Parent, Renter or Homeowner and the app puts the most relevant governments first. The in-app dashboard has a brief, timeline, districts view, vote info, alerts and speak-up screens, with an onboarding walkthrough.

### Accessibility and languages
- English and Spanish throughout, at about an 8th-grade reading level.
- Keyboard access, visible focus, 4.5:1 text contrast (checked by an automated test) and layouts that work at 390px wide with no horizontal scroll.

### Privacy by design
- No addresses or comment drafts in the database, server cookies, accounts, links or logs. The street address lives only in the reader's browser, and signing out clears it.
- Share links carry body IDs only.
- Personnel and closed-session items never store or show a private person's name.
- Every table has row-level security on, with no `anon` policies. The service-role key stays on the server.

---

## How it works

```
 Official sources ──► Scrapers (lib/adapters, lib/ingest) ──► Supabase (Postgres + PostGIS)
 (Legistar, BoardDocs,        │  quote check + review queue            │
  district sites, PDFs)       ▼                                        ▼
                      Rule engine ──► Stories + coverage ──► Next.js app ──► Web Push alerts
                      (lib/rules)     (AI, then code checks)  (App Router)
                                                                   ▲
                      Address ──► Census Geocoder + HCAD lookup ───┘
```

| Layer | Technology |
|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui |
| Database | Supabase Postgres with PostGIS and pg_trgm, row-level security everywhere |
| AI | Gemini models through OpenRouter (`lib/openrouter.ts`) with structured JSON output, server-side only |
| Alerts | Web Push (`web-push`, `lib/push/`, `public/sw.js`); Twilio code present but off |
| i18n | next-intl, `messages/en.json` and `messages/es.json` |
| Tests | Vitest (unit, no network), Node's test runner for the Speak up helpers, golden tests for the scrapers |
| Hosting | Vercel |

All dates and times use `America/Chicago`.

### Repository layout

| Path | What's there |
|---|---|
| `app/(public)/`, `app/(prototype)/` | Public pages (results, bodies, weekly, alerts, speak-up, tax receipt) and the in-app dashboard (`/start`, `/app/*`) |
| `app/api/` | Lookup, coach, alerts, items, quiz, tax receipt and cron routes |
| `app/admin/` | Review queue for AI-extracted agenda items |
| `lib/` | Lookup, adapters, ingest, news, rules, stories, perspectives, speak, coach, push, sms, registration |
| `data/` | Body catalogs, scraper sources, district sites, HCAD jurisdiction maps |
| `supabase/migrations/` | Database schema |
| `components/`, `messages/` | UI components and English/Spanish text |
| `tests/` | Unit, golden, platform, live and Speak up tests |
| `scripts/` | Scraping, ingest, news, seeding and admin commands |
| `web/` | The original prototype, kept for reference only (not deployed) |

---

## Run it locally

Requires Node 22 or later.

```bash
npm install
cp .env.example .env.local   # then fill in the values (see below)
npm run dev                  # http://localhost:3000
```

Useful commands:

```bash
npm test                         # unit tests; the network is blocked
npm run typecheck
npm run lint
npm run build
npm run test:live                # tests against real sites and the AI provider
npm run scrape -- --source <id>  # run one agenda source (output in tmp/scrape)
npm run ingest -- --source <id>  # save a source's agendas to Supabase
npm run news -- --out tmp/news   # collect news headlines
npm run admin -- set-password <email>   # set an /admin password
```

### Environment variables

`.env.example` lists them all. Never commit real values.

| Group | Variables |
|---|---|
| Supabase | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_DB_URL` |
| AI | `OPENROUTER_API_KEY`, `GEMINI_MODEL`, `GEMINI_EXTRACT_MODEL`, `GEMINI_EXTRACT_FALLBACK_MODEL`, `GEMINI_JUDGE_MODEL` |
| Browser alerts | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| Security and jobs | `BODIES_TOKEN_SECRET`, `CRON_SECRET`, `IP_HASH_SECRET`, `ADMIN_EMAILS`, `SITE_URL` |
| Texting (off) | `TWILIO_*` |
| Demo | `DEMO_MODE`, `DEMO_RECORD` |

---

## Current status

Built and working:
- Address lookup with HCAD and Census, body pages, the governs-you question, ballot list and not-a-government cards.
- Agenda adapters, the scheduled ingest job and the admin review queue, with source catalogs for hundreds of Harris County water districts and several school boards.
- Weekly stories with fact-checking, the coverage-perspectives pipeline, and browser notifications.
- The full Speak up flow with an English and Spanish coach.
- Sample data in the dashboard is being replaced screen by screen with real data. Screens still on demo data carry a "Sample data" label.

Known limits, stated plainly:
- Text messages are off (see Alerts).
- The tax receipt needs real tax-rate and turnout data before it can show verified dollar amounts.
- Coverage outside the loaded ZIP codes falls back to a Census-only result or a partial list of governments.
- Many small districts post no agendas online. Their pages say so and link the official notice location. Nothing is invented.
- Some agenda sources are not yet seeded into the live database, and authenticated review plus scheduled production ingest still need end-to-end verification.

---

## Roadmap

**Next up**
- Replace the remaining dashboard sample data with live data and finish the English/Spanish translation of the app shell.
- Seed and verify the scraper sources already built, then roll out every school board and water district in Harris County in batches (see [`.plans/district-coverage-plan.md`](.plans/district-coverage-plan.md)).
- Generate stories for upcoming meetings first, so the weekly page always leads with what a reader can still act on.
- Load verified tax rates and election turnout so the tax receipt can show real numbers.
- Test the alert pipeline on the deployed site, including an iPhone added to the Home Screen.

**Later**
- Texting alerts, once an adult registers a Twilio sender.
- More bodies: Harris Health, HCDE, management districts, TIRZs and housing authorities.
- Live regional section: H-GAC, TxDOT Houston District, TCEQ, the PUC, the Subsidence District and SJRA.
- "What happened after you spoke": the vote result and the video timestamp of your comment.
- News coverage block in Spanish and on item pages.
- A full meeting-day screen, a weekly email report, an "I'm going" counter and group features.
- More registration recipes and automatically imported bodies. Any Legistar government is one row in the sources table, so the approach scales beyond Houston.
- Vietnamese translation.

---

## Rules we hold ourselves to

- **Neutral:** we summarize and never recommend a position.
- **Sourced:** every story and agenda item links to its official source, and AI-written content is labeled.
- **No ghostwriting:** the coach points out problems and never writes your comment for you.
- **Private:** no addresses or drafts stored on servers.
- **Official sources only** for agenda data. News never creates or changes agenda items or alerts.

## Contributing

Five teammates work in this repo, each owning one part (lookup, agenda data, weekly news and alerts, Speak up, platform). Read [`CLAUDE.md`](CLAUDE.md), [`INSTRUCTIONS.md`](INSTRUCTIONS.md) and [`DESIGN.md`](DESIGN.md) first, and add an entry to [`agent_handoff.md`](agent_handoff.md) after any change. Don't edit the two plan files unless a teammate asks for that specific change. Report security issues as described in [`SECURITY.md`](SECURITY.md).

## Data sources and acknowledgments

U.S. Census Geocoder, Harris County Appraisal District (HCAD) bulk data, Harris County and Houston ISD Legistar agendas, individual district and city websites, Houston Public Media, Community Impact and Houston Landing, and the University of Houston Hobby School survey (used only as context). Full source list in [`Project_Plan.md`](Project_Plan.md).
