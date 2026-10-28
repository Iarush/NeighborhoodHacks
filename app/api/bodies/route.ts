import { getEnv, getOptionalEnv } from '@/lib/env'
import { selectRows } from '@/lib/db/raw'
import { verifyBodiesToken } from '@/lib/tokens'
import { houstonDate } from '@/lib/date'
import { validTaxRate } from '@/lib/taxReceipt'
import { agendaCoverage, bodiesWithAgendaSource, type SourceCoverageRow } from '@/lib/ingest/coverage'

type BodyRow = {
  id: string
  name: string
  type: string | null
  description_en: string | null
  description_es: string | null
  elected_or_appointed: string | null
  meeting_info_url: string | null
  tax_set_by_body_id: string | null
  operations_by_body_id: string | null
  regulated_by: string | null
  operator_name: string | null
}
type RateRow = { body_id: string; year: number; adopted_rate: number | string | null; last_vote_date: string | null; source_url: string | null }
type ElectionRow = { id: string; body_id: string | null; date: string | null; type: string | null; votes_cast: number | null; registered_voters: number | null; source_url: string | null }
type OfficeRow = { id: string; body_id: string | null; office_name: string | null; holder_name: string | null; next_election_date: string | null; source_url: string | null }
type MentionRow = { body_id: string; mention: { id: string; outlet: string | null; headline: string | null; url: string | null; published_at: string | null; forward_looking: boolean | null } | null }

const failure = (status: number, message: string) => Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })

export async function GET(request: Request) {
  const url = new URL(request.url)
  let ids: string[] | null
  try {
    ids = verifyBodiesToken(url.searchParams.get('t'))
  } catch {
    return failure(500, 'Body lookup is not configured yet.')
  }
  if (!ids) return failure(400, 'Use the signed results link to view these body details.')
  const requestedId = url.searchParams.get('id')
  if (requestedId && !ids.includes(requestedId)) return failure(404, 'That body is not in this address lookup.')
  const selectedIds = requestedId ? [requestedId] : ids

  try {
    if (getOptionalEnv('VERCEL_ENV') === 'production') {
      getEnv('SUPABASE_URL')
      getEnv('SUPABASE_SERVICE_ROLE_KEY')
    }
    const bodies = await selectRows<BodyRow>(
      'bodies',
      'id,name,type,description_en,description_es,elected_or_appointed,meeting_info_url,tax_set_by_body_id,operations_by_body_id,regulated_by,operator_name',
      (query) => query.in('id', selectedIds),
    )
    const foundIds = bodies.map((body) => body.id)
    if (foundIds.length !== selectedIds.length) return failure(404, 'These verified bodies are no longer available. Run the address lookup again.')
    const relatedIds = [...new Set(bodies.flatMap((body) => [body.tax_set_by_body_id, body.operations_by_body_id]).filter((id): id is string => Boolean(id)))]
    const [relatedBodies, rates, elections, offices, mentions, sources] = await Promise.all([
      relatedIds.length
        ? selectRows<{ id: string; name: string }>('bodies', 'id,name', (query) => query.in('id', relatedIds))
        : Promise.resolve([] as Array<{ id: string; name: string }>),
      foundIds.length
        ? selectRows<RateRow>('tax_rates', 'body_id,year,adopted_rate,last_vote_date,source_url', (query) => query.in('body_id', foundIds).order('year', { ascending: false }))
        : Promise.resolve([] as RateRow[]),
      foundIds.length
        ? selectRows<ElectionRow>('elections', 'id,body_id,date,type,votes_cast,registered_voters,source_url', (query) => query.in('body_id', foundIds).lte('date', houstonDate()).order('date', { ascending: false }))
        : Promise.resolve([] as ElectionRow[]),
      foundIds.length
        ? selectRows<OfficeRow>('ballot_offices', 'id,body_id,office_name,holder_name,next_election_date,source_url', (query) => query.in('body_id', foundIds).order('next_election_date'))
        : Promise.resolve([] as OfficeRow[]),
      foundIds.length
        ? selectRows<MentionRow>(
            'news_mention_bodies',
            'body_id,mention:news_mentions(id,outlet,headline,url,published_at,forward_looking)',
            (query) => query.in('body_id', foundIds).order('published_at', { ascending: false, referencedTable: 'mention' }).limit(100),
          )
        : Promise.resolve([] as MentionRow[]),
      selectRows<SourceCoverageRow>('sources', 'body_id,config', (query) => query),
    ])
    const covered = bodiesWithAgendaSource(sources)
    const nameById = new Map([...bodies, ...relatedBodies].map((body) => [body.id, body.name]))
    const rateById = new Map<string, RateRow>()
    for (const rate of rates) if (!rateById.has(rate.body_id)) rateById.set(rate.body_id, rate)
    const electionById = new Map<string, ElectionRow>()
    for (const election of elections) if (election.body_id && !electionById.has(election.body_id)) electionById.set(election.body_id, election)
    const headlines = new Map<string, MentionRow['mention'][]>()
    for (const { body_id, mention } of mentions) {
      if (!mention?.forward_looking || !mention.headline || !mention.url) continue
      headlines.set(body_id, [...(headlines.get(body_id) ?? []), mention])
    }
    const lang = url.searchParams.get('lang') === 'es' ? 'es' : 'en'
    return Response.json({
      bodies: bodies.map((body) => {
        const rate = rateById.get(body.id)
        return {
          id: body.id,
          name: body.name,
          type: body.type,
          description: lang === 'es' ? body.description_es ?? body.description_en : body.description_en,
          elected_or_appointed: body.elected_or_appointed,
          meeting_info_url: body.meeting_info_url,
          tax_set_by_body_id: body.tax_set_by_body_id,
          tax_set_by_name: body.tax_set_by_body_id ? nameById.get(body.tax_set_by_body_id) ?? null : null,
          operations_by_body_id: body.operations_by_body_id,
          operations_by_name: body.operations_by_body_id ? nameById.get(body.operations_by_body_id) ?? null : null,
          regulated_by: body.regulated_by,
          operator_name: body.operator_name,
          tax_rate: validTaxRate(rate?.adopted_rate ?? null),
          tax_year: rate?.year ?? null,
          tax_source_url: rate?.source_url ?? null,
          last_vote_date: rate?.last_vote_date ?? null,
          latest_election: body.type && electionById.get(body.id) ? electionById.get(body.id) : null,
          ballot_offices: offices.filter((office) => office.body_id === body.id),
          agenda_coverage: agendaCoverage(body.type, body.id, covered),
          headlines: (headlines.get(body.id) ?? []).sort((a, b) => (b?.published_at ?? '').localeCompare(a?.published_at ?? '')).slice(0, 3),
        }
      }),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return failure(500, 'We could not load body details right now.')
  }
}
