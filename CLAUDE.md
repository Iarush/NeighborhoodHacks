# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

ShowUp HTX: a 5-person high school team's entry for Neighborhood Hacks 2026. A user enters a Houston-area address and sees every local government that affects them, what each one is deciding next, and how to speak up before the vote.

- **Deadline:** submissions close **Fri Oct 23, 2026, 11:59 PM CST**. There's no live demo. Judges see only the Devpost write-up, a 2–6 minute video and this public repo.
- **The spec is the two plan files, plus part specs in `.plans/`.**
  - `Project_Plan.md` covers what the product does and the team split (parts P1–P5).
  - `Technical_Implementation_Plan.md` covers how it's built: the stack (§1), the file layout (§2), the DB schema (§16), and the shared contracts every part depends on: `Meeting`/`Item` types (§6), `bodies_token` (§3), `classify()` (§8).
  - `.plans/agent-scraper-spec.md` (P2, v1.2) wins over the plan files for P2's work. Its §12 lists the changes other parts must know about: extended types, extra schema columns, `classify()` rules and more. That includes the news "might come up" box on body pages (D26), which the plan files now include too.
- **Don't change the plan files** unless a teammate asks for that specific change. If something conflicts with the plan, follow the plan and raise the conflict.
- **The prototype UI is the app's UI** (changed Oct 20, 2026; see `agent_handoff.md`). The screens first built in `web/` now live at the repo root:
  - `app/(prototype)/app/*` (`/app`, `/app/brief`, `/app/timeline`, `/app/districts`, `/app/speak`, `/app/vote`, `/app/alerts`) and `app/(prototype)/start` (`/start`), with the sidebar shell in `components/prototype/`.
  - Their demo data is in `lib/prototype/` and is shown with a "Sample data" label. **Replace it piece by piece with real data; don't drop or redesign a screen to do it.** `lib/prototype/live.ts` maps real data (the reader's `bodies_token`, P3's items) onto the screens' types, and `lib/prototype/profile.tsx` prefers it over the demo whenever it's there.
  - When you wire your part's screen to real data, record which screen and which data in `agent_handoff.md`.
  - The rest of the app (APIs, DB, jobs, `lib/`) follows the plan's §2 layout. Where a screen and the plan disagree on behavior (tier names, stakes, neutrality, privacy), the plan wins: change the screen, not the plan.
  - Don't add features to `web/` itself. It's kept as the original reference and runs on its own.
- **Hosting and data:**
  - **Vercel:** project `showup-htx` on the `majority-illusion` team. Production is https://showup-htx-six.vercel.app. Pushes to `main` deploy, but Vercel blocks deploys of teammates' commits, because the repo is private. They go live with the owner's next push, or with `vercel deploy --prod` run by the owner from a `git archive` copy: a CLI deploy that still carries the teammate's commit is blocked too.
  - **Supabase:** project `showup-htx` (ID `elsvhqqwdxwsuvkbchdq`). Environment values live in `.env.local` (see `.env.example`) and in Vercel. Never commit them.
  - **AI:** the team moved every model call to OpenRouter on Oct 20, 2026 (`lib/openrouter.ts`, used by `lib/gemini.ts` and `lib/adapters/gemini.ts`). That replaces the tech plan's Gemini-direct setup (§1). `OPENROUTER_API_KEY` is set in `.env.local` and Vercel (Oct 21), and the Gemini key was removed from both; the code still falls back to `GEMINI_API_KEY` only if the OpenRouter key is missing. Model names stay in the `GEMINI_*_MODEL` variables, and each one must be on OpenRouter's model list with structured output.
  - **Alerts:** since Oct 22, 2026 they go out as browser notifications (Web Push: `lib/push/`, `public/sw.js`, `app/api/alerts/push`), because Twilio needs an adult's ID verification and days of carrier registration. The keys are the `VAPID_*` variables. The texting code stays but is off, so text sign-up shows a labeled preview. See tech plan §11.

## Binding rules

**Git identity:** every commit in this repo is authored and committed as `Iarush <aarush.bhavanam@gmail.com>`. Before committing, set it in the repo (`git config user.name "Iarush"` and `git config user.email "aarush.bhavanam@gmail.com"`) and check with `git log -1 --format='%an <%ae> | %cn <%ce>'`. Never use a bot identity or any other address, including the signed-in account's email. Handoff entries name Iarush in **Who**.

@INSTRUCTIONS.md

When drafting the Devpost write-up, leave the AI-disclosure section for a teammate to write. The team decided to disclose AI use there; see `agent_handoff.md`.

## Plan stress test (once per teammate)

At the start of a session, check whether your teammate has done the plan stress test, using the rules at the top of `plan_stress_test.md`. If they haven't, run it before other work, unless they say to skip it or do it later. **Exception:** if you're running autonomously under a `.plans/` spec, don't stop for it. Note in that spec's progress log that the stress test is pending.

## Handoff log (required)

Five teammates' agents work in this repo. At the start of a session, read the newest entries in `agent_handoff.md`. After you add, edit or delete anything, add an entry there before you finish or commit, using the template and rules at the top of that file. Flag any change to a shared contract.

The owner's planning-review entry records the team's answers on scope, schedule and data sources. Where those answers differ from the plan files or a `.plans/` spec, the plan or spec wins.

## Commands

