import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const outputDir = path.join(process.cwd(), "n8n", "workflows");

function node(id, name, type, typeVersion, position, parameters, extra = {}) {
  return {
    parameters,
    id,
    name,
    type,
    typeVersion,
    position,
    ...extra
  };
}

function webhookNode(id, name, pathValue, position) {
  return node(id, name, "n8n-nodes-base.webhook", 2, position, {
    httpMethod: "POST",
    path: pathValue,
    responseMode: "responseNode",
    options: {
      rawBody: false
    }
  });
}

function codeNode(id, name, position, jsCode) {
  return node(id, name, "n8n-nodes-base.code", 2, position, {
    mode: "runOnceForAllItems",
    jsCode
  });
}

function httpRequestNode(id, name, position, parameters, extra = {}) {
  return node(id, name, "n8n-nodes-base.httpRequest", 4.2, position, parameters, extra);
}

function callbackNode(id, name, position) {
  return httpRequestNode(id, name, position, {
    method: "POST",
    url: "={{ $json.callbackUrl }}",
    sendHeaders: true,
    headerParameters: {
      parameters: [
        {
          name: "Authorization",
          value: "Bearer {{$vars.COMMERCE_AUTOMATION_API_SECRET}}"
        },
        {
          name: "Content-Type",
          value: "application/json"
        }
      ]
    },
    sendBody: true,
    specifyBody: "json",
    jsonBody: "={{ JSON.stringify($json.callbackBody) }}",
    options: {
      timeout: 30000
    }
  });
}

function respondNode(id, name, position, responseBody, responseCode = 200) {
  return node(id, name, "n8n-nodes-base.respondToWebhook", 1.1, position, {
    respondWith: "json",
    responseBody,
    options: {
      responseCode
    }
  });
}

const acceptedResponse =
  "={{ JSON.stringify({ ok: true, request_id: $json.body?.request_id ?? $json.request_id ?? null, message: 'Workflow accepted. Result will be sent by callback.' }) }}";

const nightlyPrepareCode = [
  "const crypto = require('crypto');",
  "const input = $input.first()?.json ?? {};",
  "const body = input.body ?? input;",
  "const settings = body.settings ?? {};",
  "const requestId = body.request_id ?? 'nightly_scout-' + Date.now();",
  "const requestedCount = Number(body.requested_count ?? settings.daily_target_count ?? 69);",
  "const queueDate = new Date().toISOString().slice(0, 10);",
  "const baseUrl = String($vars.COMMERCE_AUTOMATION_BASE_URL ?? '').replace(/\\/$/, '');",
  "const callbackUrl = baseUrl ? baseUrl + '/api/callback/n8n/nightly-scout' : '';",
  "const excludedCategories = settings.category_exclude ?? ['의류', '신발', '건강식품', '화장품', '식품', '고가전자제품', '대형가구'];",
  "const keywords = ['배수구 거름망', '틈새 청소솔', '케이블 정리 클립', '차량용 쓰레기봉투', '강아지 배변봉투', '제습제', '습기제거제', '미니 선풍기', '보냉백', '텀블러 세척솔', '냉장고 정리 트레이', '욕실 청소솔', '차량용 정리함', '반려동물 산책용품'];",
  "function safeFailure(message) {",
  "  return [{ json: { callbackUrl, callbackBody: { request_id: requestId, status: 'failed', queue_date: queueDate, created_count: 0, items: [], error_message: message } } }];",
  "}",
  "if (!callbackUrl) return safeFailure('callback URL 설정이 없어 결과를 전달할 수 없습니다.');",
  "const providerEnabled = String($vars.COUPANG_PARTNERS_PROVIDER_ENABLED ?? '').trim().toLowerCase();",
  "const accessKey = String($vars.COUPANG_PARTNERS_ACCESS_KEY ?? $vars.COUPANG_ACCESS_KEY ?? '').trim();",
  "const secretKey = String($vars.COUPANG_PARTNERS_SECRET_KEY ?? $vars.COUPANG_SECRET_KEY ?? '').trim();",
  "const customerOrPartnerId = String($vars.COUPANG_CUSTOMER_ID ?? $vars.COUPANG_PARTNER_ID ?? $vars.COUPANG_PARTNERS_CUSTOMER_ID ?? '').trim();",
  "const baseUrl = String($vars.COUPANG_PARTNERS_BASE_URL ?? 'https://api-gateway.coupang.com').trim().replace(/\\/+$/, '') || 'https://api-gateway.coupang.com';",
  "if (!['1', 'true', 'yes', 'on'].includes(providerEnabled)) return safeFailure('Coupang Partners provider enabled gate is not true.');",
  "if (!accessKey || !secretKey) return safeFailure('Coupang Partners API key pair is missing.');",
  "if (!customerOrPartnerId) return safeFailure('Coupang Partners customer/partner id is missing.');",
  "const maxKeywords = Math.min(keywords.length, Math.max(1, Math.ceil(requestedCount / 3)));",
  "function signedSearch(keyword) {",
  "  const path = '/v2/providers/affiliate_open_api/apis/openapi/products/search';",
  "  const query = 'keyword=' + encodeURIComponent(keyword) + '&limit=10';",
  "  const signedDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\\.\\d{3}Z$/, 'Z').slice(2);",
  "  const message = signedDate + 'GET' + path + query;",
  "  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');",
  "  return { url: baseUrl + path + '?' + query, authorization: 'CEA algorithm=HmacSHA256, access-key=' + accessKey + ', signed-date=' + signedDate + ', signature=' + signature };",
  "}",
  "return keywords.slice(0, maxKeywords).map((keyword) => {",
  "  const signed = signedSearch(keyword);",
  "  return { json: { requestId, queueDate, requestedCount, settings, keyword, excludedCategories, callbackUrl, coupangUrl: signed.url, coupangAuthorization: signed.authorization } };",
  "});"
].join("\n");

