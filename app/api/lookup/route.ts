import { validateAddress } from '@/lib/address'
import { LOOKUP_ERROR_STATUS, type LookupBody, type LookupErrorCode, type LookupResponse } from '@/lib/contracts/lookup'
import { rpcRows, selectRows } from '@/lib/db/raw'
import { demoCached, lookupDemoKey } from '@/lib/demo'
import { getEnv, getOptionalEnv, isDemoMode, isDemoRecord } from '@/lib/env'
import { CensusUnavailableError, geocodeCensus, type CensusMatch } from '@/lib/lookup/census'
import { fetchStreets, formatAddress, splitAddressInput } from '@/lib/lookup/suggest'
import { normalizeHcadAddress, parcelAddressCandidates } from '@/lib/lookup/normalize'
import { mergeLookupBodies, type BodyCatalogRow, type TaxRateRow } from '@/lib/lookup/merge'
import { subdivisionFromLegalDescription } from '@/lib/lookup/hoa'
import { bodiesFromCensus } from '@/lib/lookup/standIn'
import { COUNTYWIDE_UNCOVERED_CODES, uncoveredFromHcadCode } from '@/lib/lookup/uncovered'
import { RATE_LIMITS, checkRateLimit, clientIp, hashIp } from '@/lib/rateLimit'
import { signBodiesToken } from '@/lib/tokens'

type ParcelRow = {
  account: string
  legal_description: string | null
  longitude: number | null
  latitude: number | null
  jurisdiction_codes: string[]
}
type BallotRow = LookupResponse['ballot'][number]
type HoaCandidate = {
  subdivision_name: string
  hoa_body_id: string | null
  master_hoa_body_id: string | null
  source_url: string | null
  verified: boolean
  match_score: number
}
type LookupPayload = Omit<LookupResponse, 'bodies_token'>

class LookupFailure extends Error {
  constructor(readonly code: LookupErrorCode, message: string) {
    super(message)
    this.name = 'LookupFailure'
  }
}

const error = (code: LookupErrorCode, message: string) =>
  Response.json({ error: { code, message } }, { status: LOOKUP_ERROR_STATUS[code], headers: { 'Cache-Control': 'no-store' } })

/** Photon only receives street words; the house number remains between this server and Census. */
async function candidates(address: string): Promise<string[]> {
  const list = [address]
  if (/\b\d{5}\b/.test(address)) return list
  const { number, street } = splitAddressInput(address)
  if (!street) return list
  for (const suggestion of (await fetchStreets(street)).slice(0, 2)) list.push(formatAddress(suggestion, number))
  return [...new Set(list)]
}

async function matchCensus(addresses: readonly string[]): Promise<{ match: CensusMatch; candidate: string } | null> {
  for (const address of addresses) {
    const match = await geocodeCensus(address)
    if (match) return { match, candidate: address }
  }
  return null
}

/**
 * Condos and townhomes share one street address across several accounts, and lookup_hcad_parcel
 * returns one account for each different set of tax codes there. The address is confirmed when
 * every account has the same tracked codes (only commercial units pay a management district, for
 * example); the untracked governments listed are the ones every account shares. When tracked codes
 * differ (or one street address exists in two ZIP codes) nothing is confirmed, and the lookup uses
 * the Census answer instead of guessing.
 */
function resolveSharedAddress(rows: readonly ParcelRow[], trackedCodes: ReadonlySet<string>): ParcelRow | null {
  const codesOf = (row: ParcelRow) => [...new Set(row.jurisdiction_codes ?? [])]
  const tracked = (row: ParcelRow) => codesOf(row).filter((code) => trackedCodes.has(code)).sort().join(',')
  const first = rows[0]
  if (!first) return null
  if (rows.some((row) => tracked(row) !== tracked(first))) return null
  const shared = rows.slice(1).reduce((codes, row) => codes.filter((code) => codesOf(row).includes(code)), codesOf(first))
  return { ...first, jurisdiction_codes: shared }
}

async function matchParcel(addresses: readonly string[], trackedCodes: ReadonlySet<string>): Promise<ParcelRow | null> {
  for (const address of addresses) {
    const normalized = normalizeHcadAddress(address)
    if (!normalized) continue
    // The packed tables (district-coverage plan §2.1) first; the old per-account tables until they're dropped.
    const packed = await rpcRows<ParcelRow>('lookup_hcad_packed', { p_site_address_norm: normalized })
    const found = packed.length ? packed : await rpcRows<ParcelRow>('lookup_hcad_parcel', { p_site_address_norm: normalized })
    const resolved = resolveSharedAddress(found, trackedCodes)
    if (resolved) return resolved
  }
  return null
}

