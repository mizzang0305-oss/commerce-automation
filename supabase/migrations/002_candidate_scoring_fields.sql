-- Candidate quality-control fields for product_key, dedupe, scoring, and promotion readiness.
-- Additive only: existing product_candidates rows remain valid and can be recomputed by the WebApp.

alter table public.product_candidates
  add column if not exists product_key text,
  add column if not exists platform text not null default '',
  add column if not exists source_type text not null default '',
  add column if not exists source_name text not null default '',
  add column if not exists category text not null default '',
  add column if not exists candidate_score numeric not null default 0,
  add column if not exists score_reason text not null default '',
  add column if not exists duplicate_status text not null default 'unknown',
  add column if not exists duplicate_reason text not null default '',
  add column if not exists promotion_status text not null default 'needs_review',
  add column if not exists promoted_queue_id text not null default '',
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_product_candidates_product_key on public.product_candidates(product_key);
create index if not exists idx_product_candidates_candidate_score on public.product_candidates(candidate_score);
create index if not exists idx_product_candidates_duplicate_status on public.product_candidates(duplicate_status);
create index if not exists idx_product_candidates_promotion_status on public.product_candidates(promotion_status);
create index if not exists idx_product_candidates_created_at on public.product_candidates(created_at);

-- RLS remains enabled from 001_automation_core.sql. No anon/authenticated public
-- read or write policies are added here; the WebApp server-only repository uses
-- the Supabase service role key.
