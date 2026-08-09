# Coupang Image Skill Product-Bound Usage Scenes V5

## 목적

사용자 제공 media 없이 실제 Coupang 상품 이미지와 Codex Image Skill background plate를 결합해 no-upload Daily69 capacity를 확장한다. 상품은 AI로 다시 그리지 않으며, 실제 reference pixel을 deterministic alpha composite 또는 별도 reference card로 보존한다.

## 실행 경로

1. configured Coupang provider를 process-only read 경로로 호출한다.
2. `home_storage`, `kitchen_organization`, `camping_storage` 후보를 policy/image/affiliate/family gate로 선별한다.
3. authoritative product image를 내려받아 decode, size, blank-image, cutout 안정성을 검사한다.
4. built-in Codex Image Skill은 product가 없는 9:16 background plate만 생성한다.
5. local Python helper가 exact cutout을 합성하거나 `reference_card_plus_synthetic_context` fallback을 만든다.
6. machine QA와 Codex contact-sheet review를 모두 통과한 product-bound pack만 registry에 등록한다.
7. allocator는 exact `boundProductKey` match를 generic pack보다 먼저 선택하며 다른 상품에 pack을 공유하지 않는다.

## Identity 및 disclosure contract

- `syntheticUsageExample=true`
- `syntheticDisclosureRequired=true`
- disclosure: `AI 연출 사용 예시`
- `humanOwnerReviewStatus=not_requested`
- `publishEligible=false`
- product-bound `dailyReuseLimit=1`
- product-bound `consecutiveReuseLimit=1`
- exact mismatch: `PRODUCT_BOUND_USAGE_PACK_MISMATCH`

AI product redraw, 색상·형태·구성품·손잡이·뚜껑 변경, logo/text hallucination, clipping, provenance 누락은 hard reject다. 불안정한 cutout은 상품 재생성 대신 reference-card mode로 전환한다.

## Budget

- candidate products: 15
- initial background limit: 60
- repair limit: 30
- generated image maximum: 90
- live provider call maximum: 60
- scene repair maximum: 1

## 2026-08-09 no-upload proof

- baseline: active 58 / reserve 14 / distinct 72
- live discovery: 90 discovered / 27 eligible / 15 selected
- references: 15 downloaded and decoded, 0 rejected
- composite mode: exact cutout 5 / reference-card fallback 10
- backgrounds: 12 initial + 2 repair
- composites: 60
- Codex-reviewed eligible packs: 12
- balanced selected packs: 11 (`home=4`, `kitchen=4`, `camping=3`)
- RUN 1 marginal: predicted 69 / 14 / 83
- final fresh bounded proof: active 68 / reserve 14 / distinct 82
- live provider calls: 60 / 60
- final decision: `COUPANG_IMAGE_SKILL_USAGE_SCENES_V5_PARTIAL`
- blocker: one selected camping productKey did not reappear in the final bounded live candidate set

정책 threshold, category/family limits, product binding, reuse limits은 변경하지 않았다. 누락 product를 fake promote하지 않았고 provider budget 60에서 fail-closed 했다.

## Supplemental slot-069 recovery

기존 `68/14/82` proof와 60/60 call 기록은 수정하지 않는다. 별도 append-only namespace에서 missing product를 최대 2회 targeted query로 확인하고, 재등장하지 않으면 cached QA PASS pack 중 active/reserve/selected-bound product와 겹치지 않는 후보만 fresh-confirm한다.

- direct recovery: 2 query, exact product unavailable
- recovery mode: `STABILITY_AWARE_REPLACEMENT_PACK`
- replacement: 기존 QA PASS `home_storage` product-bound pack 1개 재사용
- availability evidence: prepare + marginal live evidence + fresh targeted confirmation
- supplemental provider calls: direct 2 + replacement 1 = 3/12
- new reference downloads: 0
- background generations: 0
- new composites: 0
- new Codex/Image Skill review: 0; 기존 pack의 구체적 Codex review를 유지
- original proof: 68 / 14 / 82, unchanged
- supplemental contribution: +1 / 0 / +1
- combined evidence: 69 / 14 / 83
- slot/rank: 1..69
- hourly groups: 23 x 3
- second scout: `DAILY_QUEUE_ALREADY_FILLED`, API calls 0, queue/reserve/allocation unchanged
- decision: `COUPANG_IMAGE_SKILL_USAGE_SCENES_V5_PROVEN_DAILY69_CAPACITY`

product-bound pack에는 optional `ProductAvailabilityEvidence`를 기록한다. replacement 선택은 RUN1/RUN2/fresh confirmation 중 허용된 2-observation 조합을 요구하며, V2/V3 generic pack 동작은 변경하지 않는다.

## Safety state

- queue scheduler disabled, `isPaused=true`
- Sheets/Drive/R2/DB write 0
- final video render 0
- TTS/ASR/WhisperX 0
- ControlRunner absent
- existing worker unchanged
- platform upload 0
- generated reference, cutout, background, composite, contact sheet, local registry는 Git ignored

## 실행 명령

```powershell
.\scripts\usage-evidence\run-v5-coupang-image-scenes-no-upload.ps1 -Phase prepare ...
.\scripts\usage-evidence\run-v5-coupang-image-scenes-no-upload.ps1 -Phase compose ...
.\scripts\usage-evidence\run-v5-coupang-image-scenes-no-upload.ps1 -Phase finalize ...
.\scripts\usage-evidence\run-v5-slot069-recovery-no-upload.ps1 ...
.\scripts\usage-evidence\run-v5-slot069-replacement-no-upload.ps1 ...
.\scripts\usage-evidence\run-v5-slot069-proof-only-no-upload.ps1 ...
```

환경 파일은 worktree 외부에 있어야 하며 process memory에만 주입한다. artifact에는 credential, environment path, provider raw identifier query를 남기지 않는다.

## 롤백

V5 tracked code와 문서를 되돌리고 ignored `data/coupang-image-skill-usage-scenes-v5` 및 `daily69-coupang-image-skill-v5-*` runtime artifact를 폐기하면 된다. 외부 write, scheduler enable, worker 변경이 없으므로 Production rollback은 없다.
