import { describe, expect, test } from "vitest";
import { normalizeTableFilter, tablePageSizeOptions } from "@/lib/tableUtils";

describe("table utils", () => {
  test("prepares defaults for future TanStack Table screens", () => {
    expect(tablePageSizeOptions).toEqual([10, 25, 50, 100]);
    expect(normalizeTableFilter("  Worker JOB  ")).toBe("worker job");
  });
});
