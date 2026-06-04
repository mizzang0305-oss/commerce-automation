import { NextResponse } from "next/server";
import { bulkUpdateArtifactQaStatus } from "@/lib/artifacts/artifactQa";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const result = await bulkUpdateArtifactQaStatus(getAutomationRepository(), body);
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error_code: result.error_code,
        message: result.message,
        upload_triggered: false,
        worker_jobs_created: false,
        queue_auto_uploaded_or_posted: false
      },
      { status: result.status }
    );
  }
  return NextResponse.json(result);
}
