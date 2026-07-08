alter table public.product_queue
  add column if not exists channel_key text not null default 'father_jobs';

alter table public.automation_runs
  add column if not exists channel_key text;

create index if not exists idx_product_queue_channel_key
  on public.product_queue(channel_key);

create index if not exists idx_product_queue_channel_status_scheduled
  on public.product_queue(channel_key, queue_status, scheduled_at);

create index if not exists idx_automation_runs_channel_key_started_at
  on public.automation_runs(channel_key, started_at);
