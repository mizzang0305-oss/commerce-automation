# YouTube Real Product Auto Pilot Builder

This document defines the prepare-only auto pilot flow for selecting one real Coupang product and preparing a private YouTube product package.

## Scope

The auto pilot reads existing data only:

- `product_candidates`
- `product_queue`
- `product_assets`

It selects a non-smoke real product candidate, matches a server-accessible `video/mp4` asset, and prepares a private package summary.

## Safety Contract

The auto pilot does not execute these actions:

- YouTube upload or `videos.insert`
- public visibility
- database write
- R2 upload
- queue creation
- worker job creation
- upload package persistence

Every API response includes explicit side effects:

```json
{
  "youtube_execute_called": false,
  "youtube_upload_executed": false,
  "videos_insert_called": false,
  "db_written": false,
  "r2_uploaded": false,
  "queue_created": false,
  "worker_job_created": false,
  "upload_package_created": false
}
```

## Selection Rules

Candidates are blocked when they look like smoke/test data, have garbled product names, or do not have a Coupang affiliate URL.

The selected candidate must have a linked queue item and a matching `product_assets` video row that validates as a server-accessible prepared video asset.

Local paths such as Windows `C:\...`, `/var/task/...`, or relative `.mp4` paths are not domain-ready and are blocked.

## API

```text
POST /api/uploads/youtube/real-product-pilot/auto-prepare
```

Request:

```json
{
  "mode": "dry_run",
  "visibility": "private"
}
```

Supported modes:

- `dry_run`
- `prepare_only`

Only `private` and `unlisted` visibility are allowed. `public` is blocked.

The response masks server asset URLs and never returns token material, client secrets, raw `Authorization` headers, or raw signed URL query strings.

## UI

`/uploads` includes a real product auto pilot panel with:

- automatic real product discovery
- prepare-only private package action
- safe selected product summary
- safe asset summary
- explicit side-effect flags

The panel has no execute button. YouTube private execute remains a separate manually approved flow.
