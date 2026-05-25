select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'automation_settings',
    'product_queue',
    'generated_contents',
    'automation_runs',
    'worker_jobs',
    'worker_heartbeats',
    'product_candidates',
    'product_assets',
    'production_history'
  )
order by tablename;

select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  permissive
from pg_policies
where schemaname = 'public'
  and tablename in (
    'automation_settings',
    'product_queue',
    'generated_contents',
    'automation_runs',
    'worker_jobs',
    'worker_heartbeats',
    'product_candidates',
    'product_assets',
    'production_history'
  )
order by tablename, policyname;

select
  id,
  run_mode,
  youtube_upload_enabled,
  python_worker_enabled,
  max_daily_videos,
  updated_at
from public.automation_settings
where id = 'default';
