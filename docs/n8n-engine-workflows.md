# n8n Automation Engine Workflows

Commerce Automation Control Center v1.2와 연결되는 n8n 엔진 workflow 설계/구현 문서입니다.

## Import

1. n8n에서 **Import from File**을 선택합니다.
2. 아래 파일을 각각 import합니다.
   - `n8n/workflows/A_Nightly_Scout_69.json`
   - `n8n/workflows/B_Next_Batch_3.json`
   - `n8n/workflows/C_Retry_Item.json`
3. n8n variables를 등록합니다.
4. Google Docs node에는 n8n Google Docs OAuth credential을 연결합니다.
5. 테스트 webhook URL을 웹앱 `.env`의 `N8N_*_WEBHOOK_URL`에 등록한 뒤 `/dev/webhook-test`에서 확인합니다.

## Variables

```text
COUPANG_ACCESS_KEY=
COUPANG_SECRET_KEY=
GEMINI_API_KEY=
CREATOMATE_API_KEY=
CREATOMATE_TEMPLATE_ID=
COMMERCE_AUTOMATION_BASE_URL=
COMMERCE_AUTOMATION_API_SECRET=
```

`COMMERCE_AUTOMATION_BASE_URL` 예:

```text
http://localhost:3001
```

`COMMERCE_AUTOMATION_API_SECRET`은 commerce-automation 웹앱의 서버 환경변수와 같은 값이어야 합니다.

workflow export는 callback URL을 `COMMERCE_AUTOMATION_BASE_URL`에서 조합합니다. import JSON에 `localhost:3001` 같은 환경별 URL을 고정하지 않습니다.

## Webhook Response Model

세 workflow 모두 Webhook trigger 직후 `Respond to Webhook` node가 `202 accepted`를 반환합니다.
콘텐츠 생성, Creatomate render, Google Docs 초안 생성은 별도 branch에서 계속 진행되고, 최종 결과는 callback API로 전달합니다.

이 구조는 `/api/run/next-batch` 같은 웹앱 route가 n8n 실행을 오래 기다리다가 timeout 되는 위험을 줄이기 위한 것입니다.

## A_Nightly_Scout_69

- Webhook path: `nightly-scout`
- 입력: 웹앱의 `nightly_scout` payload
- 처리:
  - `request_id`, settings, requested_count를 읽습니다.
  - 제외 카테고리: 의류, 신발, 건강식품, 화장품, 식품, 고가전자제품, 대형가구
  - 추천 키워드 기반으로 쿠팡파트너스 상품 검색 API를 호출합니다.
  - product id 기준으로 중복 제거합니다.
  - 시즌성, 생활 문제 해결성, 가격대, 배송 장점, 영상화 용이성, 반복구매성, 옵션 단순성, 고위험 카테고리 감점 기준으로 점수화합니다.
  - 상위 상품을 1시부터 23시까지 시간당 3개 슬롯으로 배정합니다.
- callback:
  - `POST {COMMERCE_AUTOMATION_BASE_URL}/api/callback/n8n/nightly-scout`

## B_Next_Batch_3

- Webhook path: `next-batch`
- 입력: 웹앱의 `next_batch` payload
- 현재 v1.2 규칙:
  - request payload 안의 `items`가 있을 때만 처리합니다.
  - `items`가 없으면 성공으로 처리하지 않고 실패 callback을 보냅니다.
- 처리:
  - Gemini로 쇼츠/블로그/SNS 문구를 생성합니다.
  - 쿠팡파트너스 고지 문구 포함 여부를 확인합니다.
  - Creatomate render를 요청합니다.
  - Google Docs 초안 node를 통해 블로그 초안 문서를 생성하도록 구성되어 있습니다.
  - `selected_affiliate_url`, `disclosure_text`, 영상 URL, 블로그 초안 URL이 모두 있을 때만 `ready_for_manual_upload`를 callback합니다.
- callback:
  - `POST {COMMERCE_AUTOMATION_BASE_URL}/api/callback/n8n/batch-result`

## C_Retry_Item

- Webhook path: `retry-item`
- 입력: 웹앱의 `retry_item` payload
- 처리:
  - 단일 item을 B workflow와 같은 방식으로 재처리합니다.
  - 영상 URL과 블로그 초안 URL이 없으면 실패 상태를 callback합니다.
- callback:
  - `POST {COMMERCE_AUTOMATION_BASE_URL}/api/callback/n8n/item-result`

## Callback Headers

모든 callback HTTP Request node는 아래 header를 사용합니다.

```http
Authorization: Bearer {{$vars.COMMERCE_AUTOMATION_API_SECRET}}
Content-Type: application/json
```

## Safe Failure Messages

대표 safe Korean error:

- `callback URL 설정이 없어 결과를 전달할 수 없습니다.`
- `쿠팡파트너스 API 설정이 없어 큐를 생성할 수 없습니다.`
- `처리할 items가 없어 batch를 실행하지 않았습니다.`
- `콘텐츠 생성 API 설정이 없어 처리할 수 없습니다.`
- `쿠팡파트너스 고지 문구가 없어 업로드 준비 상태로 전환할 수 없습니다.`
- `영상 URL 또는 블로그 초안 URL이 없어 업로드 준비 상태로 전환하지 않았습니다.`

## Security

- Secret/token/API key를 workflow log에 직접 출력하지 않습니다.
- callback body에 secret 값을 넣지 않습니다.
- 실제 YouTube/TikTok/Threads 자동 업로드 node는 없습니다.
- `youtube_upload_status`는 ready 상태 관리용이며 실제 공개 업로드 성공을 의미하지 않습니다.
