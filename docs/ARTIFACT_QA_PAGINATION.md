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

## Large-Volume Table Boundary

The `/artifacts` table renders a bounded page-sized window only. Even if an upstream repository or API bug returns more
rows than the requested `page_size`, the client caps the rendered rows at `100` and shows `Large-list optimized view active`.

Selection is page-scoped:

- Select all applies only to the currently rendered page window.
- Changing page, page size, filters, search, sort, or review queue clears the current selection.
- Keyboard navigation (`j`/`k`) and row selection (`x`) stay inside the rendered page window.
- `Esc` clears the current selection and leaves search.

Virtualization, pagination, selection, and keyboard navigation are view controls only. They must not update QA state,
create worker jobs, create upload packages, alter queue upload/post status, or trigger platform upload.
