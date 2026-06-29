# YouTube Link CTA Studio Checklist

This checklist finalizes the Minz Commerce Shorts v033 private-video link flow.
It must stay no-upload: do not call YouTube Execute, `videos.insert`, public
upload, unlisted upload, R2 upload, `product_assets` writes, DB writes, or
visibility conversion while using it.

## Target

- video_id: `ldSNhRKJLe0`
- required visibility: `private`
- description status: URL-first link CTA applied and verified by sanitized flags
- comment status: comment text ready; API creation previously returned HTTP 403
- pinning status: current code/API path does not support automatic pinning

## House Style Metadata Rule

1. On-screen CTA:
   `상품 링크는 설명란 / 고정댓글 확인`
2. Description first line:
   plain `https://` affiliate URL
3. Description top CTA:
   `상품 링크는 설명란 첫 줄 또는 고정댓글에서 확인하세요.`
4. Required disclosure:
   `※ 이 링크는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.`
5. Comment template:
   `상품 링크 👉 <PLAIN_HTTPS_AFFILIATE_URL>`
   plus Coupang Partners disclosure.
6. If comment API returns HTTP 403:
   `comment_api_retry_attempted=false`
   `manual_pin_required=true`
   switch to manual YouTube Studio comment and pin handling.

## Studio Checklist

1. Open video `ldSNhRKJLe0` in YouTube Studio.
2. Confirm the video is still private.
3. Confirm the description first line is a clickable product link.
4. Confirm the Coupang Partners disclosure is visible near the top.
5. If the product-link comment is missing, create it manually from the approved template.
6. Pin the manually created comment in Studio.
7. Confirm there are no save, copyright, or policy restriction warnings.
8. Confirm the Shorts first three seconds show the hook clearly.
9. Confirm the final sentence remains audible through the end.
10. Do not switch to public or unlisted without separate approval.

## Sanitized Verification Fields

- `description_first_line_plain_https_url=true`
- `affiliate_disclosure_present=true`
- `onscreen_cta_mentions_description_or_pinned_comment=true`
- `manual_comment_text_ready=true`
- `manual_pin_required=true`
- `comment_api_retry_attempted=false`
- `raw_affiliate_url_not_logged=true`
