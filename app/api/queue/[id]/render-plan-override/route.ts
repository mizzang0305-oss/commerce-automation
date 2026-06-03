import { NextResponse } from "next/server";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { buildStoryboardRenderPlan } from "@/lib/video/storyboardTemplatePlanner";
import {
  applyRenderPlanOverride,
  sanitizeRenderPlanOverrideInput,
  validateRenderPlanOverride,
  type RenderPlanOverrideValidationResult
} from "@/lib/video/renderPlanOverride";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const repository = getAutomationRepository();
    const item = await repository.getQueueItem(id);

    if (!item) {
      return errorResponse("QUEUE_ITEM_NOT_FOUND", "Queue item was not found.", 404);
    }

    const content = await repository.getGeneratedContentByQueueItem(id);
    if (!content) {
      return errorResponse("GENERATED_CONTENT_NOT_FOUND", "Generated content was not found.", 400);
    }

    const baseResult = buildStoryboardRenderPlan(item, content);
    if (!baseResult.ok) {
      return errorResponse("RENDER_PLAN_NOT_READY", "Render plan inputs are not ready.", 400, {
        missing_reasons: baseResult.missing_reasons
      });
    }

    const body = await request.json().catch(() => ({}));
    const override = sanitizeRenderPlanOverrideInput(body);
    const validation = validateRenderPlanOverride(override, baseResult.render_plan);
    if (!validation.ok) {
      return validationErrorResponse(validation);
    }

    const now = new Date().toISOString();
    const updated = await repository.upsertGeneratedContent({
      ...content,
      render_plan_override: override,
      render_plan_override_updated_at: now,
      render_plan_override_updated_by: override.updated_by ?? "",
      updated_at: now
    });
    const effectiveRenderPlan = applyRenderPlanOverride(baseResult.render_plan, override);

    return NextResponse.json({
      ok: true,
      message: "Render plan override saved.",
      render_plan_override: updated.render_plan_override,
      effective_render_plan: effectiveRenderPlan,
      warnings: validation.warnings,
      created_worker_jobs: 0
    });
  } catch (error) {
    console.error("[render-plan-override] save failed", sanitizeServerError(error));
    return errorResponse(
      "RENDER_PLAN_OVERRIDE_SAVE_FAILED",
      "Render plan override could not be saved.",
      500,
      { safe_error: "Check generated_contents render_plan_override migration and server logs." }
    );
  }
}

function validationErrorResponse(validation: Extract<RenderPlanOverrideValidationResult, { ok: false }>) {
  return errorResponse(validation.error_code, validation.message, 400, {
    safe_error: validation.safe_error,
    warnings: validation.warnings,
    created_worker_jobs: 0
  });
}

function errorResponse(
  errorCode: string,
  message: string,
  status: number,
  extra: Record<string, unknown> = {}
) {
  return NextResponse.json(
    {
      ok: false,
      error_code: errorCode,
      message,
      safe_error: typeof extra.safe_error === "string" ? extra.safe_error : message,
      created_worker_jobs: 0,
      ...extra
    },
    { status }
  );
}

function sanitizeServerError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const secretNamePattern = /[A-Z0-9_]*(?:SECRET|API_KEY|TOKEN)[A-Z0-9_]*/gi;
  const authHeaderPattern = new RegExp("Authori" + "zation", "gi");
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    message: message
      .replace(secretNamePattern, "[redacted-secret-name]")
      .replace(authHeaderPattern, "[redacted-header]")
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
  };
}
