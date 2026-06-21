# Cloud Video Provider Evaluation

Date: 2026-06-21 KST

Scope: research and scaffold only. No paid API calls, generated clips, R2
writes, DB writes, YouTube Execute calls, `videos.insert`, public upload, or
unlisted upload are performed by this work.

## Decision

Use a generic `cloud_image_to_video` provider scaffold before choosing a paid
vendor. The scaffold is disabled by default and requires both:

- API key presence
- explicit cost/quota approval

Until those are present, the expected blocker is:

```text
CLOUD_VIDEO_PROVIDER_NOT_CONFIGURED
```

Recommended first adapter after budget approval: `fal` with a Kling image-to-video
model. Rationale: fal exposes multiple video models, has documented server-side
API key handling, and publishes output-based video pricing. The first fallback
adapter should be `replicate` for its broad model catalog and mature prediction
API shape. Runway or Luma can be evaluated as higher-quality/direct-vendor
options if budget and commercial terms are accepted.

## Candidate Matrix

| Provider | Image-to-video support | Product consistency | Hand motion quality | API support | Cost / quota | Korean / shopping fit | Commercial terms | Automation fit | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Runway | Yes; official API includes image-to-video and current video models. Source: [Runway API reference](https://docs.dev.runwayml.com/api/) and [pricing](https://docs.dev.runwayml.com/guides/pricing/). | High for polished ads; product identity still needs human review. | Medium-high; good cinematic output but hand-specific utensil QA still required. | Strong SDK/API docs. | Credit-based; published per-second model prices. | Good visual fit; Korean text should not be baked into video. | Requires plan/org terms review before production. | Strong, but likely higher cost. | P1 direct-vendor option. |
| Kling | Yes; image-to-video API documented by Kling and available through fal. Source: [Kling image-to-video](https://kling.ai/document-api/apiReference/model/imageToVideo) and [fal Kling image-to-video](https://fal.ai/models/fal-ai/kling-video/v1.6/pro/image-to-video/api). | High candidate for product/hand motion. | High candidate for hand/cooking motion, still needs QA. | Official/open-platform and fal routes. | Kling/fal pricing is usage-based. | Good for shopping shorts if prompts keep product-focused composition. | Must verify selected route's commercial terms. | Strong. | Recommended first model family. |
| Luma | Yes; Dream Machine API supports text-to-video and image-to-video. Source: [Luma API](https://docs.lumalabs.ai/docs/api), [video generation](https://docs.lumalabs.ai/docs/video-generation), and [pricing](https://lumalabs.ai/api). | Medium-high; strong coherent motion, product detail review required. | Medium-high for natural motion. | Direct API and SDK docs. | Pay-as-you-go prices published by resolution/duration. | Good visual fit; avoid generated text overlays. | Plan/commercial terms must be checked. | Strong, direct vendor. | P1 fallback/direct option. |
| Pika | Pika points API access to fal. Source: [Pika API](https://pika.art/api). | Medium; depends on model route. | Medium; review hands/utensils carefully. | API route currently through fal. | Depends on fal/model route. | Good for social video, less proven for strict product consistency. | Terms must be checked. | Medium, via aggregator. | P2 experiment. |
| Replicate | Yes; image-to-video collection and pricing pages list video models. Source: [Replicate image-to-video](https://replicate.com/collections/image-to-video) and [pricing](https://replicate.com/pricing). | Medium to high depending on selected model. | Varies by model; requires per-model QA. | Mature prediction API. | Mix of hardware-time and input/output pricing. | Good for experiments and model comparison. | Varies by hosted model/provider. | Strong for prototyping, model switching. | P1 fallback adapter. |
| fal | Yes; video model platform with image-to-video model endpoints and video pricing. Source: [fal video APIs](https://fal.ai/video), [pricing](https://fal.ai/pricing), and [Kling I2V API](https://fal.ai/models/fal-ai/kling-video/v1.6/pro/image-to-video/api). | High when using Kling-class models. | High candidate for hand/cooking motion. | Strong queue/subscribe API; server-side key guidance. | Output-based model pricing. | Good for short shopping clips. | Route/model terms must be checked. | Strong; one API can test multiple providers. | Recommended first adapter. |

## Provider Contract Requirements

The scaffold must keep these states explicit:

- `default_enabled=false`
- `configured=false` without API key presence
- `CLOUD_VIDEO_PROVIDER_NOT_CONFIGURED` when provider name/key are missing
- `CLOUD_VIDEO_PROVIDER_COST_APPROVAL_REQUIRED` when key exists but quota/cost
  approval is absent
- no live network call in tests
- mock-only clip generation for contract tests
- no secrets in `safeSummary`

## Router Priority

```text
cloud_image_to_video
comfyui_wan_i2v
animated_still
slideshow
```

`slideshow` remains a blocked final-upload fallback because motion-first Shorts
require real generated motion, hand/utensil interaction scenes, a product-rotate
scene, and public/unlisted upload blocking.

## Implementation Notes

- Do not add vendor SDKs until a provider is chosen.
- Do not add paid API keys to `.env.example` beyond placeholder names without a
  separate env review.
- Use server-side requests only for any future live adapter.
- Keep raw image/affiliate/asset URLs out of logs and reports.
- Persist generated media only under ignored `commerce-assets/` paths after a
  separate smoke approval.
