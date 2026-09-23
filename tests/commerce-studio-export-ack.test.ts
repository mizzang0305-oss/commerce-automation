import { describe, expect, it } from "vitest";
import { parseStudioExportAck } from "../src/lib/commerce-studio/bridge/exportAck";

describe("Commerce Studio exporter receipt", () => {
  it.each(["accepted", "duplicate"] as const)("accepts the canonical %s status", (status) => {
    expect(parseStudioExportAck({ status })).toBe(status);
  });

  it.each([undefined, null, {}, { status: { status: "accepted" } }, { status: "failed" }])(
    "does not advance the sequence for an invalid receipt", (receipt) => {
      expect(() => parseStudioExportAck(receipt)).toThrow("STUDIO_EXPORT_DELIVERY_NOT_ACKNOWLEDGED");
    }
  );
});
