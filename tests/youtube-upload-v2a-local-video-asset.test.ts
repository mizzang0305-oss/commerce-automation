import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readAndVerifyV2ALocalVideoAsset } from "../src/uploads/youtube/v2a/localVideoAsset";

const temporaryRoots: string[] = [];

async function fixture() {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "youtube-v2a-asset-"));
  temporaryRoots.push(parent);
  const allowedRoot = path.join(parent, "allowed");
  const outsideRoot = path.join(parent, "outside");
  await fs.mkdir(allowedRoot);
  await fs.mkdir(outsideRoot);
  const bytes = Buffer.from("not-a-real-video-but-exact-test-bytes", "utf8");
  const videoPath = path.join(allowedRoot, "video.mp4");
  const outsidePath = path.join(outsideRoot, "video.mp4");
  await fs.writeFile(videoPath, bytes);
  await fs.writeFile(outsidePath, bytes);
  return {
    allowedRoot,
    videoPath,
    outsidePath,
    bytes,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex")
  };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("YouTube Upload V2-A exact local video asset", () => {
  it("reads only an allowed regular MP4 whose size and SHA-256 match", async () => {
    const data = await fixture();
    const verified = await readAndVerifyV2ALocalVideoAsset({
      videoPath: data.videoPath,
      allowedRoots: [data.allowedRoot],
      expectedSha256: data.sha256,
      expectedSizeBytes: data.bytes.byteLength,
      expectedMimeType: "video/mp4",
      maxSizeBytes: 1_024
    });
    expect(verified).toMatchObject({
      sha256: data.sha256,
      sizeBytes: data.bytes.byteLength,
      mimeType: "video/mp4"
    });
    expect(Buffer.from(verified.bytes)).toEqual(data.bytes);
  });

  it("rejects a file outside the allowlisted real roots", async () => {
    const data = await fixture();
    await expect(readAndVerifyV2ALocalVideoAsset({
      videoPath: data.outsidePath,
      allowedRoots: [data.allowedRoot],
      expectedSha256: data.sha256,
      expectedSizeBytes: data.bytes.byteLength,
      expectedMimeType: "video/mp4",
      maxSizeBytes: 1_024
    })).rejects.toThrow("V2A_VIDEO_PATH_OUTSIDE_ALLOWED_ROOTS");
  });

  it("rejects changed bytes and oversized inputs before upload", async () => {
    const data = await fixture();
    await expect(readAndVerifyV2ALocalVideoAsset({
      videoPath: data.videoPath,
      allowedRoots: [data.allowedRoot],
      expectedSha256: "f".repeat(64),
      expectedSizeBytes: data.bytes.byteLength,
      expectedMimeType: "video/mp4",
      maxSizeBytes: 1_024
    })).rejects.toThrow("V2A_VIDEO_SHA256_MISMATCH");
    await expect(readAndVerifyV2ALocalVideoAsset({
      videoPath: data.videoPath,
      allowedRoots: [data.allowedRoot],
      expectedSha256: data.sha256,
      expectedSizeBytes: data.bytes.byteLength,
      expectedMimeType: "video/mp4",
      maxSizeBytes: data.bytes.byteLength - 1
    })).rejects.toThrow("V2A_VIDEO_MAX_SIZE_EXCEEDED");
  });

  it("rejects symbolic-link video paths when the platform permits creating one", async () => {
    const data = await fixture();
    const linkedPath = path.join(data.allowedRoot, "linked.mp4");
    try {
      await fs.symlink(data.videoPath, linkedPath, "file");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") return;
      throw error;
    }
    await expect(readAndVerifyV2ALocalVideoAsset({
      videoPath: linkedPath,
      allowedRoots: [data.allowedRoot],
      expectedSha256: data.sha256,
      expectedSizeBytes: data.bytes.byteLength,
      expectedMimeType: "video/mp4",
      maxSizeBytes: 1_024
    })).rejects.toThrow("V2A_VIDEO_SYMLINK_OR_NON_FILE_REJECTED");
  });
});
