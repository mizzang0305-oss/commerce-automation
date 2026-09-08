# YouTube Upload Automation V2-A — Private Canary Readiness

## Scope

V2-A implements a separate, private-only YouTube upload contract. It does not change or reinterpret Daily69 V1 operation evidence and it does not authorize an upload.

Current implementation base:

- source SHA: `aa742b3e193c848451029d98fc4d86351a9a8cd5`
- source tree: `865d2802bd4a46b48c8084ab26cde659bff3551d`
- V2 branch: `codex/youtube-upload-automation-v2-private-canary-no-public`
- V1 operation observed during implementation: `operation-2026-09-09`, `tasks_armed`, `SAFE_TO_UPLOAD=false`, `PLATFORM_UPLOAD=0`

V1 Queue, Reserve, Sheets, Task Scheduler definitions, pointers, manifests, retained receipts, videos, runtime capsule, and Level3 evidence are immutable inputs outside this implementation.

## Default safety state

```text
YOUTUBE_UPLOAD_ENABLED=false
YOUTUBE_AUTO_UPLOAD=false
YOUTUBE_PUBLIC_UPLOAD_ENABLED=false
YOUTUBE_PUBLICATION_ENABLED=false
PUBLIC_UPLOAD_ENABLED=false
SAFE_TO_UPLOAD=false
```

The readiness evaluator requires every flag above to remain false. The production coordinator cannot call its adapter unless all of the following are separately true at execution time:

1. exact Owner phrase `APPROVE_YOUTUBE_PRIVATE_CANARY_UPLOAD`;
2. a previously generated readiness result is ready;
3. `YOUTUBE_UPLOAD_ENABLED=true` and `SAFE_TO_UPLOAD=true` are deliberately supplied to the one-item coordinator;
4. auto-upload, public-upload, and publication flags remain false;
5. no successful or ambiguous idempotency record exists.

There is no scheduler, public/unlisted adapter, bulk worker, publication endpoint, or approval alias in V2-A.

## Modules

| Module | Contract |
| --- | --- |
| `constants.ts` | V2-A default-off flags, exact upload scope, canonical ID/hash patterns |
| `uploadPackage.ts` | Exact operation/product/affiliate/video/metadata/channel/source binding and canonical package digest |
| `localVideoAsset.ts` | Absolute-path allowlist, realpath containment, symlink rejection, size cap, exact bytes SHA-256 |
| `channelIdentity.ts` | Fixed `channels.list(part=id,mine=true)` readback through an already-authorized fetch boundary; exact three-way channel match |
| `readiness.ts` | Fail-closed OAuth/API-project/quota/package/adapter/idempotency/receipt/readback readiness report |
| `resumablePrivateUploadAdapter.ts` | Official-host-only resumable session, 308 continuation, status probe, bounded 5xx/network retry, terminal 4xx, ambiguous outcome |
| `readbackVerifier.ts` | Exact video ID, channel, private visibility, title, and safe description-digest verification |
| `idempotencyReceipt.ts` | Canonical idempotency key and exclusive-create success/ambiguous records with an allowlisted secret-free schema |
| `privateCanaryCoordinator.ts` | One item only; exact Owner phrase; duplicate/ambiguous reconciliation before any adapter call |

## Upload package contract

Each package binds:

- operation namespace and product ID;
- affiliate URL;
- absolute video reference, SHA-256, size, and `video/mp4` MIME type;
- exact title, description, ordered tags, category, and made-for-kids declaration;
- `private` visibility only;
- canonical target channel ID;
- source Git SHA;
- deterministic SHA-256 package digest.

The caller must run `readAndVerifyV2ALocalVideoAsset` immediately before upload and compare the returned bytes, size, SHA-256, MIME type, and real path with the approved package. A changed file invalidates the package.

## OAuth and channel contract

- Required upload scope: `https://www.googleapis.com/auth/youtube.upload`.
- Raw access token, refresh token, client secret, Authorization header, and resumable session URI are prohibited from readiness reports and receipts.
- The channel probe accepts an authorized fetch function rather than raw credentials.
- Configured, operation-selected, package, authenticated, returned-resource, and post-upload channel IDs must match exactly. Display names are not identity.

If an actual channel ID, OAuth expiry, sanitized account relationship, Google Cloud project status, API enablement, OAuth consent/audit status, or privacy restriction readback is absent, readiness stays blocked.

## Quota contract

As observed in official YouTube Data API documentation on 2026-09-08, `videos.insert` uses a separate Video Uploads bucket, costs 1 unit per call, and the documented default is 100 calls per day. Defaults are subject to change.

- Reference: <https://developers.google.com/youtube/v3/docs/videos/insert>
- Overview: <https://developers.google.com/youtube/v3/getting-started>

V2-A does not hardcode those values as runtime success. Readiness requires a current sanitized project readback containing the actual limit, usage, unit cost, capture time, intended 69 uploads, and reserved retry headroom. Missing or insufficient evidence blocks readiness.

## API project constraint

YouTube documents that uploads from unverified API projects created after 2020-07-28 are restricted to private viewing until the project passes an audit. V2-A records `private_only` as a known constraint, never works around it, and still rejects public/unlisted metadata explicitly.

## Resumable and retry behavior

The adapter:

1. creates one resumable session against the official Google upload endpoint;
2. uploads bytes with `Content-Range`;
3. continues from the `Range` confirmed by HTTP 308;
4. probes the same session after network/500/502/503/504 uncertainty;
5. honors `Retry-After` or uses bounded exponential delay;
6. treats 4xx as terminal;
7. returns `ambiguous` when completion cannot be reconciled;
8. never creates a second session for an ambiguous request.

The raw session URI and transport error body are not returned.

## Readiness versus real capability

Unit tests use fake transports and synthetic evidence. They may prove contract behavior, but they do not prove any current Google account, channel, quota, API project, video, or platform upload.

The only valid current state before an approved live readback is:

```text
IMPLEMENTATION=LOCAL_VERIFIED_OR_PR_VALIDATED
RUNTIME_CHANNEL_ID=NOT_VERIFIED
OAUTH_READINESS=NOT_VERIFIED
API_PROJECT_STATUS=NOT_VERIFIED
QUOTA_READINESS=NOT_VERIFIED
PRIVATE_CANARY_EXECUTED=NO
BULK_UPLOAD=0
PUBLIC_UPLOAD=0
PLATFORM_UPLOAD=0
```

After V1 final audit passes, the Owner may authorize exactly one private upload with:

```text
APPROVE_YOUTUBE_PRIVATE_CANARY_UPLOAD
```

That token does not authorize Daily69 bulk automation, public/unlisted visibility, subscriber notifications, Ready/merge, or Production deployment.
