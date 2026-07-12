import "server-only";

import { createHash, createHmac } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { AutomationRepository } from "@/lib/repositories/types";
import {
  validatePreparedVideoAssetRef
} from "@/lib/uploads/assets/preparedVideoAssetValidator";
import type { PreparedVideoAssetRef } from "@/lib/uploads/youtube/uploadAssetContract";
import type { ProductAsset, ProductCandidate } from "@/types/automation";

export type OneProductServerAssetRegistrationErrorCode =
  | "VIDEO_ASSET_REGISTRATION_NOT_READY"
  | "LOCAL_VIDEO_ARTIFACT_MISSING"
  | "R2_OR_STORAGE_PROVIDER_NOT_CONFIGURED"
  | "SERVER_VIDEO_ASSET_UPLOAD_FAILED"
  | "PRODUCT_ASSETS_SCHEMA_REQUIRES_QUEUE_ID"
  | "PRODUCT_ASSET_PERSISTENCE_PRECHECK_FAILED"
  | "PRODUCT_ASSET_PERSISTENCE_FAILED";

export type OneProductServerAssetRegistrationResult =
  | {
      ok: true;
      asset_ref: PreparedVideoAssetRef;
      product_asset: ProductAsset;
      registration_source: "provided_asset_ref" | "r2_upload";
      r2_uploaded: boolean;
      db_written: true;
      rows_inserted_or_upserted: 1;
      blocked_reasons: [];
    }
  | OneProductServerAssetRegistrationFailure;

type OneProductServerAssetRegistrationFailure = {
      ok: false;
      error_code: OneProductServerAssetRegistrationErrorCode;
      message: string;
      blocked_reasons: string[];
      r2_uploaded: boolean;
      db_written: false;
      rows_inserted_or_upserted: 0;
      orphan_object_possible?: boolean;
    };

export type ServerVideoAssetRegistrar = (input: {
  candidate: ProductCandidate;
  prepared_video_asset?: unknown;
}) => Promise<OneProductServerAssetRegistrationResult>;

export type ServerVideoAssetUploadInput = {
  candidateId: string;
  file_buffer: Buffer;
  file_name: string;
  mime_type: "video/mp4";
  size_bytes: number;
  checksum_sha256: string;
};

export type R2PutSafeErrorCode =
  | "R2_CONFIGURATION_ERROR"
  | "R2_ACCESS_DENIED"
  | "R2_INVALID_ACCESS_KEY_ID"
  | "R2_SIGNATURE_DOES_NOT_MATCH"
  | "R2_REQUEST_TIME_TOO_SKEWED"
  | "R2_NO_SUCH_BUCKET"
  | "R2_NO_SUCH_KEY"
  | "R2_INVALID_REQUEST"
  | "R2_REQUEST_TIMEOUT"
  | "R2_REQUEST_CONFLICT"
  | "R2_RATE_LIMITED"
  | "R2_INTERNAL_ERROR"
  | "R2_SERVICE_UNAVAILABLE"
  | "R2_PERMISSION_REJECTED"
  | "R2_BUCKET_OR_OBJECT_NOT_FOUND"
  | "R2_HTTP_CLIENT_ERROR"
  | "R2_HTTP_SERVER_ERROR"
  | "R2_NETWORK_ERROR";

export type R2PutDiagnostics = {
  provider: "r2";
  operation: "put_object";
  request_attempted: boolean;
  http_status: number | null;
  safe_error_code: R2PutSafeErrorCode | null;
  raw_response_body_printed: false;
  raw_request_url_printed: false;
  auth_header_value_printed: false;
  credentials_printed: false;
};

