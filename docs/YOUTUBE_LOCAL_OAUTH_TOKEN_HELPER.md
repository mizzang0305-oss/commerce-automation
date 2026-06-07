# YouTube Local OAuth Token Helper

This helper prepares a local YouTube OAuth token file for a separately approved private upload smoke. It is local-only and approval-gated.

It does not run during normal validation, does not enable public upload, does not run `videos.insert`, and does not print token values.

## Required Environment Names

Configure values only in the local operator shell. Do not commit them.

- `YOUTUBE_CLIENT_ID`
- `YOUTUBE_CLIENT_SECRET`
- `YOUTUBE_REDIRECT_URI`
- `YOUTUBE_UPLOAD_SCOPE`
- `YOUTUBE_TOKEN_FILE`

Recommended token file path:

```text
C:\Users\LOVE\.commerce-automation\youtube-token.json
```

The token file must be outside this repository. Paths inside `C:\Users\LOVE\MyProjects\commerce-automation` are blocked.

## Commands

Print an authorization URL:

```powershell
node scripts/youtube-local-oauth-helper.mjs print-auth-url
```

This does not call Google APIs and does not write files.

Exchange an auth code for a local token file:

```powershell
node scripts/youtube-local-oauth-helper.mjs exchange-code --code "<AUTH_CODE>" --confirm APPROVE_YOUTUBE_LOCAL_OAUTH_TOKEN_GENERATION
```

The exchange command is blocked unless the exact confirmation phrase is supplied:

```text
APPROVE_YOUTUBE_LOCAL_OAUTH_TOKEN_GENERATION
```

Validate token file metadata:

```powershell
node scripts/youtube-local-oauth-helper.mjs validate-token-file
```

The validation output reports metadata only:

- `access_token_present`
- `refresh_token_present`
- `scopes_ready`
- `raw_token_returned=false`

It does not print access tokens, refresh tokens, client secrets, or raw Authorization headers.

## Safety Boundary

- Token generation is not executed by default.
- Live YouTube upload smoke is not executed by this helper.
- `RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE` remains a separate gate for any future live smoke.
- Public upload remains blocked.
- OAuth token files are local operator files and must not be committed.
- WebApp readiness checks token metadata only.
