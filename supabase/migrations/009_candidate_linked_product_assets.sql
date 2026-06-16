-- Enables candidate-only server-accessible video asset registration.
-- Apply only through the approved Supabase migration process; this PR does not run it.

alter table public.product_assets
  alter column product_queue_id drop not null;

alter table public.product_assets
  add column if not exists product_candidate_id text references public.product_candidates(id) on delete set null;

create index if not exists idx_product_assets_candidate_id
  on public.product_assets(product_candidate_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_assets_queue_or_candidate_link_chk'
      and conrelid = 'public.product_assets'::regclass
  ) then
    alter table public.product_assets
      add constraint product_assets_queue_or_candidate_link_chk
      check (
        nullif(product_queue_id, '') is not null
        or nullif(product_candidate_id, '') is not null
      ) not valid;
  end if;
end $$;
