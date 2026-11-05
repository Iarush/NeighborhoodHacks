import { DateTime } from 'luxon';
import { ZONE } from './normalize';

// mud-code-parser-spec §4.1: the monthly cap on rung-5 (LLM) reads for MUD agendas and minutes.
// $1 or 20 documents per America/Chicago month, whichever comes first. The ingest reserves a slot
// BEFORE each call, with an estimate from the page count; past the cap the document goes link-only.

export const DEFAULT_MAX_DOCS = 20;
export const DEFAULT_MAX_USD = 1.0;
/**
 * Rough cost of one page through the extract model on OpenRouter: ~1.5k input tokens and ~0.5k
 * output tokens per page at Flash-class prices (about $0.30 in / $2.50 out per million tokens),
 * doubled to cover the fallback-model retry (D17). An over-estimate keeps the cap on the safe side.
 */
export const EST_USD_PER_PAGE = 0.004;

export type LlmLimits = { max_docs: number; max_usd: number };

type EnvLike = Record<string, string | undefined>;

const num = (v: string | undefined, fallback: number) => {
  if (v === undefined || v.trim() === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** MUD_LLM_MAX_DOCS and MUD_LLM_MAX_USD; either one at 0 turns the LLM rung off. */
export function limitsFromEnv(env: EnvLike = process.env): LlmLimits {
  return { max_docs: Math.floor(num(env.MUD_LLM_MAX_DOCS, DEFAULT_MAX_DOCS)), max_usd: num(env.MUD_LLM_MAX_USD, DEFAULT_MAX_USD) };
}

export const llmOff = (l: LlmLimits) => l.max_docs <= 0 || l.max_usd <= 0;

/** The spend month, e.g. '2026-11', in America/Chicago (so the cap resets at Chicago midnight on the 1st). */
export function chicagoMonth(now: Date): string {
  return DateTime.fromJSDate(now).setZone(ZONE).toFormat('yyyy-MM');
}

export function estimateUsd(pages: number): number {
  return Math.max(1, pages) * EST_USD_PER_PAGE;
}

/** Storage for the counters (the llm_spend table, or memory in tests). */
export interface LlmSpendStore {
  /** Atomically: if docs < max_docs and est_usd < max_usd, add 1 doc and `usd`, and return true. */
  reserveLlmSpend(month: string, usd: number, limits: LlmLimits): Promise<boolean>;
  /** Add cost the estimate missed. */
  settleLlmSpend(month: string, extraUsd: number): Promise<void>;
}

/** What the mud_agenda adapter asks before each rung-5 call. */
export interface LlmBudget {
  /** True when a slot was reserved for a document of this many pages; false when the month is full. */
  reserve(pages: number): Promise<boolean>;
  /** Report the actual cost when known; only an amount above the estimate is added. */
  settle(estimatedUsd: number, actualUsd: number): Promise<void>;
}

export function createLlmBudget(store: LlmSpendStore, now: Date, limits: LlmLimits = limitsFromEnv()): LlmBudget {
  const month = chicagoMonth(now);
  return {
    async reserve(pages) {
      if (llmOff(limits)) return false;
      return store.reserveLlmSpend(month, estimateUsd(pages), limits);
    },
    async settle(estimatedUsd, actualUsd) {
      if (actualUsd > estimatedUsd) await store.settleLlmSpend(month, actualUsd - estimatedUsd);
    },
  };
}

/** An in-memory LlmSpendStore (tests, and runs with no database such as `npm run scrape`). */
export function createMemoryLlmSpend(): LlmSpendStore & { rows: Map<string, { docs: number; est_usd: number }> } {
  const rows = new Map<string, { docs: number; est_usd: number }>();
  return {
    rows,
    async reserveLlmSpend(month, usd, limits) {
      if (llmOff(limits)) return false;
      const r = rows.get(month) ?? { docs: 0, est_usd: 0 };
      if (r.docs >= limits.max_docs || r.est_usd >= limits.max_usd) return false;
      rows.set(month, { docs: r.docs + 1, est_usd: r.est_usd + Math.max(0, usd) });
      return true;
    },
    async settleLlmSpend(month, extraUsd) {
      const r = rows.get(month);
      if (r) r.est_usd += Math.max(0, extraUsd);
    },
  };
}
