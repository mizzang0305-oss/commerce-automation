# V119 Worker Queue Multi-scene Dry Run

## Decision

The merged V118 multi-image renderer is retained. V119 fixes the Worker binding around it so visual captions, spoken narration, and planned shot duration remain separate and aligned.

## Fixed behavior

- `caption` is used for on-screen subtitle cues.
- `voice_text` is used for the voiceover track input.
- A caption containing an internal line break remains one shot cue.
- Caption count must match shot duration count.
- Render-plan audio duration matches the total planned shot duration.
- JPEG source range is normalized to standard limited-range `yuv420p` output.
- Missing captions and mismatched cue counts fail closed before FFmpeg rendering.

## Local dry-run

```powershell
npm run worker:v119:multiscene-dry-run --silent
```

The command generates local fixture images, runs the real Python Worker render task and FFmpeg renderer, copies artifacts through the local storage adapter, validates cue count and media duration, and prints a sanitized JSON report.

It does not instantiate `WorkerApiClient`, call external image hosts, upload to YouTube, create comments, run a scheduler, or write DB/R2/Supabase/product assets.

## Safety

- Local generated fixtures and ignored Worker outputs only.
- `SAFE_TO_UPLOAD=false`.
- `SAFE_TO_PUBLIC_UPLOAD=false`.
- No publication success is inferred from dry-run completion.

## Rollback

Revert the V119 Worker binding, tests, command, and documentation. V118 multi-image rendering remains independently reversible through its own merge commit.
