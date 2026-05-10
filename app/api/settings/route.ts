import { NextResponse } from "next/server";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { SettingsValidationError } from "@/lib/repositories/mockAutomationRepository";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getAutomationRepository().getSettings();
  return NextResponse.json({ settings });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const settings = await getAutomationRepository().updateSettings(body);
    return NextResponse.json({ settings, message: "설정이 저장되었습니다." });
  } catch (error) {
    if (error instanceof SettingsValidationError) {
      return NextResponse.json(
        { ok: false, message: error.message, field: error.field },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { ok: false, message: "설정 저장 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
