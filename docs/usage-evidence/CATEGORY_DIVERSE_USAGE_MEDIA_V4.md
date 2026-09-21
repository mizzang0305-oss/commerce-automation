# Category-Diverse Usage Media V4

## 목적과 고정 경계

Daily69 V3 live proof의 active 58 / reserve 14 / distinct 72 병목을 category-diverse usage evidence로 해소하기 위한 no-upload intake 단계다. 기준은 Draft PR #241 exact head `ff331fbc44d10d45d64ffb25e3d84bbbab8085a4`이며 category, family, pack, asset, source, sequence threshold는 변경하지 않는다.

- `maxCategoryRatio=0.35`
- `maxProductFamilyRatio=0.10`
- `maxUsagePackReuse=5`
- asset daily reuse limit `5`
- `maxSameSequenceConsecutive=2`
- Sheets/Drive/R2/DB/render/TTS/ASR/WhisperX/Scheduler/upload/Production deploy `0`
- `SAFE_TO_UPLOAD=false`, `SAFE_TO_PUBLIC_UPLOAD=false`, `isPaused=true`

## Configured category opportunity proof

기존 `daily69-v3-live-marginal-20260809010136` snapshot을 먼저 재사용했다. 기존 snapshot만으로 stop-early 조건을 충족하지 못해 신규 category keyword만 read-only로 조회했다.

- 최종 authority namespace: `daily69-category-opportunity-v4-20260809014934`
- final search/deeplink calls: `7 / 0`
- final raw/normalized: `70 / 70`
- stop-early: 신규 category 3개, potential allocatable 32개
- task total calls: 최초 namespace 7 + repair namespace 7 = `14 / 60`
- repair 사유: 최초 namespace가 search keyword를 category보다 우선하여 `홈인테리어`에 `kitchen_organization`을 중복 추천했다. 최초 namespace는 보존하고 category source-of-truth를 우선하는 새 namespace를 생성했다.
- security artifact findings: `0`

| Category | Active | Cap | Headroom | Unique | Policy/Image/Affiliate ready | Usage blocked | Potential active gain | Target use case |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 홈인테리어 | 1 | 24 | 23 | 37 | 14 / 14 / 14 | 11 | 14 | `home_storage` |
| 주방용품 | 0 | 24 | 24 | 18 | 11 / 11 / 11 | 11 | 11 | `kitchen_organization` |
| 스포츠/레저 | 1 | 24 | 23 | 11 | 7 / 7 / 7 | 4 | 7 | `camping_storage` |

`자동차용품 24/24`와 `생활용품 24/24`는 계속 capped이며 신규 pack 대상에서 제외된다.

## 기존 local source 재검사

V3 registry의 approved inventory만 검사했고 Downloads/Documents/Desktop/개인 사진/cache/메신저 폴더는 검색하지 않았다.

- valid source IDs: `52`
- pack 미사용 valid source IDs: `1`
- 신규 category-compatible sources: `0`
- selected sources: `0`
- privacy/rights/static rejection: `0 / 0 / 0`

기존 unassigned source와 인접한 V3 laundry source contact sheet 및 motion strip을 다시 열었다. 장면은 건조대, 빨래 배치, laundry after 역할로 확인됐으며 `home_storage`, `kitchen_organization`, `camping_storage`의 정직한 evidence로 재분류할 수 없다.

## Owner intake 상태와 판정

- `USAGE_EVIDENCE_OWNER_INBOX_ROOT`: not configured
- source folders/manifests/accepted: `0 / 0 / 0`
- human owner review promoted: `NO`
- 신규 use case 등록: `0`
- 신규 pack/positive-gain pack: `0 / 0`
- V4 RUN 1 marginal/RUN 2/second scout: `NOT_RUN`

현재 판정은 `OWNER_SANITIZED_MEDIA_INTAKE_REQUIRED`다. 새 taxonomy만 먼저 추가하지 않는다. 각 use case는 owner manifest, source 2개 이상, pack 2개 이상, 역할별 asset 수, Codex visual review, actual positive marginal gain을 모두 통과한 후에만 supported로 등록한다.

정확한 제공 요청은 [OWNER_SANITIZED_MEDIA_REQUEST_MATRIX.md](./OWNER_SANITIZED_MEDIA_REQUEST_MATRIX.md)에 기록한다.
