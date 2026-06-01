import { describe, expect, test } from "vitest";
import { formatDateTime } from "@/lib/format";

describe("format helpers", () => {
  test("formats date time with stable KST 24-hour output", () => {
    expect(formatDateTime("2026-06-01T16:00:00.000Z")).toBe("06. 02. 01:00");
  });
});
