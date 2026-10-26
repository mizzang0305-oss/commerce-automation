# MINZ Cloud Media Factory — One-shot Cloud Encoding Pilot

**Status: Disabled integration candidate. A dedicated private `minz` R2 bucket was created and connector object write/read was verified on 2026-10-26. This does not verify this worker's S3 adapter, Cloud Run execution, or the latest Channel OS queue connection.**

## Channel OS boundary

PR #269 at `4b7366688dfc38fe6b1b92c75398c10ced411903` extends the commerce Next.js worker. The available Channel OS archive is a separate FastAPI/SQLite/ES-module application. Its 2026-10-13 handoff still records a first render as NOT_RUN, and the latest live PC source was unavailable during this review. Do not replace that source with the archive or claim these queues are connected. The commerce renderer requires an affiliate URL, disclosure and a server-signed visual binding; do not fabricate these to render a non-commerce Channel OS draft.

## Existing architecture preserved

The repository already contains product research, content planning, an authenticated video_render worker queue, FFmpeg renderer, Korean captions, thumbnails, upload-package generation, and Cloudflare R2 storage. This PR adds a bounded cloud **encoding worker**, not a new media platform or public posting tool.

Flow:
1. Existing Next.js flow creates an operator-reviewed video_render job.
2. One Cloud Run execution makes at most one claim using the existing authenticated worker API.
3. The worker validates the render plan, HTTPS image hosts, shot count and 15-minute pilot limit.
4. Approved Linux-compatible Korean TTS and existing FFmpeg render the video; background heartbeat prevents the job lease expiring mid-render.
5. Cloud-only `PrivateMediaStorage` writes video, thumbnail, SRT and upload-package beneath `media-factory/` in the private `minz` bucket. The legacy StorageClient is unchanged.
6. Existing completion API receives the result. No YouTube/Instagram/Threads/Metricool post or OAuth action occurs.

## Non-negotiable safety gates

- Cloud execution defaults to OFF with CLOUD_MEDIA_RUN_ENABLED=false. OFF mode neither loads worker credentials nor contacts the queue.
- Must run under a Cloud Run execution ID and isolated worker ID. Must use HTTPS WebApp/R2 URLs, exact trusted CLOUD_MEDIA_IMAGE_HOSTS, STORAGE_BACKEND=r2 and WORKER_JOB_TYPES=video_render only.
- Cloud image downloads reject redirects and disallowed domains, accept JPEG/PNG/WebP only, and enforce a 15 MiB cap. The local worker's behavior remains unchanged. DNS rebinding needs network-level egress restrictions on a production release.
- A **real approved, packaged Linux Korean TTS command** is required before claiming a job; existing provider validation rejects disabled/placeholder modes. The base image does NOT include a voice model. This blocks live narrated videos until a voice adapter is packaged and licensed.
- All third-party media require permission/licensing evidence and source URL/time/hash in the existing content ledger. YouTube/SNS competitor research is metadata/analysis; it does not authorize video-file downloads.
- Biz2Lab Instagram/Threads 2-hour product freshness check must still run at post time. Publishing remains a separate approval boundary.
- Worker API, visual-binding secret and R2 keys go in Google Secret Manager, never the repository, public Next.js variables, logs, or plain command lines. Limit new pilot R2 credentials to `minz` only. `cn-wms-files` is explicitly forbidden.
- The private adapter uses a conditional single PUT, reads the full object back and checks its SHA-256, length, MIME and metadata before returning a review URL (default 900 seconds; maximum 3600). Completion includes durable `private_artifacts` receipts. URL refresh in the existing review UI remains an integration requirement; an expired URL is not a deleted artifact.
- Initial Cloud Run pilot must use --max-retries=0 to prevent repeat R2 upload after ambiguous completion acknowledgement.
- This module does not create or schedule cloud resources, call paid media APIs, or enable upload controls.

## Files

- python-worker/cloud_media_job.py — one-shot worker, job gating, concurrency-safe heartbeat, generic error status
- python-worker/Dockerfile.cloud — Python 3.12, FFmpeg, Korean fonts, non-root user
- python-worker/src/media/image_downloader.py — isolated cloud-only safe image downloader
- python-worker/src/private_media_storage.py — private minz-only storage and integrity receipts
- .dockerignore — excludes credentials, local assets, media files from build context
- cloudbuild.cloud-media.yaml — manual-only Cloud Build
- docs/cloud-media/cloud-run.env.example.yaml — OFF-by-default deployment configuration
- python-worker/tests/test_cloud_media_job.py and test_cloud_image_download.py — unit tests

