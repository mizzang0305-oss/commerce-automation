import { NextResponse } from "next/server";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { denyDevRouteIfDisabled } from "@/lib/server/devRouteGuard";

export const dynamic = "force-dynamic";

export async function POST() {
  const denied = denyDevRouteIfDisabled();
  if (denied) {
    return denied;
  }

  const repository = getAutomationRepository();
  if (repository.resetStorage) {
    await repository.resetStorage();
  } else {
    await repository.resetSettings();
    await repository.seedQueue("default");
  }

  return NextResponse.json({ ok: true, message: "Local JSON 저장소를 초기화했습니다." });
}
