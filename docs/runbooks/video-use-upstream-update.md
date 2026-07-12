# video-use Upstream Update Runbook

1. Fetch the official repository into the external tools checkout.
2. Review license, dependency, helper CLI, EDL, render, subtitle, and Windows changes.
3. Do not move the pin to an unreviewed branch head.
4. Update `config/video-use.upstream.json` and `VIDEO_USE_PINNED_COMMIT` together.
5. Run:

```powershell
$env:VIDEO_USE_PATH='C:\path\to\verified\video-use'
npm run video-use:verify
npm run video-use:typecheck
npm run test -- tests/video-use-renderer-migration.test.ts
npm run video-use:smoke
```

6. Compare output, duration, size, codecs, captions, and failures with the prior snapshot.
7. Update the upstream audit and comparison report.
8. Open an owner-review PR. Do not merge, deploy, or upload as part of the update.

Rollback the pin and external checkout to the previously verified commit if any check regresses.
