# V088 Coupang Product Source Resolver

## Purpose

V088 resolves the `father_jobs` v057 local product source without asking the operator
to paste manual URLs. It uses the existing Coupang Partners signed search request and
Deeplink client to bind:

- `rawCoupangUrl`
- `selectedAffiliateUrl`

into the protected local manifest:

```text
commerce-assets/review/v057/father_jobs/product-source-v057.local.json
```

The manifest is local operator evidence and must not be committed.

## Channel Binding Guard

V088 is scoped to `father_jobs` only. Before any Coupang API call or local
manifest write, the resolver verifies:

- selected channel is `father_jobs`
- manifest `channelKey` is `father_jobs`
- manifest `targetChannelKey` is `father_jobs`

If either manifest channel field is missing or points to another channel, the
resolver fails closed and does not write URL evidence.

Sanitized report proof:

- `manifestChannelMatchesSelected`
- `manifestTargetChannelMatchesSelected`
- `localManifestWriteAllowed`
- `rawManifestPathPrinted=false`

## Scope

This is a no-upload resolver. It does not call YouTube APIs and does not invoke the
V084 private upload execution path.

Blocked surfaces:

- YouTube `videos.insert`
- YouTube `commentThreads.insert`
- public or unlisted upload
- visibility mutation
- comment automation
- scheduler execution
- R2, DB, or `product_assets` writes
- n8n webhook calls

## Inputs

The resolver reads:

- `COUPANG_PARTNERS_PROVIDER_ENABLED`
- `COUPANG_ACCESS_KEY` or `COUPANG_PARTNERS_ACCESS_KEY`
- `COUPANG_SECRET_KEY` or `COUPANG_PARTNERS_SECRET_KEY`
- `COUPANG_PARTNER_ID`, `COUPANG_CUSTOMER_ID`, or `COUPANG_PARTNERS_CUSTOMER_ID`
- `V088_PRODUCT_SOURCE_MANIFEST_PATH` when an operator needs to point at a protected local manifest

The product query comes from the manifest `productName`; it is not invented by the
resolver.

## Reporting

Reports are sanitized. They include booleans and hash prefixes only. They must not
print:

- raw Coupang URLs
- raw affiliate URLs
- full local file paths
- full YouTube video IDs
- full channel IDs
- access keys, secret keys, Authorization headers, HMAC signatures, tokens, or client secrets

## Command

```powershell
npm run upload:v088:resolve-coupang-product-source --silent
```

After a successful V088 bind, run the existing no-upload binders:

```powershell
npm run upload:v087:bind-product-source --silent
npm run upload:v085:private-pilot:bind-inputs --silent
```

The next state is still blocked for fresh private pilot approval. `SAFE_TO_UPLOAD`
and `SAFE_TO_PUBLIC_UPLOAD` remain `false`.
