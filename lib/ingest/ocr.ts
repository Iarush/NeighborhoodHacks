import { z } from 'zod';
import type { IngestStore, OcrJob } from './store';

// OCR hand-off between the app and the GitHub Actions OCR job (mud-code-parser-spec §5).
// The job never sees the service-role key: it asks /api/cron/ocr-queue for work and posts the text
// to /api/cron/ocr-result, both with CRON_SECRET. Tesseract itself runs only in the job.

/** PDFs handed out per queue call. */
export const OCR_BATCH = 15;
/** A PDF handed out and not finished is offered again after this long. */
export const OCR_RETRY_HOURS = 24;
const MAX_PAGES = 60;
const MAX_PAGE_CHARS = 100_000;

export const OcrResultSchema = z.object({
  document_id: z.string().min(1).max(100),
  content_hash: z.string().regex(/^[0-9a-f]{64}$/),
  pages: z.array(z.string().max(MAX_PAGE_CHARS)).min(1).max(MAX_PAGES),
  mean_confidence: z.number().min(0).max(100).nullable(),
});

export async function ocrQueue(store: IngestStore, now: Date, limit = OCR_BATCH): Promise<OcrJob[]> {
  const retryBefore = new Date(now.getTime() - OCR_RETRY_HOURS * 3_600_000);
  return store.ocrQueue(Math.min(Math.max(1, limit), OCR_BATCH), now, retryBefore);
}

export type OcrResultResponse = { status: number; body: { result?: string; error?: string } };

export async function saveOcrResult(store: IngestStore, body: unknown, now: Date): Promise<OcrResultResponse> {
  const parsed = OcrResultSchema.safeParse(body);
  if (!parsed.success) return { status: 400, body: { error: 'bad OCR result' } };
  const result = await store.saveOcrResult(parsed.data, now);
  if (result === 'not_found') return { status: 404, body: { error: 'unknown document' } };
  if (result === 'hash_mismatch') return { status: 409, body: { error: 'the PDF changed since it was queued' } };
  return { status: 200, body: { result } };
}