const nightlyScoreCode = [
  "const inputs = $input.all();",
  "const first = inputs[0]?.json ?? {};",
  "const requestId = first.requestId ?? first.callbackBody?.request_id ?? 'nightly_scout-' + Date.now();",
  "const queueDate = first.queueDate ?? new Date().toISOString().slice(0, 10);",
  "const callbackUrl = first.callbackUrl ?? '';",
  "const requestedCount = Number(first.requestedCount ?? 69);",
  "const excludedCategories = first.excludedCategories ?? ['의류', '신발', '건강식품', '화장품', '식품', '고가전자제품', '대형가구'];",
  "if (first.callbackBody?.status === 'failed') return [{ json: first }];",
  "function productsFrom(json) {",
  "  const data = json.data ?? json.body?.data ?? json;",
  "  return data.productData ?? data.products ?? data.items ?? [];",
  "}",
  "function containsExcluded(category) {",
  "  return excludedCategories.some((excluded) => String(category ?? '').includes(excluded));",
  "}",
  "function scoreProduct(product, keyword) {",
  "  const category = product.categoryName ?? product.category_path ?? '';",
  "  let score = 30;",
  "  score += /제습|습기|선풍기|보냉|나들이|차량|반려|청소/.test(keyword) ? 25 : 10;",
  "  score += /정리|청소|거름망|클립|봉투|트레이|솔/.test(keyword) ? 15 : 8;",
  "  score += Number(product.productPrice ?? 0) > 0 && Number(product.productPrice ?? 0) <= 30000 ? 15 : 5;",
  "  score += product.isRocket ? 10 : 0;",
  "  score += /솔|클립|봉투|거름망|트레이|정리함/.test(keyword) ? 10 : 5;",
  "  score += /봉투|거름망|제습제|습기제거제|세척솔/.test(keyword) ? 10 : 4;",
  "  score += 10;",
  "  if (containsExcluded(category)) score -= 30;",
  "  return Math.max(0, Math.min(100, score));",
  "}",
  "const seen = new Set();",
  "const candidates = [];",
  "for (const item of inputs) {",
  "  const keyword = item.json.keyword ?? '생활용품';",
  "  for (const product of productsFrom(item.json)) {",
  "    const productId = String(product.productId ?? product.id ?? product.raw_coupang_url ?? product.productUrl ?? '');",
  "    if (!productId || seen.has(productId)) continue;",
  "    seen.add(productId);",
  "    const category = product.categoryName ?? product.categoryPath ?? '';",
  "    if (containsExcluded(category)) continue;",
  "    candidates.push({ product, keyword, score: scoreProduct(product, keyword) });",
  "  }",
  "}",
  "const selected = candidates.sort((a, b) => b.score - a.score).slice(0, requestedCount);",
  "if (selected.length === 0) {",
  "  return [{ json: { callbackUrl, callbackBody: { request_id: requestId, status: 'failed', queue_date: queueDate, created_count: 0, items: [], error_message: '쿠팡 상품 검색 결과가 없어 큐를 생성하지 않았습니다.' } } }];",
  "}",
  "const items = selected.map(({ product, keyword, score }, index) => {",
  "  const rank = index + 1;",
  "  const slot = Math.floor(index / 3) + 1;",
  "  const hour = Math.min(23, 1 + slot - 1);",
  "  const scheduledAt = queueDate + 'T' + String(hour).padStart(2, '0') + ':00:00+09:00';",
  "  return {",
  "    id: 'coupang-' + (product.productId ?? rank) + '-' + queueDate.replace(/-/g, ''),",
  "    queue_date: queueDate, queue_rank: rank, upload_slot: slot, scheduled_at: scheduledAt, keyword,",
  "    theme: /차량/.test(keyword) ? '차량/나들이' : /반려|강아지/.test(keyword) ? '반려동물' : '생활 문제 해결',",
  "    product_name: product.productName ?? product.name ?? keyword, category_path: product.categoryName ?? product.categoryPath ?? '',",
  "    price_now_text: product.productPrice ? Number(product.productPrice).toLocaleString('ko-KR') + '원' : '',",
  "    thumbnail_url: product.productImage ?? product.thumbnail ?? '', raw_coupang_url: product.productUrl ?? '', selected_affiliate_url: product.productUrl ?? '',",
  "    product_score: score, score_reason: '시즌성, 생활 문제 해결성, 가격대, 배송 장점 기준으로 선별했습니다.',",
  "    video_angle: keyword + ' 활용 전후 비교 쇼츠', queue_status: 'scheduled',",
  "    youtube_upload_status: 'not_ready', tiktok_upload_status: 'not_ready', threads_post_status: 'not_ready', manual_review_status: 'not_ready', error_message: ''",
  "  };",
  "});",
  "return [{ json: { callbackUrl, callbackBody: { request_id: requestId, status: 'success', queue_date: queueDate, created_count: items.length, items, error_message: '' } } }];"
].join("\n");