Run these from the repo root (Node 22 or later):

```bash
npm install
npm run dev                                 # http://localhost:3000
npm run build
npm run typecheck                           # next typegen, then tsc --noEmit
npm run lint                                # eslint . (next lint no longer exists)
npm test                                    # vitest; unit tests can't reach the network
npx vitest run tests/platform/tokens.test.ts   # run one test file
npm run test:live                           # tests/live/: real sites and Gemini (vitest.live.config.ts)
npm run scrape -- --source <id>             # P2 scraper; sources in data/sources.yaml, output in tmp/scrape
npm run ingest -- --source <id>             # P2: save a source's agendas to Supabase (also --seed, --scheduled, --dry-run)
npm run news -- --out tmp/news              # P2 news collector (add --articles to fetch article text)
npm run admin -- set-password <email>       # choose your own /admin password (accounts: npm run admin -- create-all)
```

- `npm test` runs `tests/**/*.test.ts` (P5's `tests/platform/`, P2's `tests/unit/`) in UTC with `fetch` blocked (`tests/setup/no-network.ts`). Tests that need the network go in `tests/live/` and run with `npm run test:live`.
- P2's code is `lib/adapters/`, `lib/ingest/`, `lib/news/`, `data/` and `tests/golden/`. ESLint stops `lib/adapters` and `lib/ingest` from importing `lib/news` (D26, D32).
- npm 11 holds back packages' install scripts until approved. Nothing in the app needs them so far.
- `web/` is the original prototype, kept for reference, with its own `package.json` (`cd web && npm install && npm run dev`). The root's TypeScript, ESLint, vitest and Tailwind all ignore it. Its screens were moved to the root (see above), so change them there, not in `web/`.

P4 now lives in the root app: `/app/speak`, `/speak-up/[itemId]`, `/api/coach`, `components/speak` and `lib/{speak,registration,coach}`. It uses the shared AI client (`lib/gemini.ts`) and rate-limit database when configured, with local fallbacks. `npm test` also runs `npm run test:p4` (Node's built-in runner for the migrated pure-helper tests). See `docs/p4-status.md` for live verification and remaining evidence.

## Next.js caveat

Next.js 16 has breaking changes compared with older versions: `middleware.ts` is now `proxy.ts`, `cookies()` and `headers()` must be awaited, and `next lint` is gone. Before writing Next-specific code, read the relevant guide in `node_modules/next/dist/docs/` and heed deprecation notices. `next dev` keeps a Next.js rules block in `AGENTS.md`; commit it rather than removing it.

## Design system

The look and the content rules are in the root `DESIGN.md`. Read it before UI work, including its note on which sections are prototype-only. What's already in the app:
- **Color tokens** in `app/globals.css`. There are four base variables (`--brick`, `--surface` (white since Oct 22), `--denim`, `--ink`), and every other shade is derived from them. The page background is `--canvas`, a cool light gray. `tests/platform/contrast.test.ts` fails if a change drops the main text pairs below 4.5:1.
- **Fonts** in `app/layout.tsx`: Geist everywhere, news surfaces included (`font-headline` and `font-news` now point at Geist).
- **shadcn components** in `components/ui/` (pill buttons, 24px cards, 44px pill inputs). Add more with `npx shadcn@latest add <name>`, then restyle them to match.
- **Prototype screens** in `app/(prototype)/` reuse the shared pieces through `components/prototype/civic.tsx`, which adds the demo-data versions of `BodyIcon` and `TierPill`. When a screen is fully on real data, switch it to the shared ones.
- **Shared pieces** in `components/civic.tsx`: `Panel`, `SectionTitle`, `Chip`, `ArrowCircle`, `Logo`, `BodyIcon` (keyed by `BodyType` from `lib/contracts/bodyTypes.ts`) and `TierPill` (shows "Urgent" for `sms` only).

## Rules that are easy to break

- **Colors:** tokens only. No hex values or `text-[#…]` for styling in components. Follow `DESIGN.md` for contrast checks.
- **Accessibility counts for 10% of the judging score.** Build in keyboard access, visible focus and 4.5:1 text contrast from the start (DESIGN.md §13). Layouts must work at 390px wide with no horizontal scroll.
- **Neutrality** (Project_Plan "Neutrality and labeling", DESIGN.md §10):
  - Never recommend a position.
  - Never invent officials' names or quotes.
  - Every story and item links to its source, and AI-written stories carry their label.
- **The AI coach never ghostwrites** (tech plan §14). Its output has no field for replacement text, and any quote it returns must be an exact substring of the user's draft.
- **Privacy** (tech plan §19; scraper spec §5.4):
  - No addresses or comment drafts in the DB, server cookies, accounts, links or logs. Since Oct 23 the street address may stay only in the reader's browser profile (`showup.profile.v1`), and every sign-out button uses `SignOutForm`, so signing out clears it.
  - `bodies_token` carries body IDs only.
  - Personnel and closed-session items never store or show the private person's name ("an employee" instead).
  - The service-role key stays server-only, with RLS on every table and no `anon` policies.
- **Time:** all deadlines and meeting times use `America/Chicago`.

Domain facts already settled (HISD's appointed board, who sets Flood Control and Port taxes, voter-registration age and others) are under "Facts fixed in earlier revisions" in `Project_Plan.md`. Check there before writing civic copy.
