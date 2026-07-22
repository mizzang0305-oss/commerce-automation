import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  V113_FORBIDDEN_MISMATCH_TERMS,
  V113_PRODUCT_REFERENCE,
  V113_REQUIRED_PINNED_COMMENT_CTA_ANCHORS,
  V113_REQUIRED_PRODUCT_ANCHORS,
  V113_SCRIPT_SEGMENTS,
  V113_TARGET_VOICE_DURATION_SECONDS,
  V113_VOICE_SPEED_MULTIPLIER,
  V113_VOICE_STYLE,
  V113_VOICEOVER_SCRIPT,
  calculateV113TranscriptSimilarity,
  findV113RecognizedAnchors,
  validateV113ProductMatchedScript
} from "../src/rendering/shorts/v113ProductMatchedScriptVoicePreview";

describe("V113 product-matched script and voice preview", () => {
  it("locks every script segment to the rear-seat multifunction organizer", () => {
    const result = validateV113ProductMatchedScript();
    expect(V113_PRODUCT_REFERENCE).toBe("CURRENT_REAR_SEAT_MULTIFUNCTION_ORGANIZER");
    expect(V113_SCRIPT_SEGMENTS).toHaveLength(6);
    expect(result.ready).toBe(true);
    expect(result.productMatched).toBe(true);
    expect(result.missingAnchors).toEqual([]);
    expect(result.forbiddenTermsFound).toEqual([]);
    expect(result.pinnedCommentCtaPresent).toBe(true);
    expect(result.pinnedCommentCreated).toBe(false);
    for (const anchor of V113_REQUIRED_PINNED_COMMENT_CTA_ANCHORS) {
      expect(V113_VOICEOVER_SCRIPT).toContain(anchor);
    }
    expect(V113_VOICE_STYLE).toBe("energetic_sales");
    expect(V113_VOICE_SPEED_MULTIPLIER).toBeGreaterThanOrEqual(1.14);
    expect(V113_TARGET_VOICE_DURATION_SECONDS).toBeLessThan(22);
    for (const anchor of V113_REQUIRED_PRODUCT_ANCHORS) {
      expect(V113_VOICEOVER_SCRIPT).toContain(anchor);
    }
  });

  it("blocks copy written for the old front-console organizer", () => {
    const oldProductCopy = `${V113_VOICEOVER_SCRIPT} 프론트콘솔과 기어봉 옆에 설치하세요`;
    const result = validateV113ProductMatchedScript(oldProductCopy);
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("BLOCKED_V113_PRODUCT_MISMATCH_COPY");
    expect(result.forbiddenTermsFound).toEqual(expect.arrayContaining(["프론트콘솔", "기어봉"]));
    expect(V113_FORBIDDEN_MISMATCH_TERMS).toContain("콘솔 틈새");
  });

  it("blocks a script that drops the pinned-comment link CTA", () => {
    const withoutCta = V113_VOICEOVER_SCRIPT.replace("제품 정보는 고정 댓글 링크에서 확인하세요", "제품 정보를 확인하세요");
    const result = validateV113ProductMatchedScript(withoutCta);
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("BLOCKED_V113_PINNED_COMMENT_CTA_MISSING");
    expect(result.missingPinnedCommentCtaAnchors).toEqual(["고정 댓글", "링크"]);
  });

  it("normalizes Korean ASR spacing while preserving product anchors", () => {
    const transcript = V113_VOICEOVER_SCRIPT
      .split("컵홀더").join("컵 홀더")
      .split("헤드레스트").join("헤드 레스트");
    expect(calculateV113TranscriptSimilarity(V113_VOICEOVER_SCRIPT, transcript)).toBe(1);
    expect(findV113RecognizedAnchors(transcript)).toHaveLength(V113_REQUIRED_PRODUCT_ANCHORS.length);
  });

  it("keeps the generator on local preview media and fail-closed side effects", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "scripts", "uploads", "generate-v113-product-matched-script-voice-preview.ts"),
      "utf8"
    );
    expect(source).toContain("preview-v112.mp4");
    expect(source).toContain("local_command_provider_ready");
    expect(source).toContain("videosInsertCalled: false");
    expect(source).toContain("commentThreadsInsertCalled: false");
    expect(source).not.toContain("upload:v084:private-pilot:execute");
    expect(source).not.toContain("videos.insert(");
    expect(source).not.toContain("commentThreads.insert(");

    const result = validateV113ProductMatchedScript();
    expect(result.voiceOwnerReviewRequired).toBe(true);
    expect(result.voiceStyle).toBe("energetic_sales");
    expect(result.voiceSpeedMultiplier).toBe(V113_VOICE_SPEED_MULTIPLIER);
    expect(result.targetVoiceDurationSeconds).toBe(V113_TARGET_VOICE_DURATION_SECONDS);
    expect(result.replacementUploadReady).toBe(false);
    expect(result.SAFE_TO_UPLOAD).toBe(false);
    expect(result.SAFE_TO_PUBLIC_UPLOAD).toBe(false);
  });
});
