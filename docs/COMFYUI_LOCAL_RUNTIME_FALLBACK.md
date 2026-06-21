# ComfyUI Local Runtime Fallback

Date: 2026-06-21 KST

Scope: diagnosis and architecture handoff only. This document does not reinstall
ComfyUI, download Wan models, change GPU settings, submit workflows, generate
motion clips, upload to R2, write to DB, or call YouTube.

## Current Diagnosis

The commerce automation repo config reached the local setup gate:

- ComfyUI Wan config: PASS
- workflow JSON: PASS
- local smoke: BLOCKED
- blocker: `COMFYUI_LOCAL_SERVER_UNREACHABLE`

The local Desktop/backend failure happens before ComfyUI exposes HTTP on
localhost. The observed crash evidence is:

- process exit code: `3221225477`
- Windows fatal exception: access violation
- crash point: `torch.cuda.is_available`
- stack includes `comfy_kitchen/backends/cuda`

That makes the active blocker a local runtime startup failure, not a motion
provider contract, `.env.local`, or workflow JSON problem.

## Decision

Keep `comfyui_wan_i2v` in the codebase, but treat it as unavailable until the
local runtime starts successfully and `/system_stats` is reachable.

The local adapter remains disabled by default and still requires explicit local
smoke approval. It is not deleted because it remains useful when the operator
can run either:

- ComfyUI Desktop in a mode that does not crash during CUDA discovery.
- ComfyUI Windows Portable as an isolated runtime.
- A CPU-only startup path for diagnosis, if the operator chooses to test it
  manually.

## Runtime Branches For Manual Follow-up

1. Desktop CPU mode check
   - Purpose: distinguish CUDA driver/runtime crash from general Desktop
     startup failure.
   - Codex action: none. The operator must run this manually.

2. Windows Portable check
   - Purpose: isolate Desktop wrapper/runtime issues from a standard portable
     ComfyUI environment.
   - Codex action: none. No install or model download is performed by this repo
     task.

3. NVIDIA driver / PyTorch CUDA compatibility check
   - Purpose: investigate the access violation around `torch.cuda.is_available`.
   - Codex action: none. No driver, CUDA, or PyTorch changes are made here.

## Fallback Strategy

Because the local runtime is unavailable, the motion-first provider router now
adds a disabled-by-default `cloud_image_to_video` scaffold ahead of ComfyUI.

Priority:

1. `cloud_image_to_video`, only when configured and cost-approved.
2. `comfyui_wan_i2v`, only when the local runtime is available and approved.
3. `animated_still`, preview fallback only.
4. `slideshow`, final upload blocked.

Expected blocker after this scaffold:

```text
CLOUD_VIDEO_PROVIDER_NOT_CONFIGURED
```

## Safety

This fallback does not:

- call paid video APIs
- expose API keys
- call `/prompt`
- poll `/history`
- generate motion clips
- upload to YouTube
- call `videos.insert`
- upload or write to R2
- write to DB
- enable public or unlisted upload
