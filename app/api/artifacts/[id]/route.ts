import { NextResponse } from "next/server";
import { getArtifactQaDetail } from "@/lib/artifacts/artifactQa";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const detail = await getArtifactQaDetail(getAutomationRepository(), id);
  if (!detail) {
    return NextResponse.json({ ok: false, message: "Artifact를 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...detail });
}
