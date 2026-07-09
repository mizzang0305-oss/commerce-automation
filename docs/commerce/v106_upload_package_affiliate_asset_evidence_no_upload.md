# V106 Upload Package Affiliate And Asset Evidence No-Upload

## Purpose

V106 connects the V105 selected queue item to upload package readiness evidence.

This is not an upload feature. It does not call YouTube, n8n, scheduler execution, Supabase, R2, storage, DB, or product asset writes. It only reports whether the selected queue item has enough sanitized evidence to discuss a later manual upload-readiness step.

## Source

- Queue source: V105 selected queue item.
- Default channel: `father_jobs`.
- Default mode: `dry_run`.
- Blocked mode: `execute`.
- Upload package source: injected test fixture or existing V073 package generation path.

V106 uses the selected queue item as the source of truth and checks whether a matching upload package exists for the same `channelKey` and queue item.

## Evidence Checked

V106 reports only booleans and hash prefixes:

- `selectedItemFound`
- `uploadPackageFound`
- `packageChannelMatches`
- `packageQueueItemMatches`
- `titlePresent`
- `descriptionPresent`
- `tagsPresent`
- `categoryIdPresent`
- `coupangDisclosurePresent`
- `affiliateEvidencePresent`
- `affiliateEvidenceHashPrefix`
- `videoAssetEvidencePresent`
- `videoAssetHashPrefix`
- `firstFrameEvidencePresent`
- `firstFrameHashPrefix`
- `preparedHttpsAssetEvidencePresent`
- `preparedAssetServerAccessible`
- `preparedAssetHashPrefix`

## Blocker Policy

| Status | Meaning |
| --- | --- |
| `SUCCESS_V106_UPLOAD_PACKAGE_EVIDENCE_READY_NO_UPLOAD` | Package, affiliate, disclosure, video, first-frame, and prepared HTTPS asset evidence are present. |
| `BLOCKED_V105_NO_QUEUE_ITEM_FOR_NEXT_BATCH_NO_UPLOAD` | V105 cannot select a queue item. |
| `BLOCKED_V106_UPLOAD_PACKAGE_MISSING_NO_UPLOAD` | No matching upload package exists for the selected queue item. |
| `BLOCKED_V106_AFFILIATE_OR_DISCLOSURE_EVIDENCE_MISSING_NO_UPLOAD` | Affiliate or Coupang Partners disclosure evidence is missing. |
| `BLOCKED_V081_VIDEO_ASSET_MISSING_NO_UPLOAD` | Video, first-frame, prepared HTTPS, or server-accessible asset evidence is missing. |
| `BLOCKED_V106_SETTINGS_EVIDENCE_INCOMPLETE_NO_UPLOAD` | Title, description, tags, or category evidence is incomplete. |
| `BLOCKED_V106_EXECUTE_NOT_APPROVED_NO_UPLOAD` | `V106_MODE=execute` was requested and blocked. |

Even if every evidence field is present, V106 keeps:

- `SAFE_TO_UPLOAD=false`
- `SAFE_TO_PUBLIC_UPLOAD=false`
- `videosInsertCalled=false`
- `commentThreadsInsertCalled=false`

## Redaction

V106 reports must not print:

- raw affiliate URLs
- raw Coupang URLs
- signed URLs
- local absolute asset paths
- full YouTube video IDs
- full YouTube channel IDs
- tokens
- secrets
- Authorization or Bearer values
- HMAC signatures

Safe report values are booleans, enum keys, and hash prefixes only.

## Commands

Dry-run:

```powershell
npm run automation:v106:upload-package-evidence --silent
```

Blocked execute proof:

```powershell
$env:V106_MODE="execute"
npm run automation:v106:upload-package-evidence --silent
Remove-Item Env:V106_MODE
```

## Current Runtime Result

On the current local/mock data after PR #212:

- V105 selected queue item: present.
- V106 upload package match: missing.
- Current blocker: `BLOCKED_V106_UPLOAD_PACKAGE_MISSING_NO_UPLOAD`.
- Upload/comment/scheduler/n8n/storage/DB side effects: false.

## Next Action

`V107_OWNER_REVIEW_FIRST_VIDEO_SETTINGS_TABLE_NO_UPLOAD`

Before any upload-readiness discussion, the owner needs a settings/evidence table showing exactly which package, affiliate, disclosure, and prepared asset evidence is still missing.
