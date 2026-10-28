import type { Json } from '@/lib/database.types'
import { db } from '@/lib/db'
import { getOptionalEnv } from '@/lib/env'
import type { ItemType, RuleKey, Tier } from '@/lib/rules/classify'
import { StorySchema, type Story } from '@/lib/stories/types'
import { loadPerspectives } from '@/lib/perspectives/job'
import { toCoverage } from '@/lib/perspectives/types'
import { verifyBodiesToken } from '@/lib/tokens'
import type { WeeklyItem } from './build'
import { SAMPLE_BODIES, sampleItems } from './sample'
import { getRecipe } from '@/lib/registration/recipes'
import { getWindow } from '@/lib/registration/deadlines'
import { fetchAllPages } from '@/lib/paging'
import { bodiesWithAgendaSource } from '@/lib/ingest/coverage'

// Server-side data for P3's pages and APIs: the weekly page, item pages and the timeline.
// Reads the database when it's configured; otherwise serves the labeled sample data.

const DAY = 86_400_000

export type DataMode = 'db' | 'sample'
export type WeeklyBody = {
  body_id: string
  body_name: string
  body_type: string
  sms_eligible: boolean
  /** Whether a row in `sources` reads this body's agendas (lib/ingest/coverage). Unset for sample data. */
  agendas_read?: boolean
  /** The body's official meeting-notice page, from `bodies.meeting_info_url`. */
  meeting_info_url?: string | null
}

/** The database is used only when every key it needs is set. */
export function dataMode(): DataMode {
  const ready =
    getOptionalEnv('SUPABASE_URL') && getOptionalEnv('SUPABASE_SERVICE_ROLE_KEY') && getOptionalEnv('BODIES_TOKEN_SECRET')
  return ready ? 'db' : 'sample'
}

export type BodiesResult =
  | { mode: 'sample'; bodies: WeeklyBody[] }
  | { mode: 'db'; bodies: WeeklyBody[] }
  | { mode: 'db'; bodies: null; reason: 'no_token' | 'bad_token' }

/** The reader's governments, from the signed bodies_token in the link (lib/tokens.ts). */
export async function resolveBodies(token: string | null | undefined): Promise<BodiesResult> {
  if (dataMode() === 'sample') {
    return {
      mode: 'sample',
      bodies: SAMPLE_BODIES.map((b) => ({ body_id: b.id, body_name: b.short, body_type: b.type, sms_eligible: b.sms_eligible })),
    }
  }
  if (!token) return { mode: 'db', bodies: null, reason: 'no_token' }
  const ids = verifyBodiesToken(token)
  if (!ids) return { mode: 'db', bodies: null, reason: 'bad_token' }
  const [{ data, error }, sources] = await Promise.all([
    db().from('bodies').select('id, name, type, sms_eligible, meeting_info_url').in('id', ids),
    db().from('sources').select('body_id, config'),
  ])
  if (error) throw error
  if (sources.error) throw sources.error
  const covered = bodiesWithAgendaSource(sources.data ?? [])
  return {
    mode: 'db',
    bodies: (data ?? []).map((b) => ({
      body_id: b.id,
      body_name: b.name,
      body_type: b.type ?? 'other',
      sms_eligible: b.sms_eligible,
      agendas_read: covered.has(b.id),
      meeting_info_url: b.meeting_info_url,
    })),
  }
}

function parseStory(value: Json | null): Story | null {
  const r = StorySchema.safeParse(value)
  return r.success ? r.data : null
}

const ITEM_COLUMNS =
  'id, body_id, title, agenda_number, item_type, tier, rule_fired, status, action, vote_result, story_en, story_es, story_source, source_url, first_seen_at, meeting:meetings!inner(date, status, type)'

type ItemRow = {
  id: string
  body_id: string | null
  title: string
  agenda_number: string | null
  item_type: string | null
  tier: string | null
  rule_fired: string | null
  status: string
  action: string | null
  vote_result: string | null
  story_en: Json | null
  story_es: Json | null
  story_source: string | null
  source_url: string
  first_seen_at: string
  meeting: { date: string; status: string; type: string | null } | null
}

