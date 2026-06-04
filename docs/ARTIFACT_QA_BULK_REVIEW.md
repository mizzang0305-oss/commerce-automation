# Artifact QA Bulk Review

Artifact QA is an operator review layer for rendered files. It does not upload, post, dispatch workers, or change queue status.

## Scope

- Review generated `video`, `thumbnail`, `subtitle`, and `upload_package` assets.
- Filter by QA status, asset type, missing artifact type, search text, and sort order.
- Apply bulk QA status changes to selected artifact rows.
- Persist only `product_assets.qa_status`, `product_assets.qa_note`, `product_assets.render_qa_metadata`, and `updated_at`.

## API

- `GET /api/artifacts`
  - query: `qa_status`, `asset_type`, `missing`, `search`, `sort`
  - returns safe artifact summaries and aggregate counts
- `POST /api/artifacts/[id]/qa`
  - body: `{ "qa_status": "passed", "qa_note": "..." }`
- `POST /api/artifacts/bulk-qa`
  - body: `{ "artifact_ids": ["..."], "qa_status": "needs_fix", "qa_note": "..." }`

Bulk QA mutation responses must include:

```json
{
  "upload_triggered": false,
  "worker_jobs_created": false,
  "queue_auto_uploaded_or_posted": false
}
```

## Safety Rules

- QA `passed` is not upload approval.
- QA `passed` does not create channel upload packages.
- QA `passed` does not call YouTube, TikTok, Threads, or any public upload endpoint.
- Missing artifact rows should be marked `needs_fix` or `rejected`, not treated as successful renders.
- Storage secrets, service-role keys, and Authorization headers must never appear in QA notes, UI, or API responses.

## Production Pilot Note

Migration 008 SQL verification has passed for artifact QA persistence, columns, indexes, RLS/policy posture, and smoke row behavior. Production pilot readiness remains approval-gated until env, deployment, worker, R2, and manual smoke evidence are complete.
