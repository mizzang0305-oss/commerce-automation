import { NextResponse } from "next/server";
import type { ProductQueueItem } from "@/types/automation";
import { generateContentWithProvider } from "@/lib/content/aiContentProvider";
import { buildDraftGeneratedContent, contentSourceForProvider } from "@/lib/content/contentTemplate";
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
  const providerResult = await generateContentWithProvider({
    queue_item: item,
    existing_content: existingContent
  });
  const content = await repository.upsertGeneratedContent(
    buildDraftGeneratedContent(item, existingContent, now, {
      video_title: providerResult.video_title,
      video_script: providerResult.video_script,
      caption_1: providerResult.caption_1,
      caption_2: providerResult.caption_2,
      caption_3: providerResult.caption_3,
      threads_text: providerResult.threads_text,
      blog_title: providerResult.blog_title,
      blog_body: providerResult.blog_body,
      youtube_description: providerResult.youtube_description,
      tiktok_caption: providerResult.tiktok_caption,
      hashtags: providerResult.hashtags,
      disclosure_text: providerResult.disclosure_text,
      content_source: contentSourceForProvider(providerResult.provider)
    })
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
    content_provider: providerResult.provider,
    requested_provider: providerResult.requested_provider,
    used_fallback: providerResult.used_fallback,
    provider_configured: providerResult.provider_configured,
    safety_warnings: providerResult.safety_warnings,
    safe_message: providerResult.safe_message,
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
    return { ok: false, status: 400, message: "상품 이미지 URL이 없어 video_render 가능한 콘텐츠 초안을 생성할 수 없습니다." };
  }
  return { ok: true };
}

function canRestoreScheduledAfterDraft(errorMessage: string) {
  return /대본|script|콘텐츠|content|제휴 고지|disclosure/i.test(errorMessage);
}
