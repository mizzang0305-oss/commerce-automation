# Commerce Studio V1 — read-only Preview slice

## Scope and source of truth

The Studio is a separate UI at `/studio`; the legacy operator console remains at `/dashboard`. The design reference is the Owner-provided `commerce-studio-design-kit.zip`. Its product names, counts, and channel examples are **not** operational data.

The new read model uses the existing external `SIMPLE_PRODUCER_CONFIG_PATH`, its `evidenceRoot/simple-producer-state.json`, and `YOUTUBE_PUBLIC_PUBLISHER_STATE_PATH`. No search, media generation, OAuth, or upload is triggered by a Studio page request.

| Surface | Actual source | Missing source behavior |
| --- | --- | --- |
| Schedule and settings | `simple-producer/v1` external config | No schedule/settings shown |
| Slot execution | `simple-producer-state.json` | Past slots say “실행 확인 불가”; no invented zero |
| Content and upload counts | Publisher jobs and ledger | “확인 불가”; no sample data |
| Two YouTube channels | Existing expected IDs and historical ledger | Historical upload is not called current OAuth identity |
| Instagram / TikTok | No configured official app/OAuth integration | “앱 등록 · OAuth 대기” |

The page calculates 14 days of history and 7 days ahead in Asia/Seoul. Future products remain unassigned until the producer has selected one. Ledger-only records have no fabricated product name/title/published time.

## Activation boundary

- `COMMERCE_STUDIO_ENABLED=true`: enable explicitly in a local runtime.
- `VERCEL_ENV=preview`: enable in Preview unless explicitly set to `false`.
- Production is **off by default**; `/` continues to the existing dashboard and `/studio` returns 404.
- The current Vercel project has deployment-level authentication for Preview. That is not an application owner session or authorization to mutate the stable Windows host.

## Pending operating controls

Product replacement, web settings application, and account connection actions are visibly disabled. This is intentional: the current `main` web app has no owner session; the simple producer has no versioned planned-product contract; and Vercel cannot directly read or command the Windows host. Enabling buttons without owner authorization, source-policy validation, atomic expected-version comparison, host ACK, and an audited command transport would be a false success.

The existing `/api/settings` controls a separate legacy automation setting and must not be used as the simple-producer settings endpoint. The two YouTube publisher token routes and scheduled tasks are untouched. Instagram and TikTok need registered official apps and consent; they are not auto-publish routes.

## Validation status

- Local UI at 1440px and 390px: browser screenshots, navigation and console checked.
- Local real-source readback: publisher state and producer config read-only; producer state file currently absent, so generated/failed counts remain unknown.
- Preview: requires new Draft PR deployment and authenticated browser verification. No live host data bridge is configured.
- No platform upload, Scheduled Task mutation, Sheets mutation, or production DB mutation is part of this slice.

## Rollback

Set `COMMERCE_STUDIO_ENABLED=false` (or revert this PR). Existing `/dashboard`, simple producer, publisher and channel tokens are not modified.
