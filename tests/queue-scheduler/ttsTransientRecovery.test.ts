import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { recoverKoreanTts, type SafeTtsResult } from "../../src/lib/video-automation/ttsRecovery";

describe("bounded transient TTS recovery", () => {
  it("retries once in a fresh path and records fresh_process_retry", async () => {
    let calls = 0;
    const synthesize = vi.fn(async ({ text, target, attempt }: { text: string; target: string; attempt: number }): Promise<SafeTtsResult> => {
      calls += 1;
      const base = { attempt, inputHash: createHash("sha256").update(text).digest("hex"), inputCharacters: [...text].length, segmentIndex: null };
      return calls === 1 ? { ...base, status: "failed", safeCode: "TTS_RUNTIME_TRANSIENT", stage: "runtime", outputCreated: false, retryable: true } : { ...base, status: "success", safeCode: "TTS_SUCCESS", stage: "complete", outputCreated: true, retryable: false, output: target, validation: { passed: true } };
    });
    const result = await recoverKoreanTts({ narration: "상품명은 정리함입니다. 차량 정리 수납 공간을 확인하세요.", canonicalProductName: "정리함", anchors: ["차량", "정리", "수납"], voiceRoot: "voice", dependencies: { synthesize, concatenate: vi.fn() } });
    expect(result.recoveryType).toBe("fresh_process_retry");
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[1].attempt).toBe(2);
    expect(result.attempts[1].output).toContain("-retry.wav");
  });
});
