import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class CensusUnavailableError extends Error {}
  return {
    CensusUnavailableError,
    addressResult: { ok: true, value: '123 Main St, Houston, TX 77004' } as { ok: boolean; value?: string },
    censusResult: null as unknown,
    parcelRows: [] as unknown[],
    gisRows: [] as unknown[],
    nearRows: [] as unknown[],
    packedRows: [] as unknown[],
    hoaRows: [] as unknown[],
    tableRows: {} as Record<string, unknown[]>,
    rpcFailure: null as string | null,
    selectFailure: null as string | null,
    demoPayload: null as unknown,
    calls: [] as Array<{ kind: string; name: string; args?: unknown }>,
    validateAddress: vi.fn(() => ({ ok: true, value: '123 Main St, Houston, TX 77004' })),
    geocodeCensus: vi.fn(async () => null as unknown),
    fetchStreets: vi.fn(async () => []),
    rpcRows: vi.fn(async (name: string, args: unknown) => {
      mocks.calls.push({ kind: 'rpc', name, args })
      if (mocks.rpcFailure === name) throw new Error('database failure')
      if (name === 'lookup_hcad_packed') return mocks.packedRows
      if (name === 'lookup_hcad_parcel') return mocks.parcelRows
      if (name === 'lookup_boundary_near') return mocks.nearRows
      if (name === 'lookup_boundary_bodies') return mocks.gisRows
      if (name === 'lookup_hoa_candidates') return mocks.hoaRows
      return []
    }),
    selectRows: vi.fn(async (table: string, _columns: string, filter: (query: {
      in: (column: string, values: readonly unknown[]) => unknown
      eq: (column: string, value: unknown) => unknown
      order: (column: string, options?: unknown) => unknown
    }) => unknown) => {
      mocks.calls.push({ kind: 'select', name: table })
      if (mocks.selectFailure === table) throw new Error('database failure')
      const query = {
        in: (_column: string, _values: readonly unknown[]) => query,
        eq: (_column: string, _value: unknown) => query,
        order: (_column: string, _options?: unknown) => query,
      }
      filter(query)
      return mocks.tableRows[table] ?? []
    }),
    demoCached: vi.fn(async (_key: string, compute: () => Promise<unknown>) => mocks.isDemoMode() ? mocks.demoPayload : compute()),
    getEnv: vi.fn((key: string) => {
      const value = process.env[key]
      if (!value) throw new Error(`Missing ${key}`)
      return value
    }),
    getOptionalEnv: vi.fn((key: string) => process.env[key] || undefined),
    isDemoMode: vi.fn(() => false),
    isDemoRecord: vi.fn(() => false),
    checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 119, resetAt: new Date() })),
    signBodiesToken: vi.fn(() => 'signed-body-token'),
  }
})

vi.mock('@/lib/address', () => ({
  validateAddress: mocks.validateAddress,
  normalizeAddressInput: (value: string) => value.trim().replace(/\s+/g, ' '),
}))
vi.mock('@/lib/lookup/census', () => ({
  CensusUnavailableError: mocks.CensusUnavailableError,
  geocodeCensus: mocks.geocodeCensus,
}))
vi.mock('@/lib/lookup/suggest', () => ({
  fetchStreets: mocks.fetchStreets,
  formatAddress: (street: { street: string; city: string; postcode: string }, number?: string) => `${number ? `${number} ` : ''}${street.street}, ${street.city}, TX ${street.postcode}`,
  splitAddressInput: (address: string) => {
    const match = address.match(/^(\d+)\s+(.+)$/)
    return { number: match?.[1] ?? null, street: match?.[2] ?? address }
  },
}))
vi.mock('@/lib/db/raw', () => ({ rpcRows: mocks.rpcRows, selectRows: mocks.selectRows }))
vi.mock('@/lib/demo', () => ({ demoCached: mocks.demoCached, lookupDemoKey: () => 'lookup:hashed' }))
vi.mock('@/lib/env', () => ({
  getEnv: mocks.getEnv,
  getOptionalEnv: mocks.getOptionalEnv,
  isDemoMode: mocks.isDemoMode,
  isDemoRecord: mocks.isDemoRecord,
}))
vi.mock('@/lib/rateLimit', () => ({
  RATE_LIMITS: { lookupPerIp: { limit: 120, windowSeconds: 3600 } },
  checkRateLimit: mocks.checkRateLimit,
  clientIp: () => '127.0.0.1',
  hashIp: () => 'hashed-ip',
}))
vi.mock('@/lib/tokens', () => ({ signBodiesToken: mocks.signBodiesToken }))