const prepareBatchCode = [
  "const input = $input.first()?.json ?? {};",
  "const body = input.body ?? input;",
  "const settings = body.settings ?? {};",
  "const requestId = body.request_id ?? 'next_batch-' + Date.now();",
  "const baseUrl = String($vars.COMMERCE_AUTOMATION_BASE_URL ?? '').replace(/\\/$/, '');",
  "const callbackUrl = baseUrl ? baseUrl + '/api/callback/n8n/batch-result' : '';",
  "const items = Array.isArray(body.items) ? body.items.slice(0, Number(body.batch_size ?? settings.batch_size ?? 3)) : [];",
  "const disclosure = '파트너스 활동을 통해 일정액의 수수료를 제공받을 수 있습니다.';",
  "if (!callbackUrl) {",
  "  return [{ json: { callbackUrl, callbackBody: { request_id: requestId, status: 'failed', processed_count: 0, error_count: 1, items: [], error_message: 'callback URL 설정이 없어 결과를 전달할 수 없습니다.' } } }];",
  "}",
  "if (items.length === 0) {",
  "  return [{ json: { callbackUrl, callbackBody: { request_id: requestId, status: 'failed', processed_count: 0, error_count: 1, items: [], error_message: '처리할 items가 없어 batch를 실행하지 않았습니다.' } } }];",
  "}",
  "const processableItems = items.filter((item) => item.selected_affiliate_url);",
  "if (processableItems.length === 0) {",
  "  return [{ json: { callbackUrl, callbackBody: { request_id: requestId, status: 'failed', processed_count: 0, error_count: items.length, items: items.map((item) => ({ ...item, queue_status: 'error', error_message: '제휴 링크가 없어 처리할 수 없습니다.' })), error_message: '제휴 링크가 없어 처리할 수 없습니다.' } } }];",
  "}",
  "if (!$vars.GEMINI_API_KEY || !$vars.CREATOMATE_API_KEY || !$vars.CREATOMATE_TEMPLATE_ID) {",
  "  return [{ json: { callbackUrl, callbackBody: { request_id: requestId, status: 'failed', processed_count: 0, error_count: processableItems.length, items: processableItems.map((item) => ({ ...item, queue_status: 'error', error_message: '콘텐츠 생성 API 설정이 없어 처리할 수 없습니다.' })), error_message: '콘텐츠 생성 API 설정이 없어 처리할 수 없습니다.' } } }];",
  "}",
  "return processableItems.map((item) => ({ json: { requestId, callbackUrl, settings, item, disclosure, geminiPayload: { contents: [{ parts: [{ text: '쿠팡 제휴 쇼츠/블로그 초안을 JSON으로 생성하세요. 반드시 고지 문구 포함: ' + disclosure + '\\n상품명: ' + item.product_name + '\\n키워드: ' + item.keyword + '\\n제휴링크: ' + item.selected_affiliate_url }] }] } } }));"
].join("\n");

