# YouTube Creative Intelligence V1

Status: `NO_UPLOAD / RESEARCH_ONLY / SYNTHETIC_FIXTURE_ONLY`

## Purpose

This module converts owner-provided or synthetic YouTube metadata and timestamped transcript evidence into original, structured Commerce Creative Intelligence. It is not a downloader, media library, competitor-video copier, or publishing system.

The V1 flow is:

```text
Synthetic or owner-provided local source
  -> canonical source + bound transcript
  -> deterministic hook / structure / CTA evidence
  -> cross-video patterns with channel-diversity controls
  -> research-only Commerce context
```

It does not change Daily69 scoring, product ranking, prompts, workers, Scheduled Tasks, Sheets, production databases, or upload adapters.

## Safety defaults

Every new capability defaults to false:

```text
YOUTUBE_INTELLIGENCE_ENABLED=false
YOUTUBE_INTELLIGENCE_LIVE_INGEST=false
YOUTUBE_REMOTE_VIDEO_DOWNLOAD_ENABLED=false
YOUTUBE_AUDIO_DOWNLOAD_ENABLED=false
YOUTUBE_COOKIE_AUTH_ENABLED=false
YOUTUBE_REMOTE_FRAME_EXTRACTION_ENABLED=false
YOUTUBE_INTELLIGENCE_LLM_ENABLED=false
YOUTUBE_INTELLIGENCE_PRODUCTION_BRIDGE_ENABLED=false
```

`assertSyntheticFixtureOnly()` fails closed if any live, remote, cookie, model, or Production bridge flag is enabled. There is no `ingest-url` command and no remote scene-frame provider implementation.

## Upstream research evidence

The upstream was cloned as source only into an isolated temporary directory. It was not installed, imported, vendored, executed, or copied into this repository.

| Field | Pinned evidence |
| --- | --- |
| Repository | `0xchamin/mcptube` |
| Branch | `vision` |
| Exact commit | `e619bc1c0ab425ecb7b214819b9f434fdf4809a3` |
| Checked at | `2026-08-16T01:12:50+09:00` |
| Package version | `0.2.1` |
| Relevant files | `README.md`, `pyproject.toml`, `src/mcptube/server.py`, `service.py`, `ingestion/youtube.py`, `frames.py`, `scene_frames.py`, `vision.py`, `llm.py`, `storage/sqlite.py`, `wiki/storage.py` |

The reviewed architecture uses FastMCP tools, yt-dlp metadata/transcript discovery, ffmpeg frame extraction, LiteLLM text/vision calls, JSON wiki pages, SQLite/FTS5 search, and LLM-assisted retrieval. These are architecture observations only.

## Upstream license gate

Decision: `UPSTREAM_LICENSE_NOT_FULLY_VERIFIED`.

Evidence:

- The exact branch has no `LICENSE` or `COPYING` file.
- `pyproject.toml` declares `license = "MIT"` and the MIT classifier.
- README claims MIT and links to a `LICENSE` path that does not exist at the pinned commit.
- GitHub repository license metadata is `NOASSERTION`; the license API returns 404.
- The repository has no release and no tag, so there is no release artifact carrying independently verifiable license text.

Because the declarations are not backed by the referenced license text, V1 copies no upstream source and vendors no dependency. A future source-reuse proposal must first obtain and verify the exact license text and attribution requirements.

## Dependency and security findings

Pinned upstream dependencies are broad ranges, not a reproducible lock:

```text
fastmcp>=3.0,<4.0
yt-dlp>=2025.0.0
typer>=0.9
pydantic-settings>=2.0
litellm>=1.50
```

No lockfile or hash-locked requirements file exists. `chromadb` is referenced by a source/test path but is absent from declared runtime and development dependencies. A vulnerability result for a concrete resolved dependency graph therefore cannot be claimed from this snapshot. No package was installed merely to force an audit.

The static security review identified these adoption blockers in the upstream design:

- caller-provided add-video URLs are not restricted to exact HTTPS YouTube hosts before yt-dlp receives the original URL;
- subtitle URLs are opened without a response-size limit or final redirect/address policy;
- a fallback 11-character video ID is not restricted to the YouTube ID alphabet and can reach filesystem path construction;
- a non-loopback FastMCP bind can expose read, write, deletion, network, ffmpeg, and LLM-cost tools without repository-level authentication;
- frame tools are annotated read-only even though a cache miss performs network access, subprocess execution, and filesystem writes;
- HTML export interpolates remote/LLM-derived strings without contextual escaping;
- runtime dependency ranges are not reproducibly locked;
- local transcripts, wiki content, FTS data, and frames are plaintext and rely on operating-system access control.

