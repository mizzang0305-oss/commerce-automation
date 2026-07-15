# Legacy and video-use Gap Analysis

| Area | Current system | video-use | Gap | Action |
|---|---|---|---|---|
| Photo input | Worker/local renderers accept images | Video-source EDL | No complete photo path | NEW_IMPLEMENTATION |
| Video input | Local FFmpeg paths and worker URLs | Named EDL video sources | Contract differs | WRAP_WITH_ADAPTER |
| 9:16 output | 1080x1920 established | Source dependent | Normalize required | WRAP_WITH_ADAPTER |
| Captions | SRT/drawtext Korean paths | SRT via FFmpeg | Windows path bug at pin | KEEP_EXISTING |
| Price overlay | Existing content/template concern | Generic overlays | Commerce semantics absent | KEEP_EXISTING |
| Product name | Existing content/template concern | Generic overlays | Commerce wrapping absent | KEEP_EXISTING |
| Disclosure | Required by existing gates | Not commerce aware | Must remain a blocker | KEEP_EXISTING |
| Logo | Existing optional asset | Generic overlay possible | Contract mapping needed | DEFER |
| BGM | Existing optional asset | Audio pipeline present | Licensing/normalization needed | DEFER |
| TTS | Python worker/local voice providers | ElevenLabs transcription path | Different responsibility | KEEP_EXISTING |
| EDL | Several local plans | Native JSON EDL | New mapping required | REPLACE_WITH_VIDEO_USE |
| Preview | Review packets and local MP4 | `--preview` | Paths differ | WRAP_WITH_ADAPTER |
| Final render | FFmpeg worker/local generators | `render.py` | 24 fps and tool pin | WRAP_WITH_ADAPTER |
| Quality validation | Existing targeted checks | No commerce gate | Common ffprobe gate required | NEW_IMPLEMENTATION |
| Retry | Worker/job retry state | CLI exits | Map safe errors/timeouts | WRAP_WITH_ADAPTER |
| Windows | Existing primary environment | Partial | UTF-8 and SRT escaping | WRAP_WITH_ADAPTER |
| SNS upload contract | Extensive V074-V115 gates | None | Must not rewrite | KEEP_EXISTING |

## Classification Summary

- `KEEP_EXISTING`: sourcing, content, disclosure, TTS, upload/readiness, storage, queue, result evidence.
- `REPLACE_WITH_VIDEO_USE`: optional EDL composition only after shadow evidence.
- `WRAP_WITH_ADAPTER`: subprocess, Windows handling, output normalization, error mapping.
- `NEW_IMPLEMENTATION`: image validation, motion clips, common contracts, media quality, shadow comparison.
- `DEFER`: logo/BGM/remote-download/TTS expansion and admin UI.
- `REMOVE_AFTER_CUTOVER`: none in this PR.
