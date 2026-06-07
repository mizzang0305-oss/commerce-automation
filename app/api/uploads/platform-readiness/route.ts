import { NextResponse } from "next/server";
import {
  buildPlatformUploadReadiness,
  createDefaultPlatformUploadSettings,
  platformUploadSafeSideEffects
} from "@/lib/uploads";

export async function GET() {
  const settings = createDefaultPlatformUploadSettings();
  return NextResponse.json({
    ok: true,
    settings,
    readiness: buildPlatformUploadReadiness(settings),
    side_effects: platformUploadSafeSideEffects
  });
}