Positive controls observed upstream include parameterized SQLite queries, sanitized FTS query input, JSON/Pydantic rather than unsafe object deserialization, argument-array `subprocess.run` calls without `shell=True`, and per-process ffmpeg timeouts. No application code was found that explicitly loads browser cookies, stores API keys, or logs API-key values. Dependency-internal telemetry remains unverified.

Adoption decision: `ADAPT_CONCEPTS_ONLY / DO_NOT_FORK / DO_NOT_ADD_RUNTIME_DEPENDENCY`.

## Architecture

```text
src/lib/video-lab/youtube-intelligence/
  types.ts                domain contracts
  config.ts               fail-closed feature flags
  source.ts               URL, source, transcript, provenance normalization
  analyzer.ts             deterministic hook, structure, CTA and density evidence
  aggregation.ts          cross-video patterns and channel concentration guard
  providers.ts            disabled LLM/remote vision seams + local-owner evidence seam
  engine.ts               video dedupe, item isolation and run accounting
  localStore.ts           local normalized index and derived JSON artifacts
  bridge.ts               pure research-only product context
  syntheticFixtures.ts    ten original synthetic fixtures
  cli.ts                  fixture/local-input analysis and derived report core

scripts/youtube-intelligence/run.ts
  local CLI wrapper; no network command exists
```

Core domain code has no FastMCP dependency. V1 chooses `Core domain -> CLI -> optional future adapter`. MCP is not required for tests and is not implemented in this PR.

## Source and transcript contracts

`YouTubeSourceSnapshot` binds a canonical HTTPS URL, exact 11-character video ID, channel identity, observation timestamp, provenance hash, and `rawMediaReuseAllowed: false`.

URL normalization accepts only exact public hosts `youtube.com`, `www.youtube.com`, `m.youtube.com`, and `youtu.be`; rejects credentials, non-HTTPS schemes, malformed IDs, and unexpected hosts; and reconstructs a canonical watch URL without unrelated query parameters.

Transcript normalization:

- rejects negative or non-finite timestamps and durations;
- rejects oversized segments and excessive segment counts;
- removes blank segments;
- performs a stable timestamp sort;
- binds every segment to `sourceId`, `videoId`, and a deterministic sequence;
- creates a transcript fingerprint without writing transcript text to the normalized local index.

## Creative evidence contract

Deterministic V1 evidence includes:

- hook family and timing bucket for the first 1, 3, 5, and 10 seconds;
- `HOOK`, `PROBLEM`, `CONTEXT`, `REVEAL`, `DEMONSTRATION`, `BENEFIT`, `PROOF`, and `CTA` structure signals;
- CTA text, source timestamp, and early/middle/late timing;
- topic tags, claim types, caption density, speech density, and scene-pacing placeholder;
- optional local-owner visual patterns;
- confidence, timestamp references, source/channel binding, analysis version, and provenance;
- a literal `rawMediaReuseAllowed: false`.

The analyzer is intentionally a reproducible heuristic baseline, not a claim of semantic ground truth.

## Pattern model and channel concentration

V1 aggregates hook, scene, CTA, topic, pacing, and caption patterns. Each pattern carries source count, distinct channel count, confidence, first/last seen, supporting video IDs, minimum distinct channels, and maximum contribution per channel.

The default per-channel contribution cap is two and the minimum distinct-channel threshold is two. Confidence is diversity-weighted; a single channel cannot become trend-eligible or receive full diversity confidence merely by contributing many videos.

## Data lifecycle and retention

```text
data/youtube-intelligence-v1/
  raw/         operator-controlled temporary inputs; not written by the V1 engine
  normalized/  canonical metadata + transcript fingerprint/count, no transcript text
  derived/     original Creative Evidence
  index/       patterns and sanitized run accounting
```

The whole directory is gitignored.

- Raw: provider responses or full transcripts are temporary owner-controlled inputs. Never commit or log them.
- Normalized: retain canonical identifiers, hashes, observation time, and segment counts. The built-in store does not retain transcript text.
- Derived: retain our hook, structure, CTA, density, pattern, confidence, and provenance assets.
- Performance: `YouTubePerformanceSnapshot` is a separate time-series contract. It never overwrites Creative Evidence.

