import { NextResponse } from "next/server";
import {
  buildLocalImageGenerationPackage,
  localImageGenerationPackageSideEffects
} from "@/lib/image-generation-bridge/buildLocalImageGenerationPackage";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const repository = getAutomationRepository();
  const candidate = await repository.getProductCandidate(id);

  if (!candidate) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "CANDIDATE_NOT_FOUND",
        message: "Candidate product was not found.",
        side_effects: { ...localImageGenerationPackageSideEffects },
        approval_required: true
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    package: buildLocalImageGenerationPackage(candidate)
  });
}
