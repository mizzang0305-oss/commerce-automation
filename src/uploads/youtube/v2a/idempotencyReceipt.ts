import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const V2A_RECEIPT_VERSION = "youtube-upload-v2a.private-receipt.v1" as const;

export type V2AUploadState =
  | "prepared"
  | "approved"
  | "uploading"
  | "uploaded_private"
  | "verified_private"
  | "failed"
  | "ambiguous"
  | "held";

export type V2AIdempotencyInput = {
  channelId: string;
  videoSha256: string;
  productId: string;
  operationNamespace: string;
};

export type V2APrivateUploadReceipt = {
  receiptVersion: typeof V2A_RECEIPT_VERSION;
  operationNamespace: string;
  productId: string;
  videoSha256: string;
  uploadPackageSha256: string;
  targetChannelId: string;
  youtubeVideoId: string;
  privacyStatus: "private";
  createdAt: string;
  completedAt: string;
  apiOutcome: "verified_private";
  sourceGitSha: string;
  adapterVersion: string;
  idempotencyKey: string;
  mock: false;
  productionUpload: true;
};

export type V2AAmbiguousMarker = {
  receiptVersion: typeof V2A_RECEIPT_VERSION;
  idempotencyKey: string;
  operationNamespace: string;
  productId: string;
  videoSha256: string;
  targetChannelId: string;
  createdAt: string;
  reasonCode: "UPLOAD_OUTCOME_AMBIGUOUS";
  state: "ambiguous";
};

export type V2AIdempotencyStatus =
  | { status: "none" }
  | { status: "reserved" }
  | { status: "successful"; receipt: V2APrivateUploadReceipt }
  | { status: "ambiguous"; marker: V2AAmbiguousMarker };

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const GIT_SHA_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

function requireNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`INVALID_${label.toUpperCase()}`);
  }
  return normalized;
}

function requirePattern(value: string, pattern: RegExp, label: string): string {
  const normalized = requireNonEmpty(value, label);
  if (!pattern.test(normalized)) {
    throw new Error(`INVALID_${label.toUpperCase()}`);
  }
  return normalized;
}

