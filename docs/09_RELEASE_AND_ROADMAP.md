# 09 Release And Roadmap

## v1.3 Worker Architecture

Release theme: move next-batch video generation from n8n webhook dispatch to web-managed `worker_jobs`.

Included:

- Worker job data model.
- Worker claim/heartbeat/complete/fail APIs.
- `/jobs` and `/workers` pages.
- Python Worker scaffold.
- Storage abstraction for generated artifacts.
- Guardrails against fake success.
- Next-batch dispatch guard based on settings and item readiness.

Not included:

- YouTube public upload.
- TikTok posting.
- Threads posting.
- Automatic public publishing.

## Legacy Items

n8n workflows remain as legacy/optional references. Nightly Scout may still use n8n or be replaced by a dedicated product collector.

## Roadmap

1. Add Supabase/Postgres repository adapter and migrations for the documented tables.
2. Add real storage configuration for Supabase Storage or Cloudflare R2/S3.
3. Add operator APIs for retry/fail/cancel job actions.
4. Add real Google Sheets credential flow for `sheet_sync`.
5. Replace or formalize Nightly Scout product collection.
6. Upgrade `/queue` and `/jobs` with TanStack Table filtering/sorting/pagination.
7. Keep public upload as a separate, explicitly reviewed milestone.

## v1.4 Repository Adapter Target

The Supabase/Postgres repository adapter moves control-room state beyond local JSON while keeping the existing WebApp API contract.

Included:

- Supabase migration for settings, queue, generated content, runs, worker jobs, heartbeats, candidates, assets, and history.
- Server-only Supabase admin client.
- Repository factory selection via `AUTOMATION_REPOSITORY_ADAPTER=supabase`.
- Local JSON remains the default development adapter.

Not included:

- Supabase Storage.
- Direct Python Worker database access.
- Public platform upload.

## v1.5 Planner Foundation Target

The event-driven planner moves the system from raw candidate review toward production prioritization.

Included:

- Static event calendar foundation for 7-30 day production windows.
- Candidate-to-event matching and ranking.
- Daily production plan computation.
- Manual-only YouTube channel profile routing.
- Candidate-to-video smoke seed.
- `/planner`, `/api/events`, `/api/channels`, and `/api/planner/daily`.

Not included:

- Persisted planner editing UI.
- YouTube OAuth flow.
- YouTube/TikTok/Threads upload calls.
- Automatic public publishing.

Next milestones:

1. Persist event/channel/plan edits in Supabase.
2. Add candidates review filters for event matches.
3. Add queue promotion from a selected planner item.
4. Add signed/manual upload package review.
5. Keep public upload as a separate, explicitly reviewed milestone.
