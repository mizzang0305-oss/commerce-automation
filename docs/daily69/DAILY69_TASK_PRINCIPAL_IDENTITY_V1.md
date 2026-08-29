# Daily69 Scheduled Task Principal Identity V1

## Security invariant

Daily69 authoritative Scheduled Tasks must execute as the exact current Windows user selected by `WindowsIdentity.GetCurrent().User`. The canonical security authority is the Windows SID. Account-name spelling, qualification, casing, or suffix similarity is never sufficient.

The installer resolves both the expected identity and the `Get-ScheduledTask` principal readback to canonical `SecurityIdentifier.Value` values. It accepts only exact SID equality. Empty, malformed, unresolvable, ambiguous, service, group, guest, or different-account identities fail closed.

## Bare account readback

Task Scheduler may return a bare local account name after registration with a SID. The resolver uses Windows `NTAccount.Translate(SecurityIdentifier)` for the direct value and, only for a bare name, the machine-qualified local form. A bare identity is accepted only when a resolved candidate equals the exact expected SID. No suffix matching or current-user fallback exists.

## Preserved checks

SID normalization changes only the false string-representation mismatch. The installer still requires exact `LogonType=Interactive`, `RunLevel=Limited`, hidden state, `IgnoreNew`, `StartWhenAvailable`, task action, arguments, worktree, queue/source roots, namespace, expected Git HEAD, trigger schedule, and no-secret ownership contract.

## Validation

Run the focused semantic tests and the existing installer safety test:

```text
powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File scripts/daily69-first-operation/principal-identity.tests.ps1
npx vitest run tests/daily69-first-operation/safety.test.ts
```

A disposable live task proof must register a harmless current-user Limited task, read back and normalize its identity, exercise a different-SID negative assertion in-process, delete the task, and confirm absence. It must never start an authoritative Daily69 task.
