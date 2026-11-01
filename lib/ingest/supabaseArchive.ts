import type { SupabaseClient } from '@supabase/supabase-js';
import { db as typedDb } from '@/lib/db';
import { STUB_PATCH, type ArchivableItem, type ArchiveStore } from './archive';

// Untyped until lib/database.types.ts is regenerated with migration 20261028210000's columns.
const db = () => typedDb() as unknown as SupabaseClient;

// ArchiveStore on Supabase (service-role client, server-only). Both buckets are private
// (migration 20261028210000), so only this server key reads or writes them.

function check<T>(what: string, r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}

export const supabaseArchiveStore: ArchiveStore = {
  async itemsToArchive(before, limit) {
    type Row = Record<string, unknown> & { id: string; body_id: string | null; meeting: { date: string } | null };
    const rows = check(
      'items',
      await db()
        .from('items')
        .select('*, meeting:meetings!inner(date)')
        .is('archive_path', null)
        .lt('meeting.date', before.toISOString())
        .order('id')
        .limit(limit),
    ) as unknown as Row[];
    return rows.map(({ meeting, ...item }): ArchivableItem => ({ ...item, meeting_date: meeting!.date }));
  },

  async download(bucket, path) {
    const { data, error } = await db().storage.from(bucket).download(path);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  },

  async upload(bucket, path, body) {
    const { error } = await db().storage.from(bucket).upload(path, body, { contentType: 'application/gzip', upsert: true });
    if (error) throw new Error(`storage ${bucket}: ${error.message}`);
  },

  async stubItems(ids, path) {
    check('item_perspectives', await db().from('item_perspectives').delete().in('item_id', ids));
    check('items', await db().from('items').update({ ...STUB_PATCH, archive_path: path }).in('id', ids));
  },

  async expiredText(before, limit) {
    const rows = check(
      'documents',
      await db().from('documents').select('id, storage_path').not('storage_path', 'is', null).lt('fetched_at', before.toISOString()).limit(limit),
    );
    return (rows ?? []) as { id: string; storage_path: string }[];
  },

  async remove(bucket, paths) {
    const { error } = await db().storage.from(bucket).remove(paths);
    if (error) throw new Error(`storage ${bucket}: ${error.message}`);
  },

  async clearStoragePath(ids) {
    check('documents', await db().from('documents').update({ storage_path: null }).in('id', ids));
  },
};
