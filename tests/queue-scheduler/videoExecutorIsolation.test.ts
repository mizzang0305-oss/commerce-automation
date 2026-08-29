import { describe, expect, it } from "vitest";
import { validateCoupangAffiliateUrl } from "../../src/lib/affiliate-readiness";
import { bindPreparedItemsToManifestOrder, prepareQueueVideoItemsIndependently, type LocalQueueItem } from "../../src/lib/queue-scheduler";
import { rankedProducts } from "../daily-69-control/fixtures";

describe("queue video item preparation isolation", () => {
  it("binds a creative-ranked manifest back to queue items by exact product identity", () => {
    const prepared = [
      { queueId: "queue-a", productKey: "product-a" },
      { queueId: "queue-b", productKey: "product-b" },
      { queueId: "queue-c", productKey: "product-c" },
    ];
    const manifest = [
      { productKey: "product-b", finalVideo: "product-001/final/output.mp4" },
      { productKey: "product-a", finalVideo: "product-002/final/output.mp4" },
      { productKey: "product-c", finalVideo: "product-003/final/output.mp4" },
    ];

    expect(bindPreparedItemsToManifestOrder(prepared, manifest).map(({ binding, itemIndex }) => ({ queueId: binding.queueId, itemIndex }))).toEqual([
      { queueId: "queue-b", itemIndex: 0 },
      { queueId: "queue-a", itemIndex: 1 },
      { queueId: "queue-c", itemIndex: 2 },
    ]);
  });

  it("rejects duplicate, missing, or substituted manifest product identities", () => {
    const prepared = [{ productKey: "product-a" }, { productKey: "product-b" }];
    expect(() => bindPreparedItemsToManifestOrder(prepared, [{ productKey: "product-a" }, { productKey: "product-a" }])).toThrow("QUEUE_PRODUCT_BINDING_MISMATCH");
    expect(() => bindPreparedItemsToManifestOrder(prepared, [{ productKey: "product-a" }])).toThrow("QUEUE_PRODUCT_BINDING_MISMATCH");
    expect(() => bindPreparedItemsToManifestOrder(prepared, [{ productKey: "product-a" }, { productKey: "product-c" }])).toThrow("QUEUE_PRODUCT_BINDING_MISMATCH");
  });

  it.each([
    [[false, false, true], 1, 2],
    [[true, false, true], 2, 1],
    [[false, false, false], 0, 3],
    [[true, true, true], 3, 0]
  ])("isolates readiness failures for %j", async (readiness, expectedPrepared, expectedBlocked) => {
    const items = queueItems(readiness);
    const result = await prepareQueueVideoItemsIndependently({
      items,
      prepareItem: async (item) => {
        if (!validateCoupangAffiliateUrl(item.candidate.selectedAffiliateUrl).affiliateReady) {
          throw new Error("AFFILIATE_NOT_READY");
        }
        return { queueId: item.id, productKey: item.productKey };
      }
    });

    expect(result.prepared).toHaveLength(expectedPrepared);
    expect(result.failures).toHaveLength(expectedBlocked);
    expect(result.failures.every((failure) => failure.errorCode === "AFFILIATE_NOT_READY" && !failure.retryable)).toBe(true);
    expect(new Set([...result.prepared.map((entry) => entry.item.id), ...result.failures.map((failure) => failure.queueId)]).size).toBe(3);
    expect(result.prepared.every((entry) => entry.item.productKey === entry.value.productKey)).toBe(true);
  });
});

function queueItems(readiness: boolean[]): LocalQueueItem[] {
  return rankedProducts(readiness.length).map((entry, index) => ({
    id: `queue-${index}`,
    productKey: entry.candidate.productKey,
    candidate: {
      ...entry.candidate,
      selectedAffiliateUrl: readiness[index] ? entry.candidate.selectedAffiliateUrl : ""
    }
  } as LocalQueueItem));
}