/** Every Harris County address is in these (the Census fallback lists them without an HCAD record). */
const COUNTYWIDE_BODY_IDS = ['commissioners_court', 'flood_control', 'port_houston', 'hcad']

/**
 * Without an HCAD record (a new street), water districts and ISDs come from the district map
 * (district-coverage plan 0.5). A boundary within this many meters of the point, but not around
 * it, is listed as "may be in".
 */
const NEAR_EDGE_METERS = 50
const MAP_FALLBACK_TYPES = new Set(['mud', 'water_authority', 'school_board'])

const CATALOG_COLUMNS = 'id,name,type,category,elected_or_appointed,description_en,meeting_info_url,impact_rank,operator_name'

function ancillaryBody(body: {
  id: string
  name: string
  type: LookupBody['type']
  category: LookupBody['category']
  description?: string | null
  meetingInfoUrl?: string | null
}): LookupBody {
  return {
    id: body.id,
    name: body.name,
    type: body.type,
    category: body.category,
    elected_or_appointed: null,
    description: body.description ?? null,
    meeting_info_url: body.meetingInfoUrl ?? null,
    verified: false,
    source_kind: null,
    tax_source_url: null,
    tax_rate: null,
    tax_year: null,
    last_vote_date: null,
  }
}

async function buildPayload(address: string): Promise<LookupPayload> {
  const addressCandidates = await candidates(address)
  let censusResult: { match: CensusMatch; candidate: string } | null = null
  let censusUnavailable = false
  try {
    censusResult = await matchCensus(addressCandidates)
  } catch (cause) {
    if (!(cause instanceof CensusUnavailableError)) throw cause
    censusUnavailable = true
  }
  const census = censusResult?.match ?? null
  if (census && census.countyFips !== '48201') {
    throw new LookupFailure('outside_harris', 'This address is outside Harris County.')
  }

  const parcelCandidates = parcelAddressCandidates(
    censusResult ? { censusMatchedAddress: censusResult.match.matchedAddress, censusQueryAddress: censusResult.candidate } : null,
    addressCandidates,
  )
  // The whole map is small (one row per tracked HCAD code); shared addresses are checked against it.
  const mappings = await selectRows<{ hcad_code: string; body_id: string }>('jurisdiction_map', 'hcad_code,body_id', (query) => query)
  const parcel = await matchParcel(parcelCandidates, new Set(mappings.map((row) => row.hcad_code)))
  if (!parcel && !census) {
    // A Census outage is different from a genuine no-match; don't mislabel it as an invalid address.
    if (censusUnavailable) throw new LookupFailure('server_error', 'The address service is temporarily unavailable. Try again.')
    throw new LookupFailure('not_found', 'We could not find that address in Harris County.')
  }
  // Without a loaded HCAD parcel, the Census answer (city, school and college district, and the
  // countywide governments) stands in. Those bodies are labeled as not confirmed.
  const match: LookupPayload['match'] = parcel ? 'hcad' : 'census'

  const longitude = census?.coordinates?.longitude ?? parcel?.longitude ?? null
  const latitude = census?.coordinates?.latitude ?? parcel?.latitude ?? null
  const hasPoint = longitude !== null && latitude !== null && Number.isFinite(longitude) && Number.isFinite(latitude)
  // The point is only for the boundary check. An HCAD match without one (the Census can't place a
  // new street, and no parcel points are loaded) still answers from its tax codes (tech plan §5).
  const gisRows = hasPoint
    ? await rpcRows<{ body_id: string }>('lookup_boundary_bodies', { p_longitude: longitude, p_latitude: latitude })
    : []
  const codes = parcel ? [...new Set(parcel.jurisdiction_codes ?? [])].sort() : []
  const bodyForCode = new Map(mappings.filter((row) => codes.includes(row.hcad_code)).map((row) => [row.hcad_code, row.body_id]))
  // HCAD appraises property countywide and is not normally a parcel tax code.
  const hcadIds = parcel ? [...new Set(['hcad', ...bodyForCode.values()])] : []
  const gisIds = [...new Set(gisRows.map((row) => row.body_id))]
  const nearRows = hasPoint && match === 'census'
    ? await rpcRows<{ body_id: string; inside: boolean }>('lookup_boundary_near', { p_longitude: longitude, p_latitude: latitude, p_meters: NEAR_EDGE_METERS })
    : []
  const nearIds = [...new Set(nearRows.filter((row) => !row.inside && !gisIds.includes(row.body_id)).map((row) => row.body_id))]
  const censusBodies = census
    ? bodiesFromCensus(census).filter(
        (body) => match === 'census' || body.type === 'city_council' || body.type === 'school_board' || body.type === 'college_board',
      )
    : []
  const censusIds = [...new Set([...censusBodies.map((body) => body.id), ...(match === 'census' ? COUNTYWIDE_BODY_IDS : [])])]
  const resolvedIds = [...new Set([...hcadIds, ...gisIds, ...nearIds, ...censusIds])]
  const [catalog, rates, ballotRows, regionalRows, notGovernmentRows] = await Promise.all([
    resolvedIds.length
      ? selectRows<BodyCatalogRow>('bodies', CATALOG_COLUMNS, (query) => query.in('id', resolvedIds))
      : Promise.resolve([] as BodyCatalogRow[]),
    resolvedIds.length
      ? selectRows<TaxRateRow>(
          'tax_rates',
          'body_id,year,adopted_rate,last_vote_date,source_url',
          (query) => query.in('body_id', resolvedIds).order('year', { ascending: false }),
        )
      : Promise.resolve([] as TaxRateRow[]),
    resolvedIds.length
      ? selectRows<BallotRow>(
          'ballot_offices',
          'id,body_id,office_name,holder_name,next_election_date,source_url',
          (query) => query.in('body_id', resolvedIds).order('next_election_date'),
        )
      : Promise.resolve([] as BallotRow[]),
    selectRows<BodyCatalogRow>('bodies', CATALOG_COLUMNS, (query) => query.eq('category', 'regional_coming_soon').order('impact_rank')),
    selectRows<BodyCatalogRow>('bodies', CATALOG_COLUMNS, (query) => query.eq('category', 'not_government').order('impact_rank')),
  ])
  // "May be in" only applies to water districts and ISDs; other near boundaries are dropped.
  const mapNearIds = nearIds.filter((id) => MAP_FALLBACK_TYPES.has(catalog.find((body) => body.id === id)?.type ?? ''))
  // When the map places the address in an ISD, the Census school-district hint is dropped.
  const mapIds = [...gisIds, ...mapNearIds]
  const mapHasSchool = match === 'census' && catalog.some((body) => body.type === 'school_board' && mapIds.includes(body.id))
  const censusSchoolDropped = (body: { id: string; type: string | null }) => mapHasSchool && body.type === 'school_board' && !mapIds.includes(body.id)
  const catalogIds = new Set(
    catalog.filter((body) => (!nearIds.includes(body.id) || mapNearIds.includes(body.id)) && !censusSchoolDropped(body)).map((body) => body.id),
  )

  // Governments we don't track yet are listed by their official name instead of failing the lookup.
  const uncovered: LookupPayload['uncovered'] = []
  for (const code of codes) {
    const bodyId = bodyForCode.get(code)
    const entry = !bodyId || !catalogIds.has(bodyId) ? uncoveredFromHcadCode(code) : null
    if (entry) uncovered.push(entry)
  }
  if (match === 'census') {
    for (const code of COUNTYWIDE_UNCOVERED_CODES) {
      const entry = uncoveredFromHcadCode(code)
      if (entry) uncovered.push({ ...entry, source_kind: 'census' })
    }
  }
  const knownTypes = new Set([
    ...uncovered.map((item) => item.type),
    ...catalog.filter((body) => hcadIds.includes(body.id)).map((body) => body.type),
  ])
  for (const body of censusBodies) {
    if (catalogIds.has(body.id) || censusSchoolDropped(body)) continue
    // With an HCAD record, its own code for this kind of body wins over the Census hint.
    if (match === 'hcad' && knownTypes.has(body.type)) continue
    uncovered.push({ key: `census:${body.id}`, name: body.name, type: body.type ?? 'other', source_kind: 'census' })
  }

  const bodies = mergeLookupBodies({
    catalog: catalog.filter((body) => catalogIds.has(body.id)),
    hcadIds: hcadIds.filter((id) => catalogIds.has(id)),
    gisIds: mapIds,
    censusIds: censusIds.filter((id) => catalogIds.has(id)),
    rates,
  }).map((body) => {
    // Labeled "From the district map, not your tax record" (or "may be in") on /results.
    if (match !== 'census' || !body.type || !MAP_FALLBACK_TYPES.has(body.type)) return body
    if (mapNearIds.includes(body.id)) return { ...body, map_match: 'near' as const }
    return gisIds.includes(body.id) ? { ...body, map_match: 'inside' as const } : body
  })
  if (!bodies.length) throw new LookupFailure('not_found', 'We could not find local governments for that address yet.')
  // With HCAD, only confirmed bodies go into the token. With the Census fallback, every listed body
  // does, so the dashboard and weekly news still work; the page labels them as not confirmed.
  const tokenIds = match === 'hcad' ? bodies.filter((body) => body.verified).map((body) => body.id) : bodies.map((body) => body.id)
  if (!tokenIds.length) throw new LookupFailure('not_found', 'We could not verify local governing bodies for that address yet.')

  const subdivision = subdivisionFromLegalDescription(parcel?.legal_description ?? null)
  let hoa: LookupPayload['hoa'] = null
  if (subdivision) {
    const candidates = await rpcRows<HoaCandidate>('lookup_hoa_candidates', { p_subdivision: subdivision })
    const candidate = candidates[0]
    if (candidate) {
      const exactName = candidate.subdivision_name.trim().toUpperCase() === subdivision.trim().toUpperCase()
      hoa = {
        subdivision_name: candidate.subdivision_name,
        hoa_body_id: candidate.hoa_body_id,
        master_hoa_body_id: candidate.master_hoa_body_id,
        source_url: candidate.source_url,
        association_verified: candidate.verified && exactName,
        status: 'needs_confirmation',
      }
    }
  }

  // The catalog's own row wins; the built-in CenterPoint entry only covers an unseeded catalog.
  const notGovernment: LookupBody[] = []
  const addNotGovernment = (body: LookupBody) => {
    if (!notGovernment.some((item) => item.id === body.id)) notGovernment.push(body)
  }
  for (const body of notGovernmentRows) {
    addNotGovernment(ancillaryBody({
      id: body.id,
      name: body.name,
      type: body.type === 'other' ? 'other' : null,
      category: 'not_government',
      description: body.description_en,
      meetingInfoUrl: body.meeting_info_url,
    }))
  }
  addNotGovernment(ancillaryBody({ id: 'centerpoint', name: 'CenterPoint Energy', type: 'other', category: 'not_government' }))
  for (const body of catalog) {
    if (!body.operator_name) continue
    const id = `operator_${body.operator_name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)}`
    addNotGovernment(ancillaryBody({ id, name: body.operator_name, type: 'other', category: 'not_government' }))
  }

  return {
    match,
    bodies,
    uncovered,
    ballot: ballotRows.filter((office) => office.body_id && tokenIds.includes(office.body_id)),
    not_government: notGovernment,
    regional: regionalRows.map((body) => ancillaryBody({
      id: body.id,
      name: body.name,
      type: null,
      category: 'regional_coming_soon',
      description: body.description_en,
      meetingInfoUrl: body.meeting_info_url,
    })),
    hoa,
  }
}

