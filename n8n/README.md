# Commerce Automation n8n Workflows

이 폴더는 Commerce Automation Control Center와 연결되는 n8n workflow export를 보관합니다.

## Workflow Files

- `workflows/A_Nightly_Scout_69.json`
  - Webhook path: `nightly-scout`
  - 쿠팡파트너스 상품 검색, 점수화, 69개 큐 생성 callback
- `workflows/B_Next_Batch_3.json`
  - Webhook path: `next-batch`
  - payload 안의 `items`만 처리하는 배치 workflow
- `workflows/C_Retry_Item.json`
  - Webhook path: `retry-item`
  - 단일 item 재처리 workflow

## Required n8n Variables

```text
COUPANG_ACCESS_KEY
COUPANG_SECRET_KEY
GEMINI_API_KEY
CREATOMATE_API_KEY
CREATOMATE_TEMPLATE_ID
COMMERCE_AUTOMATION_BASE_URL
COMMERCE_AUTOMATION_API_SECRET
```

실제 값은 workflow JSON, 앱 코드, 실행 로그에 직접 저장하지 않습니다.

`COMMERCE_AUTOMATION_BASE_URL`은 callback URL 생성의 기준입니다. workflow export에는 `localhost:3001` 같은 고정 callback URL을 넣지 않습니다.

## Rebuild Exports

```bash
npm run build:n8n-workflows
```

## Safety

- 실제 YouTube/TikTok/Threads 자동 업로드는 포함하지 않습니다.
- callback은 `Authorization: Bearer {{$vars.COMMERCE_AUTOMATION_API_SECRET}}`로 호출합니다.
- Webhook 요청에는 먼저 `202 accepted`를 반환하고, 실제 처리 결과는 callback으로 전달합니다.
- batch/retry workflow는 영상 URL과 블로그 초안 URL이 없으면 `ready_for_manual_upload`로 전환하지 않습니다.