## Test commands (no external API calls)

    python -m unittest discover -s python-worker/tests -p 'test_cloud_media_job.py' -v
    python -m unittest discover -s python-worker/tests -p 'test_cloud_image_download.py' -v
    python -m unittest discover -s python-worker/tests -p 'test_private_media_storage.py' -v
    python -m unittest discover -s python-worker/tests -p 'test_storage_client.py' -v
    python python-worker/cloud_media_job.py
    # {"status":"disabled","claimed":0,"published":false}

Optional container boot check (downloads base images and Python dependencies):

    docker build -f python-worker/Dockerfile.cloud -t minz-cloud-media:pilot .
    docker run --rm minz-cloud-media:pilot

These are NOT substitutes for a real R2/FFmpeg/TTS/Cloud Run integration smoke.

## Google Cloud deployment template — NOT executed

Prerequisites: separate owner-controlled Google Cloud project, billing limit, Artifact Registry repo minz-media, least-privileged Cloud Run service account, and Secret Manager secrets. Check the precise target before any command. Use a **reviewed commit SHA** for image tag. Keep CLOUD_MEDIA_RUN_ENABLED=false until readiness passes.

    PROJECT_ID="YOUR_GOOGLE_PROJECT_ID"
    REGION="asia-northeast3"
    IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/minz-media/cloud-media:REVIEWED_COMMIT_SHA"
    gcloud builds submit . --project "$PROJECT_ID" \
      --config cloudbuild.cloud-media.yaml --substitutions "_IMAGE=$IMAGE"

    gcloud run jobs deploy minz-cloud-media-pilot \
      --project "$PROJECT_ID" --region "$REGION" --image "$IMAGE" \
      --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=30m \
      --cpu=2 --memory=2Gi \
      --env-vars-file=docs/cloud-media/cloud-run.env.example.yaml \
      --set-secrets=WORKER_API_SECRET=minz-worker-secret:latest,WORKER_VISUAL_BINDING_SECRET=minz-visual-binding:latest,R2_ACCESS_KEY_ID=minz-r2-key-id:latest,R2_SECRET_ACCESS_KEY=minz-r2-secret:latest \
      --service-account=minz-media-runner@YOUR_GOOGLE_PROJECT_ID.iam.gserviceaccount.com

    # Initial disabled boot only (does not claim jobs):
    gcloud run jobs execute minz-cloud-media-pilot --project "$PROJECT_ID" --region "$REGION" --wait

The example YAML contains placeholder endpoints and KOREAN_VOICE_PROVIDER=disabled. It cannot be enabled to claim live jobs until reviewed Linux voice assets and the actual R2 account endpoint are configured. No public R2 domain is required. Any queue test requires authorized source assets, approved TTS, signed render plan, and producer queue entry.

On 2026-10-26 the user linked Google billing. The observed console still showed Cloud Run Admin API disabled and the current identity unable to enable it. No Cloud Build, Cloud Run job or paid provider was launched. New charges, Production deployment and publication require separate approval; billing linkage alone does not approve them.

## Acceptance evidence before Production

Container: Python 3.12 / FFmpeg libx264 AAC / Korean fonts / non-root runtime.
Voice: approved real Korean narration with non-silent sample and license record.
Queue: atomic claim / heartbeat / completion / failure / ambiguous acknowledgement reconciliation.
Storage: all four R2 objects exist privately in `minz`; full readback hash, MIME, expiry and authorized playback are validated. r2.dev and custom public domains remain disabled.
Media: ffprobe H.264 + AAC, correct length/aspect for Shorts, subtitles/thumbnail synchronized.
Publication: public posting feature flags unchanged; per-channel owner approval + commerce source freshness.
Cost: Cloud Run CPU/memory/time limits, $ budget alarm, abort switch, no surprise schedule.

## Rollback

Disable CLOUD_MEDIA_RUN_ENABLED and stop scheduling further executions. Do not mutate the existing local Windows Worker or delete R2 production objects. A running Cloud Run task is not canceled merely by updating future configuration.

## Next modules

Metadata-only YouTube/SNS source research and rights ledger → approved Korean TTS packaging → one Cloud Run/R2 E2E → platform-specific storyboards (MINZ Father YouTube / Biz2Lab Instagram+Threads) → verified posting adapters → engagement/revenue reporting. Each requires an independent gate; this PR does not claim them as complete.