export function buildV2AIdempotencyKey(input: V2AIdempotencyInput): string {
  const payload = JSON.stringify({
    channelId: requirePattern(input.channelId, CHANNEL_ID_PATTERN, "channel_id"),
    operationNamespace: requireNonEmpty(input.operationNamespace, "operation_namespace"),
    productId: requireNonEmpty(input.productId, "product_id"),
    videoSha256: requirePattern(input.videoSha256, SHA256_PATTERN, "video_sha256")
  });
  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

export function buildV2APrivateUploadReceipt(
  input: Omit<V2APrivateUploadReceipt, "receiptVersion" | "idempotencyKey" | "mock" | "productionUpload">
): V2APrivateUploadReceipt {
  const receipt: V2APrivateUploadReceipt = {
    receiptVersion: V2A_RECEIPT_VERSION,
    operationNamespace: requireNonEmpty(input.operationNamespace, "operation_namespace"),
    productId: requireNonEmpty(input.productId, "product_id"),
    videoSha256: requirePattern(input.videoSha256, SHA256_PATTERN, "video_sha256"),
    uploadPackageSha256: requirePattern(input.uploadPackageSha256, SHA256_PATTERN, "upload_package_sha256"),
    targetChannelId: requirePattern(input.targetChannelId, CHANNEL_ID_PATTERN, "target_channel_id"),
    youtubeVideoId: requirePattern(input.youtubeVideoId, YOUTUBE_VIDEO_ID_PATTERN, "youtube_video_id"),
    privacyStatus: "private",
    createdAt: new Date(input.createdAt).toISOString(),
    completedAt: new Date(input.completedAt).toISOString(),
    apiOutcome: "verified_private",
    sourceGitSha: requirePattern(input.sourceGitSha, GIT_SHA_PATTERN, "source_git_sha"),
    adapterVersion: requireNonEmpty(input.adapterVersion, "adapter_version"),
    idempotencyKey: buildV2AIdempotencyKey({
      channelId: input.targetChannelId,
      videoSha256: input.videoSha256,
      productId: input.productId,
      operationNamespace: input.operationNamespace
    }),
    mock: false,
    productionUpload: true
  };

  if (Date.parse(receipt.completedAt) < Date.parse(receipt.createdAt)) {
    throw new Error("INVALID_RECEIPT_TIMESTAMP_ORDER");
  }
  assertV2AReceiptContainsNoSecrets(receipt);
  return receipt;
}

export function buildV2AAmbiguousMarker(input: Omit<V2AAmbiguousMarker, "receiptVersion" | "reasonCode" | "state">): V2AAmbiguousMarker {
  const marker: V2AAmbiguousMarker = {
    receiptVersion: V2A_RECEIPT_VERSION,
    idempotencyKey: requirePattern(input.idempotencyKey, SHA256_PATTERN, "idempotency_key"),
    operationNamespace: requireNonEmpty(input.operationNamespace, "operation_namespace"),
    productId: requireNonEmpty(input.productId, "product_id"),
    videoSha256: requirePattern(input.videoSha256, SHA256_PATTERN, "video_sha256"),
    targetChannelId: requirePattern(input.targetChannelId, CHANNEL_ID_PATTERN, "target_channel_id"),
    createdAt: new Date(input.createdAt).toISOString(),
    reasonCode: "UPLOAD_OUTCOME_AMBIGUOUS",
    state: "ambiguous"
  };
  assertV2AReceiptContainsNoSecrets(marker);
  return marker;
}

export function assertV2AReceiptContainsNoSecrets(value: V2APrivateUploadReceipt | V2AAmbiguousMarker): void {
  const serialized = JSON.stringify(value).toLowerCase();
  const forbidden = [
    "access_token",
    "refreshtoken",
    "refresh_token",
    "client_secret",
    "authorization",
    "bearer ",
    "upload_id=",
    "uploadtype=resumable",
    "sessionuri",
    "session_uri"
  ];
  if (forbidden.some((needle) => serialized.includes(needle))) {
    throw new Error("RECEIPT_SECRET_MATERIAL_REJECTED");
  }
}

async function prepareReceiptRoot(rootDirectory: string): Promise<string> {
  const resolved = path.resolve(requireNonEmpty(rootDirectory, "receipt_root"));
  await fs.mkdir(resolved, { recursive: true });
  const stat = await fs.lstat(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("UNSAFE_RECEIPT_ROOT");
  }
  const real = await fs.realpath(resolved);
  if (path.normalize(real) !== path.normalize(resolved)) {
    throw new Error("UNSAFE_RECEIPT_ROOT_REDIRECT");
  }
  return resolved;
}

async function writeExclusiveJson(filePath: string, value: object): Promise<void> {
  const handle = await fs.open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8" });
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function readJsonIfPresent(filePath: string): Promise<unknown | null> {
  try {
    const linkStat = await fs.lstat(filePath);
    if (!linkStat.isFile() || linkStat.isSymbolicLink()) {
      throw new Error("UNSAFE_RECEIPT_FILE");
    }
    const resolved = path.resolve(filePath);
    if (path.normalize(await fs.realpath(filePath)) !== path.normalize(resolved)) {
      throw new Error("UNSAFE_RECEIPT_FILE_REDIRECT");
    }
    const handle = await fs.open(resolved, "r");
    try {
      if (!(await handle.stat()).isFile()) throw new Error("UNSAFE_RECEIPT_FILE");
      return JSON.parse(await handle.readFile("utf8")) as unknown;
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join("\u0000") === [...expected].sort().join("\u0000");
}

function parseStoredReceipt(value: unknown, requestedKey: string): V2APrivateUploadReceipt {
  const keys = [
    "receiptVersion", "operationNamespace", "productId", "videoSha256", "uploadPackageSha256",
    "targetChannelId", "youtubeVideoId", "privacyStatus", "createdAt", "completedAt", "apiOutcome",
    "sourceGitSha", "adapterVersion", "idempotencyKey", "mock", "productionUpload"
  ] as const;
  if (!isRecord(value) || !hasExactKeys(value, keys)) throw new Error("INVALID_STORED_RECEIPT_SCHEMA");
  const stringFields = keys.filter((key) => !["mock", "productionUpload"].includes(key));
  if (stringFields.some((key) => typeof value[key] !== "string")) {
    throw new Error("INVALID_STORED_RECEIPT_SCHEMA");
  }
  if (
    value.receiptVersion !== V2A_RECEIPT_VERSION || value.idempotencyKey !== requestedKey ||
    value.privacyStatus !== "private" || value.apiOutcome !== "verified_private" ||
    value.mock !== false || value.productionUpload !== true ||
    !SHA256_PATTERN.test(value.videoSha256 as string) ||
    !SHA256_PATTERN.test(value.uploadPackageSha256 as string) ||
    !CHANNEL_ID_PATTERN.test(value.targetChannelId as string) ||
    !YOUTUBE_VIDEO_ID_PATTERN.test(value.youtubeVideoId as string) ||
    !GIT_SHA_PATTERN.test(value.sourceGitSha as string)
  ) throw new Error("INVALID_STORED_RECEIPT_SCHEMA");
  const receipt = value as V2APrivateUploadReceipt;
  const expectedKey = buildV2AIdempotencyKey({
    channelId: receipt.targetChannelId,
    videoSha256: receipt.videoSha256,
    productId: receipt.productId,
    operationNamespace: receipt.operationNamespace
  });
  if (expectedKey !== requestedKey || !Number.isFinite(Date.parse(receipt.createdAt)) ||
      !Number.isFinite(Date.parse(receipt.completedAt)) ||
      Date.parse(receipt.completedAt) < Date.parse(receipt.createdAt)) {
    throw new Error("INVALID_STORED_RECEIPT_SCHEMA");
  }
  assertV2AReceiptContainsNoSecrets(receipt);
  return receipt;
}

function parseStoredMarker(value: unknown, requestedKey: string): V2AAmbiguousMarker {
  const keys = ["receiptVersion", "idempotencyKey", "operationNamespace", "productId", "videoSha256", "targetChannelId", "createdAt", "reasonCode", "state"] as const;
  if (!isRecord(value) || !hasExactKeys(value, keys) || value.receiptVersion !== V2A_RECEIPT_VERSION ||
      value.idempotencyKey !== requestedKey || value.reasonCode !== "UPLOAD_OUTCOME_AMBIGUOUS" ||
      value.state !== "ambiguous" || typeof value.operationNamespace !== "string" ||
      typeof value.productId !== "string" || typeof value.videoSha256 !== "string" ||
      typeof value.targetChannelId !== "string" || typeof value.createdAt !== "string" ||
      !SHA256_PATTERN.test(value.videoSha256) || !CHANNEL_ID_PATTERN.test(value.targetChannelId) ||
      !Number.isFinite(Date.parse(value.createdAt))) throw new Error("INVALID_STORED_MARKER_SCHEMA");
  const marker = value as V2AAmbiguousMarker;
  if (buildV2AIdempotencyKey({ channelId: marker.targetChannelId, videoSha256: marker.videoSha256,
      productId: marker.productId, operationNamespace: marker.operationNamespace }) !== requestedKey) {
    throw new Error("INVALID_STORED_MARKER_SCHEMA");
  }
  assertV2AReceiptContainsNoSecrets(marker);
  return marker;
}

function assertStoredReservation(value: unknown, requestedKey: string): void {
  const keys = ["receiptVersion", "idempotencyKey", "state"] as const;
  if (!isRecord(value) || !hasExactKeys(value, keys) ||
      value.receiptVersion !== V2A_RECEIPT_VERSION || value.idempotencyKey !== requestedKey ||
      value.state !== "uploading") {
    throw new Error("INVALID_STORED_RESERVATION_SCHEMA");
  }
}

export function createV2AFileIdempotencyStore(rootDirectory: string) {
  return {
    async lookup(idempotencyKey: string): Promise<V2AIdempotencyStatus> {
      const key = requirePattern(idempotencyKey, SHA256_PATTERN, "idempotency_key");
      const root = await prepareReceiptRoot(rootDirectory);
      const receipt = await readJsonIfPresent(path.join(root, `${key}.success.json`));
      if (receipt) {
        return { status: "successful", receipt: parseStoredReceipt(receipt, key) };
      }
      const marker = await readJsonIfPresent(path.join(root, `${key}.ambiguous.json`));
      if (marker) {
        return { status: "ambiguous", marker: parseStoredMarker(marker, key) };
      }
      const reservation = await readJsonIfPresent(path.join(root, `${key}.uploading.json`));
      if (reservation) {
        assertStoredReservation(reservation, key);
        return { status: "reserved" };
      }
      return { status: "none" };
    },

    async reserve(idempotencyKey: string): Promise<boolean> {
      const key = requirePattern(idempotencyKey, SHA256_PATTERN, "idempotency_key");
      const root = await prepareReceiptRoot(rootDirectory);
      try {
        await writeExclusiveJson(path.join(root, `${key}.uploading.json`), {
          receiptVersion: V2A_RECEIPT_VERSION, idempotencyKey: key, state: "uploading"
        });
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
        throw error;
      }
    },

    async writeSuccess(receipt: V2APrivateUploadReceipt): Promise<string> {
      assertV2AReceiptContainsNoSecrets(receipt);
      const expectedKey = buildV2AIdempotencyKey({
        channelId: receipt.targetChannelId,
        videoSha256: receipt.videoSha256,
        productId: receipt.productId,
        operationNamespace: receipt.operationNamespace
      });
      if (receipt.idempotencyKey !== expectedKey) {
        throw new Error("RECEIPT_IDEMPOTENCY_KEY_MISMATCH");
      }
      const root = await prepareReceiptRoot(rootDirectory);
      const ambiguousPath = path.join(root, `${expectedKey}.ambiguous.json`);
      if (await readJsonIfPresent(ambiguousPath)) {
        throw new Error("AMBIGUOUS_UPLOAD_REQUIRES_RECONCILIATION");
      }
      const receiptPath = path.join(root, `${expectedKey}.success.json`);
      await writeExclusiveJson(receiptPath, receipt);
      // Keep the exclusive reservation as a permanent tombstone. Lookup prioritizes
      // terminal receipts, while a stale contender can never reacquire this key.
      return receiptPath;
    },

    async markAmbiguous(marker: V2AAmbiguousMarker): Promise<string> {
      assertV2AReceiptContainsNoSecrets(marker);
      const root = await prepareReceiptRoot(rootDirectory);
      const successPath = path.join(root, `${marker.idempotencyKey}.success.json`);
      if (await readJsonIfPresent(successPath)) {
        throw new Error("SUCCESS_RECEIPT_ALREADY_EXISTS");
      }
      const markerPath = path.join(root, `${marker.idempotencyKey}.ambiguous.json`);
      await writeExclusiveJson(markerPath, marker);
      // Preserve the reservation tombstone until an explicit reconciliation flow
      // is designed; automatic reuse could duplicate an already-created video.
      return markerPath;
    }
  };
}
