// Phase 0 of .plans/mud-code-parser-spec.md: survey the newest agendas of every llm_extract source.
//   npm run survey:agendas                       fetch every llm_extract source, then report
//   npm run survey:agendas -- --source hcmud_489 fetch one source (repeat --source for more)
//   npm run survey:agendas -- --offline          report from the saved text only (no network)
// In the cloud container, Node's fetch needs NODE_USE_ENV_PROXY=1 to use the proxy.
// Page text goes to tmp/survey/agenda-pdfs/<id>.json; the report to tmp/survey/agenda-report.{json,md}.
// Both are gitignored. The PDFs themselves are never saved.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { DateTime } from 'luxon';
import { discover, downloadUrl } from '@/lib/adapters/discover';
import { PDF_TIMEOUT_MS, getBytes } from '@/lib/adapters/http';
import { getPdfText } from '@/lib/adapters/pdfText';
import { FIRM_PROFILES, GENERIC } from '@/lib/adapters/mudAgenda/profiles';
import { summarize, surveyRow, type SurveyDoc, type SurveyRow } from '@/lib/adapters/mudAgenda/survey';
import { loadBodyCatalog } from '@/lib/ingest/catalog';
import { ZONE } from '@/lib/ingest/normalize';
import { loadSources } from '@/lib/ingest/registry';

const OUT = 'tmp/survey';
const TEXT_DIR = join(OUT, 'agenda-pdfs');
/** Newest agendas per source. */
const PER_SOURCE = 2;
/** Look this far back and ahead for agendas. */
const WINDOW_BACK_DAYS = 120;
const WINDOW_AHEAD_DAYS = 45;
const CONCURRENCY = 6;
const http = { retries: 1, timeoutMs: 30_000 };

type Cached = { id: string; texts?: (SurveyDoc & { has_text_layer: boolean })[]; error?: string };

const { values } = parseArgs({
  options: { source: { type: 'string', multiple: true }, offline: { type: 'boolean', default: false } },
  strict: true,
});

const sources = loadSources().filter((s) => s.adapter === 'llm_extract' && s.body_id);
const bodyType = new Map(loadBodyCatalog().map((b) => [b.id, b.type]));
const isWater = (bodyId: string) => bodyType.get(bodyId) === 'mud';

async function fetchSource(id: string, config: unknown): Promise<Cached> {
  const now = DateTime.now().setZone(ZONE);
  const window = { from: now.minus({ days: WINDOW_BACK_DAYS }).toJSDate(), to: now.plus({ days: WINDOW_AHEAD_DAYS }).toJSDate() };
  try {
    const found = await discover(config, window, { http });
    const newest = [...found.docs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, PER_SOURCE);
    const texts: Cached['texts'] = [];
    for (const d of newest) {
      const bytes = await getBytes(downloadUrl(d.url), { ...http, timeoutMs: PDF_TIMEOUT_MS });
      const pdf = await getPdfText(bytes);
      texts.push({ url: d.url, date: d.date, has_text_layer: pdf.has_text_layer, pages: pdf.pages });
    }
    return { id, texts };
  } catch (e) {
    return { id, error: e instanceof Error ? e.message : String(e) };
  }
}

async function fetchAll(ids: string[]): Promise<void> {
  mkdirSync(TEXT_DIR, { recursive: true });
  if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) {
    console.warn('HTTPS_PROXY is set but NODE_USE_ENV_PROXY is not; fetches may fail. Rerun with NODE_USE_ENV_PROXY=1.');
  }
  const queue = [...ids];
  let done = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        const src = sources.find((s) => s.id === id)!;
        const out = await fetchSource(id, src.config);
        writeFileSync(join(TEXT_DIR, `${id}.json`), JSON.stringify(out));
        done++;
        console.log(`[${done}/${ids.length}] ${id}: ${out.error ? `error: ${out.error}` : `${out.texts!.length} doc(s)`}`);
      }
    }),
  );
}

