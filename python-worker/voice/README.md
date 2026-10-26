# Offline Korean pilot voice

`supertonic_ko.py` implements the existing `--script --output --language --format`
local-command contract. The base cloud image does not yet contain this optional
voice package or model; no Cloud Run execution is claimed.

The bounded Work CPU pilot used Supertonic 3 preset **M1** (`ko`) with eight steps.
The model revision is `724fb5abbf5502583fb520898d45929e62f02c0b` from
https://huggingface.co/Supertone/supertonic-3 . Model license: OpenRAIL-M; SDK: MIT.
The SDK repository was archived on 2026-09-09. Keep the pinned package/model
and review support/security before adopting it for Production.

Package the pinned dependencies, model `onnx/`, `voice_styles/M1.json`, and the
original LICENSE into an isolated Linux image. Record every asset SHA-256 and
the built container digest. `MINZ_TTS_MODEL_DIR` must be an absolute local
directory. The command sets offline mode and disables both ONNX and Hub
telemetry before imports; runtime model downloads are forbidden.

Example after packaging (no paid synthesis API):

```sh
MINZ_TTS_MODEL_DIR=/opt/minz/models/supertonic3 \
  /opt/minz/voice/supertonic_ko.py --script /work/narration.txt \
  --output /work/narration.wav --language ko --format wav
```

Use an absolute executable path for `KOREAN_VOICE_COMMAND`. Keep
`KOREAN_VOICE_PROVIDER_APPROVED=false` until the owner approves the audition.
The pilot voice is an audition candidate, not an approved channel identity.
Disclose AI-generated voice in the actual video and its upload package, as
required by the model license. Do not invent a speaker identity or clone a voice.

The isolated pilot uses the archived Channel OS renderer. This command is
separately compatible with PR #269's commerce worker; it does not connect the
two queues or supply a signed commerce render plan.
