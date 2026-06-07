import { NextResponse } from "next/server";
import { buildYouTubeUploadReadiness, youtubeUploadSafeSideEffects } from "@/lib/uploads/youtube";

export async function GET() {
  return NextResponse.json({
    ok: true,
    readiness: buildYouTubeUploadReadiness(),
    secrets_exposed: false,
    side_effects: youtubeUploadSafeSideEffects
  });
}
