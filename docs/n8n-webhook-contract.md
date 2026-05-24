# n8n Webhook Contract (Legacy / Optional)

This contract is legacy/optional in v1.3. It may be used for Nightly Scout/product collection callbacks, but it is not used by `/api/run/next-batch`.

## Active Replacement For Next Batch

Next-batch video rendering now uses:

- `POST /api/run/next-batch`
- `worker_jobs.json` / production DB equivalent
- Python Worker claim/heartbeat/complete/fail APIs

No `N8N_NEXT_BATCH_WEBHOOK_URL` call is made by the active next-batch path.

## Security Rules

- Do not expose n8n webhook URLs or secrets to the browser.
- Do not include `N8N_WEBHOOK_SECRET` or `COMMERCE_AUTOMATION_API_SECRET` in payload bodies.
- Public YouTube/TikTok/Threads upload remains disabled.

## Optional Nightly Scout Request

`POST N8N_NIGHTLY_SCOUT_WEBHOOK_URL`

```json
{
  "type": "nightly_scout",
  "request_id": "nightly_scout-...",
  "requested_at": "2026-05-24T00:00:00.000Z",
  "settings": {},
  "requested_count": 69,
  "mode": "generate_queue",
  "callback": {
    "url": "http://localhost:3000/api/callback/n8n/nightly-scout",
    "method": "POST"
  }
}
```

## Optional Nightly Scout Callback

`POST /api/callback/n8n/nightly-scout`

```http
Authorization: Bearer COMMERCE_AUTOMATION_API_SECRET
Content-Type: application/json
```

```json
{
  "request_id": "nightly_scout-...",
  "status": "success",
  "queue_date": "2026-05-24",
  "created_count": 69,
  "items": [
    {
      "id": "queue-001",
      "queue_rank": 1,
      "scheduled_at": "2026-05-24T01:00:00.000Z",
      "keyword": "keyword",
      "product_name": "product",
      "raw_coupang_url": "https://www.coupang.com/vp/products/example",
      "selected_affiliate_url": "https://link.example/affiliate",
      "product_score": 90,
      "queue_status": "scheduled"
    }
  ],
  "error_message": ""
}
```

## Legacy Batch/Retry Callbacks

The old batch/retry callback routes still exist for compatibility, but v1.3 next-batch dispatch should not depend on them. Worker completion is the source of truth for rendered artifacts.

## Operational Notes

- n8n success means the workflow accepted a request, not that content was generated or published.
- Worker success requires valid result URLs.
- `video_render` completion without `video_url` is rejected and cannot produce `video_ready`.
