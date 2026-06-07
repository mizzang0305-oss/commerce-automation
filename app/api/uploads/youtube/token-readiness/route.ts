import { NextResponse } from "next/server";
import { buildYouTubeLocalTokenProviderStatus, youtubeUploadSafeSideEffects } from "@/lib/uploads/youtube";

export async function GET() {
  return NextResponse.json({
    ok: true,
    token_readiness: buildYouTubeLocalTokenProviderStatus(),
    raw_token_exposed: false,
    side_effects: youtubeUploadSafeSideEffects
  });
}