const prepareRenderCode = [
  "const inputs = $input.all();",
  "return inputs.map((entry) => {",
  "  const item = entry.json.item ?? {};",
  "  const text = JSON.stringify(entry.json.candidates ?? entry.json.body ?? entry.json);",
  "  const disclosure = entry.json.disclosure;",
  "  const hasDisclosure = text.includes(disclosure);",
  "  if (!hasDisclosure) {",
  "    return { json: { requestId: entry.json.requestId, callbackUrl: entry.json.callbackUrl, item: { ...item, queue_status: 'error', error_message: '쿠팡파트너스 고지 문구가 없어 업로드 준비 상태로 전환할 수 없습니다.' }, skipRender: true } };",
  "  }",
  "  return { json: { requestId: entry.json.requestId, callbackUrl: entry.json.callbackUrl, item: { ...item, disclosure_text: disclosure }, disclosure, generatedText: text, renderPayload: { template_id: $vars.CREATOMATE_TEMPLATE_ID, modifications: { product_name: item.product_name, thumbnail_url: item.thumbnail_url, affiliate_url: item.selected_affiliate_url, disclosure_text: disclosure } } } };",
  "});"
].join("\n");

const buildBatchCallbackCode = [
  "const inputs = $input.all();",
  "const first = inputs[0]?.json ?? {};",
  "if (first.callbackBody) return [{ json: first }];",
  "const requestId = first.requestId ?? 'next_batch-' + Date.now();",
  "const callbackUrl = first.callbackUrl ?? '';",
  "const items = inputs.map((entry) => {",
  "  const source = entry.json.item ?? {};",
  "  const render = entry.json.body ?? entry.json;",
  "  const videoUrl = render.url ?? render.video_url ?? render.render_url ?? '';",
  "  const snapshotUrl = render.snapshot_url ?? render.video_snapshot_url ?? '';",
  "  const blogDraftUrl = render.blog_draft_url ?? entry.json.blog_draft_url ?? '';",
  "  const disclosureText = source.disclosure_text ?? entry.json.disclosure ?? entry.json.renderPayload?.modifications?.disclosure_text ?? '';",
  "  if (source.error_message) return source;",
  "  if (!source.selected_affiliate_url || !disclosureText || !videoUrl || !blogDraftUrl) {",
  "    return { ...source, disclosure_text: disclosureText, queue_status: 'error', error_message: '제휴 링크, 고지 문구, 영상 URL 또는 블로그 초안 URL이 없어 업로드 준비 상태로 전환하지 않았습니다.' };",
  "  }",
  "  return { ...source, disclosure_text: disclosureText, queue_status: 'ready_for_manual_upload', video_url: videoUrl, video_snapshot_url: snapshotUrl, blog_draft_url: blogDraftUrl, youtube_upload_status: 'ready_to_upload', tiktok_upload_status: 'ready_to_upload', threads_post_status: 'ready_to_post', manual_review_status: 'ready_for_review', error_message: '' };",
  "});",
  "const errorCount = items.filter((item) => item.queue_status === 'error').length;",
  "return [{ json: { callbackUrl, callbackBody: { request_id: requestId, status: errorCount > 0 ? 'failed' : 'success', processed_count: items.length - errorCount, error_count: errorCount, items, error_message: errorCount > 0 ? '일부 상품 처리에 실패했습니다.' : '' } } }];"
].join("\n");

