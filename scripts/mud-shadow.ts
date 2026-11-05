// Phase 6 of .plans/mud-code-parser-spec.md: the shadow run. No DB writes.
//   npm run shadow:mud                          fetch every water district's newest 2 agendas, then report
//   npm run shadow:mud -- --source hcmud_489    refetch one source (repeat --source for more)
//   npm run shadow:mud -- --offline             re-run the ladder on the saved text (after a profile change)
//   npm run shadow:mud -- --no-compare          skip the Supabase item-count comparison
// For each agenda it runs rungs 1-4 of the mud_agenda ladder. A scan, or a text layer rungs 1-2 can't
// read, is OCR'd locally (pdftoppm + tesseract, as the ocr.yml job does) so rung 3 is tested too.
// Rung 5 (LLM) is never called. Item counts are compared with the items the llm_extract path stored
// for the same agenda URL (read-only, service-role key from .env.local).
// In the cloud container, Node's fetch needs NODE_USE_ENV_PROXY=1 to use the proxy.
// Saved text: tmp/shadow/docs/<id>.json. Report: tmp/shadow/report.{json,md}. Both gitignored; PDFs aren't saved.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { config as loadEnv } from 'dotenv';
import { DateTime } from 'luxon';
import { discover, downloadUrl } from '@/lib/adapters/discover';
import { PDF_TIMEOUT_MS, getBytes } from '@/lib/adapters/http';
import { getPdfText, getPositionedText, pdfTextFromPages } from '@/lib/adapters/pdfText';
import { runLadder } from '@/lib/adapters/mudAgenda/adapter';
import { detectFirm } from '@/lib/adapters/mudAgenda/profiles';
import { loadBodyCatalog } from '@/lib/ingest/catalog';
import { documentContentHash } from '@/lib/ingest/hash';
import { ZONE } from '@/lib/ingest/normalize';
import { loadSources } from '@/lib/ingest/registry';
import { ocrPdf } from './ocr-documents';

const OUT = 'tmp/shadow';
const DOC_DIR = join(OUT, 'docs');
const PER_SOURCE = 2;
const WINDOW_BACK_DAYS = 120;
const WINDOW_AHEAD_DAYS = 45;
const CONCURRENCY = 6;
const TARGET = 0.95;
const http = { retries: 1, timeoutMs: 30_000 };

type SavedDoc = {
  url: string;
  date: string;
  type?: string;
  sha256: string;
  text: string[] | null;
  positioned: string[] | null;
  ocr: string[] | null;
  ocr_confidence?: number | null;
  error?: string;
};
type Saved = { id: string; docs: SavedDoc[]; error?: string };

export type DocRow = { url: string; date: string; ok: boolean; rung: number; firm: string; items: number; llm_items: number | null; reasons: string[]; not_agenda?: boolean };

/** A tax-rate hearing notice posted where agendas go: no item list, so rejecting it is right. */
const TAX_NOTICE = /public\s+hearing\s+on\s+a\s+proposed\s+tax\s+rate/i;
export type SourceRow = { id: string; firm: string; docs: DocRow[]; error?: string; newest_ok: boolean | null; all_ok: boolean | null };

const { values } = parseArgs({
  options: {
    source: { type: 'string', multiple: true },
    offline: { type: 'boolean', default: false },
    'no-compare': { type: 'boolean', default: false },
  },
  strict: true,
});

const bodyType = new Map(loadBodyCatalog().map((b) => [b.id, b.type]));
const sources = loadSources().filter((s) => (s.adapter === 'llm_extract' || s.adapter === 'mud_agenda') && s.body_id && bodyType.get(s.body_id) === 'mud');
const now = new Date();

/** Rungs 1-4 on saved text. OCR text stands in for what ocr.yml would have stored. */
async function ladder(src: (typeof sources)[number], d: SavedDoc, withOcr: boolean) {
  const text = d.text ? pdfTextFromPages(d.text, d.sha256) : null;
  return runLadder({
    source_id: src.id,
    body_id: src.body_id!,
    doc: { url: d.url, date: d.date, type: d.type as never },
    now,
    default_time: typeof src.config.default_time === 'string' ? src.config.default_time : undefined,
    text,
    positioned: async () => (d.positioned ? pdfTextFromPages(d.positioned, d.sha256) : null),
    ocr: withOcr && d.ocr ? d.ocr.join('\f') : undefined,
  });
}

