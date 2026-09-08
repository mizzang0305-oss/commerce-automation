import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type V2ALocalVideoAssetExpectation = {
  videoPath: string;
  allowedRoots: readonly string[];
  expectedSha256: string;
  expectedSizeBytes: number;
  expectedMimeType: "video/mp4";
  maxSizeBytes: number;
};

export type V2AVerifiedLocalVideoAsset = {
  bytes: Uint8Array;
  sha256: string;
  sizeBytes: number;
  mimeType: "video/mp4";
  verifiedRealPath: string;
};

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export async function readAndVerifyV2ALocalVideoAsset(
  expectation: V2ALocalVideoAssetExpectation
): Promise<V2AVerifiedLocalVideoAsset> {
  if (!path.isAbsolute(expectation.videoPath)) throw new Error("V2A_VIDEO_PATH_NOT_ABSOLUTE");
  if (expectation.allowedRoots.length === 0) throw new Error("V2A_VIDEO_ALLOWED_ROOT_MISSING");
  if (!SHA256_PATTERN.test(expectation.expectedSha256)) throw new Error("V2A_VIDEO_SHA256_INVALID");
  if (!Number.isSafeInteger(expectation.expectedSizeBytes) || expectation.expectedSizeBytes <= 0) {
    throw new Error("V2A_VIDEO_SIZE_INVALID");
  }
  if (!Number.isSafeInteger(expectation.maxSizeBytes) || expectation.maxSizeBytes <= 0) {
    throw new Error("V2A_VIDEO_MAX_SIZE_INVALID");
  }
  if (expectation.expectedMimeType !== "video/mp4" || path.extname(expectation.videoPath).toLowerCase() !== ".mp4") {
    throw new Error("V2A_VIDEO_MIME_TYPE_INVALID");
  }

  const initialLinkStat = await fs.lstat(expectation.videoPath);
  if (!initialLinkStat.isFile() || initialLinkStat.isSymbolicLink()) {
    throw new Error("V2A_VIDEO_SYMLINK_OR_NON_FILE_REJECTED");
  }

  const verifiedRealPath = await fs.realpath(expectation.videoPath);
  const realRoots = await Promise.all(expectation.allowedRoots.map(resolveSafeRoot));
  if (!realRoots.some((root) => isPathWithin(root, verifiedRealPath))) {
    throw new Error("V2A_VIDEO_PATH_OUTSIDE_ALLOWED_ROOTS");
  }

  const handle = await fs.open(verifiedRealPath, "r");
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size !== expectation.expectedSizeBytes) {
      throw new Error("V2A_VIDEO_SIZE_MISMATCH");
    }
    if (before.size > expectation.maxSizeBytes) {
      throw new Error("V2A_VIDEO_MAX_SIZE_EXCEEDED");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (after.size !== before.size || bytes.byteLength !== before.size) {
      throw new Error("V2A_VIDEO_CHANGED_DURING_READ");
    }
    const finalRealPath = await fs.realpath(expectation.videoPath);
    if (!samePath(finalRealPath, verifiedRealPath)) {
      throw new Error("V2A_VIDEO_PATH_CHANGED_DURING_READ");
    }
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    if (!constantTimeHexEqual(sha256, expectation.expectedSha256)) {
      throw new Error("V2A_VIDEO_SHA256_MISMATCH");
    }
    return {
      bytes,
      sha256,
      sizeBytes: bytes.byteLength,
      mimeType: "video/mp4",
      verifiedRealPath
    };
  } finally {
    await handle.close();
  }
}

async function resolveSafeRoot(root: string): Promise<string> {
  if (!path.isAbsolute(root)) throw new Error("V2A_VIDEO_ALLOWED_ROOT_NOT_ABSOLUTE");
  const resolved = path.resolve(root);
  const stat = await fs.lstat(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("V2A_VIDEO_ALLOWED_ROOT_UNSAFE");
  }
  return fs.realpath(resolved);
}

function isPathWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function samePath(left: string, right: string): boolean {
  return process.platform === "win32"
    ? path.normalize(left).toLowerCase() === path.normalize(right).toLowerCase()
    : path.normalize(left) === path.normalize(right);
}

function constantTimeHexEqual(left: string, right: string): boolean {
  if (!SHA256_PATTERN.test(left) || !SHA256_PATTERN.test(right)) return false;
  return crypto.timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}
