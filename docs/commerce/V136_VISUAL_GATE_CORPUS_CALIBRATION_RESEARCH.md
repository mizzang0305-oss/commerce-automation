# V136 Visual Gate Corpus Calibration Research

## 목적

V135의 threshold가 V133/V134 한 쌍에 과적합되지 않았는지 확인한다. 기존 owner review와 contact-sheet 증거에서 반복 차단3세트와 시각 다양성 통과3세트를 구성하고 leave-one-out으로 검증한다.

## Corpus

- block: V133 동일 제품 사진 반복, V014 동일 제품 사진/색상 변형, V028 placeholder product-card 반복
- pass: V134 owner PASS 실사용 구성, V029 real image-skill scenes, V035 owner PASS image-skill scenes

V029는 최종 영상이 motion jitter로 실패했지만 장면 자산 자체는 human review의 pass aspect였다. 따라서 pixel diversity calibration에서는 pass로 분류한다.

## 탐색 범위

- similarity threshold:0.82~0.94
- maximum largest-cluster ratio:0.4,0.5,0.6
- minimum perceptual clusters:3,4
- 후보 설정42개

안전 가중치는 반복 실패를 잘못 통과시키는 unsafe false pass65%, 정상 장면을 차단하는 false block35%로 둔다. 동점이면 V135 baseline0.88/0.5/3에 가까운 설정을 선택한다.

## 2단계 구조

1. Stage1 pixel gate: 실제 중심부 edge similarity와 반복 군집을 약1초 이내 검사한다.
2. Stage2 provenance gate: verified usage source, usage-example label, exact product scene ratio를 검사한다.

Stage1은 반복 사진 차단 전용이다. 사람이 실제로 등장하는지, 제품 외형이 변형됐는지, 장면이 광고로 설득력 있는지는 Stage2와 owner review가 계속 담당한다.

## 안전 범위

- local labeled-corpus research only
- no external API, TTS, render, upload, comment, visibility change
- no DB/R2/queue/Worker mutation
- `SAFE_TO_UPLOAD=false`
- `SAFE_TO_PUBLIC_UPLOAD=false`

## 실제 결과

- corpus: block3 / pass3, 총6세트46장면
- 후보 설정:42개
- 선택 설정: similarity0.88 / 최대 반복 비율0.5 / 최소 cluster3
- full corpus:6/6, accuracy1.0
- leave-one-out:6/6, accuracy1.0
- unsafe false pass:0
- false block:0
- 전체 실행 시간:2521.31ms, 세트당 평균 약420ms

| 표본 | 기대 | 결과 | clusters | 최대 반복 비율 |
|---|---:|---:|---:|---:|
| V133 | block | block | 1 | 1.0000 |
| V014 | block | block | 2 | 0.8750 |
| V028 | block | block | 3 | 0.7500 |
| V134 | pass | pass | 6 | 0.1667 |
| V029 | pass | pass | 8 | 0.1250 |
| V035 | pass | pass | 8 | 0.1250 |

완전분리 설정은42개 중34개였고 similarity0.82~0.94, 최대 반복 비율0.4~0.6 범위에 걸쳐 존재했다. 선택 임계값0.5를 기준으로 가장 가까운 block 표본은0.75라 안전 여유0.25, 가장 가까운 pass 표본은0.1667이라 정상 여유0.3333이다. 특정 한 점만 우연히 맞은 결과는 아니다.

## 결론

V135 baseline은 이 로컬 corpus에서 유지할 수 있다. Stage1 pixel gate는 scene image가 준비된 직후 실행하면 되며, 전체6세트도 약2.5초에 끝났다. 다만 표본이 빨래건조대 한 제품군에 집중되어 있으므로 production hard gate 승격 전 생활용품 외 최소2개 카테고리의 owner-labeled corpus가 추가로 필요하다.
