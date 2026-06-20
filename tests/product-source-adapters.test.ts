import { describe, expect, test } from "vitest";

import { createAmazonCreatorsProductSourceAdapterStub } from "@/lib/commerce/adapters/amazonCreatorsProductSourceAdapter.stub";
import { createCoupangProductSourceAdapter } from "@/lib/commerce/adapters/coupangProductSourceAdapter";
import { createMedusaProductSourceAdapterStub } from "@/lib/commerce/adapters/medusaProductSourceAdapter.stub";
import { createSaleorProductSourceAdapterStub } from "@/lib/commerce/adapters/saleorProductSourceAdapter.stub";
import { createShopifyProductSourceAdapterStub } from "@/lib/commerce/adapters/shopifyProductSourceAdapter.stub";
import { createSpreeProductSourceAdapterStub } from "@/lib/commerce/adapters/spreeProductSourceAdapter.stub";
import { createWooCommerceProductSourceAdapterStub } from "@/lib/commerce/adapters/woocommerceProductSourceAdapter.stub";
import type { ProductCandidateLike, ProductSourceAdapter } from "@/lib/commerce/productSourceAdapterTypes";

describe("product source adapter scaffold", () => {
  test("Coupang adapter maps current product-like data to safe refs", () => {
    const adapter = createCoupangProductSourceAdapter();

    const mapped = adapter.mapCandidate({
      source: "coupang",
      sourceProductId: "candidate-001",
      title: "Bilibin stainless cooking tools",
      rawProductUrl: "redacted-affiliate-ref",
      rawMediaUrls: ["redacted-media-ref"],
      metadata: { token: "must-not-leak" }
    });

    expect(mapped).toMatchObject({
      source: "coupang",
      sourceProductId: "candidate-001",
      title: "Bilibin stainless cooking tools",
      safeProductUrlRef: {
        source: "coupang",
        safeRef: "safe:coupang:product:candidate-001"
      }
    });
    expect(adapter.listMedia(mapped)).toEqual([
      {
        source: "coupang",
        mediaType: "image",
        safeRef: "safe:coupang:media:candidate-001:0",
        alt: "Bilibin stainless cooking tools"
      }
    ]);
    expect(JSON.stringify(mapped)).not.toContain("redacted-affiliate-ref");
    expect(JSON.stringify(mapped)).not.toContain("redacted-media-ref");
    expect(JSON.stringify(mapped)).not.toContain("must-not-leak");
  });

  test("non-Coupang adapters are stub-only and expose no secrets or raw URLs", () => {
    const stubs: ProductSourceAdapter[] = [
      createShopifyProductSourceAdapterStub(),
      createAmazonCreatorsProductSourceAdapterStub(),
      createMedusaProductSourceAdapterStub(),
      createSpreeProductSourceAdapterStub(),
      createSaleorProductSourceAdapterStub(),
      createWooCommerceProductSourceAdapterStub()
    ];
    const candidate: ProductCandidateLike = {
      source: "shopify",
      sourceProductId: "source-001",
      title: "Stub product",
      safeProductUrlRef: { source: "shopify", safeRef: "safe:shopify:product:source-001" },
      media: []
    };

    for (const adapter of stubs) {
      const descriptor = adapter.describe();

      expect(descriptor).toMatchObject({
        source: adapter.source,
        configured: false,
        apiCallsEnabled: false,
        secretsRequired: []
      });
      expect(adapter.listMedia(candidate)).toEqual([]);
      expect(JSON.stringify(descriptor)).not.toMatch(/secret_value|access_token|client_secret|https?:\/\//i);
    }
  });
});
