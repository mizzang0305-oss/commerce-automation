# WhisperX Local CPU Spike Evaluation

공식 기준: [WhisperX repository](https://github.com/m-bain/whisperX), [pyproject.toml](https://github.com/m-bain/whisperX/blob/main/pyproject.toml).

## 판정

`GO_CANDIDATE` for continued local research only. Production adoption은 승인되거나 구현되지 않았고 `VIDEO_LAB_WHISPERX=false`를 유지한다.

## 격리 환경

| Check | Result |
|---|---|
| Runtime | Python 3.12.10 disposable venv |
| Venv | `%USERPROFILE%/.local/minz-video-lab-whisperx` |
| WhisperX | 3.8.6 |
| faster-whisper | 1.2.1, WhisperX transcription backend |
| PyTorch | 2.8.0+cpu |
| Device / compute | CPU / int8, CUDA unavailable |
| Model | tiny, Korean forced alignment |
| Samples | 5 local-only non-sensitive Korean MeloTTS WAV files |
| Repo audio/model/cache | none |
| Production Python / Worker requirements | unchanged |

## 결과

| Metric | Result |
|---|---:|
| Total audio | 40.366 s |
| Model + aligner initial load | 55.239 s |
| Total sample processing | 10.757 s |
| Average RTF | 0.265 |
| Observed peak RSS | 2052.30 MB |
| Words with timing | 74 |
| Minimum / average aligned ratio | 1.000 / 1.000 |
| Missing timing | 0 |
| Overlap / non-monotonic | 0 / 0 |
| Caption timeline pass | 5/5 |
| Korean segmentation usable | 5/5 |
| Minimum / average transcript similarity | 0.8537 / 0.8890 |
| WORD / PHRASE / POP_GROUP cues | 74 / 20 / 29 |

모든 샘플이 useful word timing 90% 기준, monotonic timing, caption timeline, Korean segmentation 조건을 통과했다. 초기 로딩을 제외한 CPU 처리 속도는 offline research에 사용할 수 있다. `tiny` transcript 정확도는 Production ASR 품질 기준으로 간주하지 않으며, 이번 판정의 핵심은 word alignment와 caption timing의 연구 가치다.

## 확인된 제약

- Windows의 TorchCodec native library가 현재 FFmpeg 8과 직접 호환되지 않는다는 경고가 발생했다. bridge는 WAV를 메모리에 pre-load하여 이번 실행에는 영향을 주지 않았지만 일반 파일 디코딩 경로에는 blocker다.
- 초기 모델/aligner 로딩 약 55초와 약 2.05GB RSS는 interactive request 경로에 적합하지 않다.
- Hugging Face cache symlink가 비활성이라 cache가 더 많은 디스크를 사용할 수 있다.
- `tiny`는 alignment 연구용 선택이다. 실제 production transcript/ASR 대체 결론을 내리지 않는다.

## 안전값

```text
VIDEO_LAB_WHISPERX=false
SAFE_TO_UPLOAD=false
SAFE_TO_PUBLIC_UPLOAD=false
YOUTUBE_AUTO_UPLOAD=false
PUBLIC_UPLOAD=false
UNLISTED_UPLOAD=false
COMMENT_AUTOMATION=false
```

모델, cache, sample audio, reference manifest, full alignment JSON은 repo 밖 disposable local directory에만 존재하고 commit하지 않는다.