const prepareRetryCode = [
  "const input = $input.first()?.json ?? {};",
  "const body = input.body ?? input;",
  "const requestId = body.request_id ?? 'retry_item-' + Date.now();",
  "const baseUrl = String($vars.COMMERCE_AUTOMATION_BASE_URL ?? '').replace(/\\/$/, '');",
  "const callbackUrl = baseUrl ? baseUrl + '/api/callback/n8n/item-result' : '';",
  "const item = body.item;",
  "const disclosure = '파트너스 활동을 통해 일정액의 수수료를 제공받을 수 있습니다.';",
  "if (!callbackUrl) return [{ json: { callbackUrl, callbackBody: { request_id: requestId, status: 'failed', item: item ?? {}, error_message: 'callback URL 설정이 없어 결과를 전달할 수 없습니다.' } } }];",
  "if (!item) return [{ json: { callbackUrl, callbackBody: { request_id: requestId, status: 'failed', item: {}, error_message: '재시도할 item이 없습니다.' } } }];",
  "return [{ json: { requestId, callbackUrl, item, disclosure, geminiPayload: { contents: [{ parts: [{ text: 'retry_item 모드로 상품 콘텐츠를 다시 생성하세요. 반드시 고지 문구 포함: ' + disclosure + '\\n상품명: ' + item.product_name + '\\n제휴링크: ' + item.selected_affiliate_url }] }] } } }];"
].join("\n");

const buildRetryCallbackCode = [
  "const first = $input.first()?.json ?? {};",
  "if (first.callbackBody) return [{ json: first }];",
  "const item = first.item ?? {};",
  "const render = first.body ?? first;",
  "const videoUrl = render.url ?? render.video_url ?? '';",
  "const blogDraftUrl = render.blog_draft_url ?? first.blog_draft_url ?? '';",
  "const disclosureText = item.disclosure_text ?? first.disclosure ?? first.renderPayload?.modifications?.disclosure_text ?? '';",
  "const resultItem = item.selected_affiliate_url && disclosureText && videoUrl && blogDraftUrl",
  "  ? { ...item, disclosure_text: disclosureText, queue_status: 'ready_for_manual_upload', video_url: videoUrl, blog_draft_url: blogDraftUrl, youtube_upload_status: 'ready_to_upload', tiktok_upload_status: 'ready_to_upload', threads_post_status: 'ready_to_post', manual_review_status: 'ready_for_review', error_message: '' }",
  "  : { ...item, disclosure_text: disclosureText, queue_status: 'error', error_message: '제휴 링크, 고지 문구, 영상 URL 또는 블로그 초안 URL이 없어 재시도 처리를 완료하지 않았습니다.' };",
  "return [{ json: { callbackUrl: first.callbackUrl, callbackBody: { request_id: first.requestId, status: resultItem.queue_status === 'error' ? 'failed' : 'success', item: resultItem, error_message: resultItem.error_message ?? '' } } }];"
].join("\n");

