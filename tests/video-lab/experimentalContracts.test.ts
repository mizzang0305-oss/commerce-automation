import { describe, expect, test, vi } from "vitest";

import { buildCaptionTimeline } from "@/lib/video-lab/captionTimeline";
import {
  DisabledVideoLabRenderer,
  ExperimentalRemotionRenderer,
  type VideoLabRendererRequest
} from "@/lib/video-lab/rendererContract";
import {
  DisabledWordAlignmentProvider,
  LocalWhisperXWordAlignmentProvider,
  type WordAlignmentToken
} from "@/lib/video-lab/wordAlignmentProvider";

const words: WordAlignmentToken[] = [
  { word: "좁은", start: 0, end: 0.3, confidence: 0.97 },
  { word: "공간도", start: 0.32, end: 0.7, confidence: 0.96 },
  { word: "깔끔하게", start: 0.72, end: 1.2, confidence: 0.94 },
  { word: "정리해요", start: 1.8, end: 2.3, confidence: 0.95 }
];

describe("video lab experimental contracts", () => {
  test("keeps WhisperX disabled without invoking a bridge", async () => {
    const result = await new DisabledWordAlignmentProvider().align({
      audio_path: "local.wav",
      language: "ko"
    });

    expect(result).toEqual({
      status: "disabled",
      provider: "disabled",
      reason: "WHISPERX_NOT_CONFIGURED",
      words: [],
      external_calls: 0
    });
    await expect(new DisabledWordAlignmentProvider().inspect()).resolves.toEqual({
      provider: "disabled",
      status: "NOT_CONFIGURED",
      configured: false
    });
  });

  test("validates an injected local WhisperX bridge and exposes no external call", async () => {
    const bridge = vi.fn(async () => ({ words }));
    const provider = new LocalWhisperXWordAlignmentProvider(bridge);
    const result = await provider.align({ audio_path: "local.wav", language: "ko" });

    expect(bridge).toHaveBeenCalledWith({
      audio_path: "local.wav",
      language: "ko",
      model: "small",
      device: "cpu",
      compute_type: "int8"
    });
    expect(result.status).toBe("completed");
    expect(result.external_calls).toBe(0);
    await expect(provider.inspect()).resolves.toEqual({
      provider: "local_whisperx",
      status: "READY_LOCAL",
      configured: true
    });
  });

  test("builds deterministic caption cues from aligned Korean words", () => {
    expect(buildCaptionTimeline(words, { max_chars: 8, max_gap_seconds: 0.5 })).toEqual([
      {
        cue_id: "cue-001",
        text: "좁은 공간도",
        start_seconds: 0,
        end_seconds: 0.7,
        words: 2
      },
      {
        cue_id: "cue-002",
        text: "깔끔하게",
        start_seconds: 0.72,
        end_seconds: 1.2,
        words: 1
      },
      {
        cue_id: "cue-003",
        text: "정리해요",
        start_seconds: 1.8,
        end_seconds: 2.3,
        words: 1
      }
    ]);
  });

  test("keeps Remotion disabled by default and binds experimental output exactly", async () => {
    const request: VideoLabRendererRequest = {
      candidate_id: "LAB_01",
      width: 1080,
      height: 1920,
      fps: 30,
      captions: buildCaptionTimeline(words),
      local_asset_paths: ["local-scene.png"],
      local_audio_path: "local.wav",
      output_path: "video-lab.mp4"
    };
    const disabled = await new DisabledVideoLabRenderer().render(request);
    expect(disabled).toMatchObject({
      status: "disabled",
      reason: "NOT_CONFIGURED",
      upload_called: false
    });
    await expect(new DisabledVideoLabRenderer().inspect()).resolves.toEqual({
      renderer: "disabled",
      status: "NOT_CONFIGURED",
      configured: false
    });

    const adapter = vi.fn(async () => ({ output_path: "video-lab.mp4" }));
    const rendered = await new ExperimentalRemotionRenderer(adapter).render(request);
    expect(rendered).toEqual({
      status: "rendered",
      renderer: "remotion_experimental",
      output_path: "video-lab.mp4",
      upload_called: false
    });
    await expect(new ExperimentalRemotionRenderer(adapter).inspect()).resolves.toEqual({
      renderer: "remotion_experimental",
      status: "READY_EXPERIMENTAL",
      configured: true
    });
  });

  test("fails closed on malformed alignment output and renderer binding", async () => {
    const provider = new LocalWhisperXWordAlignmentProvider(async () => ({ words: [] }));
    await expect(provider.align({ audio_path: "local.wav", language: "ko" })).rejects.toThrow(
      "VIDEO_LAB_WHISPERX_WORDS_REQUIRED"
    );

    const renderer = new ExperimentalRemotionRenderer(async () => ({ output_path: "other.mp4" }));
    await expect(
      renderer.render({
        candidate_id: "LAB_01",
        width: 1080,
        height: 1920,
        fps: 30,
        captions: buildCaptionTimeline(words),
        local_asset_paths: ["local.png"],
        local_audio_path: "local.wav",
        output_path: "expected.mp4"
      })
    ).rejects.toThrow("VIDEO_LAB_RENDER_OUTPUT_BINDING_FAILED");
  });
});
