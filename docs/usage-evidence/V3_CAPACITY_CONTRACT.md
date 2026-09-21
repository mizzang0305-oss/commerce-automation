# V3 capacity contract — Daily69 qualification

## Field identity

| Field | Meaning | Unit |
| --- | --- | --- |
| `V3MarginalEvaluation.final.active` | Products actually selected into `plan.active` | products |
| `final.reserve` | Products selected into `plan.reserve` | products |
| `final.distinct` | Distinct product keys across active and reserve | product identities |
| `diagnostics.uniqueCount` | Deduplicated input ranked universe | products |
| `operationalCoverage.maximumBipartiteMatchingSize` | Slot-to-reserve matching | independent matches |

`final.active` includes active only, not reserve or unused universe. The V3
wrapper accepts no existing queue and calls the planner without `existing`,
so this wrapper includes no carry. Other direct planner calls can seed carry;
their `active` array contains only newly selected products, not carry.

## Why expected 64, why actual 14

`tests/usage-evidence-v3/effectiveCapacity.test.ts` uses seven generic use cases
with two packs each. Each pack offers exactly one problem/usage/after triple.
Thus there are 14 distinct materializable sequence fingerprints, not 70.
Its added V3 motion packs are not consumable by the production materializer
and must contribute zero marginal allocations.

At parent `aa742b3e193c848451029d98fc4d86351a9a8cd5`, the allocator prevented
only three consecutive identical sequences, while allowing five daily uses.
A read-only replay of that parent planner/allocator with the same fixture
produces 64 active + 6 reserve, 70 allocations using only 14 unique sequences.

The current Owner-approved Daily69 repair explicitly requires global sequence
uniqueness across carry, direct, and preallocated reserve. With that contract,
the unchanged fixture permits exactly 14 active, zero additional reserve,
14 distinct products, active shortfall 55, and reserve shortfall 14.
This is a stale test expectation, not a new reserve count or weakened cap.
The fixture helper asserts the single-sequence premise; the test checks zero
gain from unsupported motion packs as well as the explicit sequence upper bound.

## Source and consumers

- `sourcePacksV3.ts`: `summarizePlan` returns array lengths and distinct keys;
  `marginalGain` separately returns active/reserve/combined deltas.
- `capacityPlanner.ts` / `allocator.ts`: actual eligibility and allocation.
- `run-v3-capacity-simulation.ts`: serializes marginal baseline/final.
- `run-v3-live-capacity-proof.ts`: persists `predicted: marginal.final` and
  classifies the actual active count; it does not interpret it as universe size.
- `run-daily69-capacity-shadow.ts`: persists marginal evidence and selected registry.

Historical V2/V3 documents and persisted manifests retain their original
consecutive-reuse interpretation. Do not rewrite their counts. This addendum
documents current Daily69 qualification semantics; historical observations
are not fresh global-uniqueness readiness certificates. Pilot allocation
continues to use its existing bounded consecutive-reuse policy.
