alter table public.product_assets
  add column if not exists render_qa_metadata jsonb not null default '{}'::jsonb,
  add column if not exists qa_status text not null default 'pending',
  add column if not exists qa_note text not null default '',
  add column if not exists updated_at timestamptz not null default now();

create index if not exists product_assets_qa_status_idx
  on public.product_assets (qa_status);

create index if not exists product_assets_product_queue_asset_type_idx
  on public.product_assets (product_queue_id, asset_type);