async function fetchSource(src: (typeof sources)[number]): Promise<Saved> {
  const zNow = DateTime.now().setZone(ZONE);
  const window = { from: zNow.minus({ days: WINDOW_BACK_DAYS }).toJSDate(), to: zNow.plus({ days: WINDOW_AHEAD_DAYS }).toJSDate() };
  try {
    const found = await discover(src.config, window, { http });
    const newest = [...found.docs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, PER_SOURCE);
    const docs: SavedDoc[] = [];
    for (const d of newest) {
      const saved: SavedDoc = { url: d.url, date: d.date, type: d.type, sha256: '', text: null, positioned: null, ocr: null };
      try {
        const bytes = await getBytes(downloadUrl(d.url), { ...http, timeoutMs: PDF_TIMEOUT_MS });
        saved.sha256 = documentContentHash(bytes);
        const t = await getPdfText(bytes).catch(() => null);
        saved.text = t?.has_text_layer ? t.pages : null;
        if (saved.text) saved.positioned = (await getPositionedText(bytes).catch(() => null))?.pages ?? null;
        // OCR only when the no-OCR rungs fail, as in production (needs_ocr).
        const first = await ladder(src, saved, false);
        if (!first.ok && first.needs_ocr) {
          const o = ocrPdf(bytes);
          saved.ocr = o.pages;
          saved.ocr_confidence = o.mean_confidence;
        }
      } catch (e) {
        saved.error = (e as Error).message;
      }
      docs.push(saved);
    }
    return { id: src.id, docs };
  } catch (e) {
    return { id: src.id, docs: [], error: (e as Error).message };
  }
}

async function fetchAll(ids: string[]) {
  mkdirSync(DOC_DIR, { recursive: true });
  if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) console.warn('HTTPS_PROXY is set but NODE_USE_ENV_PROXY is not; rerun with NODE_USE_ENV_PROXY=1.');
  const queue = [...ids];
  let done = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        const out = await fetchSource(sources.find((s) => s.id === id)!);
        writeFileSync(join(DOC_DIR, `${id}.json`), JSON.stringify(out));
        console.log(`[${++done}/${ids.length}] ${id}: ${out.error ? `error: ${out.error}` : `${out.docs.length} doc(s)`}`);
      }
    }),
  );
}

/** Items the llm_extract path stored per agenda URL, for the shadow's sources (read-only). */
async function llmItemCounts(ids: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn('No SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY; skipping the LLM comparison.');
    return counts;
  }
  for (let i = 0; i < ids.length; i += 40) {
    const list = ids.slice(i, i + 40).join(',');
    const res = await fetch(`${url}/rest/v1/meetings?select=agenda_url,items(count)&agenda_url=not.is.null&source_id=in.(${list})`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`meetings query: HTTP ${res.status}`);
    for (const m of (await res.json()) as { agenda_url: string; items: { count: number }[] }[]) {
      counts.set(m.agenda_url, m.items[0]?.count ?? 0);
    }
  }
  return counts;
}

const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : '–');
const cell = (s: string) => s.replace(/\|/g, '/').replace(/\s+/g, ' ');

