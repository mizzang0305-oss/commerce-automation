# Video Intelligence Lab v1 — Baseline Architecture

## 목적과 경계

Video Lab은 상품 쇼츠 후보의 카피 점수화, word alignment, caption timeline, renderer 비교를 연구하는 local-only 계층이다. Production WebApp, Queue, Python Worker, R2, UploadPackage, YouTube 경로는 source of truth로 유지하며 이 계층에서 import하거나 변경하지 않는다.

```text
Synthetic creative fixtures
  -> deterministic scorer / ranker
  -> optional local word-alignment provider
  -> caption timeline
  -> disabled renderer contract
  -> local research artifacts (gitignored)
```

## 현재 Production 기준선

- WebApp이 상품·큐·render plan을 관리한다.
- Python Worker가 승인된 provider 설정과 FFmpeg render를 담당한다.
- ASR, 실제 사용 장면, product identity, V143, upload approval은 기존 gate가 담당한다.
- Video Lab 결과는 운영 상태를 변경하지 않으며 Production 의사결정 근거로 자동 승격되지 않는다.

## Video Lab 모듈

| 모듈 | v1 상태 | Side effect |
|---|---|---|
| Creative scorer/ranker | enabled in local library | 없음 |
| WhisperX provider | disabled / optional bridge | 명시 실행 시 로컬 모델·파일만 |
| Caption timeline | pure function | 없음 |
| Remotion renderer | interface/scaffold | 없음 |
| LatentSync | HOLD | 없음 |

## 고정 안전값

```text
VIDEO_LAB_ENABLED=false
VIDEO_LAB_VIRALITY_SCORER=true
VIDEO_LAB_WHISPERX=false
VIDEO_LAB_REMOTION=false
VIDEO_LAB_LATENTSYNC=false
SAFE_TO_UPLOAD=false
SAFE_TO_PUBLIC_UPLOAD=false
```

## 격리 규칙

- `src/lib/video-lab/**`는 Production integration module을 import하지 않는다.
- 연구 출력은 `data/video-lab/`, `commerce-assets/video-lab/`, `video-lab-outputs/`에만 두며 모두 gitignore한다.
- secret, raw credential, provider stdout/stderr는 artifact에 저장하지 않는다.
- 운영 renderer/TTS/ASR/Worker dependency는 변경하지 않는다.
