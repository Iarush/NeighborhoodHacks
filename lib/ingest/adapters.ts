import type { Adapter, AdapterKind } from '@/lib/adapters/types';

// One place that maps a source's adapter kind to its implementation (used by the CLIs, the
// ingest pipeline and the cron route). Dynamic imports keep each adapter's dependencies
// (PDF parsing, the AI client) out of runs that don't need them.

const LOADERS: Record<AdapterKind, () => Promise<Adapter>> = {
  legistar: async () => (await import('@/lib/adapters/legistar')).legistarAdapter,
  boardbook: async () => (await import('@/lib/adapters/boardbook')).boardbookAdapter,
  llm_extract: async () => (await import('@/lib/adapters/llmExtract')).llmExtractAdapter,
  primegov: async () => (await import('@/lib/adapters/primegov')).primeGovAdapter,
  manual: async () => (await import('@/lib/adapters/manual')).manualAdapter,
  diligent: async () => (await import('@/lib/adapters/diligent')).diligentAdapter,
  boarddocs: async () => (await import('@/lib/adapters/boarddocs')).boardDocsAdapter,
  utilitytaxservice: async () => (await import('@/lib/adapters/utilitytaxservice')).utilityTaxServiceAdapter,
  mud_agenda: async () => (await import('@/lib/adapters/mudAgenda/adapter')).mudAgendaAdapter,
};

export function loadAdapter(kind: AdapterKind): Promise<Adapter> {
  return LOADERS[kind]();
}
