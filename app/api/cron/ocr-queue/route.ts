import { isAuthorizedCron, unauthorizedCronResponse } from '@/lib/cron'
import { ocrQueue } from '@/lib/ingest/ocr'
import { supabaseIngestStore } from '@/lib/ingest/supabaseStore'

// GET /api/cron/ocr-queue (mud-code-parser-spec §5). Called by .github/workflows/ocr.yml with
// "Authorization: Bearer <CRON_SECRET>". Returns up to 15 scanned agenda PDFs waiting for OCR:
// { jobs: [{ document_id, url, content_hash }] }. Each one handed out isn't offered again for 24 h.

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return unauthorizedCronResponse()
  const limit = Number(new URL(req.url).searchParams.get('limit') ?? '') || undefined
  const jobs = await ocrQueue(supabaseIngestStore, new Date(), limit)
  console.log(`ocr-queue: ${jobs.length} job(s)`)
  return Response.json({ jobs })
}
