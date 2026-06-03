import { NextResponse } from "next/server";
import { buildChannelUploadPackage } from "@/lib/channels/uploadPackage";
import { routeQueueItemToChannel } from "@/lib/channels/channelRouting";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import type { ProductAsset } from "@/types/automation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type BuildUploadPackageBody = {
  channel_profile_id?: unknown;
};

type SafeErrorCode =
  | "QUEUE_ITEM_NOT_FOUND"
  | "QUEUE_NOT_VIDEO_READY"
  | "MISSING_VIDEO_URL"
  | "MISSING_AFFILIATE_URL"
  | "MISSING_CHANNEL_PROFILE_ID"
  | "CHANNEL_PROFILE_NOT_FOUND"
  | "GENERATED_CONTENT_NOT_FOUND"
  | "MISSING_DISCLOSURE_TEXT"
  | "MISSING_PRODUCT_ASSETS"
  | "CHANNEL_UPLOAD_PACKAGE_SCHEMA_ERROR"
  | "CHANNEL_UPLOAD_PACKAGE_CONFLICT"
  | "BUILD_UPLOAD_PACKAGE_FAILED";

type SafeErrorPayload = {
  ok: false;
  error_code: SafeErrorCode;
  message: string;
  safe_error: string;
  missing_reasons: string[];
  created_worker_jobs: 0;
};

const GENERIC_ERROR_MESSAGE = "채널 업로드 패키지 생성 중 오류가 발생했습니다.";
const REQUIRED_PRODUCT_ASSETS: ProductAsset["asset_type"][] = [
  "video",
  "thumbnail",
  "subtitle",
  "upload_package"
];

export async function POST(request: Request, context: RouteContext) {
  try {
    return await buildUploadPackageResponse(request, context);
  } catch (error) {
    const { status, payload, log } = mapBuildUploadPackageError(error);
    console.error("[build-upload-package] failed", log);
    return NextResponse.json(payload, { status });
  }
}

async function buildUploadPackageResponse(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await readJsonBody(request);
  const preferredChannelId = typeof body.channel_profile_id === "string" ? body.channel_profile_id.trim() : "";
  const repository = getAutomationRepository();
  const [item, content, assets] = await Promise.all([
    repository.getQueueItem(id),
    repository.getGeneratedContentByQueueItem(id),
    repository.getProductAssets(id)
  ]);

  if (!item) {
    return errorResponse("QUEUE_ITEM_NOT_FOUND", 404, "상품 큐 항목을 찾을 수 없습니다.", [
      "product_queue_item"
    ]);
  }

  if (item.queue_status !== "video_ready") {
    return errorResponse("QUEUE_NOT_VIDEO_READY", 400, "video_ready 상태의 상품만 업로드 패키지를 만들 수 있습니다.", [
      "queue_status_video_ready"
    ]);
  }

  if (!item.video_url.trim()) {
    return errorResponse("MISSING_VIDEO_URL", 400, "video_url이 없어 업로드 패키지를 만들 수 없습니다.", [
      "video_url"
    ]);
  }

  if (!item.selected_affiliate_url.trim()) {
    return errorResponse("MISSING_AFFILIATE_URL", 400, "제휴 링크가 없어 업로드 패키지를 만들 수 없습니다.", [
      "selected_affiliate_url"
    ]);
  }

  if (!preferredChannelId) {
    return errorResponse("MISSING_CHANNEL_PROFILE_ID", 400, "채널 프로필을 선택해야 합니다.", [
      "channel_profile_id"
    ]);
  }

  const channels = await repository.getChannelProfiles();
  const channel = routeQueueItemToChannel(item, channels, preferredChannelId);
  if (!channel) {
    return errorResponse(
      "CHANNEL_PROFILE_NOT_FOUND",
      404,
      "채널 프로필을 찾을 수 없거나 수동 업로드 전용 채널이 아닙니다.",
      ["channel_profile"]
    );
  }

  if (!content) {
    return errorResponse("GENERATED_CONTENT_NOT_FOUND", 400, "생성 콘텐츠가 없어 업로드 패키지를 만들 수 없습니다.", [
      "generated_contents"
    ]);
  }

  if (!content.disclosure_text.trim()) {
    return errorResponse("MISSING_DISCLOSURE_TEXT", 400, "제휴 고지 문구가 없어 업로드 패키지를 만들 수 없습니다.", [
      "disclosure_text"
    ]);
  }

  const missingAssetTypes = getMissingRequiredAssetTypes(assets);
  if (missingAssetTypes.length > 0) {
    return errorResponse("MISSING_PRODUCT_ASSETS", 400, "필수 산출물 파일이 없어 업로드 패키지를 만들 수 없습니다.", [
      "product_assets",
      ...missingAssetTypes.map((assetType) => `product_asset:${assetType}`)
    ]);
  }

  const result = buildChannelUploadPackage({ item, content, assets, channel });
  if (!result.ok) {
    return errorResponse(
      mapBuildFailureReasonToErrorCode(result.missing_reasons[0]),
      result.status,
      result.message,
      result.missing_reasons
    );
  }

  const savedPackage = await repository.upsertChannelUploadPackage(result.package);

  return NextResponse.json({
    ok: true,
    message: "채널 업로드 패키지를 생성했습니다. 실제 업로드 API는 호출하지 않았습니다.",
    package: savedPackage,
    checklist: result.checklist,
    created_worker_jobs: 0
  });
}

