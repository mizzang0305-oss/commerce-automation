import { NextResponse } from "next/server";
import {
  CoupangSmokeError,
  promoteCoupangProductToVideoSmoke
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
    const candidateId = typeof body.candidate_id === "string" ? body.candidate_id : "";
    const result = await promoteCoupangProductToVideoSmoke(getAutomationRepository(), candidateId);

    return NextResponse.json({
      ok: true,
      step: "promote",
      message: "후보를 상품 큐로 승격했습니다. worker job은 생성하지 않았습니다.",
      candidate_id: result.candidate.id,
      queue_id: result.queue_item.id,
      queue_item: result.queue_item,
      content: result.content,
      warnings: result.warnings,
      created_worker_jobs: result.created_worker_jobs,
      status: result.status
    });
  } catch (error) {
    return smokeErrorResponse("promote", error);
  }
}

function smokeErrorResponse(step: string, error: unknown) {
  const status = error instanceof CoupangSmokeError ? error.status : 500;
  const errorCode = error instanceof CoupangSmokeError ? error.error_code : "COUPANG_SMOKE_PROMOTE_FAILED";
  return NextResponse.json(
    {
      ok: false,
      step,
      error_code: errorCode,
      message: "후보 승격 중 오류가 발생했습니다.",
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
