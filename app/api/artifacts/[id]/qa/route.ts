import { NextResponse } from "next/server";
import { updateArtifactQaStatus } from "@/lib/artifacts/artifactQa";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const result = await updateArtifactQaStatus(getAutomationRepository(), id, body);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error_code: result.error_code, message: result.message }, { status: result.status });
  }
  return NextResponse.json(result);
}
