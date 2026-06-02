import { NextResponse } from "next/server";
import type { GeneratedContent, ProductQueueItem } from "@/types/automation";
import { buildDraftGeneratedContent } from "@/lib/content/contentTemplate";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  await request.json().catch(() => ({}));
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
    return NextResponse.json(
      { ok: false, message: guard.message, missing_reasons: [guard.message], created_worker_jobs: 0 },
      { status: guard.status }
    );
  }

  const now = new Date().toISOString();
  const existingContent = await repository.getGeneratedContentByQueueItem(id);
  const content = await repository.upsertGeneratedContent(
    buildDraftGeneratedContent(item, existingContent, now)
  );
  const restoreReadiness = evaluateScheduledRestoreReadiness(item, content);
  const restoredScheduled = restoreReadiness.canRestore;
  const updatedItem = restoredScheduled
    ? await repository.updateQueueItemById(item.id, {
        queue_status: "scheduled",
        manual_review_status: "not_ready",
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
    missing_reasons: restoreReadiness.missingReasons,
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

export function evaluateScheduledRestoreReadiness(item: ProductQueueItem, content: GeneratedContent) {
  const missingReasons: string[] = [];

  if (!["manual_review", "error"].includes(item.queue_status)) {
    return { canRestore: false, missingReasons };
  }

  if (!isRecoverableContentReviewReason(item.error_message)) {
    missingReasons.push("manual_review 사유가 콘텐츠 초안 생성으로 해결 가능한 항목이 아닙니다.");
  }
  if (!item.selected_affiliate_url.trim()) {
    missingReasons.push("제휴 링크가 없어 예약 상태로 복구할 수 없습니다.");
  }
  if (!item.thumbnail_url.trim()) {
    missingReasons.push("썸네일 URL이 없어 예약 상태로 복구할 수 없습니다.");
  }
  if (!content.disclosure_text.trim()) {
    missingReasons.push("제휴 고지 문구가 없어 예약 상태로 복구할 수 없습니다.");
  }
  if (!content.video_script.trim()) {
    missingReasons.push("영상 대본이 없어 예약 상태로 복구할 수 없습니다.");
  }

  return { canRestore: missingReasons.length === 0, missingReasons };
}

function isRecoverableContentReviewReason(errorMessage: string) {
  const normalized = errorMessage.trim();
  if (!normalized) {
    return false;
  }
  if (/제휴\s*링크|affiliate|selected_affiliate_url|썸네일|thumbnail|상품\s*이미지|image_url/i.test(normalized)) {
    return false;
  }
  return /영상\s*대본|대본|video_script|script|콘텐츠|content|제휴\s*고지|disclosure/i.test(normalized);
}
