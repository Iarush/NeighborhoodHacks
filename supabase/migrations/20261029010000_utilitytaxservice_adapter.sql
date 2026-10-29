-- MUD rollout bucket M12: the Utility Tax Service listing adapter (lib/adapters/utilitytaxservice.ts).
-- Additive only: widens the check on sources.adapter (Postgres names it sources_adapter_check).

alter table public.sources drop constraint if exists sources_adapter_check;
alter table public.sources
  add constraint sources_adapter_check
  check (adapter in ('legistar', 'boardbook', 'primegov', 'llm_extract', 'manual', 'diligent', 'boarddocs', 'utilitytaxservice'));
