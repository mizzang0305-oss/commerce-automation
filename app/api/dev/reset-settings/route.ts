import { NextResponse } from "next/server";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { denyDevRouteIfDisabled } from "@/lib/server/devRouteGuard";

export const dynamic = "force-dynamic";

export async function POST() {
  const denied = denyDevRouteIfDisabled();
  if (denied) {
    return denied;
  }

  const settings = await getAutomationRepository().resetSettings();
  return NextResponse.json({ ok: true, message: "설정을 기본값으로 복구했습니다.", settings });
}
