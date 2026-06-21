# Commerce Video Provider Roadmap

Scope: motion-first architecture and adapter sequencing for commerce shorts.
No provider install, no model download, no GPU execution, no YouTube Execute,
no `videos.insert`, no R2 write, and no DB write are approved by this document.

## Provider Priority

1. `comfyui_wan_i2v`
   - Use ComfyUI as a service boundary and Wan2.1/Wan2.2 I2V workflows as the
     first real motion target.
   - Keep the app-side contract limited to safe scene briefs and safe clip refs.
   - Expected current blocker: `MOTION_PROVIDER_NOT_CONFIGURED`.
2. `ltx_video`
   - Keep as a second adapter target because LTX-Video has a lighter integration
     profile and clear open-source code surface.
   - Must still pass the same hand, utensil, rotate, and slideshow-like gates.
3. `animated_still`
   - Useful for local preview and prompt iteration.
   - Never safe for motion-first final upload by itself.
4. `slideshow`
   - Retained only for legacy preview/diagnostic output.
   - Always blocked for motion-first final upload.

## Implementation Sequence

| Phase | Work | Exit condition |
| --- | --- | --- |
| P0 | Research docs and local TypeScript scaffold | Tests prove router and quality gates block final upload without provider config |
| P1 | ComfyUI Wan I2V adapter design | Endpoint contract documented, no secrets in client, no model install in app |
| P2 | Local ComfyUI smoke in separate approved environment | Safe clip refs created locally, no public upload |
| P3 | LTX-Video adapter as fallback | Same manifest and quality gate contract |
| P4 | Review-memory prompt feedback loop | Failed patterns can be captured locally without DB writes |

## Rendering Stack

FFmpeg remains the baseline renderer/muxer because it is mature and already
fits local render workflows. MoviePy can help with scripted local assembly when
Python ergonomics are useful. Remotion is attractive for React-authored layouts,
but it should not become the default until licensing and commercial usage are
explicitly reviewed.

Sources:

- FFmpeg legal notes: https://ffmpeg.org/legal.html
- MoviePy: https://github.com/Zulko/moviepy
- Remotion: https://github.com/remotion-dev/remotion

## TTS Stack

Piper is the preferred local TTS research target because it can run offline and
does not require browser or online service behavior. edge-tts is useful for quick
prototypes but depends on Microsoft online TTS behavior and policy review. Coqui
TTS, OpenVoice, StyleTTS2, and Bark stay research-only until Korean voice quality,
license terms, and consent requirements are checked.

Sources:

- Piper: https://github.com/rhasspy/piper
- edge-tts: https://github.com/rany2/edge-tts
- Coqui TTS: https://github.com/coqui-ai/TTS
- OpenVoice: https://github.com/myshell-ai/OpenVoice
- StyleTTS2: https://github.com/yl4579/StyleTTS2
- Bark: https://github.com/suno-ai/bark

## Safety Invariants

- Default app state must return `MOTION_PROVIDER_NOT_CONFIGURED`.
- Public and unlisted upload remain blocked from final execute.
- `videos.insert` must not be called when the motion quality gate fails.
- Provider results must contain safe refs and summaries, not raw asset URLs.
- ComfyUI, Wan2.1, Wan2.2, LTX-Video, CogVideoX, HunyuanVideo, AnimateDiff,
  Stable Video Diffusion, ModelScope, and Diffusers are not installed by this PR.
