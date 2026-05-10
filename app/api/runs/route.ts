import { NextResponse } from "next/server";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export async function GET() {
  const runs = await getAutomationRepository().getRuns();
  return NextResponse.json({ runs });
}
