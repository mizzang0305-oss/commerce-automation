# Daily69 immutable Codex runtime capsule

Status: implementation contract; not an operation or runtime-version approval.

## Problem and boundaries

The exact approved 0.153.1 artifact disappeared from its updater-managed installation path during operation-2026-09-06. The missing artifact is confirmed; deletion actor, exact deletion time, and updater causality are not confirmed. Historical operation manifests, receipts, queues, Sheets and disabled Tasks must not be migrated or repaired by this feature.

A future operation requires an independently verified Daily69-owned runtime capsule. `SAFE_TO_UPLOAD=false`, no platform upload, and separate Owner gates for a new operation, ARM and publication still apply.

## Approval and storage

The default approval remains version `0.153.1`, SHA256 `56a84de2b617af6b95b0c5c5d8ae120d3c2fb69008ab330c7e7df3945b98b782`, model `gpt-6-astra`, reasoning `xhigh`, `ignoreUserConfig=true`. Candidate discovery never grants approval. Admission reports `APPROVED_RUNTIME_AVAILABLE`, `APPROVED_RUNTIME_UNAVAILABLE`, or `RUNTIME_REAPPROVAL_REQUIRED`.

Production entry points use the code-owned root `D:/CodexData/commerce-runtime/codex`, independent of the manifest and environment. This root is outside the worktree, updater installation and historical evidence. A policy override exists only for trusted library callers such as disposable tests; it is not exposed by the operator CLI, ARM or Task verifier.

Canonical layout: `<root>/<purpose>/<version>/<binary-sha256>/<config-binding-digest>/`. Each final directory contains exactly `codex.exe` and `capsule-manifest.json`. `operation` and `diagnostic` are distinct purposes; diagnostic capsules cannot enter operation ARM. A future explicit approval file is trusted local operator input, not a cryptographic Owner signature or proof derived from an installed candidate. Do not accept it from an untrusted request or generated discovery record.

## Materialization and immutable identity

1. Validate approval, trusted root, canonical paths and links.
2. Acquire an exclusive per-identity lock. Never steal an existing lock.
3. Hash source, copy its unnamed byte stream to an exclusive staging file, fsync/close, then recheck source identity/size/time/hash.
4. Reopen/hash the copy and run bounded version, `exec --help`, and bundled model/config probes. No inference or provider review.
5. Write canonical manifest bytes; verify exact file inventory, sizes, hashes, bundle digest and manifest SHA. Mark files read-only where supported.
6. Atomically rename staging into a previously absent canonical target and reopen through the canonical verifier.

Manifest identity includes purpose, runtime version/hash, model/reasoning, config binding, capsule ID, bundle digest, safe source path fingerprint, creation time and exact file inventory. A reference additionally binds the canonical manifest SHA. Existing capsules are reused only after full verification and safe probes; the original install may be absent on reuse. Failed staging and locks are retained for investigation, not overwritten or automatically cleaned.

The measured initial bundle shape is a standalone executable for version/help/bundled-model startup. This does not prove every optional sandbox/helper feature or authenticated inference path on every CLI release. Each newly approved version must pass its actual functional probes; do not copy the whole application tree speculatively.

## Path and tamper boundary

Reject noncanonical/relative/UNC/device/ADS paths, root escape, forbidden install/worktree/evidence roots, symlinks, junctions, Windows reparse attributes, hardlinks, unexpected streams, extra files, missing files, altered bytes, altered manifests and configuration mismatches. Source/destination overlap is forbidden. Executable bytes, not NTFS named streams, are copied.

Read-only attributes are defense in depth, not a security boundary. Owner-only ACL provisioning remains an operator/environment responsibility and is not silently changed here. Reopen/hash checks and checks immediately before launch narrow TOCTOU; they cannot fully defeat an already privileged same-owner process replacing filesystem objects between the last check and OS execution. A dedicated restricted runtime identity/ACL and OS handle-based execution policy would be a separate hardening design. No claim of complete same-owner tamper immunity is made.

## Future ARM and Tasks

`daily69-codex-cli-runtime-v2` binds the capsule reference and exact child executable. Legacy v1 remains readable as history, but future creation, promotion to armed/running, and active-pointer promotion require an operation-purpose v2 capsule. An updater command passed directly to ARM is rejected. No implicit migration or PATH Codex fallback exists.

Owner-approved Task contract: keep the existing PowerShell wrapper as the Scheduled Task action. Bind capsule path, manifest SHA, bundle digest and binary SHA into Task arguments; compare against the operation manifest and canonical verifier before environment import or claims. The actual Codex child is launched only at the bound capsule executable. Installer planning/readback and pre-promotion checks repeat the contract. A verifier failure follows existing fail-closed handling; it does not select another runtime. Node/PowerShell and the existing user context remain external host dependencies.

## Authentication, diagnostics and retry

Never copy `auth.json`, OAuth/API/session tokens, user configuration, `.env` or credentials. Existing approved authentication remains in the same Windows user context outside the capsule. Local `login status` can prove credential resolution only; it is not proof of authenticated provider inference. A real provider probe needs its own explicit authority.

Before each review invocation and attempt, verify the exact capsule. On mismatch, stop before invocation and do not retry through ambient runtimes. Existing non-transient/auth/schema/usage/upgrade/unknown/malformed/timeout retry policy remains unchanged; only explicit transient/network failures may use the existing maximum of two attempts.

Success receipts add bounded process identity metadata (PID, times, exit/signal, lengths/hashes, termination, CLI version/path fingerprint) because previous receipts did not retain the successful CLI child PID. No raw stdout/stderr, argv, environment or auth state is added. Existing failure diagnostics are preserved.

## Local operator commands (not execution approval)

```powershell
npm run daily69:runtime-capsule -- --action admission
npm run daily69:runtime-capsule -- --action admission --candidate-version <version> --candidate-sha256 <sha256>
npm run daily69:runtime-capsule -- --action materialize --source-command <approved-exact-executable> --approval-file <owner-approved-json>
npm run daily69:runtime-capsule -- --action verify --runtime-capsule-binding <saved-runtimeBinding-json>
```

Approval JSON schema: `daily69-codex-runtime-approval-v1` with `purpose`, safe `authorizationRef`, `version`, `binarySha256`, `model`, `reasoningEffort`, and `ignoreUserConfig: true`. The binding file contains the returned `runtimeBinding` object itself. Omit approval-file only when using the unchanged historical default, not to approve a substitute binary.

## Retention, validation and rollback

There is no automatic capsule deletion or GC. Any future deletion workflow must enumerate every manifest referencing the capsule ID/digest, block active lifecycle and protected historical references, then obtain explicit approval. Retain failures separately. Do not remove a capsule just because an operation is held.

Focused tests cover materialization, disappearance, atomicity, concurrency, path/link/ADS controls, tamper, runtime binding, pre-claim Task gate, fail-closed scope, process diagnostics and retries. Run expanded Daily69 suites, full repository tests, lint/build, Python tests, parser and source/secret scans before publication. Native signed diagnostic results must be distinguished from synthetic tests and production runtime approval.

Rollback is a source revert through a reviewed branch before any future operation is armed. If a future operation references this contract, hold it through an explicit Owner gate first; never rewrite historical bindings or delete referenced capsules as a rollback shortcut. This implementation does not recover either prior failed operation and does not reduce `REMAINING_TO_V1_COMPLETE=2`.
