import { NextResponse } from "next/server";
import { listArtifactQaSummaries } from "@/lib/artifacts/artifactQa";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await listArtifactQaSummaries(getAutomationRepository());
  return NextResponse.json({ ok: true, ...result });
}