function errorResponse(errorCode: SafeErrorCode, status: number, safeError: string, missingReasons: string[]) {
  return NextResponse.json(buildSafeErrorPayload(errorCode, safeError, missingReasons), { status });
}

function buildSafeErrorPayload(
  errorCode: SafeErrorCode,
  safeError: string,
  missingReasons: string[] = []
): SafeErrorPayload {
  return {
    ok: false,
    error_code: errorCode,
    message: GENERIC_ERROR_MESSAGE,
    safe_error: sanitizeForClient(safeError),
    missing_reasons: missingReasons,
    created_worker_jobs: 0
  };
}

function getMissingRequiredAssetTypes(assets: ProductAsset[]) {
  return REQUIRED_PRODUCT_ASSETS.filter(
    (assetType) => !assets.some((asset) => asset.asset_type === assetType && asset.url.trim())
  );
}

function mapBuildFailureReasonToErrorCode(reason: string | undefined): SafeErrorCode {
  if (reason === "queue_status_video_ready") {
    return "QUEUE_NOT_VIDEO_READY";
  }
  if (reason === "video_url") {
    return "MISSING_VIDEO_URL";
  }
  if (reason === "selected_affiliate_url") {
    return "MISSING_AFFILIATE_URL";
  }
  if (reason === "generated_contents") {
    return "GENERATED_CONTENT_NOT_FOUND";
  }
  if (reason === "disclosure_text") {
    return "MISSING_DISCLOSURE_TEXT";
  }
  return "BUILD_UPLOAD_PACKAGE_FAILED";
}

function mapBuildUploadPackageError(error: unknown): {
  status: number;
  payload: SafeErrorPayload;
  log: Record<string, string | string[] | number>;
} {
  const supabaseError = getSupabaseError(error);
  const supabaseCode = supabaseError?.code ?? "";
  const supabaseMessage = supabaseError?.message ?? getErrorMessage(error);
  const supabaseDetail = supabaseError?.detail ?? supabaseError?.details ?? "";
  const supabaseHint = supabaseError?.hint ?? "";
  const safeSummary = mapSupabaseErrorToSafeSummary(supabaseCode, [
    supabaseMessage,
    supabaseDetail,
    supabaseHint
  ].join(" "));

  const payload = buildSafeErrorPayload(safeSummary.errorCode, safeSummary.safeError, [
    "channel_upload_package"
  ]);

  return {
    status: safeSummary.status,
    payload,
    log: {
      error_code: payload.error_code,
      status: safeSummary.status,
      supabase_code: sanitizeForLog(supabaseCode),
      supabase_message: sanitizeForLog(supabaseMessage),
      supabase_detail: sanitizeForLog(supabaseDetail),
      supabase_hint: sanitizeForLog(supabaseHint)
    }
  };
}

function mapSupabaseErrorToSafeSummary(
  code: string,
  combinedMessage: string
): { status: number; errorCode: SafeErrorCode; safeError: string } {
  const normalizedMessage = combinedMessage.toLowerCase();
  if (code === "23505") {
    return {
      status: 409,
      errorCode: "CHANNEL_UPLOAD_PACKAGE_CONFLICT",
      safeError: "이미 생성된 채널 업로드 패키지가 있는지 확인하세요."
    };
  }

  if (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST204" ||
    normalizedMessage.includes("no unique or exclusion constraint") ||
    normalizedMessage.includes("on conflict")
  ) {
    return {
      status: 500,
      errorCode: "CHANNEL_UPLOAD_PACKAGE_SCHEMA_ERROR",
      safeError: normalizedMessage.includes("no unique or exclusion constraint")
        ? "channel_upload_packages id primary key 또는 unique constraint를 확인하세요."
        : "channel_upload_packages 스키마 또는 PostgREST schema cache를 확인하세요."
    };
  }

  return {
    status: 500,
    errorCode: "BUILD_UPLOAD_PACKAGE_FAILED",
    safeError: "채널 업로드 패키지 저장 중 서버 오류가 발생했습니다."
  };
}

function getSupabaseError(error: unknown): {
  code?: string;
  message?: string;
  detail?: string | null;
  details?: string | null;
  hint?: string | null;
} | null {
  if (!error || typeof error !== "object") {
    return null;
  }
  const value = error as { supabaseError?: unknown };
  if (!value.supabaseError || typeof value.supabaseError !== "object") {
    return null;
  }
  return value.supabaseError as {
    code?: string;
    message?: string;
    detail?: string | null;
    details?: string | null;
    hint?: string | null;
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : "Unknown error";
}

function sanitizeForClient(value: string) {
  return sanitizeForLog(value);
}

function sanitizeForLog(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value
    .replace(/SUPABASE_SERVICE_ROLE_KEY/gi, "[redacted-secret-name]")
    .replace(/WORKER_API_SECRET/gi, "[redacted-secret-name]")
    .replace(/R2_SECRET/gi, "[redacted-secret-name]")
    .replace(/S3_SECRET_ACCESS_KEY/gi, "[redacted-secret-name]")
    .replace(/Authorization/gi, "[redacted-header]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/secret/gi, "[redacted]");
}

async function readJsonBody(request: Request): Promise<BuildUploadPackageBody> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body as BuildUploadPackageBody : {};
  } catch {
    return {};
  }
}
