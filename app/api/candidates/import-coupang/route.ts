import { NextResponse } from "next/server";
import {
  buildCoupangCandidate,
  CoupangCandidateImportError,
  type CoupangCandidateInput
} from "@/lib/coupang/coupangCandidateImport";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const repository = getAutomationRepository();

  try {
    const [initialQueue, initialJobs, candidates, queueItems, productionHistory] = await Promise.all([
      repository.getQueue(),
      repository.getWorkerJobs(),
      repository.getProductCandidates(),
      repository.getQueue(),
      repository.getProductionHistory()
    ]);
    const result = buildCoupangCandidate(toCandidateInput(body), {
      candidates,
      queueItems,
      productionHistory
    });
    const [candidate] = await repository.upsertProductCandidates([result.candidate]);
    const [finalQueue, finalJobs] = await Promise.all([
      repository.getQueue(),
      repository.getWorkerJobs()
    ]);

    return NextResponse.json({
      ok: true,
      candidate: candidate ?? result.candidate,
      readiness: result.readiness,
      queue_items_created: Math.max(0, finalQueue.length - initialQueue.length),
      worker_jobs_created: Math.max(0, finalJobs.length - initialJobs.length)
    });
  } catch (error) {
    if (error instanceof CoupangCandidateImportError) {
      return NextResponse.json(
        {
          ok: false,
          error_code: error.error_code,
          message: error.message
        },
        { status: error.status }
      );
    }

    console.error("[candidates/import-coupang] failed", {
      message: error instanceof Error ? error.message : "Unknown error"
    });
    return NextResponse.json(
      {
        ok: false,
        error_code: "CANDIDATE_IMPORT_FAILED",
        message: "쿠팡 후보 생성 중 오류가 발생했습니다."
      },
      { status: 500 }
    );
  }
}

function toCandidateInput(body: unknown): CoupangCandidateInput {
  const record = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  return {
    product_name: record.product_name,
    raw_coupang_url: record.raw_coupang_url,
    selected_affiliate_url: record.selected_affiliate_url,
    thumbnail_url: record.thumbnail_url,
    price_now_text: record.price_now_text,
    category_path: record.category_path,
    source_type: record.source_type,
    item_id: record.item_id,
    itemId: record.itemId,
    vendor_item_id: record.vendor_item_id,
    vendorItemId: record.vendorItemId,
    source: "coupang_manual"
  };
}
