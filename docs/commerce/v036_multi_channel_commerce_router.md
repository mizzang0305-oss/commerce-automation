# v036 Multi-Channel Commerce Router

v036 adds a dry-run commerce routing layer for three YouTube Shorts channel concepts:

- `father_jobs`: practical dad/work/vehicle/tool utility products.
- `neoman_moleulgeol`: everyday life-hack and mistake-prevention products.
- `lets_buy`: value, comparison, and deal-check products.

The router does not upload, mutate YouTube videos, create comments, write DB rows, upload to R2, or write `product_assets`.

## Engines

1. `ChannelProfileRegistry`
2. `CommerceProductRouter`
3. `HookAndScriptGenerator`
4. `AffiliateProviderRouter`
5. `ChannelUploadPlanPreview`

## Safety Model

- Product links belong in comments, not the description.
- Descriptions point viewers to the comment product link.
- Comment previews include Coupang Partners disclosure.
- Reports and preview artifacts use masked affiliate URLs only.
- Non-Coupang provider adapters are modeled but inactive.
- Generated copy blocks fake usage claims, guaranteed-result claims, medical claims, placeholders, example URLs, and mojibake.
- Cross-channel reuse is blocked: the same product must receive channel-specific hook, script, title, scene prompts, and comment first line.

## Preview Artifacts

The local generator writes untracked preview files under:

```text
commerce-assets/review/v036/
```

Expected files:

- `multi-channel-commerce-plan.json`
- `channel-routing-preview.html`
- `channel-hook-preview.json`
- `channel-comment-preview.json`
- `affiliate-provider-routing-preview.json`
- `safety-risk-report.json`

These files are local review artifacts and must not be committed.
