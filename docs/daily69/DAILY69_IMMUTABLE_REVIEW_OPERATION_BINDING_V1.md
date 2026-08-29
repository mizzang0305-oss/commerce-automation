# Daily69 Immutable Review Origin to Operation Binding V1

## Purpose

This contract separates an actual Codex content review from the later act of binding the same immutable artifact to a new Daily69 operation. It never refreshes `reviewedAt`, never rewrites an origin namespace, and never treats a binding as an AI execution.

## Evidence modes

Level3 accepts exactly two review evidence modes:

1. `DIRECT_REVIEW`: the existing `CodexReviewEvidenceV2` path. Its direct-review freshness rules remain unchanged: five minutes for natural review and sixty minutes for `carry_forward_revalidation`.
2. `IMMUTABLE_CARRY_FORWARD_BINDING`: a `queue-codex-review-operation-binding-v1` file referenced by a digest-bound queue metadata record.

A queue item cannot contain both modes. Newly rendered items have no `operationCarryover` lineage and therefore cannot enter the immutable binding path.

## Two clocks

- `originReviewedAt` is copied exactly from the located immutable origin evidence. The origin registry, origin evidence, and executor receipt must all agree. No binding file contains a `reviewedAt` field.
- `boundToOperationAt` records the local operation-binding event. Application requires it to be within five minutes of the applying process and before the target full-day operation.

The binding window is limited to the 48 hours immediately preceding the target operation. This supports the repository's next-full-day lifecycle, including one intentionally skipped terminal date, without turning binding files into replayable indefinite operation authority.

There is no arbitrary maximum age for the immutable origin review itself. Origin eligibility instead requires exact video/path/size SHA-256 identity, exact machine-QA and visual evidence digests, an invoked authenticated Codex executor receipt, an unchanged product, and freshly recomputed current affiliate/product/source eligibility. Any changed artifact, product, QA evidence, schema, or current business binding fails closed.

## Origin identity

Every binding references all three layers:

- the exact origin registry path and SHA-256;
- the stable digest of the exact `CodexReviewEvidenceV2` entry located inside that registry;
- the exact authenticated executor receipt path and SHA-256.

The validator reopens all three. A copied semantic summary, filename match, or `bindingResult=pass` alone has no authority.

Only `queue-codex-review-evidence-v2` is compatible with binding V1. Older, unknown, BLOCK, ERROR, missing, ambiguous, or modified evidence is `REVALIDATION_REQUIRED` and is rejected rather than downgraded.

## Current-operation binding

The validator recomputes:

- target namespace, date, queue, slot, and product;
- exact current video path, SHA-256, and size;
- machine-QA artifact path, digest, semantic PASS, and no-upload flags;
- origin lineage and regeneration count;
- product candidate and usage-evidence allocation digest;
- approved current Coupang affiliate host and current source/category/use-case digest;
- product reference, visual evidence, usage evidence, and visual-binding digests from the authenticated receipt.

The current source arm gate continues to enforce the aggregate 69/14/83 capacity, product-family/category policies, usage binding, and affiliate readiness across the whole operation.

## Runtime flow

Dry run, with no operation mutation:

```powershell
npm run daily69:first-day:plan-immutable-review-bindings -- --source-root <source-root> --target-namespace <operation-YYYY-MM-DD> --target-date <YYYY-MM-DD> --origin-registry <registry.json>
```

The required result is exactly 9 candidates, 9 origin receipts, 9 video hashes, 9 products, 9 machine-QA PASS records, 9 would-pass bindings, zero fake timestamps, and zero AI executions.

After a fresh operation is created at the binding-fix Git SHA:

```powershell
npm run daily69:first-day:apply-immutable-review-bindings -- --queue-root <operation-root> --origin-registry <registry.json>
```

Application writes one atomic binding file per item plus a binding registry. It then rehashes and revalidates every file before a single atomic queue promotion. Level3, closeout, and post-closeout reopen the binding file, origin registry, origin evidence, receipt, current video, current product binding, and current QA evidence instead of trusting the stored PASS value.

## Invalidation

Binding fails for a changed video, different product, changed/missing receipt or registry, BLOCK/ERROR review, schema downgrade, rerender, changed machine QA, invalid current affiliate URL, incomplete origin lineage, stale application timestamp, operation-date replay, or queue metadata containing conflicting review modes.

## Safety

The binding path does not call Codex, ffmpeg, Sheets, Drive, DB, R2, uploads, social platforms, payments, or deployment. All output retains `SAFE_TO_UPLOAD=false`, `SAFE_TO_PUBLIC_UPLOAD=false`, and `PLATFORM_UPLOAD=0`.
