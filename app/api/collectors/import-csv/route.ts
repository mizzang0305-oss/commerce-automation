import { NextResponse } from "next/server";
import { parseCandidateCsv } from "@/lib/collectors/candidateImport";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { denyDevRouteIfDisabled } from "@/lib/server/devRouteGuard";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = denyDevRouteIfDisabled();
  if (denied) {
    return denied;
  }

  const body = await request.json().catch(() => ({}));
  const csv = typeof body.csv === "string" ? body.csv : "";
  const source = typeof body.source === "string" && body.source.trim() ? body.source.trim() : "manual_csv";
  if (!csv.trim()) {
    return NextResponse.json(
      { ok: false, message: "가져올 CSV 내용이 비어 있습니다." },
      { status: 400 }
    );
  }

  const result = parseCandidateCsv(csv, { source });
  if (result.candidates.length > 0) {
    await getAutomationRepository().upsertProductCandidates(result.candidates);
  }

  return NextResponse.json({
    ok: result.errors.length === 0,
    imported_count: result.candidates.length,
    error_count: result.errors.length,
    errors: result.errors,
    candidate_ids: result.candidates.map((candidate) => candidate.id)
  });
}
