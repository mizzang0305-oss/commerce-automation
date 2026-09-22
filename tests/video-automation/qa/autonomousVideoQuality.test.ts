import { describe, expect, it } from "vitest";
import { evaluateHookUsageLayout } from "../../../src/lib/video-automation/layoutCollision";
import { evaluateAutomatedVideoQuality } from "../../../src/lib/video-automation/qa/automatedVideoQuality";
import type { AutomatedReviewInput, CodexVisualReview, VisualQaMeasurements } from "../../../src/lib/video-automation/qa/types";

const visualPass: CodexVisualReview = {
  visualReviewExecuted: true, passed: true, reviewer: "codex_local_visual_inspection",
  inspectedPaths: ["first.jpg", "first3.jpg", "contact.jpg"],
  firstFrameNote: "후킹 문구가 첫 프레임 상단 안전영역에서 선명하게 보인다.",
  firstThreeSecondsNote: "0초부터 3초까지 확대 이동과 캡션 전환이 연속적으로 확인된다.",
  contactSheetNote: "전체 구간에서 실사용 장면이 화면을 채우며 반복 빈칸이 보이지 않는다."
};

function measurements(overrides: Partial<VisualQaMeasurements> = {}): VisualQaMeasurements {
  return {
    fileSize: 1000, durationSeconds: 18, width: 1080, height: 1920, frameRate: "30/1", videoCodec: "h264", audioCodec: "aac",
    videoStream: true, audioStream: true, firstFramePath: "first.jpg", firstThreeSecondsContactSheetPath: "first3.jpg", contactSheetPath: "contact.jpg",
    sampledFramePaths: ["first.jpg"], freezeRatio: 0.05, longestFreezeSeconds: 0.3, visualChangeRatio: 0.95, canvasFillRatio: 0.93,
    emptyCanvasRatio: 0.05, integratedLoudnessLufs: -16, truePeakDb: -1.6, longSilenceCount: 0, longestSilenceMs: 420, meanPauseMs: 230,
    qaOverheadSeconds: 4, ...overrides
  };
}

function input(overrides: Partial<AutomatedReviewInput> = {}): AutomatedReviewInput {
  return {
    productKey: "cable", attempt: "final", selectedHook: "케이블, 왜 3가지를 확인할까요?", hookFamily: "CHECKLIST", measurements: measurements(),
    asrPassed: true, alignedRatio: 1, layoutCollision: false, captionTimelinePassed: true, captionMaxWords: 4, captionFontPx: 66,
    captionAnimation: "pop", primaryVisualWidthRatio: 0.92, genericUsage: true, genericOverclaim: false, productIdentityBound: true,
    productAnchorCount: 3, hookFamilyUniqueInBatch: true, usageLabelFullOnce: true, usageLabelAbbreviatedAfterIntro: true,
    hookVisibleAtSeconds: 0, hookFontPx: 104, hookHighContrast: true, codexVisualReview: visualPass, ...overrides
  };
}

describe("autonomous video review v2", () => {
  it("keeps usage badge and hook in separate non-overlapping boxes", () => {
    expect(evaluateHookUsageLayout({ hook: "케이블, 왜 3가지를 확인할까요?", usageLabel: "연출된 사용 예시" })).toMatchObject({ passed: true, collision: false });
  });

  it("blocks a five-word POP_GROUP caption", () => {
    const review = evaluateAutomatedVideoQuality(input({ captionMaxWords: 5 }));
    expect(review.blockers).toContain("CAPTION_SAFE_TIMELINE_FAILED");
    expect(review.captionQaPassed).toBe(false);
  });

  it("blocks slideshow freeze ratio and long visual beats", () => {
    const review = evaluateAutomatedVideoQuality(input({ measurements: measurements({ freezeRatio: 0.62, longestFreezeSeconds: 2.2 }) }));
    expect(review.blockers).toEqual(expect.arrayContaining(["SLIDESHOW_FREEZE_RATIO_HIGH", "VISUAL_BEAT_TOO_LONG"]));
    expect(review.action).toBe("REPAIR");
  });

  it("fails occupancy QA for a small primary image", () => {
    const review = evaluateAutomatedVideoQuality(input({ primaryVisualWidthRatio: 0.62, measurements: measurements({ canvasFillRatio: 0.62, emptyCanvasRatio: 0.38 }) }));
    expect(review.signals).toEqual(expect.arrayContaining(["PRIMARY_VISUAL_TOO_SMALL", "EMPTY_CANVAS_EXCESSIVE"]));
    expect(review.machineQaPassed).toBe(false);
  });

  it("fails creative QA for repeated hook family", () => {
    const review = evaluateAutomatedVideoQuality(input({ hookFamilyUniqueInBatch: false }));
    expect(review.signals).toContain("HOOK_TEMPLATE_REPETITION");
    expect(review.creativeQaPassed).toBe(false);
    expect(review.machineQaPassed).toBe(false);
  });

  it("penalizes a long TTS silence without changing the provider", () => {
    const review = evaluateAutomatedVideoQuality(input({ measurements: measurements({ longSilenceCount: 2, longestSilenceMs: 1050, meanPauseMs: 780 }) }));
    expect(review.signals).toContain("LONG_TTS_SILENCE");
    expect(review.audioQaPassed).toBe(false);
  });

  it("does not convert technical PASS into AUTO_QA_PASS when visual review fails", () => {
    const review = evaluateAutomatedVideoQuality(input({ codexVisualReview: { ...visualPass, passed: false } }));
    expect(review.technicalQaPassed).toBe(true);
    expect(review.automatedVisualQaPassed).toBe(false);
    expect(review.finalAutomatedQaPassed).toBe(false);
    expect(review.humanOwnerReviewStatus).toBe("not_requested");
    expect(review.publishReady).toBe(false);
  });
});
