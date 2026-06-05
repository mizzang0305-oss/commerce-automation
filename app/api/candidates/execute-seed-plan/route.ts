import { NextResponse } from "next/server";
import { buildCandidateOnlySeedExecution } from "@/lib/candidates/candidateOnlySeedExecution";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const repository = getAutomationRepository();
  const result = await buildCandidateOnlySeedExecution(repository, body);

  return NextResponse.json(result, { status: result.status });
}
