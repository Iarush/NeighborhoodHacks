-- District coverage Phase 0 (.plans/district-coverage-plan.md §2, 0.1 and 0.5).
-- Additive only: the old hcad_parcels / hcad_jurisdictions tables and lookup_hcad_parcel stay
-- until the packed tables are loaded and the demo addresses check out (plan §2.1 order). Drop them
-- in a later migration, after that check.

-- 2.1 Packed HCAD lookup. An address is stored as a 64-bit hash of its normalized text
-- (hashtextextended, the same function Postgres uses for hash partitioning, so it is stable).
create table public.hcad_code_sets (
  id integer generated always as identity primary key,
  codes text[] not null unique
);
alter table public.hcad_code_sets enable row level security;

create table public.hcad_subdivisions (
  id integer generated always as identity primary key,
  name text not null unique
);
alter table public.hcad_subdivisions enable row level security;

create table public.hcad_addresses (
  addr_key bigint not null,
  code_set_id integer not null references public.hcad_code_sets (id),
  subdivision_id integer references public.hcad_subdivisions (id),
  primary key (addr_key, code_set_id)
);
alter table public.hcad_addresses enable row level security;

-- Rows: [{ "address": "<normalized>", "codes": ["001", ...], "subdivision": "<name or null>" }].
-- The address text is hashed here and never stored.
create or replace function public.load_hcad_packed_batch(p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted integer;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'HCAD packed rows must be a JSON array';
  end if;

  create temporary table staged on commit drop as
  select distinct
    pg_catalog.hashtextextended(r.address, 0) as addr_key,
    (select coalesce(array_agg(c order by c), array[]::text[]) from (select distinct jsonb_array_elements_text(r.codes) as c) as s) as codes,
    nullif(btrim(r.subdivision), '') as subdivision
  from jsonb_to_recordset(p_rows) as r(address text, codes jsonb, subdivision text)
  where r.address is not null and jsonb_typeof(r.codes) = 'array' and jsonb_array_length(r.codes) > 0;

  insert into public.hcad_code_sets (codes)
  select distinct codes from staged
  on conflict (codes) do nothing;

  insert into public.hcad_subdivisions (name)
  select distinct subdivision from staged where subdivision is not null
  on conflict (name) do nothing;

  insert into public.hcad_addresses (addr_key, code_set_id, subdivision_id)
  select s.addr_key, c.id, d.id
  from staged as s
  join public.hcad_code_sets as c on c.codes = s.codes
  left join public.hcad_subdivisions as d on d.name = s.subdivision
  on conflict (addr_key, code_set_id) do update set subdivision_id = excluded.subdivision_id;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke execute on function public.load_hcad_packed_batch(jsonb)
  from public, anon, authenticated;
grant execute on function public.load_hcad_packed_batch(jsonb)
  to service_role;

-- Same columns as lookup_hcad_parcel, so route.ts reads either. One row per code set at the
-- address; account and coordinates are no longer stored, and the subdivision name stands in for
-- the legal description (subdivisionFromLegalDescription accepts a bare name).
create or replace function public.lookup_hcad_packed(p_site_address_norm text)
returns table (
  account text,
  legal_description text,
  longitude double precision,
  latitude double precision,
  jurisdiction_codes text[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    null::text,
    d.name,
    null::double precision,
    null::double precision,
    c.codes
  from public.hcad_addresses as a
  join public.hcad_code_sets as c on c.id = a.code_set_id
  left join public.hcad_subdivisions as d on d.id = a.subdivision_id
  where a.addr_key = pg_catalog.hashtextextended(p_site_address_norm, 0)
  order by c.id;
$$;

revoke execute on function public.lookup_hcad_packed(text)
  from public, anon, authenticated;
grant execute on function public.lookup_hcad_packed(text)
  to service_role;

-- 0.5 Map lookup for addresses HCAD doesn't have: boundaries the point is inside, plus those
-- within p_meters of it ("may be in").
create or replace function public.lookup_boundary_near(p_longitude double precision, p_latitude double precision, p_meters double precision)
returns table (body_id text, inside boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  with point as (
    select extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326) as geom
  )
  select b.body_id, bool_or(extensions.st_covers(b.geom, point.geom))
  from public.boundaries as b, point
  where extensions.st_dwithin(b.geom::extensions.geography, point.geom::extensions.geography, p_meters)
  group by b.body_id
  order by b.body_id;
$$;

revoke execute on function public.lookup_boundary_near(double precision, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.lookup_boundary_near(double precision, double precision, double precision)
  to service_role;

-- 2.2 Raw agenda text moves to a private Storage bucket; the row keeps a pointer.
alter table public.documents
  add column storage_path text;

-- 2.3 Items older than the hot window become stubs pointing at an archive file.
alter table public.items
  add column archive_path text;

-- Private buckets: no public access and no policies, so only the service role reads them.
insert into storage.buckets (id, name, public)
values ('agenda-text', 'agenda-text', false), ('item-archive', 'item-archive', false)
on conflict (id) do nothing;

-- 2.4 Daily housekeeping. Returns the number of rows deleted from each table. demo_cache has no
-- expiry (it is the recorded demo, lib/demo.ts), so it is left alone.
create or replace function public.housekeeping_cleanup()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result jsonb := '{}'::jsonb;
  n integer;
begin
  delete from public.rate_limits where window_start < now() - interval '7 days';
  get diagnostics n = row_count; result := result || jsonb_build_object('rate_limits', n);
  delete from public.alert_queue where scheduled_for < now() - interval '7 days';
  get diagnostics n = row_count; result := result || jsonb_build_object('alert_queue', n);
  delete from public.alerts_sent where sent_at < now() - interval '90 days';
  get diagnostics n = row_count; result := result || jsonb_build_object('alerts_sent', n);
  delete from public.p2_notices where acknowledged_at is not null and acknowledged_at < now() - interval '90 days';
  get diagnostics n = row_count; result := result || jsonb_build_object('p2_notices', n);
  return result;
end;
$$;

revoke execute on function public.housekeeping_cleanup()
  from public, anon, authenticated;
grant execute on function public.housekeeping_cleanup()
  to service_role;

-- 2.5 Sizes for the admin health page. Only service_role may call it, and it can read storage.objects.
create or replace function public.storage_sizes()
returns table (database_bytes bigint, storage_bytes bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    pg_catalog.pg_database_size(pg_catalog.current_database()),
    coalesce((select sum((o.metadata->>'size')::bigint) from storage.objects as o), 0)::bigint;
$$;

revoke execute on function public.storage_sizes()
  from public, anon, authenticated;
grant execute on function public.storage_sizes()
  to service_role;
