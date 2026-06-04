import { NextResponse } from "next/server";
import { listArtifactQaSummaries, parseArtifactQaFilters } from "@/lib/artifacts/artifactQa";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export async function GET(request?: Request) {
  const filters = request ? parseArtifactQaFilters(new URL(request.url).searchParams) : undefined;
  const result = await listArtifactQaSummaries(getAutomationRepository(), filters);
  return NextResponse.json({ ok: true, ...result });
}
