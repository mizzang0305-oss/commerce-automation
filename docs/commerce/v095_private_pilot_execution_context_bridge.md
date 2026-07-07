# V095 Private Pilot Execution Context Bridge

V095 adds a no-upload execution context bridge for the YouTube private pilot.

This is not an upload PR. It does not authorize private upload execution, public
upload, unlisted upload, comment automation, scheduler execution, webhook
execution, DB writes, R2 writes, or product asset writes.

## Problem

After PR #202, the individual no-upload binders could pass, but the final V084
process did not have a stable way to receive the V088/V087/V085 evidence,
queue item id, upload package id, and readiness booleans immediately before
execution. The result was a pre-execute block even when a fresh owner approval
was present.

## Design

V095 adds `src/uploads/youtube/v095PrivatePilotExecutionContext.ts`.

The module creates a protected local context file at:

```text
commerce-assets/review/v057/father_jobs/private-pilot-execution-context.local.json
```

The context contains only sanitized execution evidence:

- V088 resolver status
- V087 binder status
- V085 binder status
- channel key
- queue item id
- upload package id
- private visibility
- maxItems=1
- readiness booleans
- hash prefixes
- context creation and expiry timestamps

The context must not contain approval text, raw affiliate URLs, raw Coupang URLs,
full YouTube video IDs, full YouTube channel IDs, token values, secrets,
Authorization headers, HMAC signatures, or raw evidence bodies.

## Commands

```text
npm run upload:v095:prepare-execution-context
npm run upload:v095:preflight-private-pilot
```

Both commands are no-upload. They do not call the private-pilot execute command.

## V084 Context Loading

`buildV084PrivateUploadPilotInvocationFromEnv` reads the canonical V095 context
by default:

```text
commerce-assets/review/v057/father_jobs/private-pilot-execution-context.local.json
```

An explicit path can override the default through:

```text
V084_PRIVATE_PILOT_EXECUTION_CONTEXT_PATH
```

V084 loads sanitized context values before building the plan or execute request.
Approval still comes only from the runtime environment and is not read from or
stored in the context file.

If the context is missing, V084 adds
`BLOCKED_V084_EXECUTION_CONTEXT_NOT_LOADED`. If the context is stale, unsafe, or
conflicts with explicit env values, V084 fails closed.

Plan and execute use the same V084 request builder. This prevents the plan from
loading V095 context while the execute path reconstructs queue item id, upload
package id, resolver/binder status, or readiness from unrelated process env
values.

## Protected Path Policy

V095 context paths are restricted to:

```text
commerce-assets/review/v057/father_jobs/
```

Absolute paths are accepted only when they resolve inside that protected root.
Relative paths containing `..` are blocked. Unsafe prepare paths do not write a
context file, and unsafe load paths are blocked before any read attempt. Reports
only use the safe context label, not the raw requested path.

## Safety

V095 keeps:

- `SAFE_TO_UPLOAD=false`
- `SAFE_TO_PUBLIC_UPLOAD=false`
- public upload blocked
- unlisted upload blocked
- comment automation blocked
- scheduler execution blocked
- `videos.insert` not called during PR validation
- `commentThreads.insert` not called during PR validation
- no V076 completed evidence/store/report before a real complete adapter result
- no fake success

## Rollback

Revert the V095 commit. V084 will return to env-only planning and continue
blocking when V088/V087/V085 evidence is not explicitly provided.

## Next Step After Merge

After merge, run the V095 no-upload preflight on main. Only if the V084 plan is
blocked solely by missing fresh approval should a separate owner approval be
requested for exactly one private pilot execution retry.
