import { describe, expect, it } from "vitest";
import { inspectQueueMediaEvidence } from "../../src/lib/queue-scheduler/mediaEvidence";

const validProbe = {
  streams: [
    { codec_type: "video", codec_name: "h264", width: 1080, height: 1920, r_frame_rate: "30/1" },
    { codec_type: "audio", codec_name: "aac" },
  ],
  format: { duration: "24.500" },
};

describe("Daily69 queue media evidence", () => {
  it("binds exact hash, size, codec, resolution, fps, and duration", async () => {
    await expect(inspectQueueMediaEvidence("video.mp4", {
      probe: async () => validProbe,
      hash: async () => "a".repeat(64),
      size: async () => 1024,
    })).resolves.toMatchObject({ passed: true, videoSha256: "a".repeat(64), videoSize: 1024, fps: 30, durationSeconds: 24.5, blockers: [] });
  });

  it("fails closed for every Level3 media contract mismatch", async () => {
    const result = await inspectQueueMediaEvidence("video.mp4", {
      probe: async () => ({ streams: [{ codec_type: "video", codec_name: "vp9", width: 720, height: 1280, r_frame_rate: "24/1" }], format: { duration: "5" } }),
      hash: async () => "invalid",
      size: async () => 0,
    });
    expect(result.passed).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      "VIDEO_FILE_EMPTY", "VIDEO_SHA256_INVALID", "VIDEO_CODEC_NOT_H264", "AUDIO_CODEC_NOT_AAC",
      "VIDEO_RESOLUTION_INVALID", "VIDEO_FPS_INVALID", "VIDEO_DURATION_INVALID",
    ]));
  });
});
