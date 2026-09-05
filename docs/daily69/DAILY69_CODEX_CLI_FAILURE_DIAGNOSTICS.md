# Daily69 CLI failure diagnostics and isolated reproduction

## Scope and historical limit

`operation-2026-09-05-attempt-2` is **ATTEMPT_2_NATURAL_PROOF_LOST**. Its held operation, missed hourly triggers, original receipts, Sheets revision44 and local paused revision45 must not be repaired, replayed, or reclassified as successful. The frozen runtime SHA is `27e4fd619c42612b937fa41d7d4efd11025fda53`.

Read-only forensics found two attempts each for slots022/023/024. All video, product-reference, three visual-role, allocated usage and machine-QA bindings were exact. All six error receipts lack durable stdout/stderr diagnostics and token usage. No structured output or final review artifact exists. Per-attempt SQLite usage tables contain zero rows. Original provider failure fingerprints cannot be reconstructed from these files.

An isolated slot022 reproduction using the default npm CLI0.144.6 and current ambient gpt-6-astra configuration failed twice with exit1. Both errors state that the model requires a newer Codex version. This proves a current reproducible CLI/model compatibility failure, **not** an exact match to the missing historical08:00 stderr. Unrelated provider outage, quota, or historical auth claims remain unproven.

## Durable failure contract

The first pinned0.153.1 slot022 diagnostic resolved the transport failure (CLI exit0, correct product/video bindings), but returned a malformed `reviewedAt` string containing localized text. It was preserved as DIFFERENT_FAILURE/CODEX_REVIEW_STRUCTURED_TIMESTAMP_INVALID, not promoted. The schema previously constrained only timestamp string length. The repair now places the host request instant in a per-attempt schema `const`, requires the prompt to echo it exactly, and revalidates equality. Completion time remains the host's independently recorded completion timestamp; this does not fabricate a model clock or weaken the timestamp gate.

- `CodexCliInvocationError.message` contains only the classified safe code, never raw process output or a raw `cause`.
- Error receipts retain actual nullable process exit code, phase, process ID, start/end timestamps, termination confirmation, exact output byte lengths and SHA256 digests, truncation flags, CLI version, executable fingerprint, and failure fingerprint.
- Capture buffers retain at most2,000,000 stdout bytes and16,384 stderr bytes, while hashes and byte counters consume every received byte. A terminal error never silently becomes exit1 when the actual result was another code, a signal, launch failure, or timeout.
- No full raw stdout/stderr is written to files or attached to an exception. Excerpts consist only of a fixed vocabulary of safe signal labels; unknown text, prompt/product content, headers, token/cookie/password/client-secret values and paths cannot enter them. No speculative free-text redaction guarantee is made.
- Natural canonical receipts contain metadata/static signals only, without excerpt fields. Isolated diagnostic receipts may also contain the same bounded static excerpt labels. Unknown output is retained as hashes/lengths plus `UNCLASSIFIED_OUTPUT_OMITTED`, not copied as text.
- Known-category fingerprints bind classification, runtime identity and phase. Unknown-category fingerprints additionally bind the exact two output hashes, so unrelated opaque errors cannot look identical merely because both were classified UNKNOWN.
- Timeout stops only the child process created by that invocation; on Windows it uses taskkill for that owned PID/tree. This is not Windows Scheduled Task execution or modification. Unconfirmed termination stays fail-closed and is never retried.

## Runtime and retry policy

See `DAILY69_CODEX_RUNTIME_BINDING.md` for binary SHA/version/model/reasoning/config-isolation binding. Shared npm installation and user config are not upgraded or edited. Native future ARM/runtime-preflight requires the immutable binding; historical manifests are never silently updated.

The only new stderr classifier is `CODEX_REVIEW_CLI_UPGRADE_REQUIRED`, justified by the retained isolated reproduction. Auth, usage limit, schema/input, invalid structured output, upgrade-required, timeout, and unknown errors do not immediately retry. Terminal per-video receipts also prevent a subsequent call from silently retrying the same failure in that ledger.

