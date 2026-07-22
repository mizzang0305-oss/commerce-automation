# AGENTS.md - Coupang Commerce Automation

These instructions apply when Codex works in this folder.

## Autonomy Rule

If a task is safe, local, and inside the stated scope, do it without asking another question. Report the result afterward.

Ask first only for commit, push, deploy, external upload/send, deletion of unrelated files, production mutation, payment/order/notification actions, credential use, or scope expansion.

## Minz-OS Update Requirement

After every Codex task in this repo, update Minz-OS unless the user explicitly says not to update memory.

Minz-OS vault:

```text
C:\Users\LOVE\MyProjects\Codex\2026-06-06\you-are-helping-me-set-up\Minz-OS
```

Project handover:

```text
01_Project_Handovers/01_Coupang_Commerce_Automation_HANDOVER.md
```

Protocol:

```text
04_Prompts_and_Skills/MINZ_OS_UPDATE_PROTOCOL.md
```

Always update:

- `PROJECT_STATUS.md`
- the project handover above

Record verified facts only:

- branch
- working tree status
- changed files
- commit hash, if committed
- PR URL, if opened or updated
- push status, if pushed
- deploy status, if deployed
- validation commands and results
- `not_tested` items
- blockers and next action

## Safety Boundaries

- Do not store secrets, API keys, tokens, cookies, or `.env` contents.
- Do not place live orders.
- Do not upload files externally unless explicitly approved.
- Do not deploy unless explicitly requested.
- Preserve exact validation commands named by the user.
- If PR dependencies matter, verify GitHub PR state and local ancestry before follow-on work.

If Minz-OS cannot be written from the current environment, report `Minz-OS update: not_updated` and explain the exact reason.
