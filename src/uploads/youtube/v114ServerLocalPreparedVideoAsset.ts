import "server-only";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  ServerPreparedVideoAssetReadResult,
  ServerPreparedVideoAssetReader
} from "@/lib/uploads/youtube/youtubeUploadAdapter";
import type { PreparedVideoAssetRef } from "@/lib/uploads/youtube/uploadAssetContract";

export const APPROVE_V114_SERVER_LOCAL_ASSET_PREPARE_ONCE =
  "APPROVE_V114_SERVER_LOCAL_ASSET_PREPARE_ONCE" as const;

export const V114_SERVER_LOCAL_ASSET_STORAGE_KEY =
  "v114:v057:father_jobs:corrected-preview" as const;

export type V114ServerLocalPreparedAssetResult =
  | {
      ok: true;
      assetRef: PreparedVideoAssetRef;
      fileRead: true;
      raw_file_path_printed: false;
    }
  | {
      ok: false;
      blocker:
        | "BLOCKED_V114_CANONICAL_LOCAL_VIDEO_MISSING"
        | "BLOCKED_V114_CANONICAL_LOCAL_VIDEO_EMPTY";
      fileRead: false;
      raw_file_path_printed: false;
    };

export async function prepareV114ServerLocalVideoAsset(input: {
  cwd: string;
  queueItemId: string;
}): Promise<V114ServerLocalPreparedAssetResult> {
  const filePath = canonicalV057VideoPath(input.cwd);
  try {
    const [stat, bytes] = await Promise.all([fs.stat(filePath), fs.readFile(filePath)]);
    if (!stat.isFile() || stat.size <= 0 || bytes.byteLength <= 0) {
      return blocked("BLOCKED_V114_CANONICAL_LOCAL_VIDEO_EMPTY");
    }
    const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
    return {
      ok: true,
      assetRef: {
        asset_id: `asset-v114-${safeSlug(input.queueItemId)}`,
        storage_key: V114_SERVER_LOCAL_ASSET_STORAGE_KEY,
        signed_url: null,
        prepared_video_asset_url: null,
        mime_type: "video/mp4",
        size_bytes: bytes.byteLength,
        checksum_sha256: checksum,
        expires_at: null,
        provider: "server_local_file",
        server_accessible: true
      },
      fileRead: true,
      raw_file_path_printed: false
    };
  } catch {
    return blocked("BLOCKED_V114_CANONICAL_LOCAL_VIDEO_MISSING");
  }
}

export function createV114ServerLocalVideoAssetReader(input: {
  cwd: string;
}): ServerPreparedVideoAssetReader {
  return async (asset) => {
    if (
      asset.provider !== "server_local_file" ||
      asset.storage_key !== V114_SERVER_LOCAL_ASSET_STORAGE_KEY
    ) {
      return readBlocked("server_local_asset_reference_not_allowed");
    }

    try {
      const bytes = await fs.readFile(canonicalV057VideoPath(input.cwd));
      if (bytes.byteLength <= 0) {
        return readBlocked("server_local_asset_empty");
      }
      const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
      if (
        !asset.checksum_sha256 ||
        checksum !== asset.checksum_sha256 ||
        asset.size_bytes !== bytes.byteLength
      ) {
        return readBlocked("server_local_asset_evidence_mismatch");
      }
      const arrayBuffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer;
      return { ok: true, bytes: arrayBuffer, size: bytes.byteLength };
    } catch {
      return readBlocked("server_local_asset_read_failed");
    }
  };
}

function canonicalV057VideoPath(cwd: string) {
  return path.join(
    path.resolve(cwd),
    "commerce-assets",
    "review",
    "v057",
    "father_jobs",
    "corrected-preview-v057.mp4"
  );
}

function blocked(
  blocker: Extract<V114ServerLocalPreparedAssetResult, { ok: false }>["blocker"]
): V114ServerLocalPreparedAssetResult {
  return {
    ok: false,
    blocker,
    fileRead: false,
    raw_file_path_printed: false
  };
}

function readBlocked(reason: string): ServerPreparedVideoAssetReadResult {
  return {
    ok: false,
    blocked_reasons: [reason],
    safe_error: "Server-local prepared video asset is not readable with matching evidence."
  };
}

function safeSlug(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || "queue-item";
}
