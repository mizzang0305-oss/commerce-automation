# V135 Pre-render Visual Evidence Research

## 목적

V133에서 자동 품질 보고서는 PASS였지만 실제 contact sheet는 동일 제품 사진의 반복이었다. V135는 TTS와 최종 영상 렌더 전에 실제 이미지 픽셀과 장면 출처를 검사해 이 실패를 조기에 차단한다.

## 확인된 원인

- `buildSceneImageQualityReport()`는 실제 생성 파일을 읽지 않고 provider mode별 고정 점수를 반환한다.
- 파일 SHA가 다르거나 배경색·문구가 달라도 중심 제품 사진은 같을 수 있다.
- 장면 manifest의 `human_or_hand_usage_signal` 같은 필드는 시각 검출 결과가 아니라 scene spec 선언이다.

## V135 연구 게이트

1. 각 장면 중앙 70%를 grayscale edge image로 변환한다.
2. 16x16 difference hash를 계산하고 similarity 0.88 이상을 같은 반복 군집으로 묶는다.
3. 최소 3개 perceptual cluster와 최대 반복 군집 비율 0.5를 요구한다.
4. 최소 2개 verified real-usage provenance와 `사용 상황 예시` 표기를 요구한다.
5. 제품 정체성 보존을 위해 exact product image 장면을 최소 1개, 전체의 50% 이하로 요구한다.
6. unknown/unverified provenance는 fail-closed 처리한다.

## 효율화 순서

`candidate dedupe → source provenance → V135 image gate → low-cost preview/contact sheet → owner review → TTS → final render → private-upload preflight`

현재처럼 TTS와 최종 렌더 후 사람 검토를 하면 V133 유형의 실패에도 전체 제작 비용이 발생한다. V135는 Pillow 기반 로컬 이미지 검사만 수행하며 외부 API, TTS, 렌더, 업로드를 호출하지 않는다.

## 안전 범위

- local research only
- no upload / no comment / no visibility change
- no DB, R2, queue, Worker mutation
- no new dependency
- `SAFE_TO_UPLOAD=false`
- `SAFE_TO_PUBLIC_UPLOAD=false`

## 승격 조건

V133 실패 세트는 BLOCKED, V134 승인 세트는 PASS로 분리되어야 한다. focused unit tests와 실제 두 세트의 재현 결과가 모두 맞을 때만 Worker 또는 upload package에 연결하는 별도 코드/PR을 제안한다.

## 실제 재현 결과

| 세트 | 판정 | 검사 시간 | perceptual clusters | 최대 반복 군집 | verified usage | exact product |
|---|---:|---:|---:|---:|---:|---:|
| V133 반복 제품 사진 8장 | BLOCKED | 454.13ms | 1 | 8/8, 100% | 0 | 0 |
| V134 승인 장면 6장 | PASS | 423.62ms | 6 | 1/6, 16.67% | 3 | 3 |

V133은 파일 SHA는 8개로 모두 달랐지만 edge perceptual similarity 평균이 0.9421이고 모든 장면이 한 군집으로 묶였다. 이는 파일 해시나 선언형 scene kind만으로 반복 장면을 찾을 수 없다는 직접 증거다.

V134 제작에서 승인된 로컬 TTS는 약 52.9초, 최종 렌더는 약 30.4초가 걸렸다. V135 실제 검사는 warm run 약 0.42~0.45초, cold run 최대 약 1.25초였다. 최악값 1.25초를 사용해도 이미지 준비 이후 TTS+최종 렌더 약 83.3초 중 약 98.5%를 실패 작업에서 피할 수 있다. 이미지 수집·생성 비용은 이 비교에 포함하지 않는다.

## 한계와 다음 코드 경계

- perceptual hash는 사람·손의 존재를 직접 인식하지 않는다. 실제 사용 증거는 server-side asset provenance와 함께 사용해야 한다.
- provenance 값을 클라이언트 payload에서 신뢰하면 안 된다. 향후 통합 시 stock fetcher, owner import, reviewed generator가 서버에서 provenance를 부여해야 한다.
- 생성 이미지의 인체 왜곡이나 제품 외형 변형은 별도 owner review 또는 이후 비전 모델 연구가 필요하다.
- 다음 승격은 `generate scenes → V135 gate → preview` 경로까지만 연결하고, upload executor에는 직접 연결하지 않는다.