async function main() {
  loadEnv({ path: '.env.local', quiet: true });
  const ids = values.source?.length ? values.source : sources.map((s) => s.id);
  const unknown = ids.filter((id) => !sources.some((s) => s.id === id));
  if (unknown.length) throw new Error(`not a water-district llm_extract/mud_agenda source: ${unknown.join(', ')}`);
  if (!values.offline) await fetchAll(ids);

  const saved = new Set(existsSync(DOC_DIR) ? readdirSync(DOC_DIR).map((f) => f.replace(/\.json$/, '')) : []);
  const covered = sources.filter((s) => saved.has(s.id));
  const llm = values['no-compare'] ? new Map<string, number>() : await llmItemCounts(covered.map((s) => s.id));

  const rows: SourceRow[] = [];
  for (const src of covered) {
    const c = JSON.parse(readFileSync(join(DOC_DIR, `${src.id}.json`), 'utf8')) as Saved;
    const docs: DocRow[] = [];
    for (const d of c.docs) {
      if (d.error || (!d.text && !d.ocr)) {
        docs.push({ url: d.url, date: d.date, ok: false, rung: 0, firm: 'generic', items: 0, llm_items: llm.get(d.url) ?? null, reasons: [d.error ? `fetch: ${d.error}` : 'no text layer and no OCR text'] });
        continue;
      }
      const o = await ladder(src, d, true);
      const firm = o.ok ? o.result.profile : o.profile;
      docs.push({
        url: d.url,
        date: d.date,
        ok: o.ok,
        rung: o.rung,
        firm: firm === 'generic' ? detectFirm((d.text ?? d.ocr ?? []).join('\f')).id : firm,
        items: o.ok ? o.result.items.length : 0,
        llm_items: llm.get(d.url) ?? null,
        reasons: o.ok ? [] : o.reasons.slice(0, 3),
        ...(!o.ok && o.reasons[0] === 'list intro not found' && TAX_NOTICE.test((d.text ?? d.ocr ?? []).join('\f')) ? { not_agenda: true } : {}),
      });
    }
    // Pass/fail counts only agendas: fetch failures and tax-rate notices are listed but not counted.
    const withDoc = docs.filter((d) => !d.reasons[0]?.startsWith('fetch:') && !d.not_agenda);
    rows.push({
      id: src.id,
      firm: withDoc[0]?.firm ?? '',
      docs,
      ...(c.error ? { error: c.error } : {}),
      newest_ok: withDoc.length ? withDoc[0]!.ok : null,
      all_ok: withDoc.length ? withDoc.every((d) => d.ok) : null,
    });
  }

  const withDoc = rows.filter((r) => r.newest_ok !== null);
  const newestOk = withDoc.filter((r) => r.newest_ok).length;
  const allOk = withDoc.filter((r) => r.all_ok).length;
  const docRows = rows.flatMap((r) => r.docs).filter((d) => !d.reasons[0]?.startsWith('fetch:') && !d.not_agenda);
  const notAgenda = rows.flatMap((r) => r.docs).filter((d) => d.not_agenda).length;
  const fetchFailed = rows.flatMap((r) => r.docs).filter((d) => d.reasons[0]?.startsWith('fetch:')).length;
  const byRung: Record<string, number> = {};
  for (const d of docRows) byRung[d.ok ? `rung ${d.rung}` : 'failed'] = (byRung[`${d.ok ? `rung ${d.rung}` : 'failed'}`] ?? 0) + 1;
  const compared = docRows.filter((d) => d.ok && d.llm_items !== null && d.llm_items > 0);
  const same = compared.filter((d) => d.items === d.llm_items).length;
  const close = compared.filter((d) => Math.abs(d.items - d.llm_items!) <= 1).length;
  const byFirm: Record<string, { sources: number; ok: number }> = {};
  for (const r of withDoc) {
    const f = (byFirm[r.firm] ??= { sources: 0, ok: 0 });
    f.sources++;
    if (r.all_ok) f.ok++;
  }
  const summary = {
    date: DateTime.now().setZone(ZONE).toISODate(),
    sources: rows.length,
    with_document: withDoc.length,
    no_document: rows.length - withDoc.length,
    newest_ok: newestOk,
    all_ok: allOk,
    pass_rate_all: withDoc.length ? allOk / withDoc.length : 0,
    target_met: withDoc.length > 0 && allOk / withDoc.length >= TARGET,
    documents: docRows.length,
    tax_notices_skipped: notAgenda,
    fetch_failed_docs: fetchFailed,
    by_rung: byRung,
    compared_with_llm: compared.length,
    same_item_count: same,
    within_one: close,
    by_firm: byFirm,
  };

  const md = [
    `# MUD parser shadow run (${summary.date})`,
    '',
    'Phase 6 of `.plans/mud-code-parser-spec.md`: rungs 1–4 of the `mud_agenda` ladder over every water district’s newest 2 agendas. OCR (rung 3) was run locally with tesseract; the LLM (rung 5) was never called. No DB writes.',
    '',
    `Sources: ${summary.sources}. With a document: ${summary.with_document}. No document (fetch failed or nothing in the window): ${summary.no_document}.`,
    '',
    `- **Every fetched agenda accepted: ${allOk} of ${withDoc.length} sources (${pct(allOk, withDoc.length)})**, target ${TARGET * 100}% ${summary.target_met ? 'met' : 'not met'}.`,
    `- Newest agenda accepted: ${newestOk} of ${withDoc.length} (${pct(newestOk, withDoc.length)}).`,
    `- Not counted: ${notAgenda} tax-rate hearing notices posted as agendas (rightly rejected: no item list) and ${fetchFailed} documents that failed to download.`,
    `- Documents by rung: ${Object.entries(byRung).sort().map(([k, v]) => `${k} ${v}`).join(', ')}.`,
    `- Item counts vs. the LLM's stored items for the same agenda URL: ${compared.length} compared, ${same} equal, ${close} within 1.`,
    '',
    '| Firm | Sources | All accepted |',
    '|---|---|---|',
    ...Object.entries(byFirm).sort((a, b) => b[1].sources - a[1].sources).map(([f, v]) => `| ${f} | ${v.sources} | ${v.ok} |`),
    '',
    '## Failures',
    '',
    '| Source | Firm | Date | Rung | Reasons | URL |',
    '|---|---|---|---|---|---|',
    ...rows.flatMap((r) => r.docs.filter((d) => !d.ok && !d.not_agenda).map((d) => `| ${r.id} | ${d.firm} | ${d.date} | ${d.rung} | ${cell(d.reasons.join('; ')).slice(0, 160)} | ${d.url} |`)),
    '',
    '## Item counts that differ from the LLM by more than 1',
    '',
    '| Source | Date | Parser | LLM | URL |',
    '|---|---|---|---|---|',
    ...rows.flatMap((r) => r.docs.filter((d) => d.ok && d.llm_items && Math.abs(d.items - d.llm_items) > 1).map((d) => `| ${r.id} | ${d.date} | ${d.items} | ${d.llm_items} | ${d.url} |`)),
    '',
    '## Per source',
    '',
    '| Source | Firm | Docs (date: rung/items, LLM) | All accepted |',
    '|---|---|---|---|',
    ...rows.map((r) => `| ${r.id} | ${r.firm} | ${r.docs.map((d) => `${d.date}: ${d.ok ? `r${d.rung}/${d.items}` : d.not_agenda ? 'tax notice' : 'failed'}${d.llm_items !== null ? ` (${d.llm_items})` : ''}`).join(', ') || cell(r.error ?? 'no document')} | ${r.all_ok === null ? '–' : r.all_ok ? 'yes' : 'no'} |`),
    '',
  ].join('\n');
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'report.json'), JSON.stringify({ summary, rows }, null, 2));
  writeFileSync(join(OUT, 'report.md'), md);
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Report: ${join(OUT, 'report.md')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
