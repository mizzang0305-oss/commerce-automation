import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

const DOC_PATH = path.join(process.cwd(), "docs", "commerce", "v072_public_autopilot_target_spec.md");
const TASK_PATH = path.join(process.cwd(), "TASK.md");

describe("v072 public autopilot target spec", () => {
  test("defines the final upload package architecture without enabling uploads", async () => {
    const doc = await readFile(DOC_PATH, "utf8");

    expect(doc).toContain("COUPANG_AUTOPILOT_PUBLIC_UPLOAD_COMPLETE");
    expect(doc).toContain("UploadPackage");
    expect(doc).toContain("SAFE_TO_UPLOAD=false");
    expect(doc).toContain("Product source provenance");
    expect(doc).toContain("Coupang Deeplink API");
    expect(doc).toContain("YouTube public upload gate");
    expect(doc).toContain("Comment writer gate");
    expect(doc).toContain("Advanced settings gate");
    expect(doc).toContain("Scheduler gate");
    expect(doc).toContain("Dashboard control gate");
    expect(doc).toContain("Upload result store");
    expect(doc).toContain("manual affiliate URL emergency override");
  });

  test("documents fail-closed blockers for every mutation-critical dependency", async () => {
    const doc = await readFile(DOC_PATH, "utf8");

    expect(doc).toContain("BLOCKED_UPLOAD_PACKAGE_PRODUCT_SOURCE_MISSING");
    expect(doc).toContain("BLOCKED_DEEPLINK_AFFILIATE_URL_NOT_READY");
    expect(doc).toContain("BLOCKED_VIDEO_ASSET_NOT_READY");
    expect(doc).toContain("BLOCKED_FIRST_FRAME_NOT_READY");
    expect(doc).toContain("BLOCKED_DISCLOSURE_MISSING");
    expect(doc).toContain("BLOCKED_TARGET_CHANNEL_NOT_VERIFIED");
    expect(doc).toContain("BLOCKED_DUPLICATE_UPLOAD_RISK");
    expect(doc).toContain("BLOCKED_YOUTUBE_OAUTH_NOT_READY");
    expect(doc).toContain("BLOCKED_YOUTUBE_QUOTA_NOT_READY");
    expect(doc).toContain("BLOCKED_PUBLIC_UPLOAD_APPROVAL_MISSING");
  });

  test("keeps manual URL input out of the default path", async () => {
    const doc = await readFile(DOC_PATH, "utf8");
    const lowered = doc.toLowerCase();

    expect(lowered).toContain("manual affiliate url emergency override");
    expect(lowered).toContain("manual raw coupang url emergency override");
    expect(lowered).not.toMatch(/manual (affiliate|raw coupang) url.*default path/);
    expect(lowered).not.toMatch(/default path.*manual (affiliate|raw coupang) url/);
  });

  test("keeps TASK.md aligned with T002 and the no-upload safety state", async () => {
    const task = await readFile(TASK_PATH, "utf8");

    expect(task).toContain("### T002 - V072 Public Autopilot Target Spec");
    expect(task).toContain("Status: `PR_OPEN`");
    expect(task).toContain("`SAFE_TO_UPLOAD=false`");
    expect(task).toContain("No fresh approval, no real public upload.");
  });
});
