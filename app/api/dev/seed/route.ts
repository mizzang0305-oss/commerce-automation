import { NextResponse } from "next/server";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, message: "개발용 API는 production에서 실행할 수 없습니다." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const mode = body.mode === "error-sample" || body.mode === "simulate-transition" ? body.mode : "default";
  const items = await getAutomationRepository().seedQueue(mode);

  return NextResponse.json({
    ok: true,
    message: "개발용 샘플 데이터가 갱신되었습니다.",
    count: items.length
  });
}
