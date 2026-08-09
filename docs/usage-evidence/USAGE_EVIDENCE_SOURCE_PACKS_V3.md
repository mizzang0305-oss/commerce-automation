# Usage Evidence Source Packs V3

## 목적과 경계

이 변경은 Daily-69 no-upload 큐의 usage evidence 병목을 완화하기 위해 기존 로컬 sanitized source media에서 실제 motion clip과 신규 pack 후보를 만든다. 최종 영상 렌더, TTS, ASR, WhisperX, Sheets/Drive/R2/DB 쓰기, Task 활성화, 플랫폼 업로드, 배포는 수행하지 않는다.

- 기준 PR: `#240`
- 기준 HEAD: `240f40fe848b15649ec8f749c8513529cbce5c2d`
- 기준 live 결과: active 58, reserve 14, distinct 72, shortfall 11
- 기존 registry: 44 valid sources, 59 assets, 30 packs, nominal 150 units
- 정책 불변: category 0.35, family 0.10, pack/asset 5, sequence consecutive 2, source video daily 15

## 로컬 source와 검수 결과

`config/usage-evidence/library-v3-source-pack-plan.json`은 자동 glob 대신 9개 explicit local source만 허용한다. 각 source에는 provenance/rights basis, privacy review requirement, allowed use cases, human source review 상태가 명시된다.

- source contact sheets opened: 9
- Codex source review pass: 8
- rejected source: `v3-laundry-v027-visual-only`
- rejection reason: static product-card/CTA carousel이며 실제 usage motion이 아님
- privacy blocked: 0
- rights blocked: 0
- human owner status promoted: 0

Codex review는 human owner review가 아니다. Human evidence가 있는 source에서 파생한 clip도 `humanOwnerReviewStatus=not_requested`, `publishEligible=false`를 유지한다.

## Motion clip 생성과 QA

Python builder는 ffprobe/decode, scene-boundary 또는 bounded fallback window, H.264 30fps muted clip, 11-frame motion strip, pHash와 temporal signature를 사용한다. Clip 길이는 1.0~4.0초이며 현재 생성 길이는 2.2초다.

- candidates: 37
- machine QA pass: 27
- machine hard fail: 1
- near duplicates removed: 9
- Codex-reviewed accepted clips: 24
- accepted distinct source IDs: 8
- Tier A source-derived clips: 8
- Tier B local-only clips: 16
- desk/cable-compatible clips: 7
- laundry-compatible clips: 17

정적 carousel source에서 나온 3개 machine-pass 후보는 Codex visual review에서 별도로 거절했다. 따라서 machine motion 신호만으로 eligibility를 부여하지 않는다.

## Pack 후보

Round 1은 총 12개 pack을 생성한다.

| Use case | Packs |
| --- | ---: |
| `cable_organization` | 3 |
| `desk_organization` | 3 |
| `laundry_space_organization` | 3 |
| `laundry_drying` | 3 |
| vehicle | 0 |

각 V3 pack은 고유 asset 7개 이상, problem/before 2개 이상, usage/action 3개 이상, after 2개 이상, source 2개 이상을 요구한다. Primary source는 전체 신규 pack에서 source당 최대 2개다. 12개 pack의 `sequenceFingerprint`는 모두 고유하다.

## Capacity 권위와 현재 blocker

과거 live namespace에는 선택된 active 58개와 reserve 14개만 저장되어 있고 177개 전체 ranked candidate snapshot은 없다. 이 72개 persisted replay에서는 V3 registry를 사용해도 distinct 후보 상한이 72이므로 실제 marginal gain을 판정할 수 없다. 해당 결과는 `PERSISTED_72_ITEM_REPLAY_DIAGNOSTIC_ONLY`로 표시한다.

새 bounded namespace `daily69-source-packs-v3-20260809085920-baseline`에서는 현재 process environment의 Coupang provider readiness가 모두 false여서 API call 0, candidate 0으로 fail-closed 종료됐다. 자격 증명 값은 조회·기록하지 않았다. 따라서 다음 항목은 아직 증명되지 않았다.

- actual 177-candidate marginal gain
- minimal final V3 pack selection
- active 69 / reserve 14 / distinct 83 live capacity
- second scout idempotency

12개 후보 pack과 24개 clip은 생성·검수됐지만, full live candidate snapshot 없이 final registry pack을 임의 선택하지 않는다.

## 재현 명령

```powershell
python tools\video-automation\usage_evidence_source_packs_v3.py `
  --asset-root <asset-root> `
  --existing-registry <v2-worktree>\data\usage-evidence-library-v2\registry.json `
  --plan config\usage-evidence\library-v3-source-pack-plan.json `
  --output-root data\usage-evidence-source-packs-v3

npm run usage-evidence:v3:simulate -- `
  --baseline-root <v2-worktree>\data\daily69-asset-capacity-20260809072033 `
  --baseline-registry <v2-worktree>\data\usage-evidence-library-v2\registry.json `
  --candidate-registry data\usage-evidence-source-packs-v3\registry.json `
  --output-root data\usage-evidence-source-packs-v3\simulation
```

모든 `data/usage-evidence-source-packs-v3/` media/review/capacity 결과와 `data/daily69-source-packs-v3-*` namespace는 Git ignored다.

## 안전 상태

- `SAFE_TO_UPLOAD=false`
- `publishEligible=false`
- `GOOGLE_SHEETS_WRITE=0`
- `GOOGLE_DRIVE_WRITE=0`
- `R2_WRITE=0`
- `DB_WRITE=0`
- `FINAL_VIDEO_RENDER=0`
- `TTS=0`
- `ASR=0`
- `WHISPERX=0`
- `PLATFORM_UPLOAD=0`
- `PRODUCTION_DEPLOY=0`
- Queue scheduler disabled and paused
