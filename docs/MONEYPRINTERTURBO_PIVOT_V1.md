# MoneyPrinterTurbo Pivot V1

## Decision

The current Coupang-dependent content path is no longer the primary growth path.

```text
PRIMARY_CONTENT_ENGINE=MoneyPrinterTurbo
COUPANG_LIVE_SCOUT=HOLD
COUPANG_PARTNERS_401_RETRY=AUTO_DISABLED
PUBLIC_AUTO_PUBLISH=HOLD_UNTIL_SMOKE_PASS
```

The goal is to reuse the existing `commerce-automation` control plane, scheduling, QA evidence, and publisher ledger while replacing the fragile product-source/render dependency with a topic-to-short-video engine.

## Why this pivot

The current repository already records a persistent external Coupang Partners HTTP 401 blocker. Repeating authentication retries is not productive until the external account/key/permission problem changes.

MoneyPrinterTurbo provides a narrower and more reusable production primitive:

```text
topic / keyword
  -> script
  -> stock or generated media
  -> voice
  -> subtitles
  -> music
  -> rendered short
```

The upstream project exposes WebUI, CLI, and an HTTP API. V1 integration uses its local HTTP API only.

## Architecture

```text
Topic Sources
  - manual owner topic
  - approved trend/research feed
  - Biz2Lab content queue
        |
        v
commerce-automation
  Topic Queue / Schedule / Evidence
        |
        v
MoneyPrinterTurbo adapter
  POST /api/v1/videos
  GET  /api/v1/tasks/{task_id}
        |
        v
Local MP4 result
        |
        v
Existing local QA / approval gates
        |
        v
Existing publisher ledger
        |
        +--> YouTube Shorts
        +--> TikTok
        +--> Instagram Reels
```

Do not couple generation success to Coupang product search, affiliate deep-link creation, or product-image readiness.

## Reuse vs retire

### Reuse

- operator/admin control plane
- scheduler and run evidence
- local QA and owner review gates
- duplicate prevention
- publisher ledger and channel readiness
- rollback/safe-error conventions

### Hold / retire from the primary path

- live Coupang Partners scout
- Coupang-only candidate selection
- Coupang affiliate URL as a required generation field
- product-only use-case routing
- custom render pipeline when MoneyPrinterTurbo can produce the same artifact more cheaply

Keep the old code until V1 proves stable. Do not delete it in this pivot.

## Integration contract

Environment variables:

```text
MPT_BASE_URL=http://127.0.0.1:8080
MPT_API_KEY=<optional, recommended when exposed beyond localhost>
```

Default V1 generation policy:

- output: portrait 9:16
- language: Korean
- one video per task
- subtitles enabled
- stock source: Pexels
- material matching enabled
- public publishing disabled until a local smoke passes

The client implementation lives in:

```text
src/lib/moneyprinterturbo/client.ts
```

## First smoke

Use one owner-approved topic only.

Example:

```text
AI가 바꾼 직장인의 아침 루틴
```

Success criteria:

1. MoneyPrinterTurbo starts locally.
2. `POST /api/v1/videos` returns one task id.
3. task polling reaches a final MP4.
4. Korean subtitles are readable on a 9:16 mobile frame.
5. no Coupang API call occurs.
6. no public social upload occurs.
7. output path and generation evidence are recorded.

## V2 after smoke

Only after V1 passes:

1. add a topic queue and scoring policy,
2. create 3 candidate hooks/scripts and choose one,
3. reuse current QA/duplicate checks,
4. connect the approved MP4 to the existing publisher ledger,
5. enable one platform at a time,
6. keep daily caps and owner-visible failure evidence.

MoneyPrinterTurbo already contains cross-platform publishing support upstream, but this repository should not enable it first. Retaining the existing publisher boundary gives one place for account identity, caps, duplicate prevention, and rollback.

## Monetization direction

MoneyPrinterTurbo is the production engine, not the revenue model.

Priority revenue loops:

1. Biz2Lab lead generation: automation/AI shorts -> landing page -> inquiry.
2. owned content asset: Shorts/Reels/TikTok -> blog/landing page -> email or inquiry.
3. affiliate links only where source data and disclosure are reliable; they are optional, not a hard dependency.

The new KPI is not "Coupang products uploaded". Track:

```text
videos_generated
qa_pass_rate
publish_success_rate
views_24h
profile_clicks
landing_clicks
leads
revenue_per_1000_views
cost_per_published_video
```

## Safety / rollback

- no production deploy in V1
- no scheduler change in V1
- no automatic public upload in V1
- no deletion of the existing Coupang path
- rollback = stop MPT process and leave `MPT_BASE_URL` unset
