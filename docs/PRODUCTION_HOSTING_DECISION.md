# Production Hosting Target Decision

Status: decision package, no deployment executed.

Last reviewed: 2026-06-04.

## Recommendation

Use this as the first production-like MVP target:

1. WebApp: Vercel-hosted Next.js service.
2. Repository: Supabase/Postgres.
3. Artifact storage: Cloudflare R2 with the existing four-bucket layout.
4. Python Worker: operator-controlled Windows machine for the first production pilot.
5. Uploads: manual-only channel upload packages.

This keeps the current verified pipeline intact:

```text
Coupang candidate -> queue -> content draft -> next-batch -> Python Worker -> R2 -> video_ready -> channel upload package -> manual upload tracking
```

No production deployment is performed by this decision package.

## Why This Target

The WebApp is already a Next.js admin service. Vercel is a good fit for hosting the control room and server API routes, while Supabase and R2 already cover shared state and artifacts.

The Python Worker is the highest-risk runtime because it depends on Python, ffmpeg, image download behavior, and R2 upload credentials. Keeping it on the existing operator-controlled Windows environment for the first production pilot avoids introducing cloud worker packaging risk at the same time as WebApp hosting.

This is not the final architecture. It is the lowest-risk first operating target.

## Option Comparison

| Option | WebApp fit | Python Worker fit | Operational risk | Cost shape | Recommendation |
| --- | --- | --- | --- | --- | --- |
| Vercel WebApp + local Windows Worker | Strong Next.js fit | Uses current worker setup | Low initial migration risk; PC uptime required | Web hosting plus local machine cost | Recommended first pilot |
| Render Web Service + Render Background Worker | General web service fit | Background workers are first-class continuous services | Medium; worker packaging and always-on service setup required | Separate web/worker services | Good second target if local worker uptime is unacceptable |
| Fly.io Web + Machine Worker | Good for containerized apps | Good for persistent machine-style worker control | Medium-high; container/runtime/networking decisions required | Usage/resource based | Good if precise worker lifecycle control is needed |
| Railway Web + Worker Service | Good for simple app hosting | Possible service-based worker setup | Medium; billing and service topology should be watched | Base subscription plus usage | Viable for simple all-in-one cloud experiments |
| VPS for both WebApp and Worker | Flexible | Flexible | Highest ops burden for patching, process supervision, TLS, monitoring | Fixed server cost | Use only if cost predictability or full control is more important than managed DX |

Provider pricing and limits change. Verify official pricing and limits before purchase or production rollout:

- Vercel pricing: https://vercel.com/pricing
- Vercel pricing docs: https://vercel.com/docs/pricing
- Render background workers: https://render.com/docs/background-workers/
- Render pricing: https://render.com/pricing/
- Fly Machines: https://fly.io/docs/machines/overview/
- Fly pricing: https://fly.io/docs/about/pricing/
- Railway pricing: https://docs.railway.com/pricing

## Target Architecture

```text
Operator browser
  -> Vercel WebApp
      -> Supabase/Postgres repository
      -> worker API endpoints

Local Windows Python Worker
  -> polls Vercel WebApp worker APIs
  -> downloads product images
  -> renders video with ffmpeg
  -> uploads video/thumbnail/subtitle/upload_package to R2
  -> reports completion to WebApp
```

The Python Worker must not connect to Supabase DB directly. It only talks to the WebApp API.

## Required WebApp Env

Set these in the hosting provider secret store, not in client-side variables:

```text
AUTOMATION_REPOSITORY_ADAPTER=supabase
SUPABASE_URL=<server only>
SUPABASE_SERVICE_ROLE_KEY=<server only>
WORKER_API_SECRET=<server only>
PUBLIC_APP_BASE_URL=https://<production-webapp-host>
CONTENT_AI_PROVIDER=template
ENABLE_DEV_TOOLS=false
ENABLE_MOCK_STORAGE_ROUTE=false
```

Do not set:

```text
NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_WORKER_API_SECRET
NEXT_PUBLIC_COUPANG_SECRET_KEY
NEXT_PUBLIC_OPENAI_API_KEY
NEXT_PUBLIC_GEMINI_API_KEY
```

## Required Worker Env

Set these only on the worker machine:

```text
WEB_APP_BASE_URL=https://<production-webapp-host>
WORKER_API_SECRET=<same server secret>
WORKER_ID=production-worker-1
WORKER_JOB_TYPES=video_render,sheet_sync
POLL_INTERVAL_SECONDS=5
HEARTBEAT_INTERVAL_SECONDS=15
STORAGE_BACKEND=r2
R2_ENDPOINT_URL=<storage endpoint>
R2_ACCESS_KEY_ID=<storage key>
R2_SECRET_ACCESS_KEY=<storage secret>
R2_REGION=auto
R2_PUBLIC_BASE_URL_RENDERED_VIDEOS=<public or custom domain>
R2_PUBLIC_BASE_URL_THUMBNAILS=<public or custom domain>
R2_PUBLIC_BASE_URL_SUBTITLES=<public or custom domain>
R2_PUBLIC_BASE_URL_UPLOAD_PACKAGES=<public or custom domain>
```

Do not put `SUPABASE_SERVICE_ROLE_KEY` in `python-worker/.env`.

## Production Smoke Gate

Before accepting this target, run the checklist in `checklists/production-hosting-target-checklist.md`.

Minimum pass criteria:

- WebApp diagnostics show configured booleans only.
- `repository.adapter=supabase`.
- Dev mutating routes are blocked in normal production.
- Candidate import creates only a candidate.
- Promotion creates queue/content scaffold only.
- Content draft creates zero worker jobs.
- `next-batch` creates the worker job.
- Python Worker is started outside WebApp.
- Worker completion requires `video_url`.
- R2 artifacts return HTTP 200 or valid signed URL responses.
- Channel upload package stays `manual_ready`.
- `upload_enabled=false`.
- `manual_upload_only=true`.

## Explicitly Out Of Scope

- Executing a production deployment.
- YouTube OAuth flow.
- OAuth token storage.
- YouTube `videos.insert`.
- TikTok Direct Post.
- Threads post.
- Public upload enablement.
- ViMax dependency.
- External video/image API calls.
- WebApp launching Python Worker.

## When To Move Beyond The First Target

Move from local Windows Worker to a cloud worker only when at least one is true:

- The operator PC cannot stay online during scheduled production windows.
- Multiple workers are needed.
- Monitoring and restart behavior must be managed centrally.
- Local network or OS updates interrupt worker availability.
- A containerized ffmpeg/Python Worker image has passed the same R2 smoke gate.

Preferred next cloud-worker target: Render Background Worker or Fly Machine, depending on whether managed service simplicity or machine lifecycle control matters more.
