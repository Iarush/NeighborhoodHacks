-- District coverage: the Diligent Community and BoardDocs adapters (lib/adapters/diligent.ts for
-- humble_isd_board, lib/adapters/boarddocs.ts for katy_isd_board).
-- Widens the inline check on sources.adapter (Postgres names it sources_adapter_check).

alter table public.sources drop constraint if exists sources_adapter_check;
alter table public.sources
  add constraint sources_adapter_check
  check (adapter in ('legistar', 'boardbook', 'primegov', 'llm_extract', 'manual', 'diligent', 'boarddocs'));