function readCached(id: string): Cached | undefined {
  const path = join(TEXT_DIR, `${id}.json`);
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Cached) : undefined;
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '–');

function markdown(rows: SurveyRow[]): string {
  const s = summarize(rows);
  const water = rows.filter((r) => r.water_district);
  const textWater = water.filter((r) => r.firm).length;
  const label = new Map([...FIRM_PROFILES, GENERIC].map((p) => [p.id, p.label]));
  const lines = [
    `# Agenda survey (${DateTime.now().setZone(ZONE).toFormat('yyyy-MM-dd')})`,
    '',
    'Phase 0 of `.plans/mud-code-parser-spec.md`. The rung is an estimate from the list shape until the Phase 1 parser exists:',
    '`1` = clean "1. 2. 3." list on the text layer; `2/4` = text layer, list not recognized; `3` = no text layer (OCR); `none` = no document.',
    '',
    `Sources: ${s.sources} (${s.water_districts} water districts). Water districts with a document: ${s.with_document}; without (fetch failed or nothing in the window): ${s.failed}.`,
    '',
    '| Newest agenda (water districts) | Count | Share |',
    '|---|---|---|',
    ...(['numbered', 'unnumbered', 'scanned'] as const).map((k) => `| ${k} | ${s.by_shape[k]} | ${pct(s.by_shape[k], s.with_document)} |`),
    '',
    `Firms, over the ${textWater} water districts with a text-layer agenda (scans can't be identified before OCR). Not identified: **${s.unidentified_text} (${pct(s.unidentified_text, textWater)})**.`,
    '',
    '| Firm | Districts | By name/phone | By doc ID | By template |',
    '|---|---|---|---|---|',
    ...Object.entries(s.by_firm).map(([id, n]) => {
      const of = water.filter((r) => r.firm?.id === id);
      const by = (k: string[]) => of.filter((r) => k.includes(r.firm!.by)).length;
      return `| ${label.get(id) ?? id} | ${n} | ${by(['name', 'phone'])} | ${by(['doc_id'])} | ${by(['template'])} |`;
    }),
    '',
    '## Per source',
    '',
    '| Source | Water | Firm | By | Shape | Run | Rung | Docs (text) | Newest | Error |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map((r) =>
      [r.id, r.water_district ? 'yes' : 'no', r.firm?.id ?? '', r.firm?.by ?? '', r.shape ?? '', r.run ?? '', r.rung, `${r.docs} (${r.text_docs})`, r.newest_date ?? '', (r.error ?? '').replace(/\|/g, '/').slice(0, 80)]
        .join(' | ')
        .replace(/^/, '| ')
        .concat(' |'),
    ),
    '',
  ];
  return lines.join('\n');
}

async function main() {
  const ids = values.source?.length ? values.source : sources.map((s) => s.id);
  const unknown = ids.filter((id) => !sources.some((s) => s.id === id));
  if (unknown.length) throw new Error(`not an llm_extract source: ${unknown.join(', ')}`);
  if (!values.offline) await fetchAll(ids);

  // The report always covers every source with saved text, so one-source refetches don't shrink it.
  const saved = new Set(existsSync(TEXT_DIR) ? readdirSync(TEXT_DIR).map((f) => f.replace(/\.json$/, '')) : []);
  const rows = sources
    .filter((s) => saved.has(s.id))
    .map((s) => {
      const c = readCached(s.id)!;
      return surveyRow({ id: s.id, water_district: isWater(s.body_id!), docs: c.texts ?? [], error: c.error });
    });
  writeFileSync(join(OUT, 'agenda-report.json'), JSON.stringify({ summary: summarize(rows), rows }, null, 2));
  writeFileSync(join(OUT, 'agenda-report.md'), markdown(rows));
  const s = summarize(rows);
  console.log(JSON.stringify(s, null, 2));
  console.log(`Report: ${join(OUT, 'agenda-report.md')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
