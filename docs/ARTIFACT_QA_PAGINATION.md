# Artifact QA Pagination

Artifact QA pagination keeps `/artifacts` usable when generated artifact rows grow.

## Read-Only Boundary

- Pagination is read-only.
- Pagination does not change QA status.
- Pagination does not create worker jobs.
- Pagination does not trigger uploads.
- Pagination does not change queue upload/post status.

The API response includes:

```json
{
  "pagination": {
    "page": 1,
    "page_size": 25,
    "total_items": 125,
    "total_pages": 5,
    "has_next": true,
    "has_prev": false
  },
  "side_effects": {
    "upload_triggered": false,
    "worker_jobs_created": false,
    "queue_auto_uploaded_or_posted": false
  }
}
```

## Query Parameters

- `page`: default `1`.
- `page_size`: default `25`, max `100`.
- `sort`: `newest`, `oldest`, `qa_status`, or `asset_type`.
- `qa_status`, `asset_type`, `missing`, `search`: existing Artifact QA filters.

Changing a filter or search resets `page` to `1` in the UI. Previous/Next controls preserve the active filters.
