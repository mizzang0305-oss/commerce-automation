import { describe, expect, test } from "vitest";
import { parseSimpleProducerConfig } from "@/lib/simple-producer/config";

const valid = {
  schema: "simple-producer/v1",
  enabled: true,
  dailyGenerateTarget: 3,
  maxItemsPerRun: 1,
  generationSlots: ["09:00", "15:00", "21:00"],
  timeZone: "Asia/Seoul",
  evidenceRoot: "D:\\secure\\simple-producer-evidence"
} as const;

describe("simple producer configuration", () => {
  test("accepts the bounded three-slot operational configuration", () => {
    expect(parseSimpleProducerConfig(valid, "D:\\repo\\commerce-automation")).toMatchObject({
      enabled: true,
      dailyGenerateTarget: 3,
      maxItemsPerRun: 1,
      generationSlots: ["09:00", "15:00", "21:00"],
      timeZone: "Asia/Seoul"
    });
  });

  test.each([
    ["unbounded items", { maxItemsPerRun: 2 }, "SIMPLE_PRODUCER_MAX_ITEMS_PER_RUN_INVALID"],
    ["out of order slots", { generationSlots: ["15:00", "09:00", "21:00"] }, "SIMPLE_PRODUCER_SLOTS_INVALID"],
    ["late backfill slot", { generationSlots: ["09:00", "15:00", "22:00"] }, "SIMPLE_PRODUCER_SLOTS_INVALID"],
    ["repository evidence", { evidenceRoot: "D:\\repo\\commerce-automation\\data\\producer" }, "SIMPLE_PRODUCER_EVIDENCE_ROOT_INSIDE_REPOSITORY"]
  ])("rejects %s", (_label, patch, safeError) => {
    expect(() => parseSimpleProducerConfig({ ...valid, ...patch }, "D:\\repo\\commerce-automation")).toThrow(safeError);
  });
});