function nightlyWorkflow() {
  return {
    name: "A_Nightly_Scout_69",
    active: false,
    nodes: [
      webhookNode("nightly-webhook", "Webhook - nightly-scout", "nightly-scout", [0, 0]),
      codeNode("nightly-prepare", "Prepare Coupang Search Requests", [260, 0], nightlyPrepareCode),
      httpRequestNode(
        "nightly-coupang-search",
        "Coupang Product Search",
        [560, 0],
        {
          method: "GET",
          url: "={{ $json.coupangUrl }}",
          sendHeaders: true,
          headerParameters: {
            parameters: [
              {
                name: "Authorization",
                value: "={{ $json.coupangAuthorization }}"
              }
            ]
          },
          options: {
            timeout: 30000
          }
        },
        { continueOnFail: true }
      ),
      codeNode("nightly-score", "Score Products And Build Queue Callback", [860, 0], nightlyScoreCode),
      callbackNode("nightly-callback", "Callback - nightly scout result", [1160, 0]),
      respondNode("nightly-respond", "Respond - nightly scout accepted", [260, -180], acceptedResponse, 202)
    ],
    connections: {
      "Webhook - nightly-scout": {
        main: [
          [
            { node: "Respond - nightly scout accepted", type: "main", index: 0 },
            { node: "Prepare Coupang Search Requests", type: "main", index: 0 }
          ]
        ]
      },
      "Prepare Coupang Search Requests": { main: [[{ node: "Coupang Product Search", type: "main", index: 0 }]] },
      "Coupang Product Search": { main: [[{ node: "Score Products And Build Queue Callback", type: "main", index: 0 }]] },
      "Score Products And Build Queue Callback": { main: [[{ node: "Callback - nightly scout result", type: "main", index: 0 }]] }
    },
    settings: { executionOrder: "v1" }
  };
}

function nextBatchWorkflow() {
  return {
    name: "B_Next_Batch_3",
    active: false,
    nodes: [
      webhookNode("batch-webhook", "Webhook - next-batch", "next-batch", [0, 0]),
      codeNode("batch-prepare", "Prepare Batch Items", [260, 0], prepareBatchCode),
      httpRequestNode(
        "batch-gemini",
        "Gemini Generate Content",
        [560, 0],
        {
          method: "POST",
          url: "={{ 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + $vars.GEMINI_API_KEY }}",
          sendBody: true,
          specifyBody: "json",
          jsonBody: "={{ JSON.stringify($json.geminiPayload) }}",
          options: { timeout: 60000 }
        },
        { continueOnFail: true }
      ),
      codeNode("batch-render-prepare", "Prepare Creatomate Render And Draft", [860, 0], prepareRenderCode),
      httpRequestNode(
        "batch-creatomate",
        "Creatomate Create Render",
        [1160, 0],
        {
          method: "POST",
          url: "https://api.creatomate.com/v1/renders",
          sendHeaders: true,
          headerParameters: {
            parameters: [
              {
                name: "Authorization",
                value: "Bearer {{$vars.CREATOMATE_API_KEY}}"
              },
              {
                name: "Content-Type",
                value: "application/json"
              }
            ]
          },
          sendBody: true,
          specifyBody: "json",
          jsonBody: "={{ JSON.stringify($json.renderPayload) }}",
          options: { timeout: 60000 }
        },
        { continueOnFail: true }
      ),
      node(
        "batch-google-docs",
        "Google Docs - create blog draft",
        "n8n-nodes-base.googleDocs",
        2,
        [1460, 0],
        {
          operation: "create",
          title: "={{ 'Commerce Draft - ' + ($json.item?.product_name ?? 'item') }}",
          text: "={{ $json.generatedText ?? '' }}"
        },
        {
          notes: "Attach a Google Docs OAuth credential in n8n. Without a real document URL, the callback builder keeps the item out of ready_for_manual_upload."
        }
      ),
      codeNode("batch-callback-build", "Build Batch Callback", [1760, 0], buildBatchCallbackCode),
      callbackNode("batch-callback", "Callback - batch result", [2060, 0]),
      respondNode("batch-respond", "Respond - batch accepted", [260, -180], acceptedResponse, 202)
    ],
    connections: {
      "Webhook - next-batch": {
        main: [
          [
            { node: "Respond - batch accepted", type: "main", index: 0 },
            { node: "Prepare Batch Items", type: "main", index: 0 }
          ]
        ]
      },
      "Prepare Batch Items": { main: [[{ node: "Gemini Generate Content", type: "main", index: 0 }]] },
      "Gemini Generate Content": { main: [[{ node: "Prepare Creatomate Render And Draft", type: "main", index: 0 }]] },
      "Prepare Creatomate Render And Draft": { main: [[{ node: "Creatomate Create Render", type: "main", index: 0 }]] },
      "Creatomate Create Render": { main: [[{ node: "Google Docs - create blog draft", type: "main", index: 0 }]] },
      "Google Docs - create blog draft": { main: [[{ node: "Build Batch Callback", type: "main", index: 0 }]] },
      "Build Batch Callback": { main: [[{ node: "Callback - batch result", type: "main", index: 0 }]] }
    },
    settings: { executionOrder: "v1" }
  };
}

