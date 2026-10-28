import type { Coverage } from "@/lib/perspectives/types"

export type Persona = "student" | "parent" | "renter" | "homeowner" | "voter"

export type BodyKind =
  | "school"
  | "city"
  | "county"
  | "flood"
  | "college"
  | "mud"
  | "health"

export type Topic =
  | "schools"
  | "taxes"
  | "flooding"
  | "streets"
  | "safety"
  | "elections"
  | "budget"
  | "housing"
  | "parks"

/** How loudly an update reaches you. */
export type Tier = "urgent" | "digest" | "timeline"

export type UpdateType =
  | "agenda"
  | "decision"
  | "hearing"
  | "election"
  | "meeting"
  | "deadline"

export interface Body {
  id: string
  name: string
  short: string
  kind: BodyKind
  /** One-line plain-language description */
  tagline: string
  /** Things this body controls, in plain language */
  controls: string[]
  /** How members get the job */
  selection: string
  seats: string
  meets: string
  location: string
  commentRules: string
  /** Approx. property tax rate, $ per $100 of value */
  taxRate?: number
  /** Votes cast in last election, if it holds elections */
  lastTurnout?: { year: number; votes: number; eligible: number }
  /** Your specific seat/district within this body */
  yourSeat?: string
  website: string
  /** False when we don't read this body's agendas yet (real data only; unset for the demo). */
  agendasRead?: boolean
}

export interface Update {
  id: string
  bodyId: string
  type: UpdateType
  tier: Tier
  topic: Topic
  /** ISO date of the event itself (meeting/decision/election day) */
  date: string
  /** ISO date the update was posted */
  posted: string
  title: string
  summary: string
  /** Optional detail paragraphs for the full story */
  detail?: string[]
  /** Persona-specific "why this matters to you" lines */
  why: Partial<Record<Persona, string>> & { default: string }
  /** Who this matters to most; empty means everyone */
  audiences: Persona[]
  /** For decisions */
  vote?: string
  /** For comment-able agenda items */
  comment?: {
    deadline: string
    howTo: string
    /** Null until an official allocation is verified; never substitute a rehearsal target. */
    minutes: number | null
  }
  numbers?: { label: string; value: string }[]
  source: string
  /** Real items only: the story was written with AI and must carry AI_LABEL (lib/stories/types.ts). */
  aiWritten?: boolean
  /** Real items only: the item's own page. */
  itemPath?: string
  /** Real items with no story yet: the official title's document type ("Ordinance", "Resolution"). */
  docKind?: string
  /** Real items with no story yet, when the card headline is shortened: the full official title. */
  officialTitle?: string
  /** Real items only: "What news coverage says" (perspectives spec §7). */
  coverage?: Coverage | null
  /** Real items only: the meeting happened but the minutes aren't posted ("Outcome not posted yet"). */
  outcomePending?: boolean
  /** Real meeting metadata for P4; unknown/special sessions require specific instructions. */
  meetingType?: "regular" | "special" | null
  agendaNumber?: string | null
}

export interface Jurisdiction {
  zip: string
  area: string
  city: "houston" | null
  councilDistrict?: string
  county: "harris" | "fortbend"
  precinct: string
  isd: string
  college: string
  mud?: string
  watershed: string
}

export interface Profile {
  name: string
  address: string
  zip: string
  personas: Persona[]
  age?: number
  birthdate?: string
  demo?: boolean
  /** Civic checklist steps completed */
  done?: ("alerts" | "brief" | "comment" | "registration" | "practice")[]
  sms?: {
    phone: string
    urgent: boolean
    reminders: boolean
    parentPhone?: string
    parentConsent?: "pending" | "granted"
  }
}
