import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import type { LlmClient } from '@/lib/adapters/gemini';
import { createMudAgendaAdapter } from '@/lib/adapters/mudAgenda/adapter';
import { pdfTextFromPages } from '@/lib/adapters/pdfText';
import { AdapterResultSchema, type SourceConfig } from '@/lib/adapters/types';
import { documentContentHash } from '@/lib/ingest/hash';
import { chicagoMonth, createLlmBudget, createMemoryLlmSpend, estimateUsd, limitsFromEnv } from '@/lib/ingest/llmSpend';
import { createMemoryStore } from '@/lib/ingest/memoryStore';
import { ZONE } from '@/lib/ingest/normalize';

// mud-code-parser-spec §7 Phase 5: the monthly LLM cap (§4.1).

const now = new Date('2026-11-05T18:00:00Z');

describe('llm_spend cap', () => {
  it('reads the limits from the env, with 0 turning the LLM off', () => {
    expect(limitsFromEnv({})).toEqual({ max_docs: 20, max_usd: 1 });
    expect(limitsFromEnv({ MUD_LLM_MAX_DOCS: '5', MUD_LLM_MAX_USD: '0.25' })).toEqual({ max_docs: 5, max_usd: 0.25 });
    expect(limitsFromEnv({ MUD_LLM_MAX_DOCS: 'x' })).toEqual({ max_docs: 20, max_usd: 1 });
  });

  it('counts months in America/Chicago', () => {
    expect(chicagoMonth(new Date('2026-12-01T05:30:00Z'))).toBe('2026-11'); // 11:30 PM Nov 30 in Chicago
    expect(chicagoMonth(new Date('2026-12-01T06:30:00Z'))).toBe('2026-12');
  });

  it('refuses the 21st document of a month and resets on the 1st', async () => {
    const store = createMemoryLlmSpend();
    const budget = createLlmBudget(store, now, { max_docs: 20, max_usd: 1 });
    const got = [];
    for (let i = 0; i < 21; i++) got.push(await budget.reserve(3));
    expect(got.filter(Boolean)).toHaveLength(20);
    expect(got[20]).toBe(false);
    expect(store.rows.get('2026-11')).toMatchObject({ docs: 20 });
    expect(await createLlmBudget(store, new Date('2026-12-01T07:00:00Z'), { max_docs: 20, max_usd: 1 }).reserve(3)).toBe(true);
  });

  it('stops at $1 before 20 documents, and adds only cost above the estimate', async () => {
    const store = createMemoryLlmSpend();
    const budget = createLlmBudget(store, now, { max_docs: 20, max_usd: 1 });
    const pages = Math.ceil(0.5 / estimateUsd(1)); // ~$0.50 a document
    expect(await budget.reserve(pages)).toBe(true);
    expect(await budget.reserve(pages)).toBe(true);
    expect(await budget.reserve(pages)).toBe(false);
    const before = store.rows.get('2026-11')!.est_usd;
    await budget.settle(0.5, 0.4);
    expect(store.rows.get('2026-11')!.est_usd).toBe(before);
    await budget.settle(0.5, 0.6);
    expect(store.rows.get('2026-11')!.est_usd).toBeCloseTo(before + 0.1);
  });

  it('is off when either limit is 0', async () => {
    const store = createMemoryLlmSpend();
    expect(await createLlmBudget(store, now, { max_docs: 0, max_usd: 1 }).reserve(1)).toBe(false);
    expect(await createLlmBudget(store, now, { max_docs: 20, max_usd: 0 }).reserve(1)).toBe(false);
    expect(store.rows.size).toBe(0);
  });

  it('the memory ingest store shares the same counters', async () => {
    const budget = createLlmBudget(createMemoryStore(), now, { max_docs: 1, max_usd: 1 });
    expect(await budget.reserve(1)).toBe(true);
    expect(await budget.reserve(1)).toBe(false);
  });
});

// One unreadable agenda: a text layer rungs 1-4 can't parse, with OCR text already stored, so it reaches rung 5.
const source: SourceConfig = {
  id: 'hcmud_489',
  body_id: 'hcmud_489',
  adapter: 'mud_agenda',
  config: { index_url: 'https://hcmud489.com/board-meetings/', link_pattern: '(?i)agenda.+\\.pdf$', date_from: 'filename' },
};
const index = '<html><body><a href="/static/Agenda_November_12_2026.pdf">Agenda</a></body></html>';
const pdfBytes = new Uint8Array([37, 80, 68, 70, 9, 9]);
const pdfHash = documentContentHash(pdfBytes);
const fetchImpl = (async (u: string | URL | Request) => (String(u).endsWith('/board-meetings/') ? new Response(index) : new Response(pdfBytes))) as typeof fetch;
const window = {
  from: DateTime.fromISO('2026-11-01', { zone: ZONE }).toJSDate(),
  to: DateTime.fromISO('2026-12-01', { zone: ZONE }).toJSDate(),
};
const unreadable = async () => pdfTextFromPages(['Some notice text with no agenda list at all.'], pdfHash);

function fakeLlm() {
  const calls: string[] = [];
  const llm: LlmClient = {
    async generateJson({ model }) {
      calls.push(model);
      return JSON.stringify({ meeting: null, items: [] });
    },
  };
  return { llm, calls };
}

async function run(spent: number, llm: LlmClient, withBudget = true) {
  const store = createMemoryLlmSpend();
  if (spent) store.rows.set('2026-11', { docs: spent, est_usd: 0 });
  const adapter = createMudAgendaAdapter({ http: { fetchImpl, sleep: async () => {} }, now: () => now, pdfText: unreadable, positionedText: async () => null as never, llm, models: { extract: 'm1', fallback: 'm1' } });
  const prev = { documentHashes: {}, ocrTexts: { [pdfHash]: 'still nothing numbered here' }, ...(withBudget ? { llmBudget: createLlmBudget(store, now, { max_docs: 20, max_usd: 1 }) } : {}) };
  return { r: AdapterResultSchema.parse(await adapter.run(source, { kind: 'rotation' }, window, prev)), store };
}

describe('mud_agenda rung 5 under the cap', () => {
  it('sends the 20th document of the month to the LLM', async () => {
    const { llm, calls } = fakeLlm();
    const { r, store } = await run(19, llm);
    expect(calls).toHaveLength(1);
    expect(store.rows.get('2026-11')!.docs).toBe(20);
    expect(r.documents.find((d) => d.kind === 'pdf_text')).toMatchObject({ parse_rung: 5 });
    expect(r.warnings.some((w) => w.startsWith('profile_todo: hcmud_489'))).toBe(true);
  });

  it('stores the 21st document link-only with an llm_cap_reached warning', async () => {
    const { llm, calls } = fakeLlm();
    const { r, store } = await run(20, llm);
    expect(calls).toHaveLength(0);
    expect(store.rows.get('2026-11')!.docs).toBe(20);
    expect(r.meetings).toHaveLength(1);
    expect(r.items).toHaveLength(0);
    expect(r.meetings[0]!.agenda_url).toContain('Agenda_November_12_2026.pdf');
    expect(r.warnings.filter((w) => w.startsWith('llm_cap_reached'))).toHaveLength(1);
    expect(r.warnings.some((w) => w.startsWith('parse_failed: hcmud_489'))).toBe(true);
  });

  it('never calls the LLM without a budget (scrape CLI, dry runs)', async () => {
    const { llm, calls } = fakeLlm();
    const { r } = await run(0, llm, false);
    expect(calls).toHaveLength(0);
    expect(r.warnings.some((w) => w.includes('no LLM budget for this run'))).toBe(true);
  });
});
