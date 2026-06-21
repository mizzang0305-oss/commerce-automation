# Shopping Source Adapter Research

Scope: product-source adapter contracts for commerce video planning. This
research does not call Shopify Storefront API, Amazon Creators API, Amazon
Product Advertising API, Medusa, Spree, Saleor, WooCommerce, or any other
commerce API.

## Adapter Contract

The local scaffold uses these source names:

```text
ProductSource = "coupang" | "shopify" | "amazon_creators" | "medusa" | "spree" | "saleor" | "woocommerce"
```

Adapters return only safe product refs and media refs. Raw product URLs, raw
affiliate URLs, raw image URLs, tokens, cookies, and API keys must not be stored
in the mapped candidate object.

## Source Findings

| Source | API surface | Current adapter decision |
| --- | --- | --- |
| Coupang | Existing local candidate data already exists in this repo | Thin safe-ref mapper only |
| Shopify Storefront API | GraphQL API for storefront product/catalog reads. Source: https://shopify.dev/docs/api/storefront/latest | Stub only until token and shop policy are approved |
| Amazon Creators API | Current affiliate/creator API target. Source: https://affiliate-program.amazon.com/creatorsapi/docs/ | Stub only |
| Amazon Product Advertising API | Documentation indicates migration pressure toward newer Creators API docs. Source: https://webservices.amazon.com/paapi5/documentation/ | Do not build new adapter first |
| Medusa | Open-source commerce platform. Source: https://github.com/medusajs/medusa | Stub only |
| Spree | Open-source commerce platform with API/SDK surface. Source: https://github.com/spree/spree | Stub only |
| Saleor | Open-source GraphQL commerce platform. Source: https://github.com/saleor/saleor | Stub only |
| WooCommerce | REST API for WordPress commerce stores. Source: https://developer.woocommerce.com/docs/apis/rest-api/ | Stub only |

## Adapter Safety Rules

- No adapter should make a network call from this scaffold.
- No adapter should require or print secrets.
- Product and media data should be represented as `SafeProductUrlRef`,
  `ProductMediaLike`, and `ProductCandidateLike`.
- Raw URLs can be read by future server-only adapters, but should not appear in
  motion manifests, review memory, PR logs, or client payloads.

## Next Implementation Order

1. Keep Coupang as the only configured local mapper.
2. Design a Shopify Storefront API server-only adapter after token storage,
   shop-domain allowlisting, and rate-limit behavior are approved.
3. Evaluate Amazon Creators API separately from legacy Product Advertising API.
4. Keep Medusa, Spree, Saleor, and WooCommerce as safe no-call stubs until a
   concrete store integration is requested.
