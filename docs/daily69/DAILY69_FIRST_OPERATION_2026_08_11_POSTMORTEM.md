# Daily69 First Operation — 2026-08-11 Postmortem

## Scope

This document records sanitized lessons from the first Daily69 no-upload operation. The historical `operation-2026-08-11` namespace remains immutable. This repair does not rerun the operation, resolve live affiliate links, register or enable tasks, write Sheets, generate media, or call upload platforms.

## Timeline and observed outcome

- The operation was armed for 2026-08-11 KST with 69 active slots and 14 reserve candidates.
- Nine previously validated canary items were carried into the namespace as ready.
- All 20 hourly batches from 04:00 through 23:00 KST executed.
- Every batch claimed three items, completed zero, and returned three failures.
- The 60 newly scheduled items ended in `blocked`; the nine carryover items remained ready.
- The 23:55 closeout task executed and recorded `NO_UPLOAD_DAILY69_FIRST_OPERATION_DAY_CLOSEOUT_PENDING`.
- Upload and platform call counters remained zero.

## Root causes

### Affiliate readiness was not an arm invariant

The arm gate validated source decision, counts, slots, product bindings, and no-upload settings. It did not validate `selectedAffiliateUrl` for all 69 active items. Among ranks 10–69, only one item had a non-empty affiliate URL and 59 were missing it.

### Readiness failed after claim

The invalid items were admitted to the operation, scheduled, and claimed before the video adapter rejected them with `AFFILIATE_NOT_READY`. Affiliate preparation belongs before eligibility and arm, not inside rendering.

### One item failure amplified to the whole batch

Video input preparation occurred inside one batch-level exception boundary. A thrown readiness error was converted into the same failure for all three claimed items. The final batch therefore blocked its one affiliate-ready item together with two invalid siblings.

## Why the scheduler was not the root cause

There are 20 run records and 20 batch-result artifacts covering every scheduled hour. The scheduler triggered the intended work. The failure occurred after claim at the affiliate readiness boundary.

## Why no-upload safety worked

- `SAFE_TO_UPLOAD=false`
- `SAFE_TO_PUBLIC_UPLOAD=false`
- `PLATFORM_UPLOAD=0`
- YouTube, TikTok, Threads, comment, Production DB, R2, Drive, and deployment mutations remained disabled.
- No MP4 was generated for the 60 scheduled items.

## Repair controls

1. Use one typed, sanitized validator for Coupang affiliate URLs.
2. Require `total=69`, `affiliateReady=69`, `affiliateMissing=0`, and `affiliateInvalid=0` before creating an operation directory or active pointer.
3. Keep affiliate preparation separate from Daily69 arm and expose provider work only through an injected, idempotent preparation seam.
4. Never re-resolve or overwrite an existing valid affiliate URL.
5. Isolate video input preparation per item so one failure cannot corrupt successful siblings.
6. Record `blocked` separately from rendering `failed` in batch run results.
7. Keep product, slot, affiliate, usage-evidence, and review bindings aligned before any future reserve replacement.

## Prevention tests

- 69/69 ready is eligible; 68/69 fails before operation creation.
- Missing, malformed, unsafe-scheme, credential-bearing, and unexpected-host URLs are rejected without printing raw values.
- Valid existing URLs do not invoke the resolver.
- `missing/missing/ready` produces two isolated readiness failures and one prepared sibling.
- `ready/missing/ready` preserves two prepared siblings.
- Queue leases, product bindings, and successful video paths remain independent.

## Future owner gate

Live preparation of missing affiliate links and any fresh Daily69 operation require a separate `OWNER_APPROVAL_FOR_FRESH_AFFILIATE_READINESS_PREPARATION`. The historical namespace must never be reused or rewritten.
