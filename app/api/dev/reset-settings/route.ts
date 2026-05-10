import { NextResponse } from "next/server";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, message: "개발용 API는 production에서 실행할 수 없습니다." }, { status: 403 });
  }

  const settings = await getAutomationRepository().resetSettings();
  return NextResponse.json({ ok: true, message: "설정을 기본값으로 복구했습니다.", settings });
}
