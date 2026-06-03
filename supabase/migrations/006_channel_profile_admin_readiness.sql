-- Add operator-editable channel readiness metadata.
-- This migration intentionally does not add public read/write policies.

alter table public.channel_profiles
  add column if not exists title_template text not null default '',
  add column if not exists description_template text not null default '',
  add column if not exists hashtag_template text not null default '',
  add column if not exists pinned_comment_template text not null default '';

update public.channel_profiles
set
  upload_enabled = false,
  manual_upload_only = true,
  updated_at = now();

comment on column public.channel_profiles.title_template is
  'Manual upload title template. Used for operator package previews only; does not enable platform uploads.';
comment on column public.channel_profiles.description_template is
  'Manual upload description template. Used for operator package previews only; does not enable platform uploads.';
comment on column public.channel_profiles.hashtag_template is
  'Manual upload hashtag template. Used for operator package previews only; does not enable platform uploads.';
comment on column public.channel_profiles.pinned_comment_template is
  'Manual upload pinned comment draft. Stored for operator review only; no platform API call is made.';
