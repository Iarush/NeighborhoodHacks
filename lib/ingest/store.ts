import type { Json, Tables } from '@/lib/database.types';
import type { AdapterKind } from '@/lib/adapters/types';
import type { BodySeed } from './bodies';

// What the ingest pipeline (run.ts) reads and writes. Two implementations:
// memoryStore.ts for tests and supabaseStore.ts for the real database.

export type StoredSource = Tables<'sources'>;
export type StoredMeeting = Tables<'meetings'>;
export type StoredItem = Tables<'items'>;
export type StoredDocument = { url: string | null; content_hash: string | null };

/** Everything stored for one source: its row, meetings, items (including removed ones) and document hashes. */
export type SourceSnapshot = {
  source: StoredSource | null;
  meetings: StoredMeeting[];
  items: StoredItem[];
  documents: StoredDocument[];
};

export type SourceSeed = {
  id: string;
  body_id: string | null;
  adapter: AdapterKind;
  config: Json;
  expected_max_gap_days: number | null;
  results_max_days: number;
};

/** The meeting columns ingest manages. Every write carries all of them, so batched upserts share one key set. */
export type MeetingWrite = {
  source_id: string;
  external_id: string;
  body_id: string;
  date: string;
  end_date: string | null;
  type: 'regular' | 'special';
  status: 'scheduled' | 'cancelled';
  agenda_url: string | null;
  source_url_es: string | null;
  video_url: string | null;
  minutes_url: string | null;
  comment_rules_text: string | null;
  content_hash: string;
  previous_date: string | null;
  is_demo: boolean;
};

/** The item columns ingest manages. Never story_*, reviewed_* or id (P3 and the review page own those). */
export type ItemWrite = {
  source_id: string;
  external_id: string;
  meeting_id: string;
  body_id: string;
  meeting_body_id: string | null;
  agenda_number: string | null;
  title: string;
  section: string | null;
  description: string | null;
  matter_type: string | null;
  item_type: string | null;
  status: 'upcoming' | 'awaiting_result' | 'decided';
  action: string | null;
  vote_result: 'passed' | 'failed' | 'no_action' | null;
  tier: 'sms' | 'weekly' | 'timeline' | null;
  rule_fired: string | null;
  review_status: 'pending' | 'approved' | 'rejected' | null;
  source_quote: string | null;
  quote_verified: boolean | null;
  amounts: Json;
  attachments: Json;
  contains_private_person: boolean;
  needs_story: boolean;
  source_url: string;
  content_hash: string;
  first_seen_at: string;
  removed_at: string | null;
  is_demo: boolean;
};

export type DocumentWrite = {
  source_id: string;
  url: string;
  content_hash: string;
  kind: 'json' | 'html' | 'pdf_text' | 'llm_output';
  raw: string | null;
  fetched_at: string;
  meeting_external_id: string | null;
};

export type SourcePatch = Partial<Pick<StoredSource, 'last_checked' | 'last_success' | 'last_flags' | 'last_error'>>;

export type BodyFacts = { id: string; sms_eligible: boolean; type: string | null };

export type TaxRateRow = { adopted_rate: number | null; no_new_revenue_rate: number | null; voter_approval_rate: number | null };

/** A past meeting that still has items waiting for an outcome (input to the results recheck). */
export type ResultsCandidate = {
  source_id: string;
  meeting_id: string;
  external_id: string;
  date: string;
  last_results_check: string | null;
};

export interface IngestStore {
  /** Insert-only: rows that already exist are left as they are. */
  ensureBodies(rows: readonly BodySeed[]): Promise<void>;
  /** Mirrors data/sources.yaml. Never touches the last_* columns. */
  syncSources(rows: SourceSeed[]): Promise<void>;
  listSources(): Promise<StoredSource[]>;
  snapshot(sourceId: string): Promise<SourceSnapshot>;
  bodies(ids: string[]): Promise<BodyFacts[]>;
  /** The latest year's rates per body. */
  taxRates(bodyIds: string[]): Promise<Map<string, TaxRateRow>>;
  /** Upsert on (source_id, external_id); returns the row IDs. */
  upsertMeetings(rows: MeetingWrite[]): Promise<{ id: string; external_id: string }[]>;
  /** Upsert on (source_id, external_id). */
  upsertItems(rows: ItemWrite[]): Promise<void>;
  insertDocuments(rows: DocumentWrite[]): Promise<void>;
  updateSource(id: string, patch: SourcePatch): Promise<void>;
  markResultsChecked(meetingIds: string[], at: string): Promise<void>;
  resultsCandidates(now: Date): Promise<ResultsCandidate[]>;
  /** Source IDs with a stored meeting dated in [from, to] (the near-term sweep at scale). */
  sourcesWithMeetingsBetween(from: Date, to: Date): Promise<string[]>;
}
