# Open Source Motion Provider Evaluation

Date: 2026-06-21 KST

Scope: research and local scaffold only. This document does not install ComfyUI, Wan2.1,
Wan2.2, LTX-Video, CogVideoX, HunyuanVideo, AnimateDiff, Stable Video Diffusion,
ModelScope, Diffusers, FFmpeg, MoviePy, Remotion, edge-tts, Piper, Coqui TTS,
OpenVoice, StyleTTS2, or Bark. It does not download model weights, execute GPU
jobs, upload to YouTube, write to R2, or write to the database.

## Decision

Use `comfyui_wan_i2v` as the first real motion provider target, backed by a
ComfyUI workflow that runs Wan I2V after a separate infrastructure approval.
Keep `ltx_video` as the second provider, `animated_still` as a non-final fallback,
and `slideshow` as a blocked last-resort artifact. Until a provider endpoint is
configured, the expected blocker remains:

```text
MOTION_PROVIDER_NOT_CONFIGURED
```

## Candidate Matrix

| Area | Candidate | Fit | License / policy note | Decision |
| --- | --- | --- | --- | --- |
| Motion/I2V | ComfyUI | High | ComfyUI repository is GPL-3.0; use as separate local/service boundary, not embedded library. Source: https://github.com/Comfy-Org/ComfyUI | P0 orchestration target |
| Motion/I2V | Wan2.1 | High | Open Wan video models include I2V/T2V options; verify the exact model card/license before production use. Source: https://github.com/Wan-Video/Wan2.1 | P0 model family |
| Motion/I2V | Wan2.2 | High | Newer Wan family with I2V/T2V capabilities; verify resource and license details per chosen checkpoint. Source: https://github.com/Wan-Video/Wan2.2 | P0/P1 after infra check |
| Motion/I2V | LTX-Video | Medium-high | Lightricks repo uses Apache-2.0 code license; verify model terms for chosen weights. Source: https://github.com/Lightricks/LTX-Video | P1 fallback |
| Motion/I2V | CogVideoX | Medium | Useful benchmark, but model variants may have different terms. Source: https://github.com/zai-org/CogVideo | Research only |
| Motion/I2V | HunyuanVideo | Medium | Strong candidate; verify commercial and model terms per checkpoint. Source: https://github.com/Tencent-Hunyuan/HunyuanVideo | Research only |
| Motion/I2V | AnimateDiff | Medium-low | Good for animation experiments, weaker commerce product identity control. Source: https://github.com/guoyww/animatediff | Not first adapter |
| Motion/I2V | Stable Video Diffusion | Medium-low | Model card terms need explicit commercial review. Source: https://huggingface.co/stabilityai/stable-video-diffusion-img2vid | Not first adapter |
| Motion/I2V | ModelScope | Low-medium | Older T2V path; useful baseline but not preferred for product I2V. Source: https://huggingface.co/ali-vilab/modelscope-damo-text-to-video-synthesis | Research only |
| Motion/I2V | Diffusers video pipelines | Medium | Useful Python integration surface for multiple models. Source: https://github.com/huggingface/diffusers | Integration library only |
| Rendering | FFmpeg | High | LGPL by default, GPL if GPL components are enabled. Source: https://ffmpeg.org/legal.html | Keep as renderer/muxer |
| Rendering | MoviePy | Medium | Good scripting surface over FFmpeg for local assembly. Source: https://github.com/Zulko/moviepy | Secondary renderer |
| Rendering | Remotion | Medium | Strong TS/React video composition; license/commercial usage must be checked before SaaS usage. Source: https://github.com/remotion-dev/remotion | Not default |
| TTS | edge-tts | Medium | Convenient but relies on Microsoft online service behavior; terms need review. Source: https://github.com/rany2/edge-tts | Prototype only |
| TTS | Piper | High | Local TTS path, fast and offline; voice license must be checked per voice. Source: https://github.com/rhasspy/piper | Preferred local TTS |
| TTS | Coqui TTS | Medium | Useful local TTS ecosystem; project status and model terms need review. Source: https://github.com/coqui-ai/TTS | Research only |
| TTS | OpenVoice | Medium | Voice cloning path; consent and model terms require review. Source: https://github.com/myshell-ai/OpenVoice | Not default |
| TTS | StyleTTS2 | Medium | Research-grade voice synthesis; model terms and Korean support need validation. Source: https://github.com/yl4579/StyleTTS2 | Research only |
| TTS | Bark | Low-medium | Expressive but heavier and less predictable for commerce narration. Source: https://github.com/suno-ai/bark | Research only |

## Required Motion-First Gates

The scaffold must keep these blockers available to the upload package and final
execute gate:

- `MOTION_PROVIDER_NOT_CONFIGURED`
- `REAL_MOTION_CLIP_REQUIRED`
- `MOTION_SCENE_COUNT_TOO_LOW`
- `HAND_INTERACTION_SCENE_MISSING`
- `UTENSIL_INTERACTION_SCENE_MISSING`
- `PRODUCT_ROTATE_SCENE_MISSING`
- `SLIDESHOW_LIKE_OUTPUT_BLOCKED`
- `ALL_SCENES_STATIC_BLOCKED`
- `IMAGE_SWAP_ONLY_VIDEO_BLOCKED`

The minimum passing shape is:

- `motion_scene_count >= 4`
- `real_motion_scene_count >= 2`
- `hand_interaction_scene_count >= 2`
- `utensil_interaction_scene_count >= 2`
- `product_rotate_scene_present = true`
- `slideshow_like_ratio <= 0.25`
- `all_scenes_static = false`
- `public_upload_blocked = true`

## Prior False-Positive Lessons

The next provider must explicitly avoid the failure classes observed in prior
reviewed videos:

- `pLBtNgrwLJA`: repeated still/product-card feel must not pass as real motion.
- `mLytN-u2C5M`: generated scenes need photorealistic kitchen context, not cards.
- `hRq1iap1C14`: hand/utensil interactions must look natural and product-specific.
- `G-r6rWsZwiU`: captions, voice pacing, and product identity must stay stable.

These lessons are encoded in the review-memory schema as failed patterns rather
than storage writes.
