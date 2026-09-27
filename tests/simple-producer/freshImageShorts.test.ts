import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { executeFreshImageShortsQueue } from "@/lib/simple-producer/freshImageShorts";

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
