import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { recoverKoreanTts, type SafeTtsResult } from "../../src/lib/video-automation/ttsRecovery";

const narration = "상품명은 슈브릭 멀티 폴딩박스 손잡이형+우드 캠핑 테이블 상판+전용 방수팩 구성, 트렁크 정리함 KS4002, 블랙입니다. 차량, 왜 세 가지를 확인할까요? 차량 정리 기준 세 가지만 확인하세요. 슈브릭 멀티 폴딩박스 손잡이형+우드 캠핑 테이블 상판+전용 방수팩 구성, 트렁크 정리함 KS4002, 블랙을 고를 때 정리 공간에 맞는 크기인지, 수납 사용이 간편한지 비교하세요. 구매 전 필요한 공간 조건을 확인하면 선택이 쉬워집니다.";

describe("Korean voice failure classification", () => {
  it("keeps the exact failing fixture hash and recovers the unsupported plus sign without generic RUNTIMEERROR", async () => {
    expect(createHash("sha256").update(narration).digest("hex")).toBe("094e983cb3ad143958f3730ef7ca4d41772ff39d2ca2978863491ac00529e097");
    const synthesize = vi.fn(async ({ text, target, attempt }: { text: string; target: string; attempt: number }) => text.includes("+")
      ? failed("TTS_INPUT_UNSUPPORTED", text, attempt)
      : passed(text, target, attempt));
    const result = await recoverKoreanTts({ narration, canonicalProductName: "슈브릭 멀티 폴딩박스 손잡이형+우드 캠핑 테이블 상판+전용 방수팩 구성, 트렁크 정리함 KS4002, 블랙", anchors: ["차량", "정리", "수납", "공간", "슈브릭", "멀티"], voiceRoot: "voice", dependencies: { synthesize, concatenate: vi.fn() } });
    expect(result.rootCauseCode).toBe("TTS_INPUT_UNSUPPORTED");
    expect(result.recoveryType).toBe("spoken_narration_normalization");
    expect(result.attempts.map((entry) => entry.safeCode)).not.toContain("RUNTIMEERROR");
    expect(result.spokenNarration).toContain("형 플러스 우드");
  });
});

function failed(safeCode: string, text: string, attempt: number): SafeTtsResult { return { status: "failed", safeCode, stage: "frontend", attempt, inputHash: createHash("sha256").update(text).digest("hex"), inputCharacters: [...text].length, segmentIndex: null, outputCreated: false, retryable: false }; }
function passed(text: string, output: string, attempt: number): SafeTtsResult { return { status: "success", safeCode: "TTS_SUCCESS", stage: "complete", attempt, inputHash: createHash("sha256").update(text).digest("hex"), inputCharacters: [...text].length, segmentIndex: null, outputCreated: true, retryable: false, output, duration_seconds: 10, validation: { passed: true, sampleRate: 44100, channels: 1 } }; }