export type R2PutUploadDependencies = {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

export type ServerVideoAssetUploadResult =
  | {
      ok: true;
      asset_ref: PreparedVideoAssetRef;
      diagnostics: R2PutDiagnostics;
    }
  | {
      ok: false;
      error_code: "R2_OR_STORAGE_PROVIDER_NOT_CONFIGURED" | "SERVER_VIDEO_ASSET_UPLOAD_FAILED";
      blocked_reasons: string[];
      diagnostics: R2PutDiagnostics;
    };

export type OneProductServerAssetRegistrationDependencies = {
  cwd?: string;
  now?: () => string;
  stat?: typeof fs.stat;
  readFile?: typeof fs.readFile;
  uploadVideo?: (input: ServerVideoAssetUploadInput) => Promise<ServerVideoAssetUploadResult>;
};

export function createOneProductServerAssetRegistrar(
  repository: Pick<AutomationRepository, "upsertProductAsset" | "getProductAssetPersistenceCapabilities">,
  dependencies: OneProductServerAssetRegistrationDependencies = {}
): ServerVideoAssetRegistrar {
  const cwd = dependencies.cwd ?? process.cwd();
  const stat = dependencies.stat ?? fs.stat;
  const readFile = dependencies.readFile ?? fs.readFile;
  const uploadVideo = dependencies.uploadVideo ?? uploadVideoBufferToR2;
  const now = dependencies.now ?? (() => new Date().toISOString());

  return async ({ candidate, prepared_video_asset }) => {
    if (isProvided(prepared_video_asset)) {
      const validation = validatePreparedVideoAssetRef(prepared_video_asset);
      if (!validation.ok) {
        return blockedResult({
          error_code: "VIDEO_ASSET_REGISTRATION_NOT_READY",
          message: "Provided server-accessible video asset ref is not ready.",
          blocked_reasons: validation.blocked_reasons
        });
      }
      const precheck = await verifyCandidateLinkedPersistence(repository);
      if (!precheck.ok) {
        return precheck.result;
      }
      return persistAssetRef({
        repository,
        candidate,
        asset_ref: validation.asset_ref,
        registration_source: "provided_asset_ref",
        r2_uploaded: false,
        now
      });
    }

    const localVideoPath = await resolveExpectedLocalVideoPath({ cwd, candidateId: candidate.id, stat });
    const qualityMetadata = await readQualityMetadataSidecar(readFile, localVideoPath);
    let fileBuffer: Buffer;
    let sizeBytes: number;
    try {
      const fileStat = await stat(localVideoPath);
      if (!fileStat.isFile() || fileStat.size <= 0) {
        return blockedResult({
          error_code: "LOCAL_VIDEO_ARTIFACT_MISSING",
          message: "Expected local video artifact is missing or empty.",
          blocked_reasons: ["local_video_artifact_missing_or_empty"]
        });
      }
      fileBuffer = await readFile(localVideoPath);
      sizeBytes = fileStat.size;
    } catch {
      return blockedResult({
        error_code: "LOCAL_VIDEO_ARTIFACT_MISSING",
        message: "Expected local video artifact is not available for registration.",
        blocked_reasons: ["local_video_artifact_missing"]
      });
    }

    const precheck = await verifyCandidateLinkedPersistence(repository);
    if (!precheck.ok) {
      return precheck.result;
    }

    const checksum = createHash("sha256").update(fileBuffer).digest("hex");
    const upload = await uploadVideo({
      candidateId: candidate.id,
      file_buffer: fileBuffer,
      file_name: path.basename(localVideoPath),
      mime_type: "video/mp4",
      size_bytes: sizeBytes,
      checksum_sha256: checksum
    });
    if (!upload.ok) {
      return blockedResult({
        error_code: upload.error_code,
        message: upload.error_code === "R2_OR_STORAGE_PROVIDER_NOT_CONFIGURED"
          ? "Server-accessible storage provider is not configured."
          : "Server-accessible video asset upload failed.",
        blocked_reasons: upload.blocked_reasons
      });
    }

    return persistAssetRef({
      repository,
      candidate,
      asset_ref: upload.asset_ref,
      registration_source: "r2_upload",
      r2_uploaded: true,
      quality_metadata: qualityMetadata,
      now
    });
  };
}

async function persistAssetRef(input: {
  repository: Pick<AutomationRepository, "upsertProductAsset">;
  candidate: ProductCandidate;
  asset_ref: PreparedVideoAssetRef;
  registration_source: "provided_asset_ref" | "r2_upload";
  r2_uploaded: boolean;
  quality_metadata?: Record<string, unknown>;
  now: () => string;
}): Promise<OneProductServerAssetRegistrationResult> {
  const validation = validatePreparedVideoAssetRef(input.asset_ref);
  if (!validation.ok) {
    return blockedResult({
      error_code: "VIDEO_ASSET_REGISTRATION_NOT_READY",
      message: "Server-accessible video asset ref did not pass registration validation.",
      blocked_reasons: validation.blocked_reasons
    });
  }

  const nowIso = input.now();
  const productAsset: ProductAsset = {
    id: buildProductAssetId(input.candidate.id),
    product_queue_id: null,
    product_candidate_id: input.candidate.id,
    worker_job_id: "",
    asset_type: "video",
    bucket: inferProductAssetBucket(input.asset_ref),
    url: input.asset_ref.prepared_video_asset_url ?? input.asset_ref.signed_url ?? "",
    render_qa_metadata: stripUndefined({
      product_candidate_id: input.candidate.id,
      prepared_video_asset_provider: input.asset_ref.provider,
      storage_key: input.asset_ref.storage_key ?? undefined,
      prepared_video_asset_url: input.asset_ref.prepared_video_asset_url ?? undefined,
      signed_url: input.asset_ref.signed_url ?? undefined,
      mime_type: input.asset_ref.mime_type,
      size_bytes: input.asset_ref.size_bytes ?? undefined,
      checksum_sha256: input.asset_ref.checksum_sha256 ?? undefined,
      expires_at: input.asset_ref.expires_at ?? undefined,
      server_accessible: input.asset_ref.server_accessible,
      registration_source: input.registration_source,
      registered_by: "one_product_server_asset_registrar",
      ...(input.quality_metadata ?? {})
    }),
    qa_status: "pending",
    qa_note: "",
    created_at: nowIso,
    updated_at: nowIso
  };

  try {
    const saved = await input.repository.upsertProductAsset(productAsset);
    return {
      ok: true,
      asset_ref: input.asset_ref,
      product_asset: saved,
      registration_source: input.registration_source,
      r2_uploaded: input.r2_uploaded,
      db_written: true,
      rows_inserted_or_upserted: 1,
      blocked_reasons: []
    };
  } catch {
    return blockedResult({
      error_code: "PRODUCT_ASSET_PERSISTENCE_FAILED",
      message: "Product asset persistence failed with a safe server error.",
      blocked_reasons: input.r2_uploaded
        ? ["product_asset_persistence_failed", "product_asset_orphan_object_possible"]
        : ["product_asset_persistence_failed"],
      r2_uploaded: input.r2_uploaded,
      orphan_object_possible: input.r2_uploaded
    });
  }
}

async function verifyCandidateLinkedPersistence(
  repository: Pick<AutomationRepository, "getProductAssetPersistenceCapabilities">
): Promise<
  | { ok: true }
  | { ok: false; result: OneProductServerAssetRegistrationFailure }
> {
  if (!repository.getProductAssetPersistenceCapabilities) {
    return { ok: true };
  }

  try {
    const capabilities = await repository.getProductAssetPersistenceCapabilities();
    if (capabilities.candidate_linked_assets_supported) {
      return { ok: true };
    }
    return {
      ok: false,
      result: blockedResult({
        error_code: "PRODUCT_ASSETS_SCHEMA_REQUIRES_QUEUE_ID",
        message: "Product asset schema does not support candidate-linked assets without a queue row.",
        blocked_reasons: capabilities.blocked_reasons.length > 0
          ? capabilities.blocked_reasons
          : ["product_assets_candidate_link_schema_not_ready"]
      })
    };
  } catch {
    return {
      ok: false,
      result: blockedResult({
        error_code: "PRODUCT_ASSET_PERSISTENCE_PRECHECK_FAILED",
        message: "Product asset persistence precheck failed with a safe server error.",
        blocked_reasons: ["product_asset_persistence_precheck_failed"]
      })
    };
  }
}

export async function uploadVideoBufferToR2(
  input: ServerVideoAssetUploadInput,
  dependencies: R2PutUploadDependencies = {}
): Promise<ServerVideoAssetUploadResult> {
  const config = readR2Config(dependencies.env ?? process.env);
  if (!config.ok) {
    return {
      ok: false,
      error_code: "R2_OR_STORAGE_PROVIDER_NOT_CONFIGURED",
      blocked_reasons: config.blocked_reasons,
      diagnostics: buildR2PutDiagnostics({
        requestAttempted: false,
        httpStatus: null,
        safeErrorCode: "R2_CONFIGURATION_ERROR"
      })
    };
  }

  const storageKey = buildR2StorageKey(input.candidateId, input.file_name);
  const canonicalUri = `/${encodeS3Path(config.bucket)}/${encodeS3Path(storageKey)}`;
  const endpointUrl = new URL(config.endpoint);
  const uploadUrl = `${endpointUrl.origin}${canonicalUri}`;

  const payloadHash = input.checksum_sha256;
  const { amzDate, dateStamp } = createAmzDates((dependencies.now ?? (() => new Date()))());
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders = [
    `host:${endpointUrl.host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    ""
  ].join("\n");
  const canonicalRequest = [
    "PUT",
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join("\n");
  const signature = hmacHex(getSignatureKey(config.secretKey, dateStamp, config.region, "s3"), stringToSign);
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`
  ].join(", ");
  const requestBody = new Uint8Array(input.file_buffer);
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  let successfulHttpStatus = 200;

  try {
    const response = await fetchImpl(uploadUrl, {
      method: "PUT",
      headers: {
        "Authorization": authorization,
        "Content-Type": input.mime_type,
        "Content-Length": String(input.size_bytes),
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate
      },
      body: requestBody
    });
    if (!response.ok) {
      const safeErrorCode = await resolveR2PutSafeErrorCode(response);
      return {
        ok: false,
        error_code: "SERVER_VIDEO_ASSET_UPLOAD_FAILED",
        blocked_reasons: [
          `r2_put_failed_${response.status}`,
          safeErrorCode.toLowerCase()
        ],
        diagnostics: buildR2PutDiagnostics({
          requestAttempted: true,
          httpStatus: response.status,
          safeErrorCode
        })
      };
    }
    successfulHttpStatus = response.status;
  } catch {
    return {
      ok: false,
      error_code: "SERVER_VIDEO_ASSET_UPLOAD_FAILED",
      blocked_reasons: ["r2_put_failed", "r2_network_error"],
      diagnostics: buildR2PutDiagnostics({
        requestAttempted: true,
        httpStatus: null,
        safeErrorCode: "R2_NETWORK_ERROR"
      })
    };
  }

  const publicUrl = config.publicBaseUrl
    ? `${config.publicBaseUrl.replace(/\/+$/, "")}/${encodePublicUrlPath(storageKey)}`
    : null;

  return {
    ok: true,
    diagnostics: buildR2PutDiagnostics({
      requestAttempted: true,
      httpStatus: successfulHttpStatus,
      safeErrorCode: null
    }),
    asset_ref: {
      asset_id: buildProductAssetId(input.candidateId),
      provider: "r2",
      storage_key: storageKey,
      prepared_video_asset_url: publicUrl,
      signed_url: null,
      mime_type: input.mime_type,
      size_bytes: input.size_bytes,
      checksum_sha256: input.checksum_sha256,
      expires_at: null,
      server_accessible: true
    }
  };
}

function readR2Config(env: NodeJS.ProcessEnv):
  | {
      ok: true;
      endpoint: string;
      accessKeyId: string;
      secretKey: string;
      region: string;
      bucket: string;
      publicBaseUrl: string | null;
    }
  | {
      ok: false;
      blocked_reasons: string[];
    } {
  const endpoint = pickEnv(env, "R2_ENDPOINT_URL", "S3_ENDPOINT_URL");
  const accessKeyId = pickEnv(env, "R2_ACCESS_KEY_ID", "S3_ACCESS_KEY_ID");
  const secretKey = pickEnv(env, "R2_SECRET_ACCESS_KEY", "S3_SECRET_ACCESS_KEY");
  const region = pickEnv(env, "R2_REGION", "S3_REGION") || "auto";
  const bucket = pickEnv(env, "R2_RENDERED_VIDEOS_BUCKET", "S3_RENDERED_VIDEOS_BUCKET", "STORAGE_RENDERED_VIDEOS_BUCKET") || "rendered-videos";
  const publicBaseUrl = pickEnv(
    env,
    "R2_PUBLIC_BASE_URL_RENDERED_VIDEOS",
    "PUBLIC_RENDERED_VIDEOS_BASE_URL",
    "PUBLIC_STORAGE_BASE_URL"
  ) || null;
  const blockedReasons: string[] = [];
  if (!endpoint) {
    blockedReasons.push("r2_endpoint_missing");
  }
  if (!accessKeyId) {
    blockedReasons.push("r2_access_key_missing");
  }
  if (!secretKey) {
    blockedReasons.push("r2_secret_key_missing");
  }
  if (!bucket) {
    blockedReasons.push("r2_bucket_missing");
  }
  if (endpoint) {
    try {
      const parsed = new URL(endpoint);
      if (parsed.protocol !== "https:") {
        blockedReasons.push("r2_endpoint_not_https");
      }
    } catch {
      blockedReasons.push("r2_endpoint_invalid");
    }
  }

  if (blockedReasons.length > 0 || !endpoint || !accessKeyId || !secretKey || !bucket) {
    return { ok: false, blocked_reasons: blockedReasons };
  }

  return {
    ok: true,
    endpoint,
    accessKeyId,
    secretKey,
    region,
    bucket,
    publicBaseUrl
  };
}

async function resolveExpectedLocalVideoPath(input: {
  cwd: string;
  candidateId: string;
  stat: typeof fs.stat;
}) {
  const paths = [
    buildExpectedLocalVideoPath({ cwd: input.cwd, candidateId: input.candidateId, version: "v010" }),
    buildExpectedLocalVideoPath({ cwd: input.cwd, candidateId: input.candidateId, version: "v009" }),
    buildExpectedLocalVideoPath({ cwd: input.cwd, candidateId: input.candidateId, version: "v008" })
  ];
  for (const localVideoPath of paths) {
    try {
      const fileStat = await input.stat(localVideoPath);
      if (fileStat.isFile() && fileStat.size > 0) {
        return localVideoPath;
      }
    } catch {
      // Try the next supported local render version.
    }
  }
  return paths[0];
}

function buildExpectedLocalVideoPath(input: { cwd: string; candidateId: string; version: "v008" | "v009" | "v010" }) {
  const safeCandidateId = toSafeSlug(input.candidateId);
  return path.join(
    input.cwd,
    "commerce-assets",
    "generated-videos",
    safeCandidateId,
    input.version,
    "story-shorts.mp4"
  );
}

async function readQualityMetadataSidecar(
  readFile: typeof fs.readFile,
  localVideoPath: string
) {
  const sidecarPaths = [
    localVideoPath.replace(/\.mp4$/i, ".quality.json"),
    path.join(path.dirname(localVideoPath), "quality-report.json")
  ];
  for (const sidecarPath of sidecarPaths) {
    try {
      const text = await readFile(sidecarPath, "utf8");
      const parsed = JSON.parse(String(text)) as unknown;
      if (isSafeQualityMetadata(parsed)) {
        return parsed;
      }
    } catch {
      // Try the next supported local metadata path.
    }
  }
  return {};
}

function isSafeQualityMetadata(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const serialized = JSON.stringify(value);
  return !/access_token|refresh_token|client_secret|Authorization|Bearer|https?:\/\//i.test(serialized);
}

function buildR2StorageKey(candidateId: string, fileName: string) {
  return [
    "real-products",
    toSafeSlug(candidateId),
    fileName.replace(/[^a-zA-Z0-9._-]/g, "-")
  ].join("/");
}

function buildProductAssetId(candidateId: string) {
  return `asset-real-product-${toSafeSlug(candidateId)}-video`;
}

function inferProductAssetBucket(assetRef: PreparedVideoAssetRef) {
  if (assetRef.provider === "r2") {
    return "r2-rendered-videos";
  }
  if (assetRef.provider === "supabase_storage") {
    return "supabase-storage";
  }
  return assetRef.provider;
}

function isProvided(value: unknown) {
  return value !== null && value !== undefined && !(typeof value === "string" && value.trim() === "");
}

function stripUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function pickEnv(env: NodeJS.ProcessEnv, ...names: string[]) {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) {
      return value;
    }
  }
  return "";
}

