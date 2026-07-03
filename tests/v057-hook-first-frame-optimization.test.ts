import fs from "node:fs";

import { describe, expect, test } from "vitest";

import packageJson from "../package.json";
import { CHANNEL_KEYS } from "../src/uploads/multi-channel/channelProfiles";
import { V048_CHANNEL_SPECS } from "../src/uploads/multi-channel/channelSpecificScriptFactory";
import {
  buildV057CommentPreview,
  buildV057FirstFrameClickabilitySummary,
  buildV057MetadataPreview,
  buildV057UploadSettingsPreview,
  buildV057ValidationReport,
  getV057HookOverlayPlan,
  validateV057ChannelPlan
} from "../src/rendering/shorts/v057HookFirstFrameOptimization";

describe("v057 hook overlay and first-frame optimization", () => {
  test("defines larger short hooks with high contrast and thumbnail-safe placement", () => {
    for (const channelKey of CHANNEL_KEYS) {
      const plan = getV057HookOverlayPlan(channelKey);

      expect(plan).toMatchObject({
        version: "v057",
        channel_key: channelKey,
        max_lines: 2,
        placement: "upper_center",
        safe_area: "upper_or_center_20_percent",
        high_contrast_box: true,
        bold: true,
        product_context_preserved: true,
        fake_claims_absent: true
      });
      expect(plan.font_px).toBeGreaterThanOrEqual(100);
      expect(plan.box_opacity).toBeGreaterThanOrEqual(0.78);
      expect(plan.hook_lines.join(" ").length).toBeLessThanOrEqual(18);
      expect(plan.hook_lines.filter(Boolean).length).toBeLessThanOrEqual(2);
    }
  });

  test("keeps channel product and script binding separated", () => {
    for (const channelKey of CHANNEL_KEYS) {
      const plan = getV057HookOverlayPlan(channelKey);
      const spec = V048_CHANNEL_SPECS.find((item) => item.channel_key === channelKey);
      expect(spec).toBeTruthy();
      expect(plan.product_name).toBe(spec?.product_name);
      for (const forbidden of spec?.forbidden_keywords ?? []) {
        expect(plan.hook_lines.join(" ")).not.toContain(forbidden);
      }
    }
  });

  test("rejects fake claims and preserves disclosure/upload settings previews", () => {
    for (const channelKey of CHANNEL_KEYS) {
      const validation = validateV057ChannelPlan(channelKey);
      const metadata = buildV057MetadataPreview(channelKey);
      const comment = buildV057CommentPreview(channelKey);
      const settings = buildV057UploadSettingsPreview(channelKey);

      expect(validation).toMatchObject({
        hook_text_large_pass: true,
        hook_text_contrast_pass: true,
        first_frame_clickability_pass: true,
        channel_binding_pass: true,
        no_fake_claims_pass: true,
        no_mojibake_pass: true,
        disclosure_preview_pass: true,
        upload_settings_preview_present: true,
        no_upload_side_effects: true,
        blocker: null
      });
      expect(metadata.status.containsSyntheticMedia).toBe(true);
      expect(metadata.paidProductPlacementDetails.hasPaidProductPlacement).toBe(true);
      expect(metadata.description_preview).toContain("쿠팡 파트너스");
      expect(comment.comment_text_has_affiliate_url).toBe(true);
      expect(comment.comment_text_has_coupang_disclosure).toBe(true);
      expect(comment.raw_url_printed).toBe(false);
      expect(JSON.stringify(comment)).not.toMatch(/https?:\/\//i);
      expect(settings.containsSyntheticMedia).toBe(true);
      expect(settings.paidProductPlacementDetails.hasPaidProductPlacement).toBe(true);
      expect(settings.safe_to_upload).toBe(false);
    }
  });

  test("builds a consolidated no-upload validation report", () => {
    const report = buildV057ValidationReport();

    expect(report).toMatchObject({
      version: "v057",
      FINAL_STATUS: "SUCCESS_V057_HOOK_AND_FIRST_FRAME_PREVIEW_READY_NO_UPLOAD",
      hook_text_large_pass: true,
      hook_text_contrast_pass: true,
      first_frame_clickability_pass: true,
      channel_binding_pass: true,
      no_fake_claims_pass: true,
      no_mojibake_pass: true,
      disclosure_preview_pass: true,
      upload_settings_preview_present: true,
      no_upload_side_effects: true,
      SAFE_TO_UPLOAD: false
    });
    expect(report.channels).toHaveLength(3);
  });

  test("first-frame clickability summaries require the three owner-review signals", () => {
    for (const channelKey of CHANNEL_KEYS) {
      expect(buildV057FirstFrameClickabilitySummary(channelKey)).toMatchObject({
        problem_or_benefit_visible: true,
        product_or_context_visible: true,
        large_hook_visible: true,
        thumbnail_safe_text: true,
        first_frame_clickability_pass: true
      });
    }
  });

  test("package script exposes review:v057 and generator avoids YouTube mutation APIs", () => {
    expect(packageJson.scripts["review:v057"]).toBe("tsx scripts/uploads/generate-v057-hook-first-frame-preview.ts");
    const script = fs.readFileSync("scripts/uploads/generate-v057-hook-first-frame-preview.ts", "utf8");
    expect(script).not.toContain("videos.insert");
    expect(script).not.toContain("commentThreads.insert");
    expect(script).not.toContain("comments.insert");
    expect(script).not.toContain("privacyStatus: \"private\"");
    expect(script).not.toContain("privacyStatus: \"unlisted\"");
  });
});
