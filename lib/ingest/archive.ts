import { gunzipSync, gzipSync } from 'node:zlib';

// Database packing (district-coverage plan §2.2–2.4). Items stay whole for ITEM_HOT_MONTHS after
// their meeting; then a body's items for one month go to a gzipped JSON file in the private
// `item-archive` bucket and each row becomes a stub. Stored agenda text is deleted after
// TEXT_RETENTION_MONTHS (the source URL stays on the row). Storage is reached through ArchiveStore,
// so the plan's logic is tested without a database.

export const ITEM_HOT_MONTHS = 8;
export const TEXT_RETENTION_MONTHS = 24;
export const ARCHIVE_BUCKET = 'item-archive';
export const TEXT_BUCKET = 'agenda-text';
/** Items archived per call, so one call stays well inside the route's time limit. */
export const ARCHIVE_BATCH = 500;

/** The columns a stub keeps (plan §2.3). Everything else is cleared or reset to its default. */
export const STUB_PATCH = {
  section: null,
  description: null,
  matter_type: null,
  item_type: null,
  rule_fired: null,
  source_quote: null,
  amounts: [],
  attachments: [],
  story_en: null,
  story_es: null,
  needs_story: false,
} as const;

export type ArchivableItem = { id: string; body_id: string | null; meeting_date: string } & Record<string, unknown>;

export interface ArchiveStore {
  /** Items whose meeting is before `before` and that aren't archived yet, oldest first. */
  itemsToArchive(before: Date, limit: number): Promise<ArchivableItem[]>;
  download(bucket: string, path: string): Promise<Uint8Array | null>;
  upload(bucket: string, path: string, body: Uint8Array): Promise<void>;
  /** Turns these items into stubs pointing at `path`, and deletes their perspectives. */
  stubItems(ids: string[], path: string): Promise<void>;
  /** Documents whose stored text was fetched before `before`. */
  expiredText(before: Date, limit: number): Promise<{ id: string; storage_path: string }[]>;
  remove(bucket: string, paths: string[]): Promise<void>;
  clearStoragePath(ids: string[]): Promise<void>;
}

export const monthsBefore = (now: Date, months: number) => {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
};

/** The meeting's month in Houston time, e.g. "2026-02". */
export const chicagoMonth = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit' }).format(new Date(iso));

/** One archive file per body and month: items/<body>/<yyyy-mm>.json.gz. */
export const archivePath = (bodyId: string | null, iso: string) => `items/${bodyId ?? 'no_body'}/${chicagoMonth(iso)}.json.gz`;

export const gzipJson = (value: unknown) => new Uint8Array(gzipSync(JSON.stringify(value)));
export const gunzipJson = <T>(bytes: Uint8Array) => JSON.parse(gunzipSync(bytes).toString('utf8')) as T;

export type ArchiveReport = { items_archived: number; files_written: number; texts_removed: number };

export async function runArchive(store: ArchiveStore, now: Date): Promise<ArchiveReport> {
  const items = await store.itemsToArchive(monthsBefore(now, ITEM_HOT_MONTHS), ARCHIVE_BATCH);
  const groups = new Map<string, ArchivableItem[]>();
  for (const item of items) {
    const path = archivePath(item.body_id, item.meeting_date);
    groups.set(path, [...(groups.get(path) ?? []), item]);
  }
  for (const [path, group] of groups) {
    // A month can be archived over several calls; earlier items in the file are kept.
    const existing = await store.download(ARCHIVE_BUCKET, path);
    const byId = new Map<string, ArchivableItem>((existing ? gunzipJson<ArchivableItem[]>(existing) : []).map((i) => [i.id, i]));
    for (const item of group) byId.set(item.id, item);
    await store.upload(ARCHIVE_BUCKET, path, gzipJson([...byId.values()]));
    // Stub only after the file is written, so a failed upload loses nothing.
    await store.stubItems(group.map((i) => i.id), path);
  }

  const expired = await store.expiredText(monthsBefore(now, TEXT_RETENTION_MONTHS), ARCHIVE_BATCH);
  if (expired.length) {
    await store.remove(TEXT_BUCKET, expired.map((d) => d.storage_path));
    await store.clearStoragePath(expired.map((d) => d.id));
  }
  return { items_archived: items.length, files_written: groups.size, texts_removed: expired.length };
}

/** The full item from its archive file, for pages that open an archived stub. */
export async function loadArchivedItem(store: Pick<ArchiveStore, 'download'>, path: string, id: string): Promise<ArchivableItem | null> {
  const bytes = await store.download(ARCHIVE_BUCKET, path);
  return bytes ? (gunzipJson<ArchivableItem[]>(bytes).find((i) => i.id === id) ?? null) : null;
}

/** Where a document's raw text is stored: agenda-text/<source>/<hash>.<kind>.gz. */
export const textPath = (sourceId: string, contentHash: string, kind: string) =>
  `${sourceId.replace(/[^a-z0-9_-]/gi, '_')}/${contentHash.replace(/[^a-z0-9]/gi, '')}.${kind}.gz`;

/** Stop lines from plan §2.5: pause the rollout and look for the cause past these. */
export const DATABASE_STOP_BYTES = 400 * 1024 * 1024;
export const STORAGE_STOP_BYTES = 800 * 1024 * 1024;

export const megabytes = (bytes: number) => Math.round(bytes / (1024 * 1024));
