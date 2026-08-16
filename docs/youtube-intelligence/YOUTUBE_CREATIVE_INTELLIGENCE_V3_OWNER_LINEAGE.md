# YouTube Creative Intelligence V3 — Owner Observation and First-party Lineage

## Boundary

V3 adds local research contracts only. It performs no YouTube request, OAuth flow, metadata/caption/timedtext request, media download, `yt-dlp`, cookie access, LLM call, Vision call, MCP call, upload, Production DB write, or ranking change.

## Owner observations

The exact-five packet remains `OWNER_OBSERVATION_REQUIRED` until the owner enters bounded observations. Completed packets require exact video ID and canonical URL binding, an approved source mode, owner provenance, ISO observation time, an allowlisted hook family and structure, nonnegative hook/CTA timing, bounded labels and notes, and `rawMediaReuseAllowed=false`.

States are limited to:

```text
OWNER_OBSERVATION_REQUIRED
OWNER_OBSERVATION_DRAFT
OWNER_OBSERVATION_VALIDATED
```

There is no auto-approval state. Local commands:

```text
npm run youtube-intelligence:owner-observation:report
npm run youtube-intelligence:owner-observation:validate -- --input <local-json>
```

## First-party creative lineage

`CommerceCreativeLineage` binds a generated creative to exact `creativeId`, `productKey`, `queueId`, optional operation namespace, version, features, generation time, and eventual published video ID/time. `CreativeFeatureSnapshot` creates a deterministic SHA-256 feature fingerprint before publication.

The future outcome join requires exact identifiers. It never fuzzy-matches:

```text
creativeId + videoId + productKey + publishedAt
```

YouTube authorized performance and commerce first-party performance retain separate provenance. Derived `CreativeOutcomeEvidence` is always `researchOnly=true` and `productionRankingAllowed=false`.

Dataset roots remain logically separated:

```text
externalCreativeObservations
ownCreativeLineage
ownChannelPerformance
commerceFirstPartyPerformance
derivedCreativeOutcomeEvidence
```
