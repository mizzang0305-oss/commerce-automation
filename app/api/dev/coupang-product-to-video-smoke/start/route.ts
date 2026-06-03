import { NextResponse } from "next/server";
import {
  buildDefaultCoupangSmokeInput,
  startCoupangProductToVideoSmoke,
  type CoupangSmokeError
} from "@/lib/dev/coupangProductToVideoSmoke";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { denyDevRouteIfDisabled } from "@/lib/server/devRouteGuard";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = denyDevRouteIfDisabled();
  if (denied) {
    return denied;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const result = await startCoupangProductToVideoSmoke(getAutomationRepository(), {
      ...buildDefaultCoupangSmokeInput(),
      ...(typeof body === "object" && body !== null ? body : {})
    });

    return NextResponse.json({
      ok: true,
      step: "start",
      message: "쿠팡 상품 후보를 생성했습니다. 큐와 worker job은 아직 생성하지 않았습니다.",
      candidate_id: result.candidate.id,
      product_key: result.candidate.product_key ?? "",
      readiness: result.readiness,
      queue_items_created: result.queue_items_created,
      worker_jobs_created: result.worker_jobs_created,
      status: result.status,
      safety: {
        public_upload_enabled: false,
        youtube_upload_enabled: false,
        worker_jobs_created_by_import: result.worker_jobs_created
      }
    });
  } catch (error) {
    return smokeErrorResponse(error);
  }
}

function smokeErrorResponse(error: unknown) {
  const smokeError = error as Partial<CoupangSmokeError>;
  const status = typeof smokeError.status === "number" ? smokeError.status : 500;
  const errorCode = typeof smokeError.error_code === "string" ? smokeError.error_code : "COUPANG_SMOKE_START_FAILED";
  return NextResponse.json(
    {
      ok: false,
      step: "start",
      error_code: errorCode,
      message: "쿠팡 상품 영상 스모크 시작 중 오류가 발생했습니다.",
      safe_error: sanitizeSafeError(error instanceof Error ? error.message : String(error)),
      created_worker_jobs: 0
    },
    { status }
  );
}

function sanitizeSafeError(value: string) {
  return value
    .replace(/SUPABASE_SERVICE_ROLE_KEY|WORKER_API_SECRET|COUPANG_SECRET_KEY|OPENAI_API_KEY|GEMINI_API_KEY|R2_SECRET_ACCESS_KEY|R2_SECRET/gi, "[redacted-secret-name]")
    .replace(/Authorization/gi, "[redacted-header]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]");
}
