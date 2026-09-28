import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { executeFreshImageShortsQueue } from "@/lib/simple-producer/freshImageShorts";
import { normalizeLiveProduct } from "@/lib/live-product-video/normalizer";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

it("holds an invalid candidate and then a candidate with fewer than three images", async () => {
  const root = await mkdtemp(join(tmpdir(), "fresh-shorts-test-"));
  roots.push(root);
  const sourcePath = join(root, "source.json");
  const queuePath = join(root, "queue.json");
  await writeFile(sourcePath, JSON.stringify({
    productKey: "coupang:product:111:item:222:vendor:333",
    canonicalProductName: "COVERONE 차량용 수납함",
    rawProductUrl: "https://www.coupang.com/vp/products/111?itemId=222&vendorItemId=333",
    selectedAffiliateUrl: "https://link.coupang.com/re/ABC?pageKey=111&itemId=222&vendorItemId=333"
  }));
  await writeFile(queuePath, JSON.stringify({ schema: "fresh-product-image-shorts-queue/v1", items: [
    { sourcePath: join(root, "missing.json"), imageUrls: [], displayName: "COVERONE 차량용 수납함", useCase: "vehicle_organization" },
    { sourcePath, imageUrls: ["https://thumbnail.coupangcdn.com/one.png"], displayName: "COVERONE 차량용 수납함", useCase: "vehicle_organization" }
  ] }));
  const result = await executeFreshImageShortsQueue({ cwd: process.cwd(), env: {}, queuePath, runId: "test", outputRoot: root, excludedProductIds: [] });
  expect(result.ok).toBe(false);
  expect(result.safeError).toBe("INSUFFICIENT_PRODUCT_IMAGES");
  const summary = JSON.parse(await readFile(join(root, "fresh-image-shorts", "test", "selection-summary.json"), "utf8"));
  expect(summary.holds.map((hold: { reason: string }) => hold.reason)).toEqual(["FRESH_PRODUCT_FAILED", "INSUFFICIENT_PRODUCT_IMAGES"]);
});

it("refills an exhausted queue from Scout and holds an image-poor product without a manual URL", async () => {
  const root = await mkdtemp(join(tmpdir(), "fresh-shorts-refill-test-"));
  roots.push(root);
  const queuePath = join(root, "queue.json");
  await writeFile(queuePath, JSON.stringify({ schema: "fresh-product-image-shorts-queue/v1", items: [] }));
  const product = normalizeLiveProduct({ rawProductId: "111", rawProductName: "차량용 정리 수납함",
    category: "자동차용품", categoryPath: "자동차용품", priceText: "10000",
    rawProductUrl: "https://www.coupang.com/vp/products/111?itemId=222&vendorItemId=333",
    selectedAffiliateUrl: "https://link.coupang.com/re/ABC?pageKey=111&itemId=222&vendorItemId=333",
    productImageUrls: ["https://thumbnail.coupangcdn.com/only.jpg"],
    sourceProvider: "coupang_partners_product_search", sourceRequestId: "test", discoveredAt: "2026-09-28T00:00:00.000Z",
    sourceKeyword: "차량용 정리함", eventContext: { eventId: "test", eventName: "test" } });
  const result = await executeFreshImageShortsQueue({ cwd: process.cwd(), env: {}, queuePath, runId: "test", outputRoot: root,
    excludedProductIds: [], autoScout: async () => ({ candidates: [product], searchCalls: 1, rawProductsFound: 1 }),
    fetchImpl: async () => new Response("Forbidden", { status: 403 }) });
  expect(result).toMatchObject({ ok: false, safeError: "INSUFFICIENT_PRODUCT_IMAGES", searchCalls: 1, rawProductsFound: 1 });
  const summary = JSON.parse(await readFile(join(root, "fresh-image-shorts", "test", "selection-summary.json"), "utf8"));
  expect(summary.holds).toEqual([{ productId: product.productKey, reason: "INSUFFICIENT_PRODUCT_IMAGES" }]);
});

it("skips an already queued product and passes its identity to automatic Scout exclusion", async () => {
  const root = await mkdtemp(join(tmpdir(), "fresh-shorts-exclude-test-"));
  roots.push(root);
  const productId = "coupang:product:111:item:222:vendor:333";
  const sourcePath = join(root, "source.json");
  const queuePath = join(root, "queue.json");
  await writeFile(sourcePath, JSON.stringify({ productKey: productId }));
  await writeFile(queuePath, JSON.stringify({ schema: "fresh-product-image-shorts-queue/v1", items: [
    { sourcePath, imageUrls: [], displayName: "차량용 정리 수납함", useCase: "vehicle_organization" }
  ] }));
  let excluded: string[] = [];
  const result = await executeFreshImageShortsQueue({ cwd: process.cwd(), env: {}, queuePath, runId: "test", outputRoot: root,
    excludedProductIds: [productId], autoScout: async (input) => {
      excluded = input.excludedProductIds;
      return { candidates: [], searchCalls: 0, rawProductsFound: 0 };
    } });
  expect(result).toMatchObject({ ok: false, safeError: "FRESH_QUEUE_EMPTY" });
  expect(excluded).toContain(productId);
});