`RAW YOUTUBE VIDEO IS NOT A COMMERCE ASSET`. Creator footage, audio, voice, and thumbnails are never registered as Shorts source media by this module.

## Local storage decision

V1 uses auditable JSON artifacts rather than SQLite/FTS5. Ten fixtures and small bounded owner-provided canaries do not establish a need for a search database. This avoids a new runtime dependency and keeps data flow obvious. SQLite/FTS5 may be reconsidered only after a bounded corpus demonstrates query and scale requirements; any future implementation must stay local and deterministic.

## LLM and vision seams

`DisabledCreativeIntelligenceModel` and `DisabledVisionEvidenceProvider` are the defaults and fail closed. `LocalOwnerFrameProvider` accepts already-approved local evidence only. No remote scene provider, video/audio downloader, cookie loader, login bypass, age/geo bypass, private-video access, signature bypass, or DRM path exists.

Future LLM calls would require a separate flag and owner gate. The current run records `modelCalls=0` and `visionCalls=0` and does not read API keys.

## Cost and run accounting

Every run can record input/normalized/duplicate counts, transcript success/failure, metadata/transcript/frame/model/vision calls, pattern count, elapsed time, and sanitized errors. Secret values and raw URLs are not error fields. V1 fixture execution records all remote/provider call counters as zero.

## Commerce research bridge

`buildYouTubeCreativeResearchContext()` is a pure typed adapter from derived evidence plus a minimal Coupang product research shape. Its output is permanently marked:

```text
researchOnly=true
productionRankingMutationAllowed=false
rawMediaReuseAllowed=false
```

It is not imported by Daily69 ranking, candidate generation, prompt generation, workers, production APIs, or upload code.

## CLI

```text
npm run youtube-intelligence:fixture
npm run youtube-intelligence:analyze -- --input <owner-local-json>
npm run youtube-intelligence:report -- --input <derived-result-json>
```

Commands write derived JSON only under the gitignored `data/youtube-intelligence-v1/derived/` path. `analyze` reads a local owner-provided file. There is no URL-ingest command and no implicit network fallback.

## Production isolation

Static tests require:

- no import of this module from other `src/` production paths;
- no upload, queue scheduler, Daily69, Sheets, Supabase, R2, or production database writer import;
- no YouTube upload call, social post, comment insert, or Task Scheduler registration call;
- no remote scene provider, yt-dlp, cookie, or URL-ingest implementation;
- all local data paths gitignored.

## Future feature assets and KPIs

The contracts leave room for `youtubeTrendScore`, `hookPatternFit`, `scenePatternFit`, `topicMomentum`, `ctaPatternFit`, `channelDiversityScore`, and `evidenceConfidence`. V1 computes none of these as Production scores.

Future evaluation may measure pattern support, distinct channels, evidence freshness, extraction confidence, topic coverage, duplicate rate, cost per analyzed video, analysis latency, and correlation with our own content's CTR, retention, affiliate CTR, and conversion. V1 claims no KPI improvement.

## Roadmap and owner gates

- V1: contracts, ten synthetic fixtures, local derived store, deterministic pattern extraction, no live ingest.
- V2: only after `OWNER_APPROVAL_FOR_BOUNDED_YOUTUBE_PUBLIC_SOURCE_CANARY`, evaluate 3–5 explicitly approved public URLs for bounded metadata/transcript acquisition.
- V3: separately review permitted visual intelligence and source rights.
- V4: run an offline YouTube + Coupang intelligence scoring experiment.
- V5: only with sufficient evidence, compare against Daily69 shadow ranking; do not change Production ranking.

## Risks

- Heuristics can misclassify nuance and Korean/English variants.
- Channel diversity reduces concentration but does not prove market representativeness.
- Public accessibility does not itself grant media reuse rights.
- Full transcript retention, provider terms, copyright, privacy, and LLM disclosure require separate policy before V2.
- Upstream dependency and license status may change; future research must re-pin SHA and re-run the gate.

## Rollback

This work is isolated. Revert the research commit or remove the `youtube-intelligence` domain, script, tests, documentation, three package scripts, and one `.gitignore` rule. No Production data, scheduler, cloud resource, or platform state requires rollback.