import { POST } from '@/app/api/lookup/route'

const request = (address = '123 Main St, Houston, TX 77004') => new Request('http://localhost/api/lookup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ address }),
})

const matchedCensus = (overrides: Record<string, unknown> = {}) => ({
  matchedAddress: '123 MAIN ST, HOUSTON, TX, 77004',
  countyFips: '48201',
  place: null,
  schoolDistrict: null,
  coordinates: { longitude: -95.36, latitude: 29.72 },
  ...overrides,
})

const parcel = (overrides: Record<string, unknown> = {}) => ({
  account: 'PRIVATE-ACCOUNT',
  legal_description: 'PRIVATE LEGAL DESCRIPTION',
  longitude: -95.37,
  latitude: 29.73,
  jurisdiction_codes: ['189'],
  ...overrides,
})

const catalog = [
  { id: 'hcad', name: 'Harris Central Appraisal District', type: 'hcad', category: 'tracked', elected_or_appointed: null, description_en: null, meeting_info_url: null, impact_rank: 1, operator_name: null },
  { id: 'hcmud_489', name: 'Harris County MUD 489', type: 'mud', category: 'tracked', elected_or_appointed: null, description_en: null, meeting_info_url: null, impact_rank: 2, operator_name: null },
  { id: 'houston_city_council', name: 'Houston City Council', type: 'city_council', category: 'tracked', elected_or_appointed: null, description_en: null, meeting_info_url: null, impact_rank: 3, operator_name: null },
]

const countywideCatalog = ['commissioners_court', 'flood_control', 'port_houston', 'hisd_board', 'hcc_board'].map((id, i) => ({
  id,
  name: id,
  type: { commissioners_court: 'commissioners_court', flood_control: 'flood_control', port_houston: 'port', hisd_board: 'school_board', hcc_board: 'college_board' }[id]!,
  category: 'tracked',
  elected_or_appointed: null,
  description_en: null,
  meeting_info_url: null,
  impact_rank: 10 + i,
  operator_name: null,
}))

function setupMatchedLookup() {
  mocks.censusResult = matchedCensus()
  mocks.parcelRows = [parcel()]
  mocks.gisRows = [{ body_id: 'houston_city_council' }]
  mocks.tableRows = {
    jurisdiction_map: [{ hcad_code: '189', body_id: 'hcmud_489' }],
    bodies: catalog,
    tax_rates: [],
    ballot_offices: [],
  }
}

