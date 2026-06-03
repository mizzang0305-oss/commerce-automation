alter table public.generated_contents
  add column if not exists render_plan_override jsonb,
  add column if not exists render_plan_override_updated_at timestamptz,
  add column if not exists render_plan_override_updated_by text;

comment on column public.generated_contents.render_plan_override is
  'Operator-authored lightweight shot text/duration overrides. Base render_plan stays deterministic and effective render_plan is computed server-side.';

comment on column public.generated_contents.render_plan_override_updated_at is
  'Timestamp for the most recent render_plan override update.';

comment on column public.generated_contents.render_plan_override_updated_by is
  'Operator label for the most recent render_plan override update. Do not store secrets or OAuth tokens here.';
