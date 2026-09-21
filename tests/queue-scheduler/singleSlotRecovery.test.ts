import { describe, expect, it } from "vitest";
import { buildSupplementalSlotBinding } from "../../src/lib/queue-scheduler";
import type { LocalQueueItem } from "../../src/lib/queue-scheduler";

describe("supplemental logical slot recovery", () => {
  it("does not rewrite the historical queue and keeps initial/final product binding explicit", () => {
    const slot = { slotId: "slot-001", productKey: "product-a" } as LocalQueueItem;
    const historical = JSON.stringify([slot]);
    const binding = buildSupplementalSlotBinding({ slot, finalProductKey: "product-b", replacementReason: "PRODUCT_SPECIFIC_VOICE_HARD_FAILURE" });
    expect(JSON.stringify([slot])).toBe(historical);
    expect(binding).toMatchObject({ slotId: "slot-001", initialProductKey: "product-a", finalProductKey: "product-b", historicalQueueRewritten: false, SAFE_TO_UPLOAD: false });
  });
});
