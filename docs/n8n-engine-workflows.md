# n8n Automation Engine Workflows (Legacy / Optional)

This document is retained for legacy reference. In v1.3 worker architecture, `/api/run/next-batch` does not call n8n. Next-batch video rendering is handled by web-managed `worker_jobs` and the Python Worker.

## Current Role Of n8n

n8n may still be used for:

- Nightly Scout/product collection.
- Legacy callback testing.
- Historical reference for previous workflow design.

n8n must not be treated as the active video render engine for next-batch.

## Legacy Workflows

Existing workflow exports:

- `n8n/workflows/A_Nightly_Scout_69.json`
- `n8n/workflows/B_Next_Batch_3.json`
- `n8n/workflows/C_Retry_Item.json`

`B_Next_Batch_3` is legacy for v1.3. The active implementation is:

1. `POST /api/run/next-batch`
2. Web app creates `video_render` rows in `worker_jobs`
3. Python Worker claims jobs
4. Worker uploads artifacts to storage
5. Worker completes/fails jobs through worker APIs

## Legacy Callback Headers

If n8n is used for Nightly Scout callbacks, requests must use:

```http
Authorization: Bearer COMMERCE_AUTOMATION_API_SECRET
Content-Type: application/json
```

Do not expose n8n webhook URLs or secrets to the browser.

## Safety Notes

- Actual YouTube/TikTok/Threads public upload nodes must remain absent or disabled.
- Public upload remains disabled by default.
- n8n webhook acceptance is not content success.
- Next-batch content success is now based on worker job results and storage URLs.
