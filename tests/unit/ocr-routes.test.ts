import { beforeEach, describe, expect, it, vi } from 'vitest';

// mud-code-parser-spec §5: /api/cron/ocr-queue and /api/cron/ocr-result. Supabase and the OCR
// helpers are replaced here; tests/unit/mud-agenda-ocr.test.ts covers the helpers themselves.

const HASH = 'a'.repeat(64);
const SECRET = 'test-cron-secret';
vi.mock('@/lib/ingest/supabaseStore', () => ({ supabaseIngestStore: {} }));
vi.mock('@/lib/ingest/ocr', () => ({
  ocrQueue: vi.fn(async () => [{ document_id: 'doc-0', url: 'https://example.invalid/a.pdf', content_hash: HASH }]),
  saveOcrResult: vi.fn(async () => ({ status: 200, body: { result: 'saved' } })),
}));
const { GET } = await import('@/app/api/cron/ocr-queue/route');
const { POST } = await import('@/app/api/cron/ocr-result/route');
beforeEach(() => vi.stubEnv('CRON_SECRET', SECRET));

describe('OCR cron routes', () => {
  it('need the cron secret', async () => {
    expect((await GET(new Request('https://x.org/api/cron/ocr-queue'))).status).toBe(401);
    expect((await POST(new Request('https://x.org/api/cron/ocr-result', { method: 'POST', body: '{}', headers: { Authorization: 'Bearer wrong' } }))).status).toBe(401);
  });

  it('return the queue and pass results through', async () => {
    const auth = { Authorization: `Bearer ${SECRET}` };
    const q = await GET(new Request('https://x.org/api/cron/ocr-queue', { headers: auth }));
    expect(await q.json()).toEqual({ jobs: [{ document_id: 'doc-0', url: 'https://example.invalid/a.pdf', content_hash: HASH }] });
    expect((await POST(new Request('https://x.org/api/cron/ocr-result', { method: 'POST', body: 'not json', headers: auth }))).status).toBe(400);
    const r = await POST(new Request('https://x.org/api/cron/ocr-result', { method: 'POST', body: JSON.stringify({ document_id: 'doc-0' }), headers: auth }));
    expect(await r.json()).toEqual({ result: 'saved' });
  });
});
