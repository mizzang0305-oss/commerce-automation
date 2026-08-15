import { describe, expect, it } from "vitest";

import { runYouTubeIntelligenceCommand } from "../../src/lib/video-lab/youtube-intelligence";

describe("YouTube Intelligence local CLI core", () => {
  it("runs a synthetic-only fixture analysis with no live calls", () => {
    const result = runYouTubeIntelligenceCommand({
      command: "fixture",
      runId: "fixture-cli",
      startedAt: "2026-08-16T00:00:00.000Z",
      finishedAt: "2026-08-16T00:00:00.000Z",
    });
    expect("run" in result && result.run).toMatchObject({
      normalizedVideoCount: 10,
      metadataCalls: 0,
      transcriptCalls: 0,
      modelCalls: 0,
      visionCalls: 0,
    });
  });

  it("accepts only owner-provided local JSON for analyze and emits derived evidence", () => {
    const inputText = JSON.stringify({
      sources: [
        {
          sourceId: "owner-local-1",
          url: "https://www.youtube.com/watch?v=YTCI0000099",
          title: "Owner provided synthetic-like local input",
          channelId: "owner-channel",
          channelTitle: "Owner Channel",
          observedAt: "2026-08-16T00:00:00.000Z",
          durationSeconds: 30,
          segments: [
            { startSeconds: 0, durationSeconds: 2, text: "왜 정리가 어려울까요?" },
            { startSeconds: 20, durationSeconds: 2, text: "지금 목록을 확인해 보세요." },
          ],
        },
      ],
    });
    const result = runYouTubeIntelligenceCommand({
      command: "analyze",
      inputText,
      runId: "owner-local",
      startedAt: "2026-08-16T00:00:00.000Z",
      finishedAt: "2026-08-16T00:00:00.000Z",
    });
    expect("evidence" in result && result.evidence).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("segments");
  });
});
