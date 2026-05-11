# n8n Webhook Contract

This document defines the server-to-server contract between Commerce Automation Control Center and n8n.

## Security Rules

- Do not expose n8n webhook URLs or secrets to the browser.
- Do not include `N8N_WEBHOOK_SECRET` or `COMMERCE_AUTOMATION_API_SECRET` in payload bodies.
- n8n callback requests must send:

```http
Authorization: Bearer COMMERCE_AUTOMATION_API_SECRET
Content-Type: application/json
```

- The actual YouTube/TikTok/Threads public upload flow is disabled in this app version.

## Nightly Scout Request

`POST N8N_NIGHTLY_SCOUT_WEBHOOK_URL`

```json
{
  "type": "nightly_scout",
  "request_id": "nightly_scout-...",
  "requested_at": "2026-05-11T00:00:00.000Z",
  "settings": {},
  "requested_count": 69,
  "date_range_days": 30,
  "mode": "generate_queue",
  "callback": {
    "url": "http://localhost:3001/api/callback/n8n/nightly-scout",
    "method": "POST"
  }
}
```

If `PUBLIC_APP_BASE_URL` is not configured, `callback` is `null`.

## Next Batch Request

`POST N8N_NEXT_BATCH_WEBHOOK_URL`

```json
{
  "type": "next_batch",
  "request_id": "next_batch-...",
  "requested_at": "2026-05-11T00:00:00.000Z",
  "settings": {},
  "batch_size": 3,
  "interval_hours": 1,
  "mode": "process_next_batch",
  "callback": {
    "url": "http://localhost:3001/api/callback/n8n/batch-result",
    "method": "POST"
  }
}
```

## Retry Item Request

`POST N8N_RETRY_ITEM_WEBHOOK_URL`

```json
{
  "type": "retry_item",
  "request_id": "retry_item-...",
  "requested_at": "2026-05-11T00:00:00.000Z",
  "item": {},
  "settings": {},
  "mode": "retry_item",
  "callback": {
    "url": "http://localhost:3001/api/callback/n8n/item-result",
    "method": "POST"
  }
}
```

## n8n Response

Preferred:

```json
{
  "ok": true,
  "run_id": "n8n-execution-id",
  "processed_count": 3,
  "error_count": 0,
  "items": []
}
```

Default n8n responses such as `{ "message": "Workflow was started" }` are accepted and stored as safe summaries.

## Nightly Scout Callback

`POST /api/callback/n8n/nightly-scout`

```json
{
  "request_id": "nightly_scout-...",
  "status": "success",
  "queue_date": "2026-05-11",
  "created_count": 69,
  "items": [
    {
      "id": "queue-001",
      "queue_rank": 1,
      "scheduled_at": "2026-05-11T01:00:00.000Z",
      "keyword": "keyword",
      "product_name": "product",
      "raw_coupang_url": "https://www.coupang.com/vp/products/...",
      "selected_affiliate_url": "https://link.coupang.com/a/...",
      "product_score": 90,
      "queue_status": "scheduled"
    }
  ],
  "error_message": ""
}
```

The app upserts callback items by `id` first, then by `raw_coupang_url`.

## Batch Result Callback

`POST /api/callback/n8n/batch-result`

```json
{
  "request_id": "next_batch-...",
  "status": "success",
  "processed_count": 3,
  "error_count": 0,
  "items": [
    {
      "id": "queue-001",
      "raw_coupang_url": "https://www.coupang.com/vp/products/...",
      "queue_status": "ready_for_manual_upload",
      "video_url": "https://cdn.example/video.mp4",
      "video_snapshot_url": "https://cdn.example/snapshot.jpg",
      "blog_draft_url": "https://docs.example/blog",
      "youtube_upload_status": "ready_to_upload",
      "tiktok_upload_status": "ready_to_upload",
      "threads_post_status": "ready_to_post",
      "error_message": ""
    }
  ]
}
```

## Item Result Callback

`POST /api/callback/n8n/item-result`

```json
{
  "request_id": "retry_item-...",
  "status": "failed",
  "item": {
    "id": "queue-001",
    "queue_status": "error",
    "error_message": "render failed"
  },
  "error_message": "render failed"
}
```

## Operational Notes

- Webhook call success means n8n accepted the request. It does not mean content was published.
- Callback results are the source of truth for queue status synchronization.
- Public YouTube upload remains disabled by default through `youtube_upload_enabled=false`.
