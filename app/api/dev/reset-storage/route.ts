import { NextResponse } from "next/server";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, message: "개발용 API는 production에서 실행할 수 없습니다." }, { status: 403 });
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
