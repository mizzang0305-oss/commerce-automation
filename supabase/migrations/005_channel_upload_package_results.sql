alter table public.channel_upload_packages
  add column if not exists uploaded_url text default '',
  add column if not exists uploaded_at timestamptz,
  add column if not exists uploaded_by text default '',
  add column if not exists upload_notes text default '',
  add column if not exists platform_upload_status text default 'manual_ready';

update public.channel_upload_packages
set
  uploaded_url = coalesce(uploaded_url, ''),
  uploaded_by = coalesce(uploaded_by, ''),
  upload_notes = coalesce(upload_notes, ''),
  platform_upload_status = coalesce(platform_upload_status, status, 'manual_ready')
where
  uploaded_url is null
  or uploaded_by is null
  or upload_notes is null
  or platform_upload_status is null;

create index if not exists idx_channel_upload_packages_platform_upload_status
  on public.channel_upload_packages(platform_upload_status);

comment on column public.channel_upload_packages.uploaded_url is
  'Operator-recorded public or private platform URL after a manual upload. This is not written by a platform API.';

comment on column public.channel_upload_packages.platform_upload_status is
  'Manual tracking status only. This does not imply YouTube/TikTok/Threads API upload execution.';
