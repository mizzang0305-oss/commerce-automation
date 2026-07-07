# V096 No-Upload Fix: V084 Execute Context Loading

V096 fixes the no-upload private pilot execution path so V084 execute request
generation loads the same protected V095 execution context used by V095
preflight.

This is not an upload approval. It does not call `videos.insert`,
`commentThreads.insert`, public upload, unlisted upload, comment automation,
scheduler execution, webhook execution, R2 writes, DB writes, or
`product_assets` writes.

## Root Cause

V095 preflight prepared a protected local context with V088/V087/V085 evidence,
queue item id, upload package id, private visibility, `maxItems=1`, and
readiness booleans.

The V084 execute process could still start without loading that same context
unless `V084_PRIVATE_PILOT_EXECUTION_CONTEXT_PATH` was explicitly passed. In
that case the execute request lost context-backed evidence and blocked on
resolver, binder, package, queue, and readiness evidence.

## Fix

V084 now loads the canonical V095 context path by default:

```text
commerce-assets/review/v057/father_jobs/private-pilot-execution-context.local.json
```

If `V084_PRIVATE_PILOT_EXECUTION_CONTEXT_PATH` is set, that explicit path is
used instead. Both default and explicit paths remain restricted to the protected
local review root.

If the context cannot be loaded, V084 returns:

```text
BLOCKED_V084_EXECUTION_CONTEXT_NOT_LOADED
```

Stale, unsafe, or conflicting context still fails closed.

## No-Upload Diagnostic

```text
npm run upload:v096:execute-context-dry-run
```

The diagnostic command does not run V084 execute. It only checks that V095
context is loadable and that V084 plan generation would be context-backed. It
forces approval to empty, so the expected final blocker is
`BLOCKED_V084_FRESH_APPROVAL_REQUIRED`.

## Approval Handling

Approval text is read only from execute-time environment. It is never stored in
the V095 context, docs, tests, TASK status, reports, or package artifacts.

After this PR is merged, a separate fresh owner approval is still required
before any private pilot upload attempt.

## Safety

- `SAFE_TO_UPLOAD=false`
- `SAFE_TO_PUBLIC_UPLOAD=false`
- No raw affiliate URL or raw Coupang URL is reported.
- No full YouTube video id or full channel id is reported.
- No token, secret, Authorization header, or HMAC is reported.
- Protected local artifacts remain untracked and must not be committed.