const R2_PROVIDER_ERROR_CODES: Readonly<Record<string, R2PutSafeErrorCode>> = {
  AccessDenied: "R2_ACCESS_DENIED",
  InvalidAccessKeyId: "R2_INVALID_ACCESS_KEY_ID",
  SignatureDoesNotMatch: "R2_SIGNATURE_DOES_NOT_MATCH",
  RequestTimeTooSkewed: "R2_REQUEST_TIME_TOO_SKEWED",
  NoSuchBucket: "R2_NO_SUCH_BUCKET",
  NoSuchKey: "R2_NO_SUCH_KEY",
  InvalidRequest: "R2_INVALID_REQUEST",
  RequestTimeout: "R2_REQUEST_TIMEOUT",
  SlowDown: "R2_RATE_LIMITED",
  InternalError: "R2_INTERNAL_ERROR",
  ServiceUnavailable: "R2_SERVICE_UNAVAILABLE"
};

async function resolveR2PutSafeErrorCode(response: Response): Promise<R2PutSafeErrorCode> {
  const providerCode = await readBoundedR2ProviderCode(response);
  if (providerCode && R2_PROVIDER_ERROR_CODES[providerCode]) {
    return R2_PROVIDER_ERROR_CODES[providerCode];
  }
  if (response.status === 401 || response.status === 403) {
    return "R2_PERMISSION_REJECTED";
  }
  if (response.status === 404) {
    return "R2_BUCKET_OR_OBJECT_NOT_FOUND";
  }
  if (response.status === 409) {
    return "R2_REQUEST_CONFLICT";
  }
  if (response.status === 429) {
    return "R2_RATE_LIMITED";
  }
  if (response.status >= 500) {
    return "R2_HTTP_SERVER_ERROR";
  }
  return "R2_HTTP_CLIENT_ERROR";
}

