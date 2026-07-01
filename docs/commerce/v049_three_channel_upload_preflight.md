# v049 Three-Channel Upload Preflight

v049 prepares a three-channel public upload plan for the v048 owner-approved review packets. It does not upload, create comments, change visibility, write product assets, write the database, or deploy.

## Scope

- Channels: `father_jobs`, `neoman_moleulgeol`, `lets_buy`
- Visibility preview: `public`
- Paid promotion: `contains_paid_promotion=true`
- Kids setting: `made_for_kids=false`
- Description points viewers to the comment link.
- Comment preview requires an affiliate link and Coupang Partners disclosure.
- Reports and HTML previews are sanitized and do not contain raw affiliate URLs.

## Approval Gates

Upload execution requires both exact phrases:

- `APPROVE_V049_EXECUTE_THREE_CHANNEL_ONE_SHOT_PUBLIC_UPLOADS_WITH_COMMENTS`
- `CONFIRM_V049_PAID_PROMOTION_SETTINGS_CHECKED_FOR_ALL_CHANNELS`

Without both phrases, v049 stays in no-upload mode:

- `upload_execution_attempted=false`
- `videos_insert_called=false`
- `comment_create_update_delete_called=false`
- `SAFE_TO_UPLOAD=false`

## Local Commands

```powershell
npm run upload:v049:preflight
```

The preflight writes local-only artifacts under:

```text
commerce-assets/review/v049
```

These artifacts must not be committed.

The execute command is also guarded:

```powershell
npm run upload:v049:execute
```

In this PR, the execute command remains blocked unless a future approved task injects the reviewed YouTube adapter and supplies fresh approval plus manual paid promotion confirmation.

## Safety

- No YouTube Execute in preflight.
- No `videos.insert`.
- No comment create/update/delete.
- No existing video visibility change.
- No R2 upload.
- No `product_assets` write.
- No DB write.
- No raw affiliate URL or secret output.