Only explicitly supplied `CODEX_REVIEW_CLI_TEMPORARY_SERVICE` and `CODEX_REVIEW_CLI_NETWORK` categories have bounded policy: one2,000ms delay, at most two total video attempts, and the existing69-invocation ledger cap. Tests inject these categories to verify policy; they are **not** evidence of a reproduced service/network error, and no speculative stderr regex was added for them.

Circuit breaker: **not implemented in this change**. The three original stderr fingerprints are unavailable, so a same-fingerprint systemic threshold cannot be justified from that batch. Immutable runtime preflight fails before natural generation when its binding is invalid; upgrade-required and unknown failures stop retrying. Do not mistake a content review BLOCK for provider/runtime failure.

Existing scheduler fail-closed behavior is preserved. The batch wrapper pauses the queue and disables ControlRunner/VideoBatch on wrapper exit>=3. Historical Closeout/Finalizer were separately disabled during incident containment; this repair does not claim that the wrapper automatically disabled all5 Tasks or change that safety contract.

## Diagnostic-only command

```text
npm run queue-video:codex-review-diagnostic -- --request <incident-root>/request.json --output <incident-root>/result.json --incident-root <absolute-incident-root>
```

- Root basename must start `daily69-codex-cli-repro-` or `codex-review-diagnostic-`. Namespace must start `diagnostic-`; provenance must equal `diagnostic`.
- Copy all inputs into this fresh root after source SHA validation. The immutable copied video/product/visual/machine-QA/usage bytes remain unchanged. Create a distinct diagnostic visual-binding envelope with only paths rebound to the verified copies; do not edit the original envelope.
- Request includes `diagnosticRoot`; optional `diagnosticRuntimeBinding` can select a locally verified runtime for before/after comparison. Natural calls cannot accept that diagnostic override.
- All read inputs, receipt/attempt/lock/schema/output/final-review targets and command result must be within the incident root. Operation markers in its ancestors, path traversal, foreign volumes, symlinks/junctions, hardlinks and input-overwrite targets fail before writes/invocation.
- Diagnostic completion emits no promotion evidence. Loading a completed diagnostic receipt through the evidence loader is explicitly forbidden. Its review artifact is labeled diagnostic with `promotionEligible=false`.
- Start with one slot sequentially; never use the current operation's receipt ledger, queue, pointer or Sheets paths, and never apply diagnostic results to canonical data.

## Regression and release gates

`codexCliDiagnostics.test.ts`, `codexReviewDiagnosticPaths.test.ts`, `codexCliReviewExecutor.test.ts`, and `codexRuntimeBinding.test.ts` cover raw byte hashing, strict bounds, static secret-safe excerpts, actual exit retention, terminal categories, bounded transient policy, caps, diagnostic nonpromotion, canonical path preservation, Windows paths/junctions, CLI pinning and owned-child timeout termination. Existing visual/usage binding tests remain.

Run focused/expanded tests, full `npm test -- --maxWorkers=4`, lint/build, Python unit/compile checks, mojibake check, PowerShell ParseFile and diff check. A fresh exact-diff security scan is required; never amend the historical sealed scan. Commit/push/Draft PR are separately recorded. No merge/deploy/upload or new operation ARM is implied.

Future operation readiness requires a fresh source SHA, security scan, immutable bindings, append-only projection and task/pointer readback. Select a date whose00:01 ControlRunner has not elapsed. Do not create a same-day catch-up attempt. V1 remains incomplete until genuine natural generation and natural closeout/finalizer proof pass the final audit; upload readiness remains separate.

Rollback: leave the unarmed repair branch unused or revert its dedicated commit on another branch. Preserve historical attempt2 hold/evidence; never re-enable it as rollback. The separate security discovery-registration-pending merge issue remains PERMANENT_FIX_PENDING and is not fixed here.
