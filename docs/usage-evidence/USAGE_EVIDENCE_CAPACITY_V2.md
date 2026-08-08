# Usage Evidence Capacity V2

## Intent

This subsystem expands Daily69 evidence capacity without enabling uploads, rendering videos, writing Sheets, or changing scheduler task state. It fails closed when the local reviewed registry is missing or invalid.

## Review authority

| Tier | Required evidence | Queue use | Publish use |
| --- | --- | --- | --- |
| `HUMAN_REVIEWED_SOURCE_DERIVED` | human-pass source, FFmpeg lineage, machine QA, Codex visual review | local no-upload | false in this registry |
| `CODEX_REVIEWED_LOCAL_ONLY` | sanitized local source, machine QA, Codex visual review | local no-upload | false |
| `UNREVIEWED` | incomplete | blocked | blocked |

Codex review never changes `humanOwnerReviewStatus` to pass. Every selected asset remains `publishEligible=false`.

## Supported taxonomy

| Use case | Packs | Units | Keywords |
| --- | ---: | ---: | ---: |
| `vehicle_console_organization` | 4 | 20 | 3 |
| `vehicle_cabin_storage` | 4 | 20 | 3 |
| `vehicle_organization` | 4 | 20 | 3 |
| `cable_organization` | 4 | 20 | 3 |
| `desk_organization` | 4 | 20 | 3 |
| `laundry_space_organization` | 5 | 25 | 3 |
| `laundry_drying` | 5 | 25 | 3 |

A use case becomes runtime-supported only when deterministic classification and keywords exist and the validated registry contains at least two eligible packs.

## Local registry build

`tools/video-automation/usage_evidence_library_v2.py` performs the following local-only steps:

1. Validates the V049 human-review rows and exact V057 source files.
2. Uses FFmpeg scene detection and segment midpoints; regular sampling is only a named fallback if scene detection cannot find boundaries.
3. Records source hash, derived hash, timestamp, and derivation operation.
4. Loads sanitized image pools with their separate review authority.
5. Runs dimension, black-frame, edge-variance, and frame-fill checks.
6. Removes assets within pHash Hamming distance 6.
7. Generates per-pack first frame, contact sheet, role-pool sheet, and manifest.
8. Requires an actual Codex review record before finalizing the ignored registry.

Generated JPG, PNG, MP4, local paths, and registry instances remain under `data/usage-evidence-library-v2/` and are Git ignored.

## Allocation model

Each pack carries reviewed alternatives for `problem`, `usage/action`, and `after`. The allocator chooses exactly one distinct asset for each role per product. This preserves a coherent three-scene minimum while distributing reuse across the reviewed pool.

Enforced limits:

- candidate use case equals pack use case
- category allowlist passes and blocklist does not match
- asset is no-upload eligible and has complete lineage
- exact asset daily reuse ≤ 5
- pack daily reuse ≤ 5
- identical selected sequence is not used three consecutive times
- one pack does not occupy all three positions in a batch
- one source video is used by at most 15 product allocations daily

The capacity planner applies the existing category ratio 0.35 and product-family ratio 0.10 before active selection, balances use cases, and allocates reserve only when a real evidence sequence is available.

## Discovery and persistence

Daily69 discovery derives keywords from the supported taxonomy and keeps the provider budget at 30 calls and 240 raw discoveries. It stops only after the planner can allocate 69 active and at least 14 reserve products.

Queue and reserve records persist the selected `packId`, exact three asset IDs, selected sequence fingerprint, and source IDs. A reserve replacement carries its preallocated evidence binding.

`shadowMode` may bypass disabled/paused execution guards only for `mode=no_upload_daily_69`; it never changes the stored settings. The same namespace is run a second time only after a full capacity pass and must return a zero-call no-op with an unchanged snapshot hash.

## Safety boundary

The shadow runner writes only its isolated local queue namespace. It imports no renderer, uploader, Sheets writer, Drive/R2 client, DB writer, TTS, ASR, or control-command executor. It does not enable Task Scheduler tasks. Control Center and Sheets projection remain out of scope.

## Decision gate

Case A requires all of the following in the ignored live report:

- active 69, reserve at least 14, and 83 distinct product keys
- slots 001–069, ranks 1–69, and 23 hourly groups of three
- category, family, asset, pack, sequence, batch, and source reuse checks pass
- all active and reserve rows have evidence allocations
- second scout uses zero provider calls and leaves the snapshot unchanged
- every external write/render/upload counter remains zero
