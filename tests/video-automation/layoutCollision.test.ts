import { describe, expect, test } from "vitest";
import { buildLocalQaStatus, evaluateHookUsageLayout, VIDEO_LAYOUT } from "@/lib/video-automation/layoutCollision";

describe("hook and usage badge layout collision gate", () => {
  test("passes the fixed layout with the configured minimum gap", () => {
    const result = evaluateHookUsageLayout({ hook: "컵홀더 정리 조건 확인", usageLabel: "연출된 사용 예시" });
    expect(result).toMatchObject({ passed: true, collision: false, actualGapPx: VIDEO_LAYOUT.HOOK_USAGE_MIN_GAP_PX });
  });

  test("blocks the previous defective overlap even when every other QA signal passes", () => {
    const layout = evaluateHookUsageLayout({ hook: "컵홀더 정리 조건 확인", usageLabel: "연출된 사용 예시", usageBadgeBox: { x: 250, y: 288, width: 360, height: 62 } });
    const qa = buildLocalQaStatus({ technicalQaPassed: true, captionQaPassed: true, layoutQaPassed: layout.passed, visualEvidencePassed: true });
    expect(layout.blockers).toContain("VIDEO_LAYOUT_HOOK_USAGE_COLLISION");
    expect(qa).toMatchObject({ layoutQaPassed: false, ownerReviewStatus: "pending", publishQualityPassed: false });
  });

  test.each(["짧은 훅", "케이블 정리 조건 확인", "123456789012123456789012"])("keeps supported hook lengths separate: %s", (hook) => {
    expect(evaluateHookUsageLayout({ hook, usageLabel: "연출된 사용 예시" }).passed).toBe(true);
  });

  test("fails closed for clipped hooks and over-wide usage labels", () => {
    expect(evaluateHookUsageLayout({ hook: "1234567890121234567890125", usageLabel: "연출된 사용 예시" }).blockers).toContain("VIDEO_LAYOUT_HOOK_CLIPPED");
    expect(evaluateHookUsageLayout({ hook: "정상 훅", usageLabel: "아주 긴 연출된 사용 예시 안내 문구" }).blockers).toContain("VIDEO_LAYOUT_USAGE_BADGE_TOO_WIDE");
  });
});
