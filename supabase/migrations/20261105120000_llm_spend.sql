-- mud-code-parser-spec §4.1 (Phase 5): the monthly cap on rung-5 LLM reads, shared by MUD agendas
-- and minutes. One row per America/Chicago month ('2026-11'). Additive only.
--   * llm_spend_reserve() checks and increments in one statement, so two ingest runs at once
--     can't both take the last slot. It returns false (and changes nothing) when the month is full.
--   * llm_spend_settle() adds the difference when a response's reported cost beats the estimate.

create table if not exists public.llm_spend (
  month text primary key check (month ~ '^\d{4}-\d{2}$'),
  docs int not null default 0,
  est_usd numeric(10, 4) not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.llm_spend enable row level security;
-- No policies: only the service role (ingest) reads or writes it.

create or replace function public.llm_spend_reserve(p_month text, p_usd numeric, p_max_docs int, p_max_usd numeric)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  ok boolean;
begin
  if p_max_docs <= 0 or p_max_usd <= 0 then
    return false;
  end if;
  insert into public.llm_spend (month) values (p_month) on conflict (month) do nothing;
  update public.llm_spend
     set docs = docs + 1, est_usd = est_usd + greatest(p_usd, 0), updated_at = now()
   where month = p_month and docs < p_max_docs and est_usd < p_max_usd
  returning true into ok;
  return coalesce(ok, false);
end;
$$;

create or replace function public.llm_spend_settle(p_month text, p_extra_usd numeric)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.llm_spend set est_usd = est_usd + greatest(p_extra_usd, 0), updated_at = now() where month = p_month;
$$;

revoke execute on function public.llm_spend_reserve(text, numeric, int, numeric) from public, anon, authenticated;
revoke execute on function public.llm_spend_settle(text, numeric) from public, anon, authenticated;
