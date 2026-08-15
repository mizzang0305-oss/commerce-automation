import { describe, expect, it } from "vitest";
import { validateCoupangAffiliateUrl } from "../../src/lib/affiliate-readiness";
import { prepareQueueVideoItemsIndependently, type LocalQueueItem } from "../../src/lib/queue-scheduler";
import { rankedProducts } from "../daily-69-control/fixtures";

describe("queue video item preparation isolation", () => {
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
