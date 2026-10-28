import { db } from '@/lib/db';
import { chunked, fetchAllPages } from '@/lib/paging';
import type { BodySeed } from './bodies';
import type {
  BodyFacts,
  DocumentWrite,
  IngestStore,
  ItemWrite,
  MeetingWrite,
  ResultsCandidate,
  SourcePatch,
  SourceSeed,
  StoredDocument,
  StoredItem,
  StoredMeeting,
  TaxRateRow,
} from './store';

// The IngestStore backed by Supabase (service-role client, server-only). Reads page past
// PostgREST's 1,000-row limit, and writes go in chunks so one request never gets too large.

const CHUNK = 500;
/** Documents carry up to 1 MB of raw text each, so they're sent in batches of about this many characters. */
const DOCUMENT_BATCH_CHARS = 3_000_000;

type Result<T> = { data: T[] | null; error: { message: string } | null };

function check<T>(table: string, r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${table}: ${r.error.message}`);
  return r.data;
}

async function all<T>(table: string, page: (from: number, to: number) => PromiseLike<Result<T>>): Promise<T[]> {
  try {
    return await fetchAllPages(page, { maxPages: 1000 });
  } catch (e) {
    throw new Error(`${table}: ${(e as Error).message}`);
  }
}

const chunks = <T>(rows: T[]) => chunked(rows, CHUNK);

export const supabaseIngestStore: IngestStore = {
  async ensureBodies(rows: readonly BodySeed[]) {
    check('bodies', await db().from('bodies').upsert([...rows], { onConflict: 'id', ignoreDuplicates: true }));
  },

  async syncSources(rows: SourceSeed[]) {
    check('sources', await db().from('sources').upsert(rows, { onConflict: 'id' }));
  },

  async listSources() {
    return check('sources', await db().from('sources').select('*').order('id')) ?? [];
  },

  async snapshot(sourceId: string) {
    const source = check('sources', await db().from('sources').select('*').eq('id', sourceId).maybeSingle());
    const meetings = await all<StoredMeeting>('meetings', (a, b) => db().from('meetings').select('*').eq('source_id', sourceId).order('id').range(a, b));
    const items = await all<StoredItem>('items', (a, b) => db().from('items').select('*').eq('source_id', sourceId).order('id').range(a, b));
    const documents = await all<StoredDocument>('documents', (a, b) =>
      db().from('documents').select('url, content_hash').eq('source_id', sourceId).order('fetched_at').order('id').range(a, b),
    );
    return { source, meetings, items, documents };
  },

  async bodies(ids: string[]): Promise<BodyFacts[]> {
    if (!ids.length) return [];
    return check('bodies', await db().from('bodies').select('id, sms_eligible, type').in('id', ids)) ?? [];
  },

  async taxRates(bodyIds: string[]) {
    const out = new Map<string, TaxRateRow>();
    if (!bodyIds.length) return out;
    const rows =
      check(
        'tax_rates',
        await db().from('tax_rates').select('body_id, year, adopted_rate, no_new_revenue_rate, voter_approval_rate').in('body_id', bodyIds).order('year'),
      ) ?? [];
    for (const r of rows) out.set(r.body_id, { adopted_rate: r.adopted_rate, no_new_revenue_rate: r.no_new_revenue_rate, voter_approval_rate: r.voter_approval_rate });
    return out;
  },

  async upsertMeetings(rows: MeetingWrite[]) {
    const out: { id: string; external_id: string }[] = [];
    for (const part of chunks(rows)) {
      out.push(...(check('meetings', await db().from('meetings').upsert(part, { onConflict: 'source_id,external_id' }).select('id, external_id')) ?? []));
    }
    return out;
  },

  async upsertItems(rows: ItemWrite[]) {
    for (const part of chunks(rows)) check('items', await db().from('items').upsert(part, { onConflict: 'source_id,external_id' }));
  },

  async insertDocuments(rows: DocumentWrite[]) {
    let batch: DocumentWrite[] = [];
    let size = 0;
    const flush = async () => {
      if (batch.length) check('documents', await db().from('documents').insert(batch));
      batch = [];
      size = 0;
    };
    for (const d of rows) {
      const n = d.raw?.length ?? 0;
      if (batch.length && size + n > DOCUMENT_BATCH_CHARS) await flush();
      batch.push(d);
      size += n;
    }
    await flush();
  },

  async updateSource(id: string, patch: SourcePatch) {
    check('sources', await db().from('sources').update(patch).eq('id', id));
  },

  async markResultsChecked(meetingIds: string[], at: string) {
    for (const part of chunks(meetingIds)) check('meetings', await db().from('meetings').update({ last_results_check: at }).in('id', part));
  },

  async resultsCandidates(now: Date) {
    type Row = { meeting: { id: string; external_id: string; source_id: string; date: string; last_results_check: string | null } | null };
    const rows = await all<Row>('items', (a, b) =>
      db()
        .from('items')
        .select('meeting:meetings!inner(id, external_id, source_id, date, last_results_check)')
        .eq('status', 'awaiting_result')
        .is('removed_at', null)
        .lt('meeting.date', now.toISOString())
        .order('id')
        .range(a, b) as unknown as PromiseLike<Result<Row>>,
    );
    const byMeeting = new Map<string, ResultsCandidate>();
    for (const r of rows) {
      const m = r.meeting;
      if (m && !byMeeting.has(m.id))
        byMeeting.set(m.id, { source_id: m.source_id, meeting_id: m.id, external_id: m.external_id, date: m.date, last_results_check: m.last_results_check });
    }
    return [...byMeeting.values()];
  },

  async sourcesWithMeetingsBetween(from: Date, to: Date) {
    const rows = await all<{ source_id: string }>('meetings', (a, b) =>
      db().from('meetings').select('source_id').gte('date', from.toISOString()).lte('date', to.toISOString()).order('id').range(a, b),
    );
    return [...new Set(rows.map((r) => r.source_id))].sort();
  },
};
