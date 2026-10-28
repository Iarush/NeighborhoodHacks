import { isAuthorizedCron, unauthorizedCronResponse } from '@/lib/cron'
import { loadSources } from '@/lib/ingest/registry'
import { runScheduled, type ScheduledOptions, type Stage } from '@/lib/ingest/scheduled'
import { supabaseIngestStore } from '@/lib/ingest/supabaseStore'

// GET or POST /api/cron/ingest (agent-scraper-spec §9 P2-C). Called by Vercel's daily cron and the
// GitHub Actions schedule, with "Authorization: Bearer <CRON_SECRET>".
//   no query                                 the full schedule: near-term sweep, rotation, results
//   ?source=<id>[&mode=rotation|near_term]   one source (default rotation)
//   ?source=<id>&mode=results&meetings=a,b   outcomes for those meetings
//   ?shard=<k>&shards=<n>                    the full schedule for one shard of the sources (0 <= k < n <= 32)
// The response holds counts and flags only, never agenda text (warnings can quote it).

export const maxDuration = 300

const STAGES: readonly Stage[] = ['rotation', 'near_term', 'results']
const bad = (error: string) => Response.json({ error }, { status: 400 })

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return unauthorizedCronResponse()

  const params = new URL(req.url).searchParams
  const sourceId = params.get('source')
  const mode = params.get('mode')
  const meetings = (params.get('meetings') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const sources = loadSources()
  const shardParam = params.get('shard')
  const shardsParam = params.get('shards')
  let shard: ScheduledOptions['shard']
  if (shardParam !== null || shardsParam !== null) {
    const index = Number(shardParam)
    const count = Number(shardsParam)
    if (!Number.isInteger(index) || !Number.isInteger(count) || count < 1 || count > 32 || index < 0 || index >= count) return bad('bad shard')
    if (sourceId) return bad('shard and source cannot be combined')
    shard = { index, count }
  }

  let only: ScheduledOptions['only']
  if (mode && !STAGES.includes(mode as Stage)) return bad('unknown mode')
  if (mode && !sourceId) return bad('mode needs a source')
  if (sourceId) {
    if (!sources.some((s) => s.id === sourceId)) return bad('unknown source')
    const stage = (mode ?? 'rotation') as Stage
    if (stage === 'results' && !meetings.length) return bad('results mode needs meetings')
    only = stage === 'results' ? { sourceId, mode: stage, meetings } : { sourceId, mode: stage }
  }

  const report = await runScheduled({ store: supabaseIngestStore, sources, ...(only ? { only } : {}), ...(shard ? { shard } : {}) })
  // One line per call for the function logs; counts only.
  console.log(
    `ingest: ok=${report.ok} runs=${report.runs.length} skipped=${report.skipped.length} ${report.elapsed_ms}ms ` +
      report.runs.map((r) => `${r.source_id}/${r.stage}:${r.ok ? 'ok' : 'failed'}`).join(' '),
  )
  return Response.json(report)
}

export const POST = GET
