import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { recoverKoreanTts, type SafeTtsResult } from "../../src/lib/video-automation/ttsRecovery";

describe("segmented TTS fallback", () => {
  it("synthesizes semantic segments and concatenates them with a 500ms pause", async () => {
    let calls = 0;
    const synthesize = vi.fn(async ({ text, target, attempt, segmentIndex }: { text: string; target: string; attempt: number; segmentIndex: number | null }): Promise<SafeTtsResult> => {
      calls += 1;
      const base = { attempt, inputHash: createHash("sha256").update(text).digest("hex"), inputCharacters: [...text].length, segmentIndex };
      return calls <= 2 ? { ...base, status: "failed", safeCode: calls === 1 ? "TTS_INPUT_UNSUPPORTED" : "TTS_SEGMENT_TOO_LONG", stage: "frontend", outputCreated: false, retryable: false } : { ...base, status: "success", safeCode: "TTS_SUCCESS", stage: "complete", outputCreated: true, retryable: false, output: target, validation: { passed: true } };
    });
    const concatenate = vi.fn(async ({ target, pauseMs }: { target: string; pauseMs: number }) => ({ status: "success", output: target, validation: { passed: true, pauseMs } }));
    const long = "상품명은 슈브릭 멀티 폴딩박스입니다. 차량 정리 기준을 확인하세요. 수납 공간과 사용 조건을 확인하세요. 구매 전 크기를 비교하세요.";
    const result = await recoverKoreanTts({ narration: long, canonicalProductName: "슈브릭 멀티 폴딩박스", anchors: ["차량", "정리", "수납", "공간"], voiceRoot: "voice", dependencies: { synthesize, concatenate } });
    expect(result.recoveryType).toBe("segmented_synthesis");
    expect(result.segments.length).toBeGreaterThan(1);
    expect(concatenate).toHaveBeenCalledWith(expect.objectContaining({ pauseMs: 500 }));
  });
});
