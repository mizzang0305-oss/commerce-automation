import { NextResponse } from "next/server";
import { buildYouTubeExecuteReadiness, youtubeUploadSafeSideEffects } from "@/lib/uploads/youtube";

export async function POST(request: Request) {
  const body = await parseBody(request);
  const readiness = buildYouTubeExecuteReadiness({
    confirmation: body.confirmation,
    smokeApproval: body.smoke_approval ?? body.smokeApproval
  });

  return NextResponse.json({
    ...readiness,
    side_effects: youtubeUploadSafeSideEffects
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
