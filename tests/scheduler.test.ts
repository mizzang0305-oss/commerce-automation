import { describe, expect, test } from "vitest";
import { createDefaultSettings } from "@/lib/repositories/mockAutomationRepository";
import {
  calculateUploadSlots,
  getDailyCapacity,
  getDailyCapacityWarning,
  getNextRunAt
} from "@/lib/scheduler";

describe("scheduler calculations", () => {
  test("creates 23 slots for 69 items with batch size 3 and hourly interval", () => {
    const settings = createDefaultSettings();

    expect(calculateUploadSlots(settings)).toHaveLength(23);
    expect(getDailyCapacity(settings)).toBe(69);
  });

  test("warns when interval 3 cannot process all 69 daily items", () => {
    const settings = createDefaultSettings({ interval_hours: 3 });

    expect(calculateUploadSlots(settings)).toHaveLength(8);
    expect(getDailyCapacity(settings)).toBe(24);
    expect(getDailyCapacityWarning(settings)).toBe(
      "현재 설정으로는 하루 69개를 모두 처리할 수 없습니다. 처리 가능량: 24개"
    );
  });

  test("calculates the next run inside the configured window", () => {
    const settings = createDefaultSettings({ interval_hours: 3 });
    const nextRun = getNextRunAt(settings, new Date(2026, 4, 10, 2, 5, 0));

    expect(nextRun.getHours()).toBe(4);
    expect(nextRun.getMinutes()).toBe(0);
  });
});
