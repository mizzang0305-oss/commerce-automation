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

1. Add production DB adapter and migrations for the documented tables.
2. Add operator APIs for retry/fail/cancel job actions.
3. Add real storage configuration for Supabase Storage or S3/R2.
4. Add real Google Sheets credential flow for `sheet_sync`.
5. Replace or formalize Nightly Scout product collection.
6. Keep public upload as a separate, explicitly reviewed milestone.
