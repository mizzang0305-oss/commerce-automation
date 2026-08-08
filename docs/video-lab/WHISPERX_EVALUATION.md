# WhisperX Local Spike Evaluation

공식 기준: [WhisperX repository](https://github.com/m-bain/whisperX), [pyproject.toml](https://github.com/m-bain/whisperX/blob/main/pyproject.toml).

## 현재 판정

`RESOURCE_BLOCKED_WITH_EVIDENCE`, `NOT_INSTALLED`.

| Check | Result |
|---|---|
| OS | Windows |
| Default Python | 3.14.3 — unsupported by current official `>=3.10,<3.14` range |
| Alternate Python | 3.12 available |
| NVIDIA GPU / CUDA | `nvidia-smi` not found |
| FFmpeg / FFprobe | available |
| Free C: space | about 59.9 GB at preflight |
| Production Python changed | No |
| Package/model installed | No |

CPU mode is technically documented, but model/dependency download is heavy and Korean forced-alignment quality needs a dedicated sample evaluation. The v1 branch therefore contains only a fail-closed provider contract and optional bridge.

## Optional isolated runtime

If separately approved, use a disposable Python 3.12 environment outside the repository, for example `%USERPROFILE%\.local\minz-video-lab-whisperx`. Do not modify `python-worker/.venv`, Worker requirements, or Production launch scripts.

Bridge contract:

```text
python tools/video-lab/whisperx_bridge.py --audio <local-file> --language ko --output data/video-lab/alignment.json --model small --device cpu --compute-type int8
```

The bridge writes word timing JSON only to the explicit local output path and emits a count-only safe summary to stdout. No raw stderr/stdout is persisted. A future evaluation needs 5–10 owner-approved Korean local samples and should measure transcript similarity, aligned word ratio, missing timings, runtime, peak memory, and caption-boundary usefulness.
