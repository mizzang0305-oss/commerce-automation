-- Atomic scheduled promotion and owner-approved private upload reservation.
-- This migration is intentionally unapplied by this PR.

alter table public.product_queue
  add column if not exists schedule_key text,
  add column if not exists product_key text;

create unique index if not exists product_queue_schedule_key_unique
  on public.product_queue (schedule_key)
  where nullif(schedule_key, '') is not null;

create unique index if not exists product_queue_product_key_unique
  on public.product_queue (product_key)
  where nullif(product_key, '') is not null;

create table if not exists public.private_pilot_owner_approvals (
  approval_id text primary key,
  upload_package_id text not null references public.channel_upload_packages(id),
  product_candidate_id text not null references public.product_candidates(id),
  video_asset_id text not null references public.product_assets(id),
  video_checksum_sha256 text not null check (video_checksum_sha256 ~ '^[a-f0-9]{64}$'),
  nonce_sha256 text not null unique check (nonce_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'approved'
    check (status in ('approved', 'consumed', 'expired', 'revoked')),
  approved_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (expires_at > approved_at)
);

create table if not exists public.private_pilot_upload_reservations (
  reservation_id text primary key,
  approval_id text not null unique references public.private_pilot_owner_approvals(approval_id),
  upload_package_id text not null unique references public.channel_upload_packages(id),
  product_candidate_id text not null references public.product_candidates(id),
  video_asset_id text not null references public.product_assets(id),
  video_checksum_sha256 text not null check (video_checksum_sha256 ~ '^[a-f0-9]{64}$'),
  kst_upload_date date not null unique,
  status text not null
    check (
      status in (
        'reserved',
        'external_call_started',
        'completed',
        'failed_before_external_call',
        'human_review_required'
      )
    ),
  failure_code text not null default '',
  video_id_sha256_prefix text not null default '',
  video_url_sha256_prefix text not null default '',
  reserved_at timestamptz not null default clock_timestamp(),
  external_call_started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.private_pilot_owner_approvals enable row level security;
alter table public.private_pilot_upload_reservations enable row level security;

create or replace function public.create_scheduled_queue_bundle(
  p_schedule_key text,
  p_product_key text,
  p_candidate jsonb,
  p_queue_item jsonb,
  p_content jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_candidate public.product_candidates;
  v_queue public.product_queue;
  v_content public.generated_contents;
begin
  if nullif(btrim(p_schedule_key), '') is null or nullif(btrim(p_product_key), '') is null then
    raise exception 'SCHEDULE_IDEMPOTENCY_KEY_REQUIRED';
  end if;
  if nullif(btrim(p_queue_item->>'selected_affiliate_url'), '') is null then
    raise exception 'AFFILIATE_DEEPLINK_REQUIRED';
  end if;
  if nullif(btrim(p_content->>'disclosure_text'), '') is null then
    raise exception 'DISCLOSURE_TEXT_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('schedule:' || p_schedule_key, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('product:' || p_product_key, 0));

  if exists (
    select 1 from public.product_queue
    where schedule_key = p_schedule_key
  ) then
    return jsonb_build_object('created', false, 'blocker', 'SCHEDULE_KEY_ALREADY_PROMOTED');
  end if;
  if exists (
    select 1 from public.product_queue where product_key = p_product_key
  ) or exists (
    select 1 from public.product_candidates
    where product_key = p_product_key and nullif(promoted_queue_id, '') is not null
  ) then
    return jsonb_build_object('created', false, 'blocker', 'PRODUCT_KEY_ALREADY_PROMOTED');
  end if;

  v_candidate := jsonb_populate_record(
    null::public.product_candidates,
    p_candidate || jsonb_build_object(
      'product_key', p_product_key,
      'promotion_status', 'promoted',
      'promoted_queue_id', p_queue_item->>'id'
    )
  );
  v_queue := jsonb_populate_record(
    null::public.product_queue,
    p_queue_item || jsonb_build_object(
      'schedule_key', p_schedule_key,
      'product_key', p_product_key,
      'channel_key', coalesce(nullif(p_queue_item->>'channel_key', ''), nullif(p_queue_item->>'channelKey', ''), 'father_jobs')
    )
  );
  v_content := jsonb_populate_record(null::public.generated_contents, p_content);

  insert into public.product_candidates select (v_candidate).*;
  insert into public.product_queue select (v_queue).*;
  insert into public.generated_contents select (v_content).*;
  return jsonb_build_object('created', true);
exception
  when unique_violation then
    if exists (select 1 from public.product_queue where schedule_key = p_schedule_key) then
      return jsonb_build_object('created', false, 'blocker', 'SCHEDULE_KEY_ALREADY_PROMOTED');
    end if;
    return jsonb_build_object('created', false, 'blocker', 'PRODUCT_KEY_ALREADY_PROMOTED');
end;
$$;

create or replace function public.reserve_private_pilot_upload(
  p_reservation_id text,
  p_upload_package_id text,
  p_approval_id text,
  p_nonce_sha256 text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_kst_date date := (clock_timestamp() at time zone 'Asia/Seoul')::date;
  v_approval public.private_pilot_owner_approvals;
begin
  select * into v_approval
  from public.private_pilot_owner_approvals
  where approval_id = p_approval_id
  for update;

  if not found
    or v_approval.status <> 'approved'
    or v_approval.upload_package_id <> p_upload_package_id
    or v_approval.nonce_sha256 <> p_nonce_sha256
    or v_approval.expires_at <= v_now
  then
    return jsonb_build_object('reserved', false, 'blocker', 'FRESH_OWNER_APPROVAL_REQUIRED');
  end if;

  if not exists (
    select 1
    from public.channel_upload_packages package
    join public.product_queue queue on queue.id = package.product_queue_id
    join public.product_candidates candidate
      on candidate.id = v_approval.product_candidate_id
      and candidate.promoted_queue_id = queue.id
    join public.product_assets asset
      on asset.id = v_approval.video_asset_id
      and asset.product_queue_id = queue.id
      and asset.product_candidate_id = candidate.id
      and asset.asset_type = 'video'
      and asset.qa_status = 'passed'
      and asset.url = package.video_url
      and asset.render_qa_metadata->>'video_checksum_sha256' = v_approval.video_checksum_sha256
      and asset.render_qa_metadata->>'prepared_video_asset_server_accessible' = 'true'
      and nullif(asset.render_qa_metadata->>'prepared_video_asset_storage_key', '') is not null
      and asset.render_qa_metadata->>'prepared_video_asset_provider' in (
        'r2', 'supabase_storage', 'signed_url', 'signed_https',
        'r2_signed_url', 'supabase_signed_url', 'external_https'
      )
    join public.worker_jobs job
      on job.id = asset.worker_job_id
      and job.status = 'completed'
      and job.product_queue_id = queue.id
      and job.product_candidate_id = candidate.id
    where package.id = p_upload_package_id
      and package.platform = 'youtube'
      and package.status = 'manual_ready'
      and package.manual_upload_only is true
      and coalesce(package.uploaded_at::text, '') = ''
      and coalesce(package.uploaded_url, '') = ''
      and coalesce(package.platform_upload_status, '') <> 'private_uploaded'
      and nullif(queue.selected_affiliate_url, '') is not null
      and queue.manual_review_status = 'approved'
      and (
        nullif(asset.render_qa_metadata->>'prepared_video_asset_expires_at', '') is null
        or (asset.render_qa_metadata->>'prepared_video_asset_expires_at')::timestamptz > v_now
      )
  ) then
    return jsonb_build_object('reserved', false, 'blocker', 'AUTHORITATIVE_ASSET_BINDING_REQUIRED');
  end if;

  update public.private_pilot_owner_approvals
  set status = 'consumed', consumed_at = v_now, updated_at = v_now
  where approval_id = p_approval_id;

  insert into public.private_pilot_upload_reservations (
    reservation_id,
    approval_id,
    upload_package_id,
    product_candidate_id,
    video_asset_id,
    video_checksum_sha256,
    kst_upload_date,
    status,
    reserved_at,
    updated_at
  ) values (
    p_reservation_id,
    v_approval.approval_id,
    v_approval.upload_package_id,
    v_approval.product_candidate_id,
    v_approval.video_asset_id,
    v_approval.video_checksum_sha256,
    v_kst_date,
    'reserved',
    v_now,
    v_now
  );
  return jsonb_build_object('reserved', true, 'reservation_id', p_reservation_id);
exception
  when unique_violation then
    return jsonb_build_object('reserved', false, 'blocker', 'DUPLICATE_OR_DAILY_PRIVATE_UPLOAD_BLOCKED');
end;
$$;

create or replace function public.mark_private_pilot_external_call_started(
  p_reservation_id text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.private_pilot_upload_reservations
  set
    status = 'external_call_started',
    external_call_started_at = clock_timestamp(),
    updated_at = clock_timestamp()
  where reservation_id = p_reservation_id and status = 'reserved';
  return found;
end;
$$;

create or replace function public.mark_private_pilot_failed_before_external_call(
  p_reservation_id text,
  p_failure_code text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.private_pilot_upload_reservations
  set
    status = 'failed_before_external_call',
    failure_code = left(coalesce(p_failure_code, ''), 80),
    updated_at = clock_timestamp()
  where reservation_id = p_reservation_id and status = 'reserved';
  return found;
end;
$$;

create or replace function public.mark_private_pilot_human_review_required(
  p_reservation_id text,
  p_failure_code text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.private_pilot_upload_reservations
  set
    status = 'human_review_required',
    failure_code = left(coalesce(p_failure_code, ''), 80),
    updated_at = clock_timestamp()
  where reservation_id = p_reservation_id
    and status in ('external_call_started', 'human_review_required');
  return found;
end;
$$;

create or replace function public.complete_private_pilot_upload(
  p_reservation_id text,
  p_video_id_sha256_prefix text,
  p_video_url_sha256_prefix text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_package_id text;
begin
  update public.private_pilot_upload_reservations
  set
    status = 'completed',
    video_id_sha256_prefix = left(coalesce(p_video_id_sha256_prefix, ''), 12),
    video_url_sha256_prefix = left(coalesce(p_video_url_sha256_prefix, ''), 12),
    completed_at = clock_timestamp(),
    updated_at = clock_timestamp()
  where reservation_id = p_reservation_id and status = 'external_call_started'
  returning upload_package_id into v_package_id;
  if not found then
    return false;
  end if;

  update public.channel_upload_packages
  set
    status = 'uploaded',
    uploaded_url = '',
    uploaded_at = clock_timestamp(),
    uploaded_by = 'owner-approved-private-pilot',
    upload_notes = jsonb_build_object(
      'video_id_sha256_prefix', left(coalesce(p_video_id_sha256_prefix, ''), 12),
      'video_url_sha256_prefix', left(coalesce(p_video_url_sha256_prefix, ''), 12)
    )::text,
    platform_upload_status = 'private_uploaded',
    updated_at = clock_timestamp()
  where id = v_package_id
    and status = 'manual_ready'
    and manual_upload_only is true
    and coalesce(uploaded_at::text, '') = ''
    and coalesce(uploaded_url, '') = '';
  if not found then
    raise exception 'UPLOAD_PACKAGE_COMPLETION_STATE_CONFLICT';
  end if;
  return true;
end;
$$;

revoke all on table public.private_pilot_owner_approvals from public, anon, authenticated;
revoke all on table public.private_pilot_upload_reservations from public, anon, authenticated;
grant select, insert, update on table public.private_pilot_owner_approvals to service_role;
grant select, insert, update on table public.private_pilot_upload_reservations to service_role;

revoke all on function public.create_scheduled_queue_bundle(text, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.reserve_private_pilot_upload(text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.mark_private_pilot_external_call_started(text)
  from public, anon, authenticated;
revoke all on function public.mark_private_pilot_failed_before_external_call(text, text)
  from public, anon, authenticated;
revoke all on function public.mark_private_pilot_human_review_required(text, text)
  from public, anon, authenticated;
revoke all on function public.complete_private_pilot_upload(text, text, text)
  from public, anon, authenticated;

grant execute on function public.create_scheduled_queue_bundle(text, text, jsonb, jsonb, jsonb)
  to service_role;
grant execute on function public.reserve_private_pilot_upload(text, text, text, text)
  to service_role;
grant execute on function public.mark_private_pilot_external_call_started(text)
  to service_role;
grant execute on function public.mark_private_pilot_failed_before_external_call(text, text)
  to service_role;
grant execute on function public.mark_private_pilot_human_review_required(text, text)
  to service_role;
grant execute on function public.complete_private_pilot_upload(text, text, text)
  to service_role;