function retryWorkflow() {
  return {
    name: "C_Retry_Item",
    active: false,
    nodes: [
      webhookNode("retry-webhook", "Webhook - retry-item", "retry-item", [0, 0]),
      codeNode("retry-prepare", "Prepare Retry Item", [260, 0], prepareRetryCode),
      httpRequestNode(
        "retry-gemini",
        "Gemini Regenerate Content",
        [560, 0],
        {
          method: "POST",
          url: "={{ 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + $vars.GEMINI_API_KEY }}",
          sendBody: true,
          specifyBody: "json",
          jsonBody: "={{ JSON.stringify($json.geminiPayload) }}",
          options: { timeout: 60000 }
        },
        { continueOnFail: true }
      ),
      codeNode("retry-render-prepare", "Prepare Retry Render", [860, 0], prepareRenderCode),
      httpRequestNode(
        "retry-creatomate",
        "Creatomate Retry Render",
        [1160, 0],
        {
          method: "POST",
          url: "https://api.creatomate.com/v1/renders",
          sendHeaders: true,
          headerParameters: {
            parameters: [
              {
                name: "Authorization",
                value: "Bearer {{$vars.CREATOMATE_API_KEY}}"
              },
              {
                name: "Content-Type",
                value: "application/json"
              }
            ]
          },
          sendBody: true,
          specifyBody: "json",
          jsonBody: "={{ JSON.stringify($json.renderPayload) }}",
          options: { timeout: 60000 }
        },
        { continueOnFail: true }
      ),
      codeNode("retry-callback-build", "Build Retry Callback", [1460, 0], buildRetryCallbackCode),
      callbackNode("retry-callback", "Callback - retry item result", [1760, 0]),
      respondNode("retry-respond", "Respond - retry accepted", [260, -180], acceptedResponse, 202)
    ],
    connections: {
      "Webhook - retry-item": {
        main: [
          [
            { node: "Respond - retry accepted", type: "main", index: 0 },
            { node: "Prepare Retry Item", type: "main", index: 0 }
          ]
        ]
      },
      "Prepare Retry Item": { main: [[{ node: "Gemini Regenerate Content", type: "main", index: 0 }]] },
      "Gemini Regenerate Content": { main: [[{ node: "Prepare Retry Render", type: "main", index: 0 }]] },
      "Prepare Retry Render": { main: [[{ node: "Creatomate Retry Render", type: "main", index: 0 }]] },
      "Creatomate Retry Render": { main: [[{ node: "Build Retry Callback", type: "main", index: 0 }]] },
      "Build Retry Callback": { main: [[{ node: "Callback - retry item result", type: "main", index: 0 }]] }
    },
    settings: { executionOrder: "v1" }
  };
}

mkdirSync(outputDir, { recursive: true });

for (const workflow of [nightlyWorkflow(), nextBatchWorkflow(), retryWorkflow()]) {
  writeFileSync(path.join(outputDir, `${workflow.name}.json`), `${JSON.stringify(workflow, null, 2)}\n`, "utf8");
}
