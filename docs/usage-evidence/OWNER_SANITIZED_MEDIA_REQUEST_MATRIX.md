# Owner Sanitized Media Request Matrix

## 정확한 다음 입력

환경변수 `USAGE_EVIDENCE_OWNER_INBOX_ROOT`가 가리키는 외부 local inbox에 아래 구조로 source를 추가한다. tracked 코드나 문서에는 실제 절대 경로를 기록하지 않는다.

```text
<inbox>/
  home_storage/
    source-001/
      source.mp4
      intake-manifest.json
  kitchen_organization/
  camping_storage/
```

## 요청 수량

| Use case | Top-level category | Planned active gain | Sources | Derived clips | Required role coverage | Folder |
| --- | --- | ---: | ---: | ---: | --- | --- |
| `home_storage` | 홈인테리어 | 4 | 3 | 14 | problem 4, usage/action 6, after 4 | `home_storage` |
| `kitchen_organization` | 주방용품 | 4 | 3 | 14 | problem 4, usage/action 6, after 4 | `kitchen_organization` |
| `camping_storage` | 스포츠/레저 | 3 | 3 | 14 | problem 4, usage/action 6, after 4 | `camping_storage` |

계획 active gain 합계는 현재 shortfall과 같은 `11`이다. 이는 media 제공 후 actual live marginal proof 전까지 예상치이며 보장값이 아니다.

## 촬영 요구사항

- source당 1080p 이상, 24~60fps, 최소 6초, 권장 10~30초
- 안정적인 카메라와 실제 손/물건/공간 변화
- source별로 `problem`, `before`, `hand_interaction`, `usage`, `organization/storage`, `after` 중 최소 3개 역할
- shot 권장 길이 3~6초

### `home_storage`

1. 정리 전 옷장·현관·리빙 공간
2. 손으로 수납함에 물건을 분류하고 배치
3. 정리 후 확보된 공간

### `kitchen_organization`

1. 정리 전 싱크대·주방 선반·냉장고 내부
2. 손으로 바구니·선반·용기에 물건 배치
3. 정리 후 동선과 공간

### `camping_storage`

1. 정리 전 일반 캠핑 장비와 수납 공간
2. 손으로 수납 가방·박스에 장비 배치
3. 정리 후 휴대·보관 상태

## 차단 대상

- 식별 가능한 얼굴, 차량 번호판
- 주소, 전화번호, 송장, 주문서
- 계정 화면, 개인 메시지
- 타사 로고를 판매 상품 브랜드처럼 보이게 하는 장면
- 권리 불명 음원, 워터마크
- 성인, 의약, 주류, 담배, 무기 관련 media

## 필수 manifest

각 source 폴더에 [owner-sanitized-media-intake-manifest.example.json](../../config/usage-evidence/owner-sanitized-media-intake-manifest.example.json)을 복사하고 `sourceId`, `allowedUseCases`만 해당 source에 맞게 수정한다.

```json
{
  "schemaVersion": "owner-sanitized-media-intake-v1",
  "sourceId": "unique-source-id",
  "ownerProvided": true,
  "rightsConfirmed": true,
  "privacyConfirmed": true,
  "brandNeutralConfirmed": true,
  "allowedUseCases": ["home_storage"],
  "sourceHumanReviewStatus": "not_available",
  "humanOwnerReviewStatus": "not_requested",
  "publishEligible": false,
  "noUploadAutomationCandidate": true
}
```

`ownerProvided`, rights/privacy 확인은 human derived review pass를 의미하지 않는다. Codex review 후에도 `humanOwnerReviewStatus=not_requested`, `publishEligible=false`를 유지한다.

## Intake 이후 gate

1. manifest, rights, privacy, brand-neutral 검증
2. first/middle/last frame, full contact sheet, motion strip 직접 검수
3. use case별 source IDs 2개 이상 및 pack 2개 이상 구성
4. pack별 unique assets 7개 이상, problem 2, usage/action 3, after 2
5. actual live marginal `activeGain>0`인 pack만 selected registry에 포함
6. active 69 / reserve 14 / distinct 83 증명 전 RUN 2와 second scout 차단

이 단계에서도 Sheets, Control Center, video canary, render, Scheduler, upload는 실행하지 않는다.
