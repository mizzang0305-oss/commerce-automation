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

1. Keep the in-house Coupang MVP path focused on manual product input, candidate review, content draft generation, worker rendering, R2 artifacts, and manual upload packages.
2. Add operator APIs for retry/fail/cancel job actions.
3. Add real Google Sheets credential flow for `sheet_sync`.
4. Replace or formalize Nightly Scout product collection.
5. Persist planner/channel edits in Supabase.
6. Keep public upload as a separate, explicitly reviewed milestone.

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
4. Expand Coupang candidate input with optional official API enrichment when credentials exist.
5. Keep public upload as a separate, explicitly reviewed milestone.

## v1.6 Coupang MVP Product Input

Included:

- `/candidates` manual Coupang product input form.
- `POST /api/candidates/import-coupang` for one candidate at a time.
- Coupang product URL normalization with tracking parameter removal.
- Deterministic `product_key` from product, item, and vendor identifiers.
- Affiliate short-link validation and `blocked_missing_affiliate` readiness for missing links.
- Product image URL readiness checks and image propagation from candidate to queue to worker payload.
- Python Worker product image download hardening and 1080x1920 render/thumbnail quality checks.
- CSV import enrichment for Coupang rows.

Not included:

- Queue creation from import.
- Worker job creation from import.
- n8n, Creatomate, or Google Docs expansion.
- YouTube/TikTok/Threads upload calls.

## v1.7 Candidate-To-Render Quality Target

The next quality layer keeps the MVP in-house while making rendered output less brittle.

Included:

- Candidate image readiness labels for missing or invalid image URLs.
- Promotion guard that prevents renderable queue rows without a usable product image.
- `/api/run/next-batch` payloads that pass both `image_url` and `thumbnail_url` to `video_render`.
- Worker download checks for status code, content type, empty bodies, and safe timeout handling.
- Vertical render layout and thumbnail title wrapping checks.

Not included:

- n8n, Creatomate, or Google Docs generation.
- Public platform upload.
- Login, CAPTCHA, block bypass, or protected review copying.
