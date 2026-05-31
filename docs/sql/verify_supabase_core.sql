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

select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'product_candidates'
  and column_name in (
    'product_key',
    'platform',
    'source_type',
    'source_name',
    'category',
    'candidate_score',
    'score_reason',
    'duplicate_status',
    'duplicate_reason',
    'promotion_status',
    'promoted_queue_id',
    'updated_at'
  )
order by column_name;
