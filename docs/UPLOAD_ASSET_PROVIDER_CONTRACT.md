# Upload Asset Provider Contract

This contract separates localhost video smoke evidence from domain-ready upload
assets.

Local Windows paths such as `C:\...\video.mp4` and serverless runtime paths such
as `/var/task/.../video.mp4` are diagnostics only. They are not domain-ready
upload inputs because a deployed serverless function cannot see the operator's
Windows filesystem and should not treat build/runtime package files as product
upload assets.

## Prepared Video Asset Reference

YouTube upload prepare and execute flows should use a server-accessible asset
reference:

```ts
export interface PreparedVideoAssetRef {
  asset_id: string;
  storage_key?: string | null;
  signed_url?: string | null;
  prepared_video_asset_url?: string | null;
  mime_type: "video/mp4";
  size_bytes?: number | null;
  checksum_sha256?: string | null;
  expires_at?: string | null;
  provider: "local_dev" | "r2" | "supabase_storage" | "signed_url" | "external_https";
  server_accessible: boolean;
}
```

Domain readiness requires:

- `server_accessible=true`
- `mime_type=video/mp4`
- `provider` is not `local_dev`
- a server-readable reference exists:
  - `signed_url`
  - `prepared_video_asset_url`
  - or a storage-backed `storage_key` that a server adapter can resolve
- when `signed_url` is used, `expires_at` is present and still in the future

If only a local path exists, readiness must stay blocked with
`server_accessible_asset_required`.

## Prepared Video Asset Provider Flow

`POST /api/uploads/assets/prepare-video-asset` is a prepare-only contract
validator for operator-provided domain assets. It accepts manual signed URL,
external HTTPS URL, R2, or Supabase Storage references and returns a sanitized
summary that can be copied into the product package prepare flow.

It does not:

- upload to R2 or any other storage provider
- write to Supabase or another database
- create queue rows or worker jobs
- call YouTube, Google OAuth, TikTok, or Threads
- return raw tokens, client secrets, Authorization headers, or unmasked signed
  URL query parameters

The response always includes explicit side effects:

```json
{
  "side_effects": {
    "external_api_called": false,
    "r2_uploaded": false,
    "db_written": false,
    "queue_created": false,
    "worker_job_created": false
  }
}
```

## One-product Video Asset Entrypoint

`POST /api/uploads/youtube/real-product-pilot/video-asset/prepare` is the
candidate-only bridge before real product auto pilot package preparation. It is
approval-gated and scoped to one candidate at a time.

Supported modes:

- `dry_run`: validates that the candidate is real, has a valid affiliate URL,
  has a ready product image, and is not a smoke/test candidate.
- `generate_local_only`: requires `RUN_REAL_PRODUCT_VIDEO_ASSET_GENERATION`.
  Local video output is local-only and must not be treated as domain-ready.
- `register_server_asset`: requires
  `APPROVE_SINGLE_SERVER_ACCESSIBLE_VIDEO_ASSET_REGISTRATION`, validates a
  server-accessible `PreparedVideoAssetRef`, and returns a one-row
  `product_assets` write plan.

This entrypoint currently returns contract metadata only. It must not upload to
R2, write `product_assets`, create queue rows, create worker jobs, persist upload
packages, call YouTube, or expose raw affiliate URLs, image URLs, signed URLs,
prepared asset URLs, tokens, client secrets, or Authorization headers.

Candidate-linked server assets can be detected by real product auto pilot when a
`video` product asset includes `render_qa_metadata.product_candidate_id` matching
the selected candidate id and the asset validates as server-accessible
`video/mp4`.

Blocked examples:

- `windows_local_path`
- `var_task_runtime_path`
- `relative_mp4_path`
- `server_accessible_false`
- `all_server_refs_missing`
- `signed_url_expired`
- `mime_type_invalid`
- `size_bytes_missing`
- `size_bytes_zero`

Signed URLs are allowed as input, but UI/API display must mask query strings,
for example `https://assets.example.test/video.mp4?[redacted]`.

## Token Provider Contract

Domain upload readiness also requires a server-only token provider contract.
The client and API responses must expose only booleans, blocker names, and safe
messages.

```ts
export interface YouTubeTokenProvider {
  getReadiness(): Promise<YouTubeTokenReadiness>;
  getAccessTokenForServerUpload(): Promise<string>;
}

export interface YouTubeTokenReadiness {
  provider_configured: boolean;
  token_ready: boolean;
  scopes_ready: boolean;
  account_ready: boolean;
  quota_ready: boolean;
  policy_ready: boolean;
  blockers: string[];
  safe_message: string;
}
```

Do not return or render:

- access tokens
- refresh tokens
- id tokens
- client secrets
- raw OAuth responses
- raw `Authorization` headers

## Current Boundary

This project currently supports:

- localhost/private smoke diagnostics
- copy-only product package prepare
- domain-ready asset and token provider contracts
- private/manual approval gates

It does not enable:

- public upload
- token/client secret exposure
- automatic YouTube/TikTok/Threads publishing
- database writes from upload prepare
- worker job creation from upload prepare

## Operator Meaning

`local smoke passed` means the local development path was proven.

`domain ready` means the server can access both:

1. a prepared video asset reference, and
2. a server-only token provider.

Those are separate states and must be reported separately.
