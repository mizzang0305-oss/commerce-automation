# Daily69 pinned Codex runtime (no upload)

## Incident and boundary

The 2026-09-05 attempt-2 natural 08:00 batch generated three selected videos but its Codex reviews exited nonzero. A separate diagnostic reproduced HTTP 400: the `gpt-6-astra` model requires a newer Codex version. The npm CLI was 0.144.6; the installed app CLI was 0.153.1. The executor inherited the mutable user model configuration and collapsed the upgrade requirement into a generic retryable exit error.

The failed attempt is historical, not repairable proof. Keep its receipts, queue, assets, Sheets rows and source SHA. Use native lifecycle hold, never manually restart Tasks or promote blocked slots. Do not upgrade the shared npm installation or rewrite user config as part of this repair.

## New operation contract

The native ARM CLI now requires all of:

```text
--codex-command <canonical absolute codex.exe path>
--codex-command-sha256 <verified binary SHA-256>
--codex-cli-version <exact --version result, without codex-cli prefix>
--codex-model <explicit bundled model slug>
--codex-reasoning-effort <low|medium|high|xhigh>
```

These values become `operation-manifest.json.codexReviewRuntime` with schema `daily69-codex-cli-runtime-v1` and `ignoreUserConfig=true`. The ARM CLI checks binary hash, exact version, `--ignore-user-config` support, bundled model and reasoning capability before creating the operation. The library keeps optional legacy manifest decoding for historical/offline callers; new native ARM and `--runtime` preflight require the binding. A legacy manifest is never silently upgraded or modified by the reader.

VideoBatch runtime preflight checks the binding before generation. Each review reopens and checks it, launches the exact executable with `--model` and explicit reasoning, and excludes ambient user configuration. Auth still uses the existing Codex credential home; no API keys or tokens enter the binding or receipt. The original read-only sandbox and ephemeral invocation remain enforced. Receipts retain the binding actually selected for the invocation. An explicit upgrade-required error is terminal, not a transient retry and never a review PASS.

Version/catalog inspection is local and does not prove account access or service health. Before arming a new attempt, run a small independent structured-output diagnostic with the selected runtime. Mark that diagnostic as synthetic/non-natural, never as operation media review or Scheduler proof. A local catalog can be conservative: a remotely available but unbundled model requires an explicitly reviewed newer runtime, not a fallback.

## Recovery sequence

1. Preserve the failed attempt and perform native hold with exact pre/post readback.
2. Validate the repair branch, fresh security diff, commit and stacked Draft PR. No merge/deploy.
3. Pin and prove the chosen runtime; retain the binary in its verified location. Removing or updating it causes a fail-closed hash/version error.
4. Choose a future canonical operation date; do not reuse elapsed hourly triggers or a held identity. Prepare fresh immutable carry bindings and append-only Sheets projection through native gates.
5. ARM only after source SHA, runtime binding, historical readback and exact Task definitions all pass. Allow natural Tasks only. No upload.

Rollback: abandon the unarmed repair candidate or revert its dedicated commit on a new branch. Never revert the historical hold or replay the failed attempt. Do not repoint authoritative Tasks to unverified source or binaries.
