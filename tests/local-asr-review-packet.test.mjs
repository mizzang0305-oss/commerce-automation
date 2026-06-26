import { describe, expect, test } from "vitest";

import {
  calculateTranscriptSimilarity,
  evaluateAudioIntelligibility,
  findRecognizedKeywordAnchors,
  getLocalAsrConfig,
  inspectLocalAsrConfig,
  normalizeAsrTranscriptForProductTerms,
  parseDotEnv
} from "../scripts/generate-local-asr-v013-review-packet.mjs";

describe("local ASR v013 review packet helpers", () => {
  test("detects missing provider without treating env presence as execution readiness", async () => {
    const config = getLocalAsrConfig({
      LOCAL_ASR_ENABLED: "true",
      LOCAL_ASR_PROVIDER: "faster-whisper",
      LOCAL_ASR_COMMAND: "C:\\missing\\asr.cmd",
      LOCAL_ASR_MODEL_PATH: "C:\\missing\\models",
      LOCAL_ASR_LANGUAGE: "ko"
    });
    const readiness = await inspectLocalAsrConfig(config);

    expect(readiness).toMatchObject({
      provider_detected: false,
      provider_name: "none",
      command_present: false,
      model_path_configured: true,
      blocker: "AUDIO_ASR_PROVIDER_NOT_CONFIGURED"
    });
  });

  test("parses local ASR env keys without exposing values", () => {
    const parsed = parseDotEnv([
      "LOCAL_ASR_ENABLED=true",
      "LOCAL_ASR_PROVIDER=faster-whisper",
      "LOCAL_ASR_COMMAND=C:\\tools\\asr.cmd",
      "LOCAL_ASR_MODEL_PATH=C:\\models",
      "LOCAL_ASR_LANGUAGE=ko"
    ].join("\n"));
    const config = getLocalAsrConfig(parsed);

    expect(config.enabled).toBe(true);
    expect(config.provider).toBe("faster-whisper");
    expect(Boolean(config.command)).toBe(true);
    expect(Boolean(config.modelPath)).toBe(true);
    expect(config.language).toBe("ko");
  });

  test("calculates transcript similarity and keyword anchors from recognized Korean text", () => {
    const reference = "장마철 빨래 냄새, 그냥 넘기면 손해입니다. 접이식 빨래 건조대는 좁은 공간에서도 빨래를 펼쳐 말릴 수 있게 도와줍니다.";
    const transcript = "장마철 빨래 냄새와 습기가 남습니다. 접이식 빨래 건조대는 좁은 공간에 좋고 구매 전 확인하세요.";

    expect(calculateTranscriptSimilarity(reference, transcript)).toBeGreaterThanOrEqual(0.49);
    expect(findRecognizedKeywordAnchors(transcript)).toEqual([
      "빨래",
      "건조대",
      "공간",
      "장마철",
      "냄새",
      "습기",
      "확인"
    ]);
  });

  test("requires product core anchors even when context anchors are recognized", () => {
    const result = evaluateAudioIntelligibility({
      transcript: "장마철 빨래 냄새와 습기가 남고 구매 전 확인하세요.",
      rawTranscriptSimilarityScore: 0.86,
      transcriptSimilarityScore: 0.86,
      speechRateWpm: 148,
      maxSilenceBetweenSegmentsMs: 140,
      hardCutCount: 0,
      voiceoverNaturalnessScore: 88,
      config: { minSimilarity: 0.82, minWpm: 130, maxWpm: 160 }
    });

    expect(result.recognizedContextAnchors).toEqual(["장마철", "냄새", "습기", "확인"]);
    expect(result.missingCoreAnchors).toEqual(["건조대", "공간"]);
    expect(result.blocker).toBe("VOICEOVER_PRODUCT_CORE_ANCHORS_MISSING");
  });

  test("normalizes repeated local ASR product-term confusions before core anchor scoring", () => {
    const transcript = "장마철 알레 냄새와 습기가 남습니다. 알외 건조대는 좁은 공간에 좋고 구매 전 확인하세요.";
    const normalized = normalizeAsrTranscriptForProductTerms(transcript);
    const result = evaluateAudioIntelligibility({
      transcript,
      rawTranscriptSimilarityScore: 0.88,
      transcriptSimilarityScore: 0.88,
      speechRateWpm: 148,
      maxSilenceBetweenSegmentsMs: 140,
      hardCutCount: 0,
      voiceoverNaturalnessScore: 88,
      config: { minSimilarity: 0.82, minWpm: 130, maxWpm: 160 }
    });

    expect(normalized).toContain("빨래");
    expect(result.recognizedCoreAnchors).toEqual(["빨래", "건조대", "공간"]);
    expect(result.blocker).toBeNull();
  });

  test("blocks normalized-pass transcripts when raw ASR similarity is still too low", () => {
    const result = evaluateAudioIntelligibility({
      transcript: "raw similarity low fixture",
      rawTranscriptSimilarityScore: 0.779,
      transcriptSimilarityScore: 1,
      speechRateWpm: 148,
      maxSilenceBetweenSegmentsMs: 140,
      hardCutCount: 0,
      voiceoverNaturalnessScore: 88,
      config: { minSimilarity: 0.82, minWpm: 130, maxWpm: 160 }
    });

    expect(result.blocker).toBe("RAW_ASR_SIMILARITY_TOO_LOW");
  });

  test("passes when all product core anchors and enough context anchors are recognized", () => {
    const result = evaluateAudioIntelligibility({
      transcript:
        "장마철 빨래 냄새와 습기가 남습니다. 접이식 빨래 건조대는 좁은 공간에서도 쓰기 좋고 구매 전 크기를 확인하세요.",
      rawTranscriptSimilarityScore: 0.9,
      transcriptSimilarityScore: 0.9,
      speechRateWpm: 145,
      maxSilenceBetweenSegmentsMs: 120,
      hardCutCount: 0,
      voiceoverNaturalnessScore: 90,
      config: { minSimilarity: 0.82, minWpm: 130, maxWpm: 160 }
    });

    expect(result.coreAnchorRecognitionPass).toBe(true);
    expect(result.contextAnchorRecognitionPass).toBe(true);
    expect(result.recognizedCoreAnchors).toEqual(["빨래", "건조대", "공간"]);
    expect(result.blocker).toBeNull();
  });
});
