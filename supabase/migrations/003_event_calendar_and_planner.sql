-- Event calendar, daily production planner, and manual-only channel routing foundation.
-- This migration intentionally does not create public read/write policies.

create table if not exists public.event_calendar (
  id text primary key,
  event_key text unique not null,
  event_name text not null,
  event_type text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  lead_days_min integer not null default 7,
  lead_days_max integer not null default 30,
  target_categories jsonb not null default '[]'::jsonb,
  target_keywords jsonb not null default '[]'::jsonb,
  excluded_keywords jsonb not null default '[]'::jsonb,
  platforms jsonb not null default '[]'::jsonb,
  priority integer not null default 0,
  seasonality_score numeric not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_production_plans (
  id text primary key,
  plan_date text not null unique,
  status text not null default 'draft',
  target_video_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_production_plan_items (
  id text primary key,
  plan_id text not null references public.daily_production_plans(id) on delete cascade,
  product_candidate_id text references public.product_candidates(id),
  product_queue_id text references public.product_queue(id),
  event_key text,
  target_channel_id text,
  rank integer not null default 0,
  status text not null default 'planned',
  reason text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.channel_profiles (
  id text primary key,
  channel_key text unique not null,
  channel_name text not null,
  platform text not null default 'youtube',
  youtube_channel_id text,
  youtube_handle text,
  niche text not null default '',
  allowed_categories jsonb not null default '[]'::jsonb,
  excluded_categories jsonb not null default '[]'::jsonb,
  default_hashtags jsonb not null default '[]'::jsonb,
  upload_window jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  upload_enabled boolean not null default false,
  manual_upload_only boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_event_calendar_status on public.event_calendar(status);
create index if not exists idx_event_calendar_starts_at on public.event_calendar(starts_at);
create index if not exists idx_event_calendar_event_key on public.event_calendar(event_key);
create index if not exists idx_daily_production_plans_plan_date on public.daily_production_plans(plan_date);
create index if not exists idx_daily_plan_items_plan_id on public.daily_production_plan_items(plan_id);
create index if not exists idx_daily_plan_items_event_key on public.daily_production_plan_items(event_key);
create index if not exists idx_daily_plan_items_channel on public.daily_production_plan_items(target_channel_id);
create index if not exists idx_channel_profiles_key on public.channel_profiles(channel_key);
create index if not exists idx_channel_profiles_status on public.channel_profiles(status);
create index if not exists idx_channel_profiles_platform on public.channel_profiles(platform);

alter table public.event_calendar enable row level security;
alter table public.daily_production_plans enable row level security;
alter table public.daily_production_plan_items enable row level security;
alter table public.channel_profiles enable row level security;

comment on table public.event_calendar is
  'Server-only event calendar foundation. Do not grant public anon/authenticated read/write policies.';
comment on table public.daily_production_plans is
  'Server-only daily production planning records. Worker jobs remain created only by next-batch.';
comment on table public.daily_production_plan_items is
  'Server-only candidate planning assignments. Planning does not create worker jobs.';
comment on table public.channel_profiles is
  'Manual-only channel routing profiles. upload_enabled defaults false and manual_upload_only defaults true.';
