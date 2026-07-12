import "server-only";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  ServerPreparedVideoAssetReadResult,
  ServerPreparedVideoAssetReader
} from "@/lib/uploads/youtube/youtubeUploadAdapter";
import type { PreparedVideoAssetRef } from "@/lib/uploads/youtube/uploadAssetContract";
import {
  V115_EXPECTED_FIRST_FRAME_FILE_NAME,
  V115_EXPECTED_SUMMARY_FILE_NAME,
  V115_EXPECTED_VIDEO_FILE_NAME,
  evaluateV115ExactV113AssetEvidence,
  type V115ExactAssetEvidenceReport
} from "./v115ExactV113AssetContract";

export const APPROVE_V115_SERVER_LOCAL_V113_ASSET_PREPARE_ONCE =
  "APPROVE_V115_SERVER_LOCAL_V113_ASSET_PREPARE_ONCE" as const;

export const V115_SERVER_LOCAL_ASSET_STORAGE_KEY =
  "v115:v113:father_jobs:product-matched-preview" as const;

export type V115ServerLocalPreparedAssetResult =
  | {
      ok: true;
      assetRef: PreparedVideoAssetRef;
      evidence: V115ExactAssetEvidenceReport;
      fileRead: true;
      raw_file_path_printed: false;
    }
  | {
      ok: false;
      blocker: string;
      evidence: V115ExactAssetEvidenceReport;
      fileRead: false;
      raw_file_path_printed: false;
    };

export async function inspectV115ExactV113LocalAsset(input: {
  cwd: string;
}): Promise<V115ExactAssetEvidenceReport> {
  const paths = exactV113Paths(input.cwd);
  const [video, firstFrame, summary] = await Promise.all([
    readFileEvidence(paths.video),
    readFileEvidence(paths.firstFrame),
    readJsonRecord(paths.summary)
  ]);

  return evaluateV115ExactV113AssetEvidence({
    videoPresent: video.present,
    videoSizeBytes: video.sizeBytes,
    videoSha256: video.sha256,
    firstFramePresent: firstFrame.present,
    firstFrameSha256: firstFrame.sha256,
    summary
  });
}

export async function prepareV115ExactV113ServerLocalVideoAsset(input: {
  cwd: string;
  queueItemId: string;
}): Promise<V115ServerLocalPreparedAssetResult> {
  const evidence = await inspectV115ExactV113LocalAsset({ cwd: input.cwd });
  if (!evidence.ready) {
    return {
      ok: false,
      blocker: evidence.blockers[0] ?? "BLOCKED_V115_EXACT_V113_ASSET_EVIDENCE_INCOMPLETE",
      evidence,
      fileRead: false,
      raw_file_path_printed: false
    };
  }

  const bytes = await fs.readFile(exactV113Paths(input.cwd).video);
  return {
    ok: true,
    assetRef: {
      asset_id: `asset-v115-${safeSlug(input.queueItemId)}`,
      storage_key: V115_SERVER_LOCAL_ASSET_STORAGE_KEY,
      signed_url: null,
      prepared_video_asset_url: null,
      mime_type: "video/mp4",
      size_bytes: bytes.byteLength,
      checksum_sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      expires_at: null,
      provider: "server_local_file",
      server_accessible: true
    },
    evidence,
    fileRead: true,
    raw_file_path_printed: false
  };
}

export function createV115ExactV113ServerLocalVideoAssetReader(input: {
  cwd: string;
}): ServerPreparedVideoAssetReader {
  return async (asset) => {
    if (
      asset.provider !== "server_local_file" ||
      asset.storage_key !== V115_SERVER_LOCAL_ASSET_STORAGE_KEY
    ) {
      return readBlocked("server_local_v113_asset_reference_not_allowed");
    }

    const evidence = await inspectV115ExactV113LocalAsset({ cwd: input.cwd });
    if (!evidence.ready) {
      return readBlocked("server_local_v113_asset_evidence_incomplete");
    }

    try {
      const bytes = await fs.readFile(exactV113Paths(input.cwd).video);
      const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
      if (
        !asset.checksum_sha256 ||
        checksum !== asset.checksum_sha256 ||
        asset.size_bytes !== bytes.byteLength
      ) {
        return readBlocked("server_local_v113_asset_evidence_mismatch");
      }
      const arrayBuffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer;
      return { ok: true, bytes: arrayBuffer, size: bytes.byteLength };
    } catch {
      return readBlocked("server_local_v113_asset_read_failed");
    }
  };
}

function exactV113Paths(cwd: string) {
  const root = path.join(path.resolve(cwd), "commerce-assets", "review", "v113", "father_jobs");
  return {
    video: path.join(root, V115_EXPECTED_VIDEO_FILE_NAME),
    firstFrame: path.join(root, V115_EXPECTED_FIRST_FRAME_FILE_NAME),
    summary: path.join(root, V115_EXPECTED_SUMMARY_FILE_NAME)
  };
}

async function readFileEvidence(filePath: string) {
  try {
    const [stat, bytes] = await Promise.all([fs.stat(filePath), fs.readFile(filePath)]);
    if (!stat.isFile() || bytes.byteLength <= 0) {
      return { present: false, sizeBytes: null, sha256: null };
    }
    return {
      present: true,
      sizeBytes: bytes.byteLength,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex")
    };
  } catch {
    return { present: false, sizeBytes: null, sha256: null };
  }
}

async function readJsonRecord(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
    return Boolean(parsed) && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function readBlocked(reason: string): ServerPreparedVideoAssetReadResult {
  return {
    ok: false,
    blocked_reasons: [reason],
    safe_error: "Exact V113 server-local asset is not readable with matching evidence."
  };
}

function safeSlug(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || "queue-item";
}