export async function POST(req: Request) {
  const input = (await req.json().catch(() => null)) as { address?: unknown } | null
  const checked = validateAddress(typeof input?.address === 'string' ? input.address : '')
  if (!checked.ok) return error('invalid_address', 'Enter a street address.')

  try {
    const production = getOptionalEnv('VERCEL_ENV') === 'production'
    const ipSecret = production ? getEnv('IP_HASH_SECRET') : getOptionalEnv('IP_HASH_SECRET')
    const serviceKey = production ? getEnv('SUPABASE_SERVICE_ROLE_KEY') : getOptionalEnv('SUPABASE_SERVICE_ROLE_KEY')
    if (production && (!ipSecret || !serviceKey)) throw new Error('Lookup security configuration is missing.')
    if (ipSecret && serviceKey) {
      const limit = await checkRateLimit(`lookup:${hashIp(clientIp(req), { secret: ipSecret })}`, RATE_LIMITS.lookupPerIp)
      if (!limit.allowed) throw new LookupFailure('rate_limited', 'Too many lookups. Try again later.')
      if (production && limit.degraded) throw new Error('Lookup rate limiting is unavailable.')
    }

    const cacheSecret = ipSecret ?? (isDemoMode() || isDemoRecord() ? getEnv('IP_HASH_SECRET') : 'cache-disabled')
    const cacheKey = lookupDemoKey(checked.value, cacheSecret)
    const payload = await demoCached<LookupPayload>(
      cacheKey,
      () => buildPayload(checked.value),
    )
    // Older cached payloads have no `match` field; treat them as HCAD matches.
    const match = payload.match ?? 'hcad'
    const ids = match === 'hcad' ? payload.bodies.filter((body) => body.verified).map((body) => body.id) : payload.bodies.map((body) => body.id)
    const token = signBodiesToken(ids)
    const response: LookupResponse = { bodies_token: token, ...payload, match, uncovered: payload.uncovered ?? [] }
    return Response.json(response, {
      headers: { 'Cache-Control': 'no-store', 'X-Lookup': match },
    })
  } catch (cause) {
    if (cause instanceof LookupFailure) return error(cause.code, cause.message)
    if (cause instanceof CensusUnavailableError) return error('server_error', 'The address service is temporarily unavailable. Try again.')
    return error('server_error', 'We could not complete this lookup. Try again later.')
  }
}
