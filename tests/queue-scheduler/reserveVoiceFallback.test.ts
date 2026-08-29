import { describe, expect, it } from "vitest";
import { isProductFallbackCode, selectCompatibleRecoveryReserve } from "../../src/lib/queue-scheduler";
import type { LocalQueueItem, ReserveCandidate } from "../../src/lib/queue-scheduler";

describe("reserve voice fallback", () => {
  it("allows product-specific voice failure but blocks environment failure", () => {
    expect(isProductFallbackCode("PRODUCT_SPECIFIC_VOICE_HARD_FAILURE")).toBe(true);
    expect(isProductFallbackCode("TTS_NORMALIZATION_IDENTITY_GUARD_FAILED")).toBe(true);
    expect(isProductFallbackCode("TTS_COMMAND_NOT_READY")).toBe(false);
    expect(isProductFallbackCode("FFMPEG_NOT_READY")).toBe(false);
  });
  it("selects only the highest-scoring unclaimed compatible reserve", () => {
    const slot = { productKey: "a", candidate: { useCase: "vehicle_organization" }, candidateHistory: [{ productKey: "a" }] } as LocalQueueItem;
    const reserve = [candidate("desk", "desk_organization", 99), candidate("low", "vehicle_organization", 80), candidate("high", "vehicle_organization", 95)] as ReserveCandidate[];
    expect(selectCompatibleRecoveryReserve({ slot, reserve, queue: [slot] })?.candidate.productKey).toBe("high");
  });
});

function candidate(productKey: string, useCase: string, score: number) { return { candidate: { productKey, useCase }, score: { eligible: true, finalProductScore: score }, claimedBySlot: "" }; }
