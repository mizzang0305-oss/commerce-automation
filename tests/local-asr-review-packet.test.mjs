import { describe, expect, test } from "vitest";

import {
  calculateTranscriptSimilarity,
  findRecognizedKeywordAnchors,
  getLocalAsrConfig,
  inspectLocalAsrConfig,
  parseDotEnv
} from "../scripts/generate-local-asr-v011-review-packet.mjs";

describe("local ASR v011 review packet helpers", () => {
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
    const reference = "장마철에 빨래를 미루면 냄새와 습기가 남습니다. 접이식 실내 빨래건조대는 공간을 확보합니다. 구매 전 크기와 하중을 확인하세요.";
    const transcript = "장마철 빨래 냄새와 습기가 남습니다. 접이식 빨래 건조대는 좁은 공간에 좋고 구매 전 확인하세요.";

    expect(calculateTranscriptSimilarity(reference, transcript)).toBeGreaterThanOrEqual(0.55);
    expect(findRecognizedKeywordAnchors(transcript)).toEqual([
      "장마철",
      "빨래",
      "냄새",
      "습기",
      "접이식",
      "건조대",
      "공간",
      "확인"
    ]);
  });
});
