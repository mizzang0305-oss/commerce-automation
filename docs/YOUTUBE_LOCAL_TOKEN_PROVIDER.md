# YouTube Local Token Provider Readiness

This guide prepares local metadata checks for a separately approved YouTube private upload smoke. It does not run OAuth, exchange tokens, upload videos, store tokens in the repository, or enable public upload.

## Safety Boundary

- Live upload smoke is still blocked unless the operator separately configures `RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE`.
- Public uploads remain blocked.
- Token values must never be printed, logged, committed, or shown in the UI.
- The WebApp checks token file metadata only: file placement, file existence, token presence, and the YouTube upload scope.

## Google Cloud Setup Checklist

1. Create or select a Google Cloud project.
2. Enable YouTube Data API v3.
3. Configure the OAuth consent screen.
4. Add the local operator account as a test user.
5. Create an OAuth client for local testing.
6. Use this scope only for upload smoke readiness:

```text
https://www.googleapis.com/auth/youtube.upload
```

Do not commit client secrets, OAuth token responses, refresh tokens, access tokens, or raw Authorization headers.

## Local Token File

Recommended token path:

```text
C:\Users\LOVE\.commerce-automation\youtube-token.json
```

Configure the local WebApp environment with the token file path:

```text
YOUTUBE_LOCAL_TOKEN_FILE_PATH=C:\Users\LOVE\.commerce-automation\youtube-token.json
```

Compatibility fallback:

```text
YOUTUBE_TOKEN_FILE=C:\Users\LOVE\.commerce-automation\youtube-token.json
```

When both are configured, `YOUTUBE_LOCAL_TOKEN_FILE_PATH` takes priority.

The token file must be outside the repository. A path inside `C:\Users\LOVE\MyProjects\commerce-automation` is blocked even if the file exists.

## Readiness API

```text
GET /api/uploads/youtube/token-readiness
```

The response returns status booleans only:

- `configured`
- `token_file_path_configured`
- `token_file_inside_repo`
- `token_file_gitignored_or_outside_repo`
- `token_file_exists`
- `token_ready`
- `scopes_ready`
- `blocked_reasons`
- `raw_token_exposed=false`

It does not return token values, client secrets, refresh tokens, access tokens, or raw token JSON.

## Private Upload Smoke Gate

The live upload smoke remains blocked unless all separately reviewed gates are true:

- YouTube readiness is complete.
- Token readiness is complete.
- Visibility is `private` or `unlisted`.
- Exact upload confirmation is present:

```text
APPROVE_YOUTUBE_PRIVATE_UPLOAD
```

- Separate live smoke approval phrase is configured:

```text
RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE
```

This document does not authorize a live upload. It only documents local readiness preparation.

## Local OAuth Helper

If a local operator needs to create the token file, use the approval-gated helper documented in
[YOUTUBE_LOCAL_OAUTH_TOKEN_HELPER.md](YOUTUBE_LOCAL_OAUTH_TOKEN_HELPER.md).

The helper supports:

- printing an OAuth authorization URL
- exchanging an authorization code only with exact approval
- validating token file metadata without printing token values

It does not run during validation and does not authorize live upload smoke.