async function readBoundedR2ProviderCode(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Buffer[] = [];
  let byteLength = 0;
  const maxBytes = 8 * 1024;
  try {
    while (byteLength < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - byteLength;
      const chunk = Buffer.from(value).subarray(0, remaining);
      chunks.push(chunk);
      byteLength += chunk.byteLength;
      if (value.byteLength > remaining) break;
    }
  } catch {
    return null;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bodyPrefix = Buffer.concat(chunks).toString("utf8");
  const match = bodyPrefix.match(/<Code>\s*([A-Za-z][A-Za-z0-9]{0,63})\s*<\/Code>/i);
  return match?.[1] ?? null;
}

function buildR2PutDiagnostics(input: {
  requestAttempted: boolean;
  httpStatus: number | null;
  safeErrorCode: R2PutSafeErrorCode | null;
}): R2PutDiagnostics {
  return {
    provider: "r2",
    operation: "put_object",
    request_attempted: input.requestAttempted,
    http_status: input.httpStatus,
    safe_error_code: input.safeErrorCode,
    raw_response_body_printed: false,
    raw_request_url_printed: false,
    auth_header_value_printed: false,
    credentials_printed: false
  };
}

function toSafeSlug(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 96) || "candidate";
}

function encodeS3Path(value: string) {
  return value
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function encodePublicUrlPath(value: string) {
  return value
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function createAmzDates(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8)
  };
}

function sha256Hex(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function getSignatureKey(secretKey: string, dateStamp: string, regionName: string, serviceName: string) {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, regionName);
  const kService = hmac(kRegion, serviceName);
  return hmac(kService, "aws4_request");
}

function blockedResult(input: {
  error_code: OneProductServerAssetRegistrationErrorCode;
  message: string;
  blocked_reasons: string[];
  r2_uploaded?: boolean;
  orphan_object_possible?: boolean;
}): OneProductServerAssetRegistrationFailure {
  return {
    ok: false,
    error_code: input.error_code,
    message: input.message,
    blocked_reasons: input.blocked_reasons,
    r2_uploaded: input.r2_uploaded ?? false,
    db_written: false,
    rows_inserted_or_upserted: 0,
    ...(input.orphan_object_possible === undefined ? {} : { orphan_object_possible: input.orphan_object_possible })
  };
}
