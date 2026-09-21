import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { recoverKoreanTtsAfterAsrFailure, type SafeTtsResult } from "../../src/lib/video-automation/ttsRecovery";

describe("ASR segmented TTS recovery", () => {
  it("re-synthesizes identity-safe semantic segments with unchanged ASR thresholds", async () => {
    const synthesize = vi.fn(async ({ text, target, attempt, segmentIndex }: { text: string; target: string; attempt: number; segmentIndex: number | null }): Promise<SafeTtsResult> => ({
      status: "success",
      safeCode: "TTS_SUCCESS",
      stage: "complete",
      attempt,
      inputHash: createHash("sha256").update(text).digest("hex"),
      inputCharacters: [...text].length,
      segmentIndex,
      outputCreated: true,
      retryable: false,
      output: target,
      validation: { passed: true },
    }));
    const concatenate = vi.fn(async ({ target, pauseMs }: { target: string; pauseMs: number }) => ({ status: "success", output: target, validation: { passed: true, pauseMs } }));
    const narration = "상품명은 SONGMICS / 튼튼한 접이식 빨래건조대입니다. 빨래 정리 기준을 확인하세요. 건조 공간과 접이식 조건을 비교하세요.";
    const result = await recoverKoreanTtsAfterAsrFailure({
      narration,
      canonicalProductName: "SONGMICS 튼튼한 접이식 빨래건조대",
      anchors: ["빨래", "건조", "공간", "접이식"],
      voiceRoot: "voice",
      dependencies: { synthesize, concatenate },
    });
    expect(result.rootCauseCode).toBe("ASR_FAILED_INITIAL_ATTEMPT");
    expect(result.recoveryType).toBe("segmented_synthesis");
    expect(result.identity.passed).toBe(true);
    expect(result.segments.length).toBeGreaterThan(1);
    expect(result.spokenNarration).not.toContain("SONGMICS");
    expect(result.spokenNarration).not.toContain("또는");
    expect(result.spokenNarration).toContain("튼튼한 접이식 빨래건조대");
    expect(concatenate).toHaveBeenCalledWith(expect.objectContaining({ pauseMs: 500 }));
  });

  it("fails closed when Latin removal leaves no product identity", async () => {
    await expect(recoverKoreanTtsAfterAsrFailure({
      narration: "상품명은 SONGMICS입니다. 빨래 건조 공간을 확인하세요.",
      canonicalProductName: "SONGMICS",
      anchors: ["빨래", "건조", "공간"],
      voiceRoot: "voice",
      dependencies: { synthesize: vi.fn(), concatenate: vi.fn() },
    })).rejects.toThrow("ASR_SEGMENTED_TTS_IDENTITY_GUARD_FAILED");
  });
});
