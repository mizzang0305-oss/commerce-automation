# YouTube Creative Intelligence V2 Source Policy

Status: `NO_UPLOAD / RESEARCH_ONLY / SOURCE_POLICY_FAIL_CLOSED`

## Decision

The public-source canary is preserved as failed evidence: metadata succeeded for 5/5 candidates, but transcript acquisition succeeded for 0/5. The timedtext responses were HTTP 200 with an empty body for all five candidates. This is not evidence that an undocumented or cookie-backed recovery path is authorized.

V2 does not adopt Innertube, undocumented YouTube APIs, live `youtube-transcript-api`, yt-dlp subtitle scraping, browser transcript scraping, cookies, login-backed access, video/audio download, or ASR fallback. The failed canary is historical evidence only; V2 makes zero additional YouTube requests.

## Official API boundary

The future official boundary is limited to our own channel after explicit Owner OAuth authorization. The V2 provider is a disabled contract and does not create tokens or call an API. Official fields will be populated only when the relevant official API exposes them and the Owner separately authorizes the adapter.

Public competitor research does not use the own-channel authorized adapter. Public availability does not imply transcript acquisition rights, media reuse rights, or ownership.

## Three source modes

```ts
type YouTubeIntelligenceSourceMode =
  | "synthetic_fixture"
  | "owner_provided_external_evidence"
  | "own_channel_authorized_api";
```

### `synthetic_fixture`

The deterministic V1 regression source remains network-free.

### `owner_provided_external_evidence`

External competitor material enters only as an Owner-provided observation: URL/video ID, Owner-written hook paraphrase, timestamps, structure and CTA annotations, visual-pattern labels, topic/use-case tags, and optional notes. A full transcript is neither required nor retained. `rawMediaReuseAllowed` must be literal `false`.

Aggregated external patterns are always labelled `BOUNDED_EXTERNAL_OBSERVATION`. They cannot support a global trend, market-wide CTR proxy, or “best-performing YouTube pattern” claim.

### `own_channel_authorized_api`

This is a future first-party feedback loop for content we generate and publish. Its provider defaults to `enabled=false` and fails closed. V2 performs no OAuth, token, metadata, analytics, captions, or performance request.

## Fail-closed source requests

These source modes are explicitly rejected:

- `automated_public_competitor_transcript`
- `automated_public_competitor_video`
- `automated_public_competitor_audio`
- `undocumented_youtube_api`
- `cookie_backed_scrape`

There is no network fallback, video/audio downloader, ASR fallback, transcript recovery command, or upload adapter.

## Exact-five Owner review packets

The five failed-canary candidates remain unchanged and each has an Owner observation template in `owner-observations/EXACT_FIVE_OWNER_OBSERVATION_PACKETS.json`:

- `o5pWTuI-qvc`
- `NB07HjOa1nc`
- `SK3acCvnq1c`
- `TnrWoaTbhD8`
- `tDa7j2Ll8YM`

Every packet is `OWNER_OBSERVATION_REQUIRED`; automated transcript recovery is false. Empty fields are prompts for the Owner, not inferred facts.

## Separate data lifecycle

External observations and own-channel performance are separate collections:

```text
externalCreativeObservations
  owner annotations only
  confidence = BOUNDED_EXTERNAL_OBSERVATION
  no media reuse
  no global performance claim

ownChannelPerformanceEvidence
  our content only
  explicit source = youtube_authorized or commerce_first_party
  no Production scoring/ranking authority
```

YouTube-authorized snapshots may contain views, likes, comments, impressions, CTR, view duration, and percentage viewed. Commerce first-party snapshots may contain affiliate clicks, conversions, and attributed revenue. The validator rejects fields placed under the wrong provenance.

Joining the sources requires an explicit binding containing `videoId`, `creativeId`, `productKey`, and `publishedAt`. V2 defines and validates this binding but does not join Production data.

## First-party performance loop

```text
Our generated creative
  -> our published video
  -> authorized YouTube performance evidence
  -> creative feature association
  -> first-party retention and CTR evidence

Commerce first-party clicks / conversions / revenue
  -> explicit video + creative + product binding
  -> feature-to-outcome research evidence
```

The long-term asset is our own creative features plus our authorized performance and commerce outcomes. V2 does not import this evidence into Daily69, Production ranking, prompt selection, or any publishing path.

## Copyright and media boundary

- Raw competitor video/audio is not downloaded or registered as an asset.
- Owner observations do not imply ownership or reuse permission.
- `rawMediaReuseAllowed=false` is mandatory in every external observation and bounded pattern.
- Short excerpts, if ever needed, require a separate rights and purpose assessment; V2 does not collect them automatically.

## Network and mutation accounting

```text
YouTube requests=0
timedtext=0
captions=0
metadata=0
yt-dlp=0
cookies=0
video download=0
audio download=0
LLM=0
Vision=0
MCP=0

YouTube upload=0
TikTok upload=0
Threads post=0
comments=0
Production ranking mutation=0
```

## Future Owner gates

1. Review and complete the exact-five observation templates.
2. Approve or reject retention of the resulting bounded annotations.
3. Separately authorize an official own-channel OAuth/API design.
4. Validate the official fields, scopes, retention, revocation, and cost before any request.
5. Run a research-only feature/outcome correlation before proposing any Production ranking connection.

Priority: `OWN_CHANNEL_AUTHORIZED_CREATIVE_PERFORMANCE_LOOP`, not competitor scraping.

## Rollback

Revert the V2 source-policy commit. No token, external provider state, Production data, upload state, or platform content needs rollback.
