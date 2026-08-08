# Autonomous Video Review V2

## 목적

Product-to-Video V1의 local-only 렌더 결과를 FFmpeg/Pillow 기반 측정과 Codex 로컬 시각 검토로 평가하고, 결정론적 repair를 최대 2회 적용한다. 이 문서와 구현은 Production Worker를 변경하지 않는다.

## 상태 의미

- `machineQaPassed`: 미디어/ASR/정렬/모션/점유율/캡션/정책/오디오 지표가 통과했다.
- `finalAutomatedQaPassed`: `machineQaPassed` 이후 Codex가 실제 first frame, first-3-seconds contact sheet, full contact sheet를 열어 구체적 메모를 남기고 통과시켰다.
- `humanOwnerReviewStatus`: 항상 `not_requested`가 기본이다. `AUTO_QA_PASS`는 `HUMAN_OWNER_PASS`가 아니다.
- `publishReady`: 항상 `false`다.

## 품질 점수

| 차원 | 가중치 |
|---|---:|
| first 3 seconds | 20 |
| motion | 18 |
| occupancy | 12 |
| caption | 12 |
| creative diversity | 10 |
| product clarity | 10 |
| audio pacing | 8 |
| layout safety | 5 |
| policy clarity | 5 |

총점 기준은 75점, first-3-seconds 기준은 70점이다. hard blocker가 하나라도 있으면 총점과 무관하게 실패한다.

## 분석 및 repair

1. `ffprobe`로 1080x1920, H.264/AAC, 30fps, non-empty stream을 확인한다.
2. 0~3초를 0.5초 간격으로 추출하고, 전체 정규 샘플과 두 contact sheet를 만든다.
3. FFmpeg `freezedetect`, `silencedetect`, `loudnorm`과 Pillow canvas-density probe를 실행한다.
4. hook family는 배치에서 최대 1회만 선택한다.
5. static/small/caption 결함은 `push_pan`, full-bleed 92%, 66px POP_GROUP, intro-only full disclosure로 repair한다.
6. `initial → repair-1 → repair-2` 이후에도 실패하면 `AUTO_QA_BLOCKED`다.

## 실행

필수 환경변수는 V1과 동일한 local runtime 경로만 받으며 값은 로그에 출력하지 않는다.

```powershell
$env:VIDEO_AUTOMATION_V2_MODE='reference'
npm run video-automation:e2e:v2

$env:VIDEO_AUTOMATION_V2_MODE='batch'
npm run video-automation:e2e:v2
```

렌더 완료 직후 상태는 `AUTONOMOUS_VIDEO_QA_V2_AWAITING_CODEX_VISUAL_REVIEW`다. Codex가 세 이미지를 실제로 연 뒤 구체적 메모 JSON을 작성하고 다음 명령으로 최종화한다.

```powershell
npx tsx scripts/video-automation/finalize-autonomous-video-review-v2.ts --run <run-root> --notes <local-notes-json>
```

## 고정 안전값

`SAFE_TO_UPLOAD=false`, `SAFE_TO_PUBLIC_UPLOAD=false`, 모든 platform upload=false, `DB_WRITE=0`, `PRODUCTION_DEPLOY=0`, `WORKER_CHANGE=0`, `SCHEDULER_CHANGE=0`, `EXTERNAL_REVIEW_UPLOAD=0`.

## Local acceptance evidence

- Reference: `run-v2-20260808051044` → `AUTONOMOUS_VIDEO_QA_V2_REFERENCE_PROVEN_BATCH_PARTIAL`
- Fresh batch: `run-v2-20260808053539` → `AUTONOMOUS_VIDEO_QA_V2_PROVEN_3_OF_3_NO_UPLOAD`
- Scores: cable `97.43`, cup holder `97.71`, drying rack `97.69`
- Codex local visual inspection: first frame + first-3-seconds sheet + full contact sheet, `3/3`
- Batch runtime: `176.63s`, average `58.88s/product`; QA overhead average `3.45s/product`
- Owner review: `not_requested`; publish ready: `false`; tracked generated media: `0`
