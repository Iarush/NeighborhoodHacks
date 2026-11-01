// P1 contract for POST /api/lookup (Technical_Implementation_Plan.md section 3).

import type { BodyType } from './bodyTypes'

export type LookupRequest = { address: string }

export type LookupErrorCode = 'invalid_address' | 'not_found' | 'outside_harris' | 'rate_limited' | 'server_error'

export type LookupBody = {
  id: string
  name: string
  type: BodyType | null
  category: 'tracked' | 'ballot_list' | 'not_government' | 'regional_coming_soon'
  elected_or_appointed: string | null
  description: string | null
  meeting_info_url: string | null
  /** True only when the authoritative jurisdiction source supports this body assignment. */
  verified: boolean
  source_kind: 'hcad' | 'gis' | 'census' | 'manual' | null
  /**
   * Census matches only: a water district or ISD found on the district map instead of a tax record.
   * "inside": the address is inside its boundary. "near": within ~50 m of its edge, so it may be in.
   */
  map_match?: 'inside' | 'near'
  /** Source link for the displayed tax rate only; jurisdiction evidence is identified by source_kind. */
  tax_source_url: string | null
  tax_rate: number | null
  tax_year: number | null
  last_vote_date: string | null
}

export type LookupBallotOffice = {
  id: string
  body_id: string | null
  office_name: string | null
  holder_name: string | null
  next_election_date: string | null
  source_url: string | null
}

export type LookupHoa = {
  subdivision_name: string
  hoa_body_id: string | null
  master_hoa_body_id: string | null
  source_url: string | null
  association_verified: boolean
  /** Address-to-subdivision extraction is heuristic; the resident still confirms the candidate. */
  status: 'needs_confirmation'
}

/** A government on this address that ShowUp doesn't track yet, listed by its official name. Never in bodies_token. */
export type LookupUncovered = {
  /** Stable list key, e.g. "hcad:043" or "census:katy_isd_board". */
  key: string
  name: string
  /** Best-fit type, so the "Who governs you?" quiz still counts it ("other" when unsure). */
  type: BodyType
  source_kind: 'hcad' | 'census'
}

export type LookupResponse = {
  /** Signed list of body IDs (lib/tokens.ts). No address or coordinates. */
  bodies_token: string
  /**
   * "hcad": the address matched an HCAD parcel, and bodies are confirmed from its tax codes.
   * "census": no HCAD parcel is loaded for this address, so bodies come from the Census answer
   * and aren't confirmed (MUDs and other districts can't be known this way).
   */
  match: 'hcad' | 'census'
  bodies: LookupBody[]
  /** Governments on this address that ShowUp doesn't track yet. */
  uncovered: LookupUncovered[]
  ballot: LookupBallotOffice[]
  not_government: LookupBody[]
  regional: LookupBody[]
  hoa: LookupHoa | null
}

export type LookupErrorResponse = { error: { code: LookupErrorCode; message: string } }

/** HTTP status for each error code. */
export const LOOKUP_ERROR_STATUS: Record<LookupErrorCode, number> = {
  invalid_address: 400,
  not_found: 404,
  outside_harris: 422,
  rate_limited: 429,
  server_error: 500,
}
