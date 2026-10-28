import type { BodyType } from "@/lib/contracts/bodyTypes"
import type { Stake } from "@/lib/stakes"
import type { Deadline, Lang, WeeklyEdition, WeeklyItem } from "@/lib/weekly/build"
import { agendaHeadline } from "@/lib/weekly/agendaTitle"
import type { WeeklyBody } from "@/lib/weekly/data"
import { STATIC_BODIES } from "./bodies"
import type { Body, BodyKind, Persona, Tier, Topic, Update, UpdateType } from "./types"
import { getRecipe } from '@/lib/registration/recipes'

// Turns real data (the reader's bodies_token and P3's items, lib/weekly) into the shapes the
// /app screens were built on (lib/prototype/types.ts), so each screen can switch from the
// demo data to real data without being rewritten. Pure: no I/O here.

/** What the server hands the /app screens when the reader has looked up their address. */
export type LiveData = {
  /** "db": real items from Supabase. "sample": P3's labeled sample items (no database configured). */
  mode: "db" | "sample"
  bodies: Body[]
  updates: Update[]
  personas: Persona[]
  /** The weekly brief in the plan's order (§10), as update IDs. Built by buildWeekly(). */
  weekly: {
    intro: string
    leadId: string | null
    comingUpIds: string[]
    decidedIds: string[]
    deadlines: Deadline[]
  }
}

const KIND: Partial<Record<BodyType, BodyKind>> = {
  school_board: "school",
  city_council: "city",
  commissioners_court: "county",
  flood_control: "flood",
  college_board: "college",
  mud: "mud",
  water_authority: "mud",
  esd: "county",
  port: "county",
  hcad: "county",
  metro: "city",
}

/**
 * Descriptions the demo already has for real bodies (what each one controls, how it's chosen).
 * Demo-only numbers (tax rate, turnout, "your seat") are dropped: they aren't this reader's.
 */
const DESCRIBED: Record<string, string> = {
  hisd_board: "hisd",
  cfisd_board: "cyfair",
  houston_city_council: "houston-council",
  commissioners_court: "harris-court",
  flood_control: "hcfcd",
  hcc_board: "hcc",
  lone_star_board: "lonestar",
}

const TOPIC: Partial<Record<BodyKind, Topic>> = { school: "schools", college: "schools", flood: "flooding" }
const ITEM_TOPIC: Partial<Record<WeeklyItem["item_type"], Topic>> = {
  tax: "taxes",
  bond: "taxes",
  property: "taxes",
  election: "elections",
  leader: "elections",
  school: "schools",
  budget: "budget",
  zoning: "housing",
  transit: "streets",
  water_rate: "budget",
}

const TIER: Record<WeeklyItem["tier"], Tier> = { sms: "urgent", weekly: "digest", timeline: "timeline" }

const VOTE: Record<string, string> = { passed: "Passed", failed: "Failed", no_action: "No action taken" }
const VOTE_ES: Record<string, string> = { passed: "Aprobado", failed: "Rechazado", no_action: "Sin acción" }

export function toBody(b: WeeklyBody): Body {
  const kind = KIND[b.body_type as BodyType] ?? "county"
  const known = STATIC_BODIES[DESCRIBED[b.body_id] ?? ""]
  return {
    id: b.body_id,
    name: b.body_name,
    short: b.body_name,
    kind,
    tagline: known?.tagline ?? "",
    controls: known?.controls ?? [],
    selection: known?.selection ?? "",
    seats: known?.seats ?? "",
    meets: known?.meets ?? "",
    location: known?.location ?? "",
    commentRules: known?.commentRules ?? "",
    website: known?.website ?? b.meeting_info_url ?? "",
    agendasRead: b.agendas_read,
  }
}

function updateType(i: WeeklyItem): UpdateType {
  if (i.status === "decided") return "decision"
  if (i.item_type === "election") return "election"
  return "agenda"
}

export function toUpdate(i: WeeklyItem, kind: BodyKind = "county", lang: Lang = "en"): Update {
  const story = (lang === "es" ? i.story_es : i.story_en) ?? i.story_en ?? null
  // No story written yet: show the official title trimmed to a card, with the full title as the summary.
  const raw = story ? null : agendaHeadline(i.title)
  return {
    id: i.item_id,
    bodyId: i.body_id,
    type: updateType(i),
    tier: TIER[i.tier],
    topic: ITEM_TOPIC[i.item_type] ?? TOPIC[kind] ?? "budget",
    date: i.meeting_date,
    posted: i.first_seen_at ?? i.meeting_date,
    title: story?.headline ?? raw!.headline,
    // No story: the headline is the official title shortened, and the full title is kept separately
    // (shown collapsed), so the same words never appear twice in a row.
    summary: story?.dek ?? "",
    officialTitle: raw?.trimmed ? i.title : undefined,
    docKind: raw?.kind ?? undefined,
    detail: story?.body_paragraphs,
    // The story's renter line is its "why it matters"; without a story there's nothing to say yet.
    // Without a story there's no "why it matters" yet; the story sheet asks the AI coach to explain instead.
    why: { default: story?.renter_line ?? "" },
    audiences: [],
    vote: i.outcome?.vote_result ? (lang === "es" ? VOTE_ES : VOTE)[i.outcome.vote_result] : undefined,
    outcomePending: i.status === "awaiting_result",
    meetingType: i.meeting_type ?? null,
    agendaNumber: i.agenda_number,
    coverage: i.coverage ?? null,
    comment: i.registration_closes_at
      ? { deadline: i.registration_closes_at, howTo: lang === "es" ? "Consulta la agenda para inscribirte." : "See the agenda for how to sign up.", minutes: getRecipe(i.body_id, i.meeting_type ?? null, i.meeting_date)?.minutes ?? null }
      : undefined,
    source: i.source_url,
    aiWritten: i.story_source === "ai",
    itemPath: `/items/${i.item_id}`,
  }
}

const PERSONAS: Record<Stake, Persona> = { student: "student", parent: "parent", renter: "renter", homeowner: "homeowner" }

export function toLiveData(
  mode: LiveData["mode"],
  bodies: WeeklyBody[],
  items: WeeklyItem[],
  stakes: Stake[],
  edition: WeeklyEdition,
  lang: Lang = "en",
): LiveData {
  const mapped = bodies.map(toBody)
  const kinds = new Map(mapped.map((b) => [b.id, b.kind]))
  const mine = (i: WeeklyItem) => kinds.has(i.body_id)
  return {
    mode,
    bodies: mapped,
    updates: items
      .filter((i) => mine(i) && i.meeting_status !== "cancelled")
      .map((i) => toUpdate(i, kinds.get(i.body_id), lang))
      .sort((a, b) => +new Date(b.posted) - +new Date(a.posted)),
    personas: stakes.map((s) => PERSONAS[s]),
    weekly: {
      intro: edition.intro,
      leadId: edition.lead && mine(edition.lead) ? edition.lead.item_id : null,
      comingUpIds: edition.comingUp.filter(mine).map((i) => i.item_id),
      decidedIds: edition.decided.filter(mine).map((i) => i.item_id),
      deadlines: edition.deadlines,
    },
  }
}
