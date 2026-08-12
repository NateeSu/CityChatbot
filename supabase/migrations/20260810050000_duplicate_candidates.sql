-- P3-DUP-001: bounded, tenant-scoped duplicate candidate lookup.
-- Candidate decisions remain human-owned; this migration never changes complaint
-- status and never creates a merge/close side effect.

alter table public.complaint_duplicate_links
  add column if not exists idempotency_key text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.complaint_duplicate_links'::regclass
       and conname = 'complaint_duplicate_links_idempotency_ck'
  ) then
    alter table public.complaint_duplicate_links
      add constraint complaint_duplicate_links_idempotency_ck
      check (idempotency_key is null or (length(idempotency_key) between 8 and 255 and idempotency_key !~ '[[:cntrl:]]'));
  end if;
end;
$$;

create unique index if not exists complaint_duplicate_links_idempotency_uq
  on public.complaint_duplicate_links (tenant_id, idempotency_key)
  where idempotency_key is not null;

-- The application applies the exact-radius Haversine calculation after this
-- narrow index scan. No PostGIS extension is required for the pilot.
create index if not exists complaints_duplicate_candidate_idx
  on public.complaints (tenant_id, canonical_status, category_id, created_at desc, id);
create index if not exists complaints_duplicate_unresolved_time_idx
  on public.complaints (tenant_id, created_at desc, category_id, id)
  where canonical_status not in ('RESOLVED', 'CLOSED', 'OUT_OF_JURISDICTION', 'CANCELLED');

create or replace function private.find_complaint_duplicate_candidates(
  p_tenant_id uuid,
  p_complaint_id uuid,
  p_radius_meters numeric default 100,
  p_window_hours integer default 72,
  p_limit integer default 20
)
returns table (
  candidate_complaint_id uuid,
  distance_meters numeric,
  time_distance_seconds bigint,
  same_category boolean
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with source as (
    select c.id, c.tenant_id, c.category_id, c.latitude, c.longitude, c.created_at
      from public.complaints as c
     where c.tenant_id = p_tenant_id
       and c.id = p_complaint_id
       and c.canonical_status not in ('RESOLVED', 'CLOSED', 'OUT_OF_JURISDICTION', 'CANCELLED')
       and c.latitude is not null
       and c.longitude is not null
  ), distances as (
    select
      candidate.id as candidate_complaint_id,
      6371008.8 * 2 * asin(least(1, sqrt(
        power(sin(radians(candidate.latitude - source.latitude) / 2), 2)
        + cos(radians(source.latitude)) * cos(radians(candidate.latitude))
          * power(sin(radians(candidate.longitude - source.longitude) / 2), 2)
      ))) as distance_meters,
      abs(extract(epoch from candidate.created_at - source.created_at))::bigint as time_distance_seconds,
      candidate.category_id is not distinct from source.category_id as same_category
      from source
      join public.complaints as candidate
        on candidate.tenant_id = source.tenant_id
       and candidate.id <> source.id
       and candidate.canonical_status not in ('RESOLVED', 'CLOSED', 'OUT_OF_JURISDICTION', 'CANCELLED')
       and candidate.latitude is not null
       and candidate.longitude is not null
       and abs(extract(epoch from candidate.created_at - source.created_at)) <= greatest(p_window_hours, 1) * 3600
       and candidate.category_id is not distinct from source.category_id
  )
  select candidate_complaint_id, round(distance_meters::numeric, 3), time_distance_seconds, same_category
    from distances
   where distance_meters <= greatest(p_radius_meters, 1)
   order by same_category desc, distance_meters asc, time_distance_seconds asc, candidate_complaint_id asc
   limit least(greatest(p_limit, 1), 50);
$$;

grant execute on function private.find_complaint_duplicate_candidates(uuid, uuid, numeric, integer, integer) to authenticated;

comment on function private.find_complaint_duplicate_candidates(uuid, uuid, numeric, integer, integer) is 'Tenant-scoped unresolved duplicate candidates; human decision is required and complaint status is never mutated.';
