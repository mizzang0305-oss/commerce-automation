import { describe, expect, test } from "vitest";
import {
  createDefaultSettings,
  createMockAutomationRepository,
  validateSettingsInput
} from "@/lib/repositories/mockAutomationRepository";

describe("automation settings", () => {
  test("uses safe defaults", () => {
    const settings = createDefaultSettings();

    expect(settings.daily_target_count).toBe(69);
    expect(settings.batch_size).toBe(3);
    expect(settings.interval_hours).toBe(1);
    expect(settings.run_mode).toBe("generate_only");
    expect(settings.is_paused).toBe(true);
    expect(settings.youtube_upload_enabled).toBe(false);
    expect(settings.approval_required).toBe(true);
    expect(settings.max_daily_uploads).toBe(6);
    expect(settings.category_exclude).toEqual([
      "의류",
      "신발",
      "건강식품",
      "화장품",
      "식품",
      "고가전자제품",
      "대형가구"
    ]);
  });

  test("validates settings before saving", () => {
    expect(validateSettingsInput({ daily_target_count: 0 }).ok).toBe(false);
    expect(validateSettingsInput({ batch_size: 11 }).ok).toBe(false);
    expect(validateSettingsInput({ interval_hours: 4 }).ok).toBe(false);
    expect(validateSettingsInput({ start_hour: -1 }).ok).toBe(false);
    expect(validateSettingsInput({ end_hour: 24 }).ok).toBe(false);
    expect(validateSettingsInput({ max_daily_uploads: 70 }).ok).toBe(false);
    expect(
      validateSettingsInput({
        daily_target_count: 30,
        batch_size: 3,
        interval_hours: 3,
        max_daily_uploads: 6
      }).ok
    ).toBe(true);
  });

  test("saves valid settings through repository", async () => {
    const repository = createMockAutomationRepository();

    const saved = await repository.updateSettings({
      interval_hours: 3,
      batch_size: 2,
      is_paused: false
    });

    expect(saved.interval_hours).toBe(3);
    expect(saved.batch_size).toBe(2);
    expect(saved.is_paused).toBe(false);
  });
});