describe('POST /api/lookup', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    mocks.addressResult = { ok: true, value: '123 Main St, Houston, TX 77004' }
    mocks.censusResult = null
    mocks.parcelRows = []
    mocks.gisRows = []
    mocks.nearRows = []
    mocks.packedRows = []
    mocks.hoaRows = []
    mocks.tableRows = {}
    mocks.rpcFailure = null
    mocks.selectFailure = null
    mocks.calls = []
    mocks.demoPayload = null
    vi.clearAllMocks()
    mocks.isDemoMode.mockReturnValue(false)
    mocks.isDemoRecord.mockReturnValue(false)
    vi.stubEnv('VERCEL_ENV', 'development')
  })

  it('rejects invalid addresses before calling Census or HCAD', async () => {
    mocks.validateAddress.mockReturnValueOnce({ ok: false, code: 'invalid_address' } as never)
    const response = await POST(request(''))
    expect(response.status).toBe(400)
    expect(mocks.geocodeCensus).not.toHaveBeenCalled()
    expect(mocks.rpcRows).not.toHaveBeenCalled()
  })

  it('rejects non-Harris Census matches before querying HCAD', async () => {
    mocks.censusResult = matchedCensus({ countyFips: '48157' })
    mocks.geocodeCensus.mockResolvedValueOnce(mocks.censusResult as never)
    const response = await POST(request())
    expect(response.status).toBe(422)
    expect(mocks.rpcRows).not.toHaveBeenCalled()
  })

  it('merges HCAD/GIS evidence, adds countywide HCAD, and signs verified IDs only', async () => {
    setupMatchedLookup()
    mocks.geocodeCensus.mockResolvedValueOnce(mocks.censusResult as never)
    const response = await POST(request())
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.bodies.map((item: { id: string; verified: boolean }) => [item.id, item.verified])).toEqual([
      ['hcad', true], ['hcmud_489', true], ['houston_city_council', true],
    ])
    expect(body.bodies_token).toBe('signed-body-token')
    expect(mocks.signBodiesToken).toHaveBeenCalledWith(['hcad', 'hcmud_489', 'houston_city_council'])
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('PRIVATE-ACCOUNT')
    expect(serialized).not.toContain('PRIVATE LEGAL DESCRIPTION')
    expect(serialized).not.toContain('-95.36')
    expect(serialized).not.toContain('123 Main St')
  })

  it('uses the Census answer when parcels at one address have different tax codes, rather than choosing one', async () => {
    mocks.censusResult = matchedCensus({ place: 'Houston city', schoolDistrict: 'Houston Independent School District' })
    mocks.geocodeCensus.mockResolvedValueOnce(mocks.censusResult as never)
    mocks.parcelRows = [parcel(), parcel({ account: 'SECOND-PRIVATE-ACCOUNT', jurisdiction_codes: ['001'] })]
    mocks.tableRows = { jurisdiction_map: [{ hcad_code: '189', body_id: 'hcmud_489' }], bodies: [...catalog, ...countywideCatalog], tax_rates: [], ballot_offices: [] }
    const response = await POST(request())
    expect(mocks.rpcRows).toHaveBeenCalledWith('lookup_hcad_parcel', { p_site_address_norm: '123 MAIN ST' })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.match).toBe('census')
    expect(body.bodies.map((b: { id: string }) => b.id)).not.toContain('hcmud_489')
    expect(body.bodies.every((b: { verified: boolean }) => !b.verified)).toBe(true)
  })

  it('confirms a shared address whose accounts differ only in untracked codes, listing just the codes they all share', async () => {
    setupMatchedLookup()
    mocks.geocodeCensus.mockResolvedValueOnce(mocks.censusResult as never)
    // A building where only the commercial units pay a management district (944).
    mocks.parcelRows = [
      parcel({ jurisdiction_codes: ['189', '633', '944'] }),
      parcel({ account: 'SECOND-PRIVATE-ACCOUNT', jurisdiction_codes: ['189', '633'] }),
    ]
    const response = await POST(request())
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.match).toBe('hcad')
    expect(body.bodies.map((b: { id: string }) => b.id)).toContain('hcmud_489')
    expect(body.uncovered.map((u: { key: string }) => u.key)).toEqual(['hcad:633'])
  })

  it('leaves out tax codes that have no official name in HCAD\'s list', async () => {
    setupMatchedLookup()
    mocks.geocodeCensus.mockResolvedValueOnce(mocks.censusResult as never)
    mocks.parcelRows = [parcel({ jurisdiction_codes: ['189', '633', '000'] })]
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect((await response.json()).uncovered.map((u: { key: string }) => u.key)).toEqual(['hcad:633'])
  })

  it('returns not found when parcels at one address disagree and the Census has no match either', async () => {
    mocks.geocodeCensus.mockResolvedValueOnce(null as never)
    mocks.parcelRows = [parcel(), parcel({ account: 'SECOND-PRIVATE-ACCOUNT', jurisdiction_codes: ['001'] })]
    const response = await POST(request())
    expect(response.status).toBe(404)
    expect(mocks.signBodiesToken).not.toHaveBeenCalled()
  })

  it('accepts several parcels at one address (condos, townhomes) when their tax codes match', async () => {
    setupMatchedLookup()
    mocks.geocodeCensus.mockResolvedValueOnce(mocks.censusResult as never)
    mocks.parcelRows = [parcel(), parcel({ account: 'SECOND-PRIVATE-ACCOUNT', jurisdiction_codes: ['189'] })]
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect((await response.json()).match).toBe('hcad')
  })

  it('does not query HCAD with a street suggestion unrelated to the Census-matched candidate', async () => {
    mocks.validateAddress.mockReturnValueOnce({ ok: true, value: '123 Main St' })
    mocks.fetchStreets.mockResolvedValueOnce([
      { street: 'Unrelated Road', city: 'Houston', postcode: '77004' },
      { street: 'Main Street', city: 'Houston', postcode: '77004' },
    ] as never)
    mocks.geocodeCensus
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce(matchedCensus({ matchedAddress: '123 MAIN ST, HOUSTON, TX, 77004' }) as never)
    mocks.parcelRows = [parcel()]
    mocks.gisRows = [{ body_id: 'houston_city_council' }]
    mocks.tableRows = { jurisdiction_map: [{ hcad_code: '189', body_id: 'hcmud_489' }], bodies: catalog, tax_rates: [], ballot_offices: [] }
    await POST(request())
    const parcelArgs = mocks.rpcRows.mock.calls
      .filter(([name]) => name === 'lookup_hcad_parcel')
      .map(([, args]) => args as { p_site_address_norm: string })
    expect(parcelArgs.length).toBeGreaterThan(0)
    expect(parcelArgs.every((args) => !args.p_site_address_norm.includes('UNRELATED'))).toBe(true)
  })

  it('falls back to the Census answer when no HCAD parcel is loaded for the address', async () => {
    mocks.censusResult = matchedCensus({ place: 'Houston city', schoolDistrict: 'Houston Independent School District' })
    mocks.geocodeCensus.mockResolvedValueOnce(mocks.censusResult as never)
    mocks.tableRows = { jurisdiction_map: [], bodies: [...catalog, ...countywideCatalog], tax_rates: [], ballot_offices: [] }
    const response = await POST(request())
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.match).toBe('census')
    const ids = body.bodies.map((b: { id: string }) => b.id).sort()
    expect(ids).toEqual(['commissioners_court', 'flood_control', 'hcad', 'hcc_board', 'hisd_board', 'houston_city_council', 'port_houston'])
    expect(body.bodies.every((b: { verified: boolean; source_kind: string }) => !b.verified && b.source_kind === 'census')).toBe(true)
    // The dashboard still works: every listed body goes into the token.
    expect([...(mocks.signBodiesToken.mock.calls[0] as unknown as [string[]])[0]].sort()).toEqual(ids)
    // The countywide Hospital District and Department of Education are listed, not tracked.
    expect(body.uncovered.map((u: { key: string; type: string }) => [u.key, u.type])).toEqual([['hcad:043', 'other'], ['hcad:044', 'other']])
  })

  it('returns not found when neither the Census nor HCAD knows the address', async () => {
    mocks.geocodeCensus.mockResolvedValueOnce(null as never)
    const response = await POST(request())
    expect(response.status).toBe(404)
    expect(mocks.rpcRows).toHaveBeenCalledWith('lookup_hcad_parcel', expect.any(Object))
    expect(mocks.signBodiesToken).not.toHaveBeenCalled()
  })

  it('lists unmapped HCAD codes and mapped codes without a catalog body as uncovered, instead of failing', async () => {
    setupMatchedLookup()
    mocks.geocodeCensus.mockResolvedValueOnce(mocks.censusResult as never)
    mocks.parcelRows = [parcel({ jurisdiction_codes: ['189', '043', '633'] })]
    const unmapped = await POST(request())
    expect(unmapped.status).toBe(200)
    const body = await unmapped.json()
    expect(body.match).toBe('hcad')
    expect(body.bodies.map((b: { id: string }) => b.id)).toContain('hcmud_489')
    expect(body.uncovered).toEqual([
      { key: 'hcad:043', name: 'Harris County Hospital District', type: 'other', source_kind: 'hcad' },
      { key: 'hcad:633', name: 'Harris County Emergency Services District 9', type: 'esd', source_kind: 'hcad' },
    ])
    expect(mocks.signBodiesToken).toHaveBeenCalledWith(['hcad', 'hcmud_489', 'houston_city_council'])

    setupMatchedLookup()
    mocks.signBodiesToken.mockClear()
    mocks.tableRows.bodies = catalog.filter((b) => b.id !== 'hcmud_489')
    mocks.geocodeCensus.mockResolvedValueOnce(mocks.censusResult as never)
    const missingBody = await POST(request())
    expect(missingBody.status).toBe(200)
    expect((await missingBody.json()).uncovered).toEqual([{ key: 'hcad:189', name: 'Harris County MUD 489', type: 'mud', source_kind: 'hcad' }])
    expect(mocks.signBodiesToken).toHaveBeenCalledWith(['hcad', 'houston_city_council'])
  })

  it('lists a Census city or school district outside the catalog as uncovered, instead of a 500', async () => {
    setupMatchedLookup()
    mocks.censusResult = matchedCensus({ place: 'Pasadena city', schoolDistrict: 'Pasadena Independent School District' })
    mocks.geocodeCensus.mockResolvedValueOnce(mocks.censusResult as never)
    const response = await POST(request())
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.uncovered.map((u: { key: string; type: string; source_kind: string }) => [u.key, u.type, u.source_kind])).toEqual([
      ['census:pasadena_city_council', 'city_council', 'census'],
      ['census:pasadena_isd_board', 'school_board', 'census'],
    ])
  })

  it('lists CenterPoint once even when the catalog also has it', async () => {
    setupMatchedLookup()
    mocks.tableRows.bodies = [...catalog, { id: 'centerpoint', name: 'CenterPoint Energy', type: 'other', category: 'not_government', elected_or_appointed: null, description_en: null, meeting_info_url: null, impact_rank: 99, operator_name: null }]
    mocks.geocodeCensus.mockResolvedValueOnce(mocks.censusResult as never)
    const body = await (await POST(request())).json()
    expect(body.not_government.filter((b: { id: string }) => b.id === 'centerpoint')).toHaveLength(1)
  })

  it('returns a generic server error on PostGIS RPC or body-catalog failure without signing a token', async () => {
    setupMatchedLookup()
    mocks.rpcFailure = 'lookup_boundary_bodies'
    mocks.geocodeCensus.mockResolvedValueOnce(mocks.censusResult as never)
    const boundaryFailure = await POST(request())
    expect(boundaryFailure.status).toBe(500)
    expect(await boundaryFailure.text()).not.toContain('database failure')
    expect(mocks.signBodiesToken).not.toHaveBeenCalled()

    setupMatchedLookup()
    mocks.rpcFailure = null
    mocks.selectFailure = 'bodies'
    mocks.geocodeCensus.mockResolvedValueOnce(mocks.censusResult as never)
    const catalogFailure = await POST(request())
    expect(catalogFailure.status).toBe(500)
    expect(await catalogFailure.text()).not.toContain('database failure')
    expect(mocks.signBodiesToken).not.toHaveBeenCalled()
  })

  it('uses an HCAD centroid when Census is unavailable and returns a server error when neither source resolves', async () => {
    mocks.geocodeCensus.mockRejectedValueOnce(new mocks.CensusUnavailableError())
    mocks.parcelRows = [parcel()]
    mocks.gisRows = [{ body_id: 'houston_city_council' }]
    mocks.tableRows = { jurisdiction_map: [{ hcad_code: '189', body_id: 'hcmud_489' }], bodies: catalog, tax_rates: [], ballot_offices: [] }
    const fallback = await POST(request())
    expect(fallback.status).toBe(200)
    expect(mocks.rpcRows).toHaveBeenCalledWith('lookup_boundary_bodies', { p_longitude: -95.37, p_latitude: 29.73 })

    mocks.rpcRows.mockClear()
    mocks.parcelRows = []
    mocks.geocodeCensus.mockRejectedValueOnce(new mocks.CensusUnavailableError())
    const unavailable = await POST(request())
    expect(unavailable.status).toBe(500)
    // The packed lookup, then the old tables.
    expect(mocks.rpcRows).toHaveBeenCalledTimes(2)
  })

  // Tech plan §5 step 4: "not found" only when neither source matches. Parcel points are optional
  // (the HCAD slice workflow loads none), so a new street the Census hasn't mapped yet still gets
  // its HCAD answer; only the boundary check, which needs a point, is skipped.
  it('confirms an HCAD match the Census cannot place, skipping only the boundary check', async () => {
    mocks.geocodeCensus.mockResolvedValueOnce(null as never)
    mocks.parcelRows = [parcel({ longitude: null, latitude: null })]
    mocks.tableRows = { jurisdiction_map: [{ hcad_code: '189', body_id: 'hcmud_489' }], bodies: catalog, tax_rates: [], ballot_offices: [] }
    const response = await POST(request())
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.match).toBe('hcad')
    expect(payload.bodies.map((body: { id: string }) => body.id)).toEqual(expect.arrayContaining(['hcad', 'hcmud_489']))
    expect(mocks.rpcRows).not.toHaveBeenCalledWith('lookup_boundary_bodies', expect.anything())
    expect(mocks.signBodiesToken).toHaveBeenCalled()
  })

  it('uses the final-payload cache wrapper without exposing the raw address in its key', async () => {
    setupMatchedLookup()
    mocks.geocodeCensus.mockResolvedValueOnce(mocks.censusResult as never)
    await POST(request())
    expect(mocks.demoCached).toHaveBeenCalledWith('lookup:hashed', expect.any(Function))
  })

  it('serves a demo-cache hit without calling Census or leaking the raw address into the cache key', async () => {
    vi.stubEnv('IP_HASH_SECRET', 'local-secret-for-demo-cache')
    mocks.isDemoMode.mockReturnValue(true)
    mocks.demoPayload = {
      bodies: [{ id: 'hcad', verified: true }], ballot: [], not_government: [], regional: [], hoa: null,
    }
    const response = await POST(request())
    expect(response.status).toBe(200)
    const [cacheKey] = mocks.demoCached.mock.calls[0]!
    expect(cacheKey).toMatch(/^lookup:/)
    expect(cacheKey).not.toContain('123 Main St')
    expect(mocks.geocodeCensus).not.toHaveBeenCalled()
  })

  it('fails closed in production without lookup secrets and rate limits configured requests', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const missingSecrets = await POST(request())
    expect(missingSecrets.status).toBe(500)
    expect(mocks.geocodeCensus).not.toHaveBeenCalled()

    vi.stubEnv('VERCEL_ENV', 'development')
    vi.stubEnv('IP_HASH_SECRET', 'test-ip-hash-secret')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key')
    mocks.checkRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: new Date() })
    const limited = await POST(request())
    expect(limited.status).toBe(429)
    expect(mocks.geocodeCensus).not.toHaveBeenCalled()
  })

  describe('district map fallback (district-coverage plan 0.5)', () => {
    const mapCatalog = [
      ...catalog,
      ...countywideCatalog,
      { id: 'katy_isd_board', name: 'Katy ISD Board of Trustees', type: 'school_board', category: 'tracked', elected_or_appointed: null, description_en: null, meeting_info_url: null, impact_rank: 20, operator_name: null },
    ]
    const censusOnly = (overrides: Record<string, unknown> = {}) => {
      mocks.censusResult = matchedCensus(overrides)
      mocks.geocodeCensus.mockResolvedValueOnce(mocks.censusResult as never)
      mocks.tableRows = { jurisdiction_map: [], bodies: mapCatalog, tax_rates: [], ballot_offices: [] }
    }

    it('labels a water district inside its map boundary as from the map, not confirmed', async () => {
      censusOnly()
      mocks.gisRows = [{ body_id: 'hcmud_489' }]
      mocks.nearRows = [{ body_id: 'hcmud_489', inside: true }]
      const body = await (await POST(request())).json()
      expect(body.match).toBe('census')
      const mud = body.bodies.find((b: { id: string }) => b.id === 'hcmud_489')
      expect(mud).toMatchObject({ verified: false, source_kind: 'gis', map_match: 'inside' })
      expect(mocks.rpcRows).toHaveBeenCalledWith('lookup_boundary_near', { p_longitude: -95.36, p_latitude: 29.72, p_meters: 50 })
    })

    it('lists a water district near the point as "may be in" and drops other near boundaries', async () => {
      censusOnly()
      mocks.nearRows = [{ body_id: 'hcmud_489', inside: false }, { body_id: 'houston_city_council', inside: false }]
      const body = await (await POST(request())).json()
      const ids = body.bodies.map((b: { id: string }) => b.id)
      expect(body.bodies.find((b: { id: string }) => b.id === 'hcmud_489')).toMatchObject({ verified: false, map_match: 'near' })
      expect(ids).not.toContain('houston_city_council')
    })

    it('uses the map ISD over the Census school-district hint', async () => {
      censusOnly({ schoolDistrict: 'Houston Independent School District' })
      mocks.gisRows = [{ body_id: 'katy_isd_board' }]
      mocks.nearRows = [{ body_id: 'katy_isd_board', inside: true }]
      const body = await (await POST(request())).json()
      const ids = body.bodies.map((b: { id: string }) => b.id)
      expect(ids).toContain('katy_isd_board')
      expect(ids).not.toContain('hisd_board')
      expect(body.uncovered.map((u: { key: string }) => u.key)).not.toContain('census:hisd_board')
    })

    it('skips the near check when HCAD has the address', async () => {
      setupMatchedLookup()
      mocks.geocodeCensus.mockResolvedValueOnce(mocks.censusResult as never)
      const body = await (await POST(request())).json()
      expect(body.match).toBe('hcad')
      expect(mocks.rpcRows).not.toHaveBeenCalledWith('lookup_boundary_near', expect.anything())
      expect(body.bodies.every((b: { map_match?: string }) => b.map_match === undefined)).toBe(true)
    })
  })

  it('reads the packed HCAD tables first and skips the old ones when they answer', async () => {
    setupMatchedLookup()
    mocks.packedRows = [parcel({ account: null, longitude: null, latitude: null })]
    mocks.parcelRows = []
    mocks.geocodeCensus.mockResolvedValueOnce(mocks.censusResult as never)
    const body = await (await POST(request())).json()
    expect(body.match).toBe('hcad')
    expect(mocks.rpcRows).toHaveBeenCalledWith('lookup_hcad_packed', { p_site_address_norm: '123 MAIN ST' })
    expect(mocks.rpcRows).not.toHaveBeenCalledWith('lookup_hcad_parcel', expect.anything())
  })
})
