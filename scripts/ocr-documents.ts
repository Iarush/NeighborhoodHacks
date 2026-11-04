// OCR for scanned MUD agendas (mud-code-parser-spec §5). Needs poppler (pdftoppm) and tesseract.
//
//   npm run ocr                         queue mode (GitHub Actions): ask APP_URL/api/cron/ocr-queue for
//                                       work, OCR each PDF, post the text to /api/cron/ocr-result.
//                                       Needs APP_URL and CRON_SECRET in the environment.
//   npm run ocr -- --url <pdf url>      print one PDF's OCR text (for building fixtures)
//   npm run ocr -- --file <pdf> [--out <txt>]
//
// Pages are joined with \f, like getPdfText(). In the cloud container, Node's fetch needs
// NODE_USE_ENV_PROXY=1 to use the proxy.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { downloadUrl } from '@/lib/adapters/discover';
import { PDF_TIMEOUT_MS, getBytes } from '@/lib/adapters/http';
import { documentContentHash } from '@/lib/ingest/hash';
import type { OcrJob } from '@/lib/ingest/store';

/** Spanish too when its language data is installed (some ABHR districts add a Spanish notice). */
function languages(): string {
  try {
    const list = execFileSync('tesseract', ['--list-langs'], { encoding: 'utf8' });
    return /^spa$/m.test(list) ? 'eng+spa' : 'eng';
  } catch {
    return 'eng';
  }
}

export type OcrText = { pages: string[]; mean_confidence: number | null };

/** Mean word confidence from tesseract's TSV output (rows with conf >= 0 are words). */
export function meanConfidence(tsv: string): number | null {
  const confs = tsv
    .split('\n')
    .slice(1)
    .map((row) => row.split('\t'))
    .filter((c) => c.length >= 12 && c[11]!.trim() && Number(c[10]) >= 0)
    .map((c) => Number(c[10]));
  return confs.length ? Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 10) / 10 : null;
}

export function ocrPdf(bytes: Uint8Array): OcrText {
  const dir = mkdtempSync(join(tmpdir(), 'ocr-'));
  try {
    writeFileSync(join(dir, 'in.pdf'), bytes);
    execFileSync('pdftoppm', ['-r', '300', '-png', join(dir, 'in.pdf'), join(dir, 'page')], { stdio: 'ignore', timeout: 120_000 });
    const images = readdirSync(dir)
      .filter((f) => /^page-\d+\.png$/.test(f))
      .sort((a, b) => Number(/\d+/.exec(a)![0]) - Number(/\d+/.exec(b)![0]));
    const lang = languages();
    const pages: string[] = [];
    let confSum = 0;
    let confPages = 0;
    for (const img of images) {
      const base = join(dir, img.replace(/\.png$/, ''));
      // --psm 4: one column of text of variable sizes, which suits a typed agenda page.
      execFileSync('tesseract', [join(dir, img), base, '-l', lang, '--psm', '4', 'txt', 'tsv'], { stdio: 'ignore', timeout: 120_000 });
      pages.push(readFileSync(`${base}.txt`, 'utf8').replace(/\f/g, '').trimEnd());
      const c = meanConfidence(readFileSync(`${base}.tsv`, 'utf8'));
      if (c !== null) {
        confSum += c;
        confPages++;
      }
    }
    return { pages, mean_confidence: confPages ? Math.round((confSum / confPages) * 10) / 10 : null };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function runQueue() {
  const app = process.env.APP_URL?.replace(/\/$/, '');
  const secret = process.env.CRON_SECRET;
  if (!app || !secret) throw new Error('APP_URL and CRON_SECRET must be set');
  const headers = { Authorization: `Bearer ${secret}` };
  const res = await fetch(`${app}/api/cron/ocr-queue`, { headers });
  if (!res.ok) throw new Error(`ocr-queue: HTTP ${res.status}`);
  const { jobs } = (await res.json()) as { jobs: OcrJob[] };
  console.log(`${jobs.length} document(s) to OCR`);
  let failed = 0;
  for (const job of jobs) {
    try {
      const bytes = await getBytes(downloadUrl(job.url), { timeoutMs: PDF_TIMEOUT_MS });
      // The stored hash is of the PDF that was parsed; a changed PDF is re-queued by the next ingest.
      if (documentContentHash(bytes) !== job.content_hash) {
        console.log(`${job.document_id}: PDF changed since it was queued; skipped`);
        continue;
      }
      const started = Date.now();
      const text = ocrPdf(bytes);
      const post = await fetch(`${app}/api/cron/ocr-result`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: job.document_id, content_hash: job.content_hash, ...text }),
      });
      console.log(`${job.document_id}: ${text.pages.length} page(s), confidence ${text.mean_confidence ?? '?'}, ${Math.round((Date.now() - started) / 1000)} s -> HTTP ${post.status}`);
      if (!post.ok) failed++;
    } catch (e) {
      failed++;
      console.log(`${job.document_id}: failed: ${(e as Error).message}`);
    }
  }
  if (failed) process.exitCode = 1;
}

async function main() {
  const { values } = parseArgs({ options: { url: { type: 'string' }, file: { type: 'string' }, out: { type: 'string' } } });
  if (!values.url && !values.file) return runQueue();
  const bytes = values.file ? new Uint8Array(readFileSync(values.file)) : await getBytes(downloadUrl(values.url!), { timeoutMs: PDF_TIMEOUT_MS });
  const text = ocrPdf(bytes);
  const joined = text.pages.join('\f');
  if (values.out) writeFileSync(values.out, joined);
  else process.stdout.write(joined + '\n');
  console.error(`sha256 ${documentContentHash(bytes)}; ${text.pages.length} page(s); mean confidence ${text.mean_confidence ?? '?'}`);
}

if (process.argv[1]?.endsWith('ocr-documents.ts')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