function toWeeklyItem(row: ItemRow, bodies: Map<string, WeeklyBody>): WeeklyItem | null {
  if (!row.body_id || !row.meeting) return null
  const body = bodies.get(row.body_id)
  const meetingType = row.meeting.type === 'special' ? 'special' : row.meeting.type === 'regular' ? 'regular' : null
  const recipe = getRecipe(row.body_id, meetingType, row.meeting.date)
  const window = recipe && row.status === 'upcoming' && row.meeting.status !== 'cancelled' ? getWindow(recipe, row.meeting.date, new Date()) : null
  return {
    item_id: row.id,
    body_id: row.body_id,
    body_name: body?.body_name ?? row.body_id,
    body_type: body?.body_type ?? 'other',
    title: row.title,
    item_type: (row.item_type ?? 'other') as ItemType,
    tier: (row.tier ?? 'timeline') as Tier,
    rule_fired: (row.rule_fired ?? undefined) as RuleKey | undefined,
    status: row.status as WeeklyItem['status'],
    outcome:
      row.action || row.vote_result
        ? { action: row.action ?? undefined, vote_result: (row.vote_result ?? undefined) as 'passed' | 'failed' | 'no_action' | undefined }
        : undefined,
    meeting_date: row.meeting.date,
    meeting_status: row.meeting.status === 'cancelled' ? 'cancelled' : 'scheduled',
    meeting_type: meetingType,
    agenda_number: row.agenda_number,
    registration_closes_at: window?.closesAt ?? null,
    story_en: parseStory(row.story_en),
    story_es: parseStory(row.story_es),
    story_source: row.story_source === 'ai' || row.story_source === 'template' ? row.story_source : null,
    source_url: row.source_url,
    first_seen_at: row.first_seen_at,
  }
}

/** Items for these bodies whose meeting falls in the window (default: 7 days back to 14 ahead, plan §10). */
export async function loadItems(
  mode: DataMode,
  bodies: WeeklyBody[],
  opts: { now?: Date; fromDays?: number; toDays?: number; storyLang?: 'en' | 'es' } = {},
): Promise<WeeklyItem[]> {
  const now = opts.now ?? new Date()
  if (mode === 'sample') return sampleItems(now)
  if (!bodies.length) return []
  const from = new Date(now.getTime() - (opts.fromDays ?? 7) * DAY).toISOString()
  const to = new Date(now.getTime() + (opts.toDays ?? 14) * DAY).toISOString()
  // With storyLang, only that language's story comes back (the other stays null): the stories
  // are most of each row, so this roughly halves what a page loads.
  const columns = opts.storyLang ? ITEM_COLUMNS.replace(opts.storyLang === 'en' ? 'story_es, ' : 'story_en, ', '') : ITEM_COLUMNS
  // Every matching row, page by page: one Commissioners Court meeting can have 500+ items,
  // and a single capped query would silently drop other bodies' items.
  const data = await fetchAllPages((start, end) =>
    db()
      .from('items')
      .select(columns as typeof ITEM_COLUMNS)
      .in(
        'body_id',
        bodies.map((b) => b.body_id),
      )
      .is('removed_at', null)
      .gte('meeting.date', from)
      .lte('meeting.date', to)
      .order('id')
      .range(start, end),
  )
  const byId = new Map(bodies.map((b) => [b.body_id, b]))
  const items = (data as unknown as ItemRow[]).map((r) => toWeeklyItem(r, byId)).filter((i): i is WeeklyItem => !!i)
  return withCoverage(items)
}

/** Adds "What news coverage says" from item_perspectives. No table yet means no coverage. */
async function withCoverage(items: WeeklyItem[]): Promise<WeeklyItem[]> {
  const rows = await loadPerspectives(items.map((i) => i.item_id))
  return items.map((i) => {
    const coverage = toCoverage(rows.get(i.item_id))
    return { ...i, coverage, outlet_count: coverage.outlet_count }
  })
}

/** One item for its story page, from the database or the sample set. */
export async function loadItem(id: string, now: Date = new Date()): Promise<WeeklyItem | null> {
  if (id.startsWith('sample-')) return sampleItems(now).find((i) => i.item_id === id) ?? null
  if (dataMode() === 'sample' || !/^[0-9a-f-]{36}$/i.test(id)) return null
  const { data, error } = await db().from('items').select(ITEM_COLUMNS).eq('id', id).is('removed_at', null).maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as unknown as ItemRow
  const { data: body } = await db().from('bodies').select('id, name, type, sms_eligible').eq('id', row.body_id ?? '').maybeSingle()
  const bodies = new Map<string, WeeklyBody>()
  if (body) bodies.set(body.id, { body_id: body.id, body_name: body.name, body_type: body.type ?? 'other', sms_eligible: body.sms_eligible })
  const item = toWeeklyItem(row, bodies)
  return item ? ((await withCoverage([item]))[0] ?? null) : null
}
