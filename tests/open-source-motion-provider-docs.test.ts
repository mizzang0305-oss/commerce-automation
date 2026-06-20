import fs from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

const DOC_PATHS = [
  "docs/research/OPEN_SOURCE_MOTION_PROVIDER_EVALUATION.md",
  "docs/research/COMMERCE_VIDEO_PROVIDER_ROADMAP.md",
  "docs/research/SHOPPING_SOURCE_ADAPTER_RESEARCH.md",
  "docs/research/REVIEW_MEMORY_AND_PROMPT_FEEDBACK_RESEARCH.md",
  "docs/MOTION_FIRST_SHORTS_ARCHITECTURE.md"
];

describe("open-source motion provider research docs", () => {
  test("documents provider candidates, architecture, and prior false-positive lessons", () => {
    const combined = DOC_PATHS.map(readDoc).join("\n\n");

    for (const term of [
      "ComfyUI",
      "Wan2.1",
      "Wan2.2",
      "LTX-Video",
      "CogVideoX",
      "HunyuanVideo",
      "AnimateDiff",
      "Stable Video Diffusion",
      "ModelScope",
      "Diffusers",
      "FFmpeg",
      "MoviePy",
      "Remotion",
      "edge-tts",
      "Piper",
      "Coqui TTS",
      "OpenVoice",
      "StyleTTS2",
      "Bark",
      "Shopify Storefront API",
      "Amazon Creators API",
      "Medusa",
      "Spree",
      "Saleor",
      "WooCommerce",
      "Mem0",
      "Dify",
      "Flowise",
      "LangGraph",
      "LlamaIndex",
      "n8n",
      "Kestra",
      "Windmill",
      "MOTION_PROVIDER_NOT_CONFIGURED"
    ]) {
      expect(combined).toContain(term);
    }

    for (const videoId of ["pLBtNgrwLJA", "mLytN-u2C5M", "hRq1iap1C14", "G-r6rWsZwiU"]) {
      expect(combined).toContain(videoId);
    }
  });
});

function readDoc(relativePath: string) {
  const fullPath = path.join(process.cwd(), relativePath);
  expect(fs.existsSync(fullPath), `${relativePath} should exist`).toBe(true);
  return fs.readFileSync(fullPath, "utf8");
}
