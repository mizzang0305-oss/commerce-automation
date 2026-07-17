# V140 Worker pre-render binding integration

## Decision

V139 promotion evidence is integrated into the local Worker code path behind a fail-closed server-authoritative binding contract. This is local code only. It is not committed, published, deployed, rendered, or uploaded.

## Server authority contract

`/api/run/next-batch` now creates a versioned HMAC binding for every `video_render` job. The binding covers:

- queue identity
- product-name digest
- selected affiliate URL digest
- rendered voice-script digest
- canonical full render-plan digest, including captions, durations, disclosure, image URLs, and render target
- selected visual format
- normalized server product category
- manifest purpose
- per-scene image URL digests and category labels

The contract contains no secret and does not retain raw product or affiliate URLs. `WORKER_VISUAL_BINDING_SECRET` must be a separate server-only/Worker-only random value of at least 32 characters.

If the secret or authoritative category is missing, next-batch moves the item to `manual_review` and creates zero Worker jobs.

## Worker gate order

The Python Worker now executes these steps before Korean TTS or final render:

1. require a render plan and server visual binding
2. verify HMAC with constant-time comparison
3. recompute queue, product, affiliate, script, full render-plan, image, format, and category bindings
4. download each distinct image once while preserving the five-scene timeline
5. apply the V139 format profile to downloaded pixels
6. block before TTS/render/storage upload if any binding or pixel gate fails

The upload package and Worker result include sanitized gate metadata only. Raw URLs, paths, and secrets are excluded from the gate report.

## Default repeat profile

The deterministic server template now contains five scenes and lasts 22 seconds. All five scenes retain the exact product image, so it is classified as `product_reference_repeat` and must contain one to three exact downloaded sources.

The added `identity_confirm` scene keeps the product reference explicit. A four-source identity-drift package is blocked before TTS.

## Spoof tests

Node and Python share one fixed HMAC test vector. Python tests reject tampering of:

- product name
- script
- caption
- shot duration
- image URL
- disclosure
- category
- queue ID
- missing/short secret
- missing binding

Runtime pixel tests pass one exact source repeated five times and block four exact sources in the same category. A blocked gate does not call TTS, final render, or storage upload.

## Validation

- focused TypeScript: 38/38 PASS
- full Vitest: 1,353/1,353 PASS
- focused Python integration: 17/17 PASS before the config test addition
- full Python unittest: 81/81 PASS
- changed-file ESLint: PASS
- Python compileall: PASS
- mojibake scan: 854 files, zero matches
- `git diff --check`: PASS for tracked changes
- full `tsc --noEmit`: existing repository-wide test diagnostics remain; filtered output contains no diagnostics for the changed TypeScript files

## Deployment boundary and rollback

Deployment is not authorized. Before any later rollout:

1. pause new Worker job creation and drain or explicitly handle unsigned pending jobs
2. configure the same new secret in the Web server and persistent Worker without exposing it
3. deploy/restart both sides inside an approved maintenance window
4. run one non-upload signed job pilot and confirm binding/gate metadata
5. resume job creation only after the pilot passes

Rollback is code revert plus removal of the new secret after all signed jobs are drained. Deploying only one side is unsafe: a new Worker rejects old unsigned jobs, while an old Worker does not enforce the new gate.

## Safety

- commit/push/PR/merge/deploy: not performed
- TTS/final render/storage upload/platform upload: not performed
- comment/public visibility mutation: not performed
- `SAFE_TO_UPLOAD=false`
- `SAFE_TO_PUBLIC_UPLOAD=false`
