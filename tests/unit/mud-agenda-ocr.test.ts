import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '@/lib/ingest/memoryStore';
import { OCR_BATCH, ocrQueue, saveOcrResult } from '@/lib/ingest/ocr';
import { meanConfidence } from '@/scripts/ocr-documents';

// mud-code-parser-spec §7 Phase 3: the OCR queue, the result route and the store round trip.

const HASH = 'a'.repeat(64);
const now = new Date('2026-11-04T18:00:00Z');

function storeWithScan(n = 1) {
  const store = createMemoryStore();
  for (let i = 0; i < n; i++) {
    store.tables.documents.push({
      id: `doc-${i}`,
      source_id: 'hcmud_24',
      url: `https://drive.google.com/file/d/${i}/view`,
      content_hash: i === 0 ? HASH : `${i}`.padStart(64, 'b'),
      kind: 'pdf_text',
      raw: '',
      fetched_at: '2026-11-04T12:00:00Z',
      meeting_external_id: null,
      needs_ocr: true,
    });
  }
  return store;
}

describe('OCR queue and results', () => {
  it('hands out at most 15 PDFs, and not the same one again within 24 hours', async () => {
    const store = storeWithScan(20);
    expect(await ocrQueue(store, now)).toHaveLength(OCR_BATCH);
    const second = await ocrQueue(store, new Date(now.getTime() + 3_600_000));
    expect(second.map((j) => j.document_id)).toEqual(['doc-15', 'doc-16', 'doc-17', 'doc-18', 'doc-19']);
    expect(await ocrQueue(store, new Date(now.getTime() + 2 * 3_600_000))).toEqual([]);
    expect(await ocrQueue(store, new Date(now.getTime() + 25 * 3_600_000))).toHaveLength(OCR_BATCH);
  });

  it('stores the text as ocr_text keyed by the PDF hash, clears needs_ocr, and feeds ocrTexts()', async () => {
    const store = storeWithScan();
    const out = await saveOcrResult(store, { document_id: 'doc-0', content_hash: HASH, pages: ['page one', 'page two'], mean_confidence: 92.5 }, now);
    expect(out).toEqual({ status: 200, body: { result: 'saved' } });
    expect(store.tables.documents.find((d) => d.id === 'doc-0')!.needs_ocr).toBe(false);
    expect(store.tables.documents.find((d) => d.kind === 'ocr_text')).toMatchObject({ url: 'https://drive.google.com/file/d/0/view#ocr', content_hash: HASH, raw: 'page one\fpage two' });
    expect(await store.ocrTexts('hcmud_24')).toEqual({ [HASH]: 'page one\fpage two' });
    expect(await ocrQueue(store, new Date(now.getTime() + 25 * 3_600_000))).toEqual([]);
  });

  it('rejects bad bodies, unknown documents, changed PDFs; keeps needs_ocr on empty text', async () => {
    const store = storeWithScan();
    expect((await saveOcrResult(store, { document_id: 'doc-0' }, now)).status).toBe(400);
    expect((await saveOcrResult(store, { document_id: 'nope', content_hash: HASH, pages: ['x'], mean_confidence: null }, now)).status).toBe(404);
    expect((await saveOcrResult(store, { document_id: 'doc-0', content_hash: 'c'.repeat(64), pages: ['x'], mean_confidence: null }, now)).status).toBe(409);
    expect(await saveOcrResult(store, { document_id: 'doc-0', content_hash: HASH, pages: ['  '], mean_confidence: 0 }, now)).toEqual({ status: 200, body: { result: 'empty' } });
    expect(store.tables.documents.find((d) => d.id === 'doc-0')!.needs_ocr).toBe(true);
  });

  it('averages word confidence from tesseract TSV', () => {
    const tsv = [
      'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
      '1\t1\t0\t0\t0\t0\t0\t0\t2550\t3300\t-1\t',
      '5\t1\t1\t1\t1\t1\t300\t300\t100\t40\t96.5\tNOTICE',
      '5\t1\t1\t1\t1\t2\t420\t300\t60\t40\t88.5\tOF',
    ].join('\n');
    expect(meanConfidence(tsv)).toBe(92.5);
    expect(meanConfidence('level\tconf')).toBeNull();
  });
});
