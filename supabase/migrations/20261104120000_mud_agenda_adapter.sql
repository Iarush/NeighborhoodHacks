-- mud-code-parser-spec §9: the mud_agenda adapter (lib/adapters/mudAgenda/adapter.ts), the code
-- parser for water districts' agendas. Additive only: widens the check on sources.adapter
-- (Postgres names it sources_adapter_check).

alter table public.sources drop constraint if exists sources_adapter_check;
alter table public.sources
  add constraint sources_adapter_check
  check (adapter in ('legistar', 'boardbook', 'primegov', 'llm_extract', 'manual', 'diligent', 'boarddocs', 'utilitytaxservice', 'mud_agenda'));
