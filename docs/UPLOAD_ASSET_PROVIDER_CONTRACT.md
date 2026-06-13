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
- `expires_at` is absent or still in the future

If only a local path exists, readiness must stay blocked with
`server_accessible_asset_required`.

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
