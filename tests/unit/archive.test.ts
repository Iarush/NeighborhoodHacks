import { describe, expect, it } from 'vitest';
import {
  ARCHIVE_BUCKET,
  TEXT_BUCKET,
  archivePath,
  gunzipJson,
  loadArchivedItem,
  monthsBefore,
  runArchive,
  textPath,
  type ArchivableItem,
  type ArchiveStore,
} from '@/lib/ingest/archive';

function memoryArchive(items: ArchivableItem[], texts: { id: string; storage_path: string; fetched_at: string }[] = []) {
  const files = new Map<string, Uint8Array>();
  const stubbed = new Map<string, string>();
  const removed: string[] = [];
  let failUpload = false;
  const store: ArchiveStore = {
    async itemsToArchive(before, limit) {
      return items.filter((i) => !stubbed.has(i.id) && Date.parse(i.meeting_date) < before.getTime()).slice(0, limit);
    },
    async download(bucket, path) {
      return files.get(`${bucket}/${path}`) ?? null;
    },
    async upload(bucket, path, body) {
      if (failUpload) throw new Error('storage down');
      files.set(`${bucket}/${path}`, body);
    },
    async stubItems(ids, path) {
      for (const id of ids) stubbed.set(id, path);
    },
    async expiredText(before) {
      return texts.filter((t) => Date.parse(t.fetched_at) < before.getTime() && !removed.includes(t.storage_path));
    },
    async remove(bucket, paths) {
      removed.push(...paths.map((p) => `${bucket}/${p}`));
    },
    async clearStoragePath() {},
  };
  return { store, files, stubbed, removed, failUploads: () => (failUpload = true) };
}

const item = (id: string, body_id: string, meeting_date: string): ArchivableItem => ({ id, body_id, meeting_date, title: `Item ${id}`, description: 'full text' });
const NOW = new Date('2026-10-28T12:00:00Z');

describe('item archive (district-coverage plan §2.3)', () => {
  it('archives only items past the 8-month window, one file per body and Houston month', async () => {
    const m = memoryArchive([
      item('a', 'hisd_board', '2026-01-08T00:30:00Z'), // Jan 7 in Houston
      item('b', 'hisd_board', '2026-01-20T18:00:00Z'),
      item('c', 'cfisd_board', '2026-02-10T18:00:00Z'),
      item('d', 'hisd_board', '2026-06-10T18:00:00Z'), // inside the window
    ]);
    const report = await runArchive(m.store, NOW);
    expect(report).toMatchObject({ items_archived: 3, files_written: 2 });
    expect([...m.stubbed.keys()].sort()).toEqual(['a', 'b', 'c']);
    expect(archivePath('hisd_board', '2026-01-08T00:30:00Z')).toBe('items/hisd_board/2026-01.json.gz');
    expect(m.stubbed.get('a')).toBe('items/hisd_board/2026-01.json.gz');
    const file = gunzipJson<ArchivableItem[]>(m.files.get(`${ARCHIVE_BUCKET}/items/hisd_board/2026-01.json.gz`)!);
    expect(file.map((i) => i.id).sort()).toEqual(['a', 'b']);
    expect(await loadArchivedItem(m.store, 'items/hisd_board/2026-01.json.gz', 'b')).toMatchObject({ description: 'full text' });
  });

  it('keeps earlier items when a month is archived over several calls', async () => {
    const m = memoryArchive([item('a', 'hisd_board', '2026-01-10T18:00:00Z')]);
    await runArchive(m.store, NOW);
    const later = memoryArchive([item('b', 'hisd_board', '2026-01-12T18:00:00Z')]);
    later.files.set(`${ARCHIVE_BUCKET}/items/hisd_board/2026-01.json.gz`, m.files.get(`${ARCHIVE_BUCKET}/items/hisd_board/2026-01.json.gz`)!);
    await runArchive(later.store, NOW);
    const file = gunzipJson<ArchivableItem[]>(later.files.get(`${ARCHIVE_BUCKET}/items/hisd_board/2026-01.json.gz`)!);
    expect(file.map((i) => i.id).sort()).toEqual(['a', 'b']);
  });

  it('never stubs an item whose archive file failed to upload', async () => {
    const m = memoryArchive([item('a', 'hisd_board', '2026-01-10T18:00:00Z')]);
    m.failUploads();
    await expect(runArchive(m.store, NOW)).rejects.toThrow('storage down');
    expect(m.stubbed.size).toBe(0);
  });

  it('removes stored agenda text after 24 months', async () => {
    const m = memoryArchive([], [
      { id: 'old', storage_path: 'src/old.pdf_text.gz', fetched_at: '2024-09-01T00:00:00Z' },
      { id: 'new', storage_path: 'src/new.pdf_text.gz', fetched_at: '2025-12-01T00:00:00Z' },
    ]);
    const report = await runArchive(m.store, NOW);
    expect(report.texts_removed).toBe(1);
    expect(m.removed).toEqual([`${TEXT_BUCKET}/src/old.pdf_text.gz`]);
    expect(monthsBefore(NOW, 24).toISOString()).toBe('2024-10-28T12:00:00.000Z');
  });

  it('builds safe storage paths for agenda text', () => {
    expect(textPath('houston_city_council', 'ab12/../cd', 'pdf_text')).toBe('houston_city_council/ab12cd.pdf_text.gz');
  });
});
