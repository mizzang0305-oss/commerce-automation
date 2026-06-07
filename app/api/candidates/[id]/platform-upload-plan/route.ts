import { NextResponse } from "next/server";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { buildPlatformUploadJobPlan, platformUploadSafeSideEffects } from "@/lib/uploads";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const repository = getAutomationRepository();
  const candidate = await repository.getProductCandidate(id);

  if (!candidate) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "CANDIDATE_NOT_FOUND",
        message: "Candidate was not found.",
        side_effects: platformUploadSafeSideEffects
      },
      { status: 404 }
    );
  }

  const body = await parseBody(request);
  const result = buildPlatformUploadJobPlan({ candidate, ...body });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "PLATFORM_UPLOAD_PLAN_NOT_READY",
        message: "Platform upload plan cannot be created until required manual upload inputs are present.",
        missing_reasons: result.missing_reasons,
        side_effects: platformUploadSafeSideEffects,
        approval_required: true
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    plan: result.plan,
    side_effects: platformUploadSafeSideEffects
  });
}

async function parseBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
