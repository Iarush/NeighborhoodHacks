import { isAuthorizedCron, unauthorizedCronResponse } from '@/lib/cron'
import { saveOcrResult } from '@/lib/ingest/ocr'
import { supabaseIngestStore } from '@/lib/ingest/supabaseStore'

// POST /api/cron/ocr-result (mud-code-parser-spec §5), from .github/workflows/ocr.yml with
// "Authorization: Bearer <CRON_SECRET>". Body: { document_id, content_hash, pages[], mean_confidence }.
// Stores the text as an ocr_text document beside the PDF and clears needs_ocr; the next ingest run
// parses it (ladder rungs 3-4). The response never echoes the text.

export async function POST(req: Request) {
  if (!isAuthorizedCron(req)) return unauthorizedCronResponse()
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'bad JSON' }, { status: 400 })
  }
  const out = await saveOcrResult(supabaseIngestStore, body, new Date())
  console.log(`ocr-result: ${out.status} ${out.body.result ?? out.body.error}`)
  return Response.json(out.body, { status: out.status })
}
