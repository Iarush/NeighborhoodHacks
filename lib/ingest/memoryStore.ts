import type { Tables } from '@/lib/database.types';
import type { BodySeed } from './bodies';
import type {
  DocumentWrite,
  IngestStore,
  ItemWrite,
  MeetingWrite,
  ResultsCandidate,
  SourcePatch,
  SourceSeed,
  TaxRateRow,
} from './store';

// An in-memory IngestStore for tests. It enforces the same unique keys as the database,
// hands out predictable IDs and logs every write, so tests can assert "the second run wrote nothing".

export type MemoryWrite = { table: 'bodies' | 'sources' | 'meetings' | 'items' | 'documents'; op: 'insert' | 'upsert' | 'update'; n: number };

export type MemoryStore = IngestStore & {
  tables: {
    bodies: Tables<'bodies'>[];
    sources: Tables<'sources'>[];
    meetings: Tables<'meetings'>[];
    items: Tables<'items'>[];
    documents: Tables<'documents'>[];
    tax_rates: Tables<'tax_rates'>[];
  };
  writes: MemoryWrite[];
  resetWrites(): void;
};

const key = (sourceId: string, externalId: string) => `${sourceId}\u0000${externalId}`;

function assertUnique(rows: { source_id: string; external_id: string }[], table: string) {
  const seen = new Set<string>();
  for (const r of rows) {
    const k = key(r.source_id, r.external_id);
    if (seen.has(k)) throw new Error(`${table}: ON CONFLICT DO UPDATE command cannot affect row a second time (${r.external_id})`);
    seen.add(k);
  }
}

export function createMemoryStore(): MemoryStore {
  const tables: MemoryStore['tables'] = { bodies: [], sources: [], meetings: [], items: [], documents: [], tax_rates: [] };
  const writes: MemoryWrite[] = [];
  const log = (table: MemoryWrite['table'], op: MemoryWrite['op'], n: number) => {
    if (n > 0) writes.push({ table, op, n });
  };
  let nextId = 1;
  const id = (prefix: string) => `${prefix}-${nextId++}`;
  const clone = <T>(v: T): T => structuredClone(v);

  return {
    tables,
    writes,
    resetWrites() {
      writes.length = 0;
    },

    async ensureBodies(rows: readonly BodySeed[]) {
      let n = 0;
      for (const b of rows) {
        if (tables.bodies.some((x) => x.id === b.id)) continue;
        tables.bodies.push({
          ...b,
          elected_or_appointed: null,
          impact_rank: null,
          description_en: null,
          description_es: null,
          meeting_info_url: null,
          tax_set_by_body_id: null,
          operations_by_body_id: null,
          regulated_by: null,
          operator_name: null,
        });
        n++;
      }
      log('bodies', 'insert', n);
    },

    async syncSources(rows: SourceSeed[]) {
      for (const s of rows) {
        const existing = tables.sources.find((x) => x.id === s.id);
        if (existing) Object.assign(existing, clone(s));
        else
          tables.sources.push({
            ...clone(s),
            last_checked: null,
            last_success: null,
            last_flags: [],
            last_error: null,
            comment_rules_hash: null,
            comment_rules_text: null,
          });
      }
      log('sources', 'upsert', rows.length);
    },

    async listSources() {
      return clone(tables.sources);
    },

    async snapshot(sourceId: string) {
      return clone({
        source: tables.sources.find((s) => s.id === sourceId) ?? null,
        meetings: tables.meetings.filter((m) => m.source_id === sourceId),
        items: tables.items.filter((i) => i.source_id === sourceId),
        documents: tables.documents.filter((d) => d.source_id === sourceId).map((d) => ({ url: d.url, content_hash: d.content_hash })),
      });
    },

    async bodies(ids: string[]) {
      return tables.bodies.filter((b) => ids.includes(b.id)).map((b) => ({ id: b.id, sms_eligible: b.sms_eligible, type: b.type }));
    },

    async taxRates(bodyIds: string[]) {
      const out = new Map<string, TaxRateRow>();
      const sorted = [...tables.tax_rates].sort((a, b) => a.year - b.year);
      for (const r of sorted) {
        if (bodyIds.includes(r.body_id)) {
          out.set(r.body_id, { adopted_rate: r.adopted_rate, no_new_revenue_rate: r.no_new_revenue_rate, voter_approval_rate: r.voter_approval_rate });
        }
      }
      return out;
    },

    async upsertMeetings(rows: MeetingWrite[]) {
      assertUnique(rows, 'meetings');
      const out: { id: string; external_id: string }[] = [];
      for (const w of rows) {
        let existing = tables.meetings.find((m) => m.source_id === w.source_id && m.external_id === w.external_id);
        if (existing) Object.assign(existing, clone(w));
        else {
          existing = { ...clone(w), id: id('meeting'), last_results_check: null };
          tables.meetings.push(existing);
        }
        out.push({ id: existing.id, external_id: existing.external_id });
      }
      log('meetings', 'upsert', rows.length);
      return out;
    },

    async upsertItems(rows: ItemWrite[]) {
      assertUnique(rows, 'items');
      for (const w of rows) {
        const existing = tables.items.find((i) => i.source_id === w.source_id && i.external_id === w.external_id);
        if (existing) Object.assign(existing, clone(w));
        else
          tables.items.push({
            ...clone(w),
            id: id('item'),
            story_en: null,
            story_es: null,
            story_source: null,
            reviewed_at: null,
            reviewed_by: null,
          });
      }
      log('items', 'upsert', rows.length);
    },

    async insertDocuments(rows: DocumentWrite[]) {
      for (const d of rows) tables.documents.push({ ...clone(d), id: id('document') });
      log('documents', 'insert', rows.length);
    },

    async updateSource(sourceId: string, patch: SourcePatch) {
      const s = tables.sources.find((x) => x.id === sourceId);
      if (!s) return;
      Object.assign(s, clone(patch));
      log('sources', 'update', 1);
    },

    async markResultsChecked(meetingIds: string[], at: string) {
      let n = 0;
      for (const m of tables.meetings) {
        if (meetingIds.includes(m.id)) {
          m.last_results_check = at;
          n++;
        }
      }
      log('meetings', 'update', n);
    },

    async resultsCandidates(now: Date) {
      const out: ResultsCandidate[] = [];
      for (const m of tables.meetings) {
        if (Date.parse(m.date) >= now.getTime()) continue;
        const waiting = tables.items.some((i) => i.meeting_id === m.id && !i.removed_at && i.status === 'awaiting_result');
        if (waiting) out.push({ source_id: m.source_id, meeting_id: m.id, external_id: m.external_id, date: m.date, last_results_check: m.last_results_check });
      }
      return out;
    },

    async sourcesWithMeetingsBetween(from: Date, to: Date) {
      const ids = tables.meetings
        .filter((m) => Date.parse(m.date) >= from.getTime() && Date.parse(m.date) <= to.getTime())
        .map((m) => m.source_id);
      return [...new Set(ids)].sort();
    },
  };
}
