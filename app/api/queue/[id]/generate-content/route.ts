import { NextResponse } from "next/server";
import type { ProductQueueItem } from "@/types/automation";
import { buildDraftGeneratedContent } from "@/lib/content/contentTemplate";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const restoreScheduled = Boolean((body as { restore_scheduled?: unknown }).restore_scheduled);
  const repository = getAutomationRepository();
  const item = await repository.getQueueItem(id);

  if (!item) {
    return NextResponse.json(
      { ok: false, message: "상품 큐 항목을 찾을 수 없습니다.", created_worker_jobs: 0 },
      { status: 404 }
    );
  }

  const guard = validateContentGenerationItem(item);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, message: guard.message, created_worker_jobs: 0 }, { status: guard.status });
  }

  const now = new Date().toISOString();
  const existingContent = await repository.getGeneratedContentByQueueItem(id);
  const content = await repository.upsertGeneratedContent(
    buildDraftGeneratedContent(item, existingContent, now)
  );
  const restoredScheduled =
    restoreScheduled && item.queue_status === "manual_review" && canRestoreScheduledAfterDraft(item.error_message);
  const updatedItem = restoredScheduled
    ? await repository.updateQueueItemById(item.id, {
        queue_status: "scheduled",
        error_message: "",
        updated_at: now
      })
    : item;

  return NextResponse.json({
    ok: true,
    message: restoredScheduled
      ? "콘텐츠 초안을 생성하고 상품을 예약 상태로 되돌렸습니다. worker job은 생성하지 않았습니다."
      : "콘텐츠 초안을 생성했습니다. worker job은 생성하지 않았습니다.",
    item: updatedItem ?? item,
    content,
    restored_scheduled: restoredScheduled,
    created_worker_jobs: 0
  });
}

function validateContentGenerationItem(
  item: ProductQueueItem
): { ok: true; status?: never; message?: never } | { ok: false; status: number; message: string } {
  if (!item.product_name.trim()) {
    return { ok: false, status: 400, message: "상품명이 없어 콘텐츠 초안을 생성할 수 없습니다." };
  }
  if (!item.selected_affiliate_url.trim()) {
    return { ok: false, status: 400, message: "제휴 링크가 없어 콘텐츠 초안을 생성할 수 없습니다." };
  }
  if (!item.thumbnail_url.trim()) {
    return { ok: false, status: 400, message: "썸네일 URL이 없어 video_render 가능한 콘텐츠 초안을 생성할 수 없습니다." };
  }
  return { ok: true };
}

function canRestoreScheduledAfterDraft(errorMessage: string) {
  return /대본|script|콘텐츠|content|제휴 고지|disclosure/i.test(errorMessage);
}
