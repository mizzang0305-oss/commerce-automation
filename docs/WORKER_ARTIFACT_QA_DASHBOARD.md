# Worker Artifact QA Dashboard

The artifact QA dashboard helps operators review generated assets before manual upload.

## Scope

- Add `/artifacts`.
- Add `GET /api/artifacts`.
- Add `GET /api/artifacts/[id]`.
- Add `POST /api/artifacts/[id]/qa`.
- Track `qa_status`, `qa_note`, `render_qa_metadata`, and `updated_at` on `product_assets`.

## Required Artifacts

Each video-ready queue item should have these asset types:

- `video`
- `thumbnail`
- `subtitle`
- `upload_package`

The dashboard flags missing asset groups. A missing asset does not get marked as uploaded.

## QA States

- `pending`
- `passed`
- `needs_fix`
- `rejected`

QA status is an operator review marker only. It never triggers YouTube, TikTok, Threads, public upload, worker jobs, or channel upload package creation.

## Migration

Apply:

```sql
supabase/migrations/008_product_asset_qa.sql
```

Then reload PostgREST schema cache if Supabase does not pick up the new columns immediately.

## Rollback

The feature is additive. Reverting the UI/API leaves existing product asset URLs intact.
