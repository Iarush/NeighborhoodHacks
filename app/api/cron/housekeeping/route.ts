import { isAuthorizedCron, unauthorizedCronResponse } from '@/lib/cron'
import { rawDb } from '@/lib/db/raw'
import { runArchive } from '@/lib/ingest/archive'
import { supabaseArchiveStore } from '@/lib/ingest/supabaseArchive'

// Daily database packing (district-coverage plan §2.3–2.4): deletes old operational rows, archives
// items past the 8-month window, and removes stored agenda text past 24 months. Called by
// .github/workflows/housekeeping.yml, since Vercel's free plan allows only the two crons in vercel.json.
export const maxDuration = 300

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return unauthorizedCronResponse()
  const cleanup = await rawDb().rpc('housekeeping_cleanup', {})
  if (cleanup.error) return Response.json({ error: 'housekeeping_cleanup failed' }, { status: 500 })
  const archive = await runArchive(supabaseArchiveStore, new Date())
  return Response.json({ deleted: cleanup.data, ...archive })
}
