create table if not exists public.channel_upload_packages (
  id text primary key,
  product_queue_id text references public.product_queue(id),
  channel_profile_id text,
  platform text,
  title text,
  description text,
  hashtags text,
  disclosure_text text,
  video_url text,
  thumbnail_url text,
  subtitle_url text,
  upload_package_url text,
  status text default 'manual_ready',
  upload_enabled boolean default false,
  manual_upload_only boolean default true,
  created_at timestamptz,
  updated_at timestamptz
);

create index if not exists idx_channel_upload_packages_queue_id
  on public.channel_upload_packages(product_queue_id);

create index if not exists idx_channel_upload_packages_channel_profile_id
  on public.channel_upload_packages(channel_profile_id);

create index if not exists idx_channel_upload_packages_status
  on public.channel_upload_packages(status);

alter table public.channel_upload_packages enable row level security;

comment on table public.channel_upload_packages is
  'Server-only manual upload package metadata. No public platform upload API is implemented.';
