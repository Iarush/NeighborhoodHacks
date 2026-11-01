import { normalizeHcadAddress } from './normalize'
import { subdivisionFromLegalDescription } from './hoa'

export type HcadParcelStage = {
  account: string
  site_address_norm: string
  legal_description: string | null
  longitude: number | null
  latitude: number | null
  jurisdiction_codes: string[]
}

export type HcadStageResult = {
  parcels: HcadParcelStage[]
  ambiguousAddressCount: number
  unmappedCodes: string[]
}

function parseCsv(text: string, label: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const input = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < input.length; i++) {
    const char = input[i]!
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i++ }
      else if (char === '"') quoted = false
      else field += char
    } else if (char === '"' && field.length === 0) quoted = true
    else if (char === '"') throw new Error(`${label} contains a malformed quoted field.`)
    else if (char === ',') { row.push(field); field = '' }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((cell) => cell.trim())) rows.push(row)
      row = []
    } else field += char
  }
  if (quoted) throw new Error(`${label} has an unclosed quoted field.`)
  row.push(field)
  if (row.some((cell) => cell.trim())) rows.push(row)
  if (rows.length === 0) throw new Error(`${label} is empty.`)
  return rows
}

function records(text: string, label: string, columns: readonly string[]): Array<Record<string, string>> {
  const rows = parseCsv(text, label)
  const header = rows[0]!.map((value) => value.trim().toLowerCase())
  for (const column of columns) if (!header.includes(column)) throw new Error(`${label} is missing required column: ${column}.`)
  return rows.slice(1).map((cells, index) => {
    if (cells.length !== header.length) throw new Error(`${label} row ${index + 2} has the wrong number of columns.`)
    return Object.fromEntries(header.map((key, columnIndex) => [key, cells[columnIndex]!.trim()]))
  })
}

const inHarrisBounds = (longitude: number, latitude: number) => longitude >= -96 && longitude <= -94.8 && latitude >= 29.4 && latitude <= 30.2

/** Parses the sanitized, normalized staging contract; never logs or returns row values in errors. */
export function parseHcadStaging(parcelCsv: string, jurisdictionCsv: string, mappedCodes: ReadonlySet<string>): HcadStageResult {
  const parcels = records(parcelCsv, 'Parcel staging CSV', ['account', 'site_address_norm', 'legal_description', 'longitude', 'latitude'])
  const jurisdictionRows = records(jurisdictionCsv, 'Jurisdiction staging CSV', ['account', 'hcad_code'])
  const jurisdictionByAccount = new Map<string, Set<string>>()
  const knownAccounts = new Set<string>()

  for (const row of parcels) {
    const account = row.account!
    const address = normalizeHcadAddress(row.site_address_norm!)
    if (!/^\d{6,25}$/.test(account) || !address) throw new Error('Parcel staging CSV contains an invalid account or address.')
    if (knownAccounts.has(account)) throw new Error('Parcel staging CSV contains a duplicate account.')
    knownAccounts.add(account)
    const lonText = row.longitude!
    const latText = row.latitude!
    if (Boolean(lonText) !== Boolean(latText)) throw new Error('A parcel coordinate must include both longitude and latitude.')
    if (lonText) {
      const longitude = Number(lonText)
      const latitude = Number(latText)
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || !inHarrisBounds(longitude, latitude)) {
        throw new Error('Parcel staging CSV contains coordinates outside the Harris County bounds.')
      }
    }
  }

  for (const row of jurisdictionRows) {
    const account = row.account!
    const code = row.hcad_code!
    if (!knownAccounts.has(account) || !/^\d{3,6}$/.test(code)) throw new Error('Jurisdiction staging CSV contains an invalid account or code.')
    const codes = jurisdictionByAccount.get(account) ?? new Set<string>()
    codes.add(code)
    jurisdictionByAccount.set(account, codes)
  }

  const accountsByAddress = new Map<string, number>()
  for (const row of parcels) {
    const address = normalizeHcadAddress(row.site_address_norm!)
    accountsByAddress.set(address, (accountsByAddress.get(address) ?? 0) + 1)
  }
  const ambiguousAddressCount = [...accountsByAddress.values()].filter((count) => count > 1).length
  const parsed = parcels.map((row) => {
    const address = normalizeHcadAddress(row.site_address_norm!)
    const codes = [...(jurisdictionByAccount.get(row.account!) ?? [])].sort()
    return {
      account: row.account!,
      site_address_norm: address,
      legal_description: row.legal_description || null,
      longitude: row.longitude ? Number(row.longitude) : null,
      latitude: row.latitude ? Number(row.latitude) : null,
      jurisdiction_codes: codes,
    }
  })
  const unmappedCodes = [...new Set(parsed.flatMap((parcel) => parcel.jurisdiction_codes).filter((code) => !mappedCodes.has(code)))].sort()
  return { parcels: parsed, ambiguousAddressCount, unmappedCodes }
}

export type HcadLoadPlan = {
  parcels: HcadParcelStage[]
  /** Parcels with no tax codes at all; left out so the lookup uses the Census answer for them. */
  skippedWithoutCodes: number
  /** Street addresses shared by several accounts (condos); the lookup accepts them when their codes match. */
  sharedAddressCount: number
  /** Codes with no curated body; the lookup lists them by HCAD's official name. */
  unmappedCodes: string[]
}

/** What to load from a validated stage. Shared addresses and unmapped codes no longer block a load. */
export function planHcadLoad(stage: HcadStageResult): HcadLoadPlan {
  const parcels = stage.parcels.filter((parcel) => parcel.jurisdiction_codes.length > 0)
  return {
    parcels,
    skippedWithoutCodes: stage.parcels.length - parcels.length,
    sharedAddressCount: stage.ambiguousAddressCount,
    unmappedCodes: stage.unmappedCodes,
  }
}

/** One packed row per street address and code set (district-coverage plan §2.1). */
export type HcadPackedRow = {
  address: string
  codes: string[]
  subdivision: string | null
}

/**
 * Packs a load plan for load_hcad_packed_batch: condo accounts that share an address and a code set
 * become one row, and only the subdivision is kept from the legal description. Accounts and
 * coordinates are dropped. The database hashes the address; its text is never stored.
 */
export function packHcadLoad(plan: HcadLoadPlan): HcadPackedRow[] {
  const rows = new Map<string, HcadPackedRow>()
  for (const parcel of plan.parcels) {
    const codes = [...new Set(parcel.jurisdiction_codes)].sort()
    const key = `${parcel.site_address_norm}|${codes.join(',')}`
    const subdivision = subdivisionFromLegalDescription(parcel.legal_description)
    const existing = rows.get(key)
    if (!existing) rows.set(key, { address: parcel.site_address_norm, codes, subdivision })
    else if (!existing.subdivision && subdivision) existing.subdivision = subdivision
  }
  return [...rows.values()]
}
