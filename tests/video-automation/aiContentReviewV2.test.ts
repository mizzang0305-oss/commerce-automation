import { describe, expect, it } from "vitest";
import { evaluateAiContentReview, reviewIntervalCoverage, type AiContentReviewInput } from "@/lib/video-automation/aiContentReviewV2";

const hash = "a".repeat(64);
const audioHash = "b".repeat(64);
const check = (basis: string) => ({ verdict: "pass" as const, evidenceIds: ["frame-0"], rationale: "Observed in bound evidence", basis });

function review(): AiContentReviewInput {
  return {
    schema: "ai-content-assessment/v2",
    identity: { productId: "coupang:product:1:item:2:vendor:3", videoSha256: hash, audioSha256: audioHash },
    expected: { productId: "coupang:product:1:item:2:vendor:3", videoSha256: hash, audioSha256: audioHash },
    reviewer: { kind: "ai", id: "independent-reviewer", model: "multimodal", version: "v2", runId: "review-run", generatorRunId: "generator-run" },
    evidenceIds: ["frame-0"], durationSeconds: 20, decodeComplete: true,
    visual: { method: "time_sampled_scene_review", analyzedIntervals: [[0, 20]], unresolvedIntervals: [], frameCount: 40, maxSampleGapSeconds: 0.5, sourceLineageReviewed: true },
    audio: { method: "native_audio_review", analyzedIntervals: [[0, 20]], unresolvedIntervals: [], asrFullPass: true },
    checks: { product: check("visual_evidence"), caption: check("visual_and_transcript"), script: check("original_script_and_asr"), spokenName: check("audio_evidence"), crossVideo: check("source_lineage_and_body_comparison") },
    comparedVideoIds: ["t4F3OHxGGeg"], requiredPriorVideoIds: ["t4F3OHxGGeg"], findings: [],
    rights: { status: "unverified", evidenceIds: [] }
  };
}

describe("AI content review V2 policy (not a publish authorization)", () => {
  it("permits an independent AI content assessment without claiming human playback", () => {
    const result = evaluateAiContentReview(review());
    expect(result).toMatchObject({
      auditStatus: "complete", contentVerdict: "pass", reviewerKind: "ai", reviewerType: "ai_multimodal",
      humanReviewClaimed: false, visualVerdict: "pass", asrVerdict: "pass", acousticVerdict: "pass",
      rightsVerdict: "unverified", crossVideoVerdict: "pass", publicationEligibility: false, platformUploadAllowed: false
    });
    expect(result.releaseBlockers).toContain("RIGHTS_UNVERIFIED");
  });

  it("does not use player events as semantic evidence", () => {
    const input = { ...review(), humanPlayback: { ended: true, wavEnded: true } };
    input.checks.product.verdict = "unverified";
    expect(evaluateAiContentReview(input).contentVerdict).toBe("indeterminate");
  });

  it("keeps ASR-only spoken names unresolved", () => {
    const input = review();
    input.audio.method = "asr_only";
    expect(evaluateAiContentReview(input)).toMatchObject({
      auditStatus: "incomplete", contentVerdict: "indeterminate", acousticVerdict: "not_tested", publicationEligibility: false
    });
  });

  it("does not convert a claimed spoken-name PASS based on ASR text into acoustic PASS", () => {
    const input = review();
    input.checks.spokenName.basis = "asr_transcript";
    expect(evaluateAiContentReview(input)).toMatchObject({
      auditStatus: "incomplete", acousticVerdict: "indeterminate", publicationEligibility: false
    });
  });

  it("retains unresolved visual and audio ranges in the assessment", () => {
    const input = review();
    input.visual.unresolvedIntervals = [[4, 7]];
    input.audio.unresolvedIntervals = [[12, 15]];
    expect(evaluateAiContentReview(input)).toMatchObject({
      unreviewedVisualRanges: [[4, 7]], unreviewedAudioRanges: [[12, 15]],
      visualVerdict: "indeterminate", acousticVerdict: "indeterminate", publicationEligibility: false
    });
  });

  it("does not allow decode alone or missing timeline coverage to pass", () => {
    const input = review();
    input.visual.analyzedIntervals = [];
    expect(evaluateAiContentReview(input).contentVerdict).toBe("indeterminate");
  });

  it("does not double count overlapping intervals", () => {
    expect(reviewIntervalCoverage([[0, 10], [0, 10]], 20)).toBe(0.5);
  });

  it("records an evidence-backed known visual failure even when analysis is incomplete", () => {
    const input = review();
    input.visual.analyzedIntervals = [[0, 8]];
    input.findings = [{ label: "WRONG_PRODUCT", start: 4, end: 8, evidenceIds: ["frame-0"], rationale: "Another product is visible" }];
    expect(evaluateAiContentReview(input)).toMatchObject({ auditStatus: "incomplete", contentVerdict: "fail" });
  });

  it("rejects changed media identity and self-review", () => {
    const changed = review();
    changed.expected.videoSha256 = "c".repeat(64);
    expect(evaluateAiContentReview(changed).auditStatus).toBe("invalid");
    const self = review();
    self.reviewer.runId = self.reviewer.generatorRunId;
    expect(evaluateAiContentReview(self).auditStatus).toBe("invalid");
  });

  it("rejects stale prior-publication coverage and missing evidence references", () => {
    const stale = review();
    stale.requiredPriorVideoIds.push("f9zPg0OEqG8");
    expect(evaluateAiContentReview(stale).contentVerdict).toBe("indeterminate");
    const missing = review();
    missing.checks.product.evidenceIds = ["missing"];
    expect(evaluateAiContentReview(missing).auditStatus).toBe("invalid");
  });

  it("does not conflate rights clearance with content analysis", () => {
    const input = review();
    input.rights.status = "verified";
    input.rights.evidenceIds = ["frame-0"];
    const result = evaluateAiContentReview(input);
    expect(result.contentVerdict).toBe("pass");
    expect(result.platformUploadAllowed).toBe(false);
  });
});
