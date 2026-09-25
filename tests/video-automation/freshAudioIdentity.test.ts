import { describe, expect, test } from "vitest";
import { evaluateFreshAudioIdentity } from "@/lib/video-automation/freshAudioIdentity";

const fixture = {
  canonicalProductName: "EasyBuy 슬랩 타입 분리수납함",
  asrTranscript: "상품명은 이지바이 슬랩 타입 분리수납함입니다",
  captionText: "상품명은 EasyBuy 슬랩 타입 분리수납함입니다",
  narration: "새로운 음성용 이지바이 슬랩 타입 분리 수납함",
  historicalNarration: "기존 음성용 EasyBuy 슬랩 타입 분리수납함",
  audioSha256: "a".repeat(64), historicalAudioSha256: "b".repeat(64),
  requiredExactTerms: ["슬랩", "분리수납함"],
  pronunciationAliases: { EasyBuy: "이지바이" }
};

describe("fresh audio and caption identity", () => {
  test("accepts exact ASR with an explicit spoken-only alias and canonical captions", () => {
    expect(evaluateFreshAudioIdentity(fixture)).toMatchObject({ passed: true, blockers: [] });
  });
  test.each([
    ["ASR mismatch", { asrTranscript: "상품명은 이지바이 슬렛 타입 분리수납함입니다" }, "ASR_CANONICAL_NAME_MISMATCH"],
    ["caption mismatch", { captionText: "상품명은 EasyBuy 슬랩 타입 분류수납함입니다" }, "CAPTION_CANONICAL_NAME_MISMATCH"],
    ["historical audio reused", { audioSha256: fixture.historicalAudioSha256 }, "HISTORICAL_AUDIO_HASH_REUSED"],
    ["historical narration reused", { narration: fixture.historicalNarration }, "HISTORICAL_NARRATION_HASH_REUSED"]
  ])("rejects %s", (_name, patch, code) => {
    expect(evaluateFreshAudioIdentity({ ...fixture, ...patch }).blockers).toContain(code);
  });
});
