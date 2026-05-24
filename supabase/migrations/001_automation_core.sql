-- commerce-automation v1.4 core repository schema.
-- Service role access must stay server-only in the Next.js WebApp.
-- Do not expose SUPABASE_SERVICE_ROLE_KEY to client components or Python Worker.

create table if not exists public.automation_settings (
  id text primary key default 'default',
  daily_target_count integer not null default 69,
  batch_size integer not null default 3,
  interval_hours integer not null default 1,
  start_hour integer not null default 1,
  end_hour integer not null default 23,
  run_mode text not null default 'generate_only',
  is_paused boolean not null default true,
  youtube_upload_enabled boolean not null default false,
  approval_required boolean not null default true,
  python_worker_enabled boolean not null default true,
  max_daily_uploads integer not null default 6,
  max_daily_videos integer not null default 69,
  allowed_worker_job_types jsonb not null default '["video_render","sheet_sync"]'::jsonb,
  category_include jsonb not null default '[]'::jsonb,
  category_exclude jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.product_queue (
  id text primary key,
  queue_date text not null default '',
  queue_rank integer not null default 0,
  upload_slot integer not null default 0,
  scheduled_at timestamptz,
  keyword text not null default '',
  theme text not null default '',
  product_name text not null default '',
  category_path text not null default '',
  price_now_text text not null default '',
  thumbnail_url text not null default '',
  raw_coupang_url text not null default '',
  selected_affiliate_url text not null default '',
  product_score numeric not null default 0,
  score_reason text not null default '',
  video_angle text not null default '',
  queue_status text not null default 'scheduled',
  video_url text not null default '',
  video_snapshot_url text not null default '',
  blog_draft_url text not null default '',
  youtube_upload_status text not null default 'not_ready',
  tiktok_upload_status text not null default 'not_ready',
  threads_post_status text not null default 'not_ready',
  manual_review_status text not null default 'not_ready',
  error_message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generated_contents (
  id text primary key,
  product_queue_id text not null references public.product_queue(id) on delete cascade,
  raw_coupang_url text not null default '',
  product_name text not null default '',
  selected_affiliate_url text not null default '',
  video_title text not null default '',
  video_script text not null default '',
  caption_1 text not null default '',
  caption_2 text not null default '',
  caption_3 text not null default '',
  threads_text text not null default '',
  blog_title text not null default '',
  blog_body text not null default '',
  hashtags text not null default '',
  youtube_description text not null default '',
  tiktok_caption text not null default '',
  disclosure_text text not null default '',
  content_source text not null default 'fallback',
  creatomate_render_id text not null default '',
  video_url text not null default '',
  video_snapshot_url text not null default '',
  video_status text not null default 'not_started',
  blog_draft_url text not null default '',
  blog_draft_status text not null default 'not_started',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_runs (
  id text primary key,
  request_id text,
  n8n_run_id text,
  http_status integer,
  run_type text not null,
  status text not null,
  processed_count integer not null default 0,
  error_count integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  log text not null default '',
  safe_message text not null default ''
);

create table if not exists public.worker_jobs (
  id text primary key,
  job_type text not null,
  status text not null default 'pending',
  product_queue_id text,
  product_candidate_id text,
  priority integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  claimed_by text,
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  error_message text,
  retry_count integer not null default 0,
  max_retries integer not null default 3,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table if not exists public.worker_heartbeats (
  worker_id text primary key,
  status text not null default 'online',
  current_job_id text not null default '',
  current_job_type text not null default '',
  last_heartbeat_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_candidates (
  id text primary key,
  product_name text not null default '',
  raw_coupang_url text not null default '',
  selected_affiliate_url text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_assets (
  id text primary key,
  product_queue_id text not null references public.product_queue(id) on delete cascade,
  worker_job_id text not null,
  asset_type text not null,
  bucket text not null,
  url text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.production_history (
  id text primary key,
  product_queue_id text references public.product_queue(id) on delete set null,
  worker_job_id text,
  event_type text not null,
  message text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_queue_status on public.product_queue(queue_status);
create index if not exists idx_product_queue_scheduled_at on public.product_queue(scheduled_at);
create index if not exists idx_product_queue_date_rank on public.product_queue(queue_date, queue_rank);
create index if not exists idx_generated_contents_queue_id on public.generated_contents(product_queue_id);
create unique index if not exists idx_generated_contents_queue_id_unique on public.generated_contents(product_queue_id);
create index if not exists idx_worker_jobs_status on public.worker_jobs(status);
create index if not exists idx_worker_jobs_type on public.worker_jobs(job_type);
create index if not exists idx_worker_jobs_queue_id on public.worker_jobs(product_queue_id);
create index if not exists idx_worker_jobs_created_at on public.worker_jobs(created_at);
create index if not exists idx_automation_runs_started_at on public.automation_runs(started_at);
create index if not exists idx_product_assets_queue_id on public.product_assets(product_queue_id);
create index if not exists idx_production_history_queue_id on public.production_history(product_queue_id);

alter table public.automation_settings enable row level security;
alter table public.product_queue enable row level security;
alter table public.generated_contents enable row level security;
alter table public.automation_runs enable row level security;
alter table public.worker_jobs enable row level security;
alter table public.worker_heartbeats enable row level security;
alter table public.product_candidates enable row level security;
alter table public.product_assets enable row level security;
alter table public.production_history enable row level security;

insert into public.automation_settings (id)
values ('default')
on conflict (id) do nothing;

-- No anon/authenticated read/write policies are created in this migration.
-- The WebApp repository adapter uses the Supabase service role key only on the server.
-- Add least-privilege authenticated policies in a later auth/admin-user PR if direct
-- browser access is introduced. Public writes are intentionally not allowed.
