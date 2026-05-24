import { NextResponse } from "next/server";
import type { GeneratedContent, ProductQueueItem } from "@/types/automation";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, message: "개발용 API는 production에서 실행할 수 없습니다." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const repository = getAutomationRepository();
  if (body.mode === "worker-smoke") {
    const { item, content } = createWorkerSmokeSeed();
    await repository.updateSettings({
      is_paused: false,
      python_worker_enabled: true,
      batch_size: 1,
      run_mode: "generate_only",
      youtube_upload_enabled: false,
      allowed_worker_job_types: ["video_render", "sheet_sync"]
    });
    await repository.upsertQueueItems([item]);
    await repository.upsertGeneratedContent(content);

    return NextResponse.json({
      ok: true,
      mode: "worker-smoke",
      message: "Worker smoke용 렌더 가능 상품을 생성했습니다.",
      item_id: item.id,
      item
    });
  }

  const mode = body.mode === "error-sample" || body.mode === "simulate-transition" ? body.mode : "default";
  const items = await repository.seedQueue(mode);

  return NextResponse.json({
    ok: true,
    message: "개발용 샘플 데이터가 갱신되었습니다.",
    count: items.length
  });
}

function createWorkerSmokeSeed(): { item: ProductQueueItem; content: GeneratedContent } {
  const now = new Date();
  const nowIso = now.toISOString();
  const scheduledAt = new Date(now.getTime() - 60_000).toISOString();
  const itemId = "queue-worker-smoke-001";
  const affiliateUrl = "https://link.coupang.com/a/worker-smoke";
  const imageUrl = "https://picsum.photos/seed/commerce-worker-smoke/1080/1920";
  const productName = "Worker Smoke Test Product";
  const disclosureText = "이 콘텐츠는 쿠팡 파트너스 활동의 일환으로 일정액의 수수료를 제공받을 수 있습니다.";
  const script = "worker smoke flow 검증용 영상 대본입니다. 상품 이미지, 제휴 링크, 고지 문구가 모두 있는 안전한 테스트 아이템입니다.";

  const item: ProductQueueItem = {
    id: itemId,
    queue_date: nowIso.slice(0, 10),
    queue_rank: 0,
    upload_slot: 1,
    scheduled_at: scheduledAt,
    keyword: "worker smoke",
    theme: "local e2e smoke",
    product_name: productName,
    category_path: "dev/smoke",
    price_now_text: "9,900원",
    thumbnail_url: imageUrl,
    raw_coupang_url: "https://www.coupang.com/vp/products/worker-smoke",
    selected_affiliate_url: affiliateUrl,
    product_score: 99,
    score_reason: "로컬 Worker E2E smoke flow 검증을 위한 렌더 가능 샘플입니다.",
    video_angle: "worker smoke flow 검증",
    queue_status: "scheduled",
    video_url: "",
    video_snapshot_url: "",
    blog_draft_url: "",
    youtube_upload_status: "not_ready",
    tiktok_upload_status: "not_ready",
    threads_post_status: "not_ready",
    manual_review_status: "not_ready",
    error_message: "",
    created_at: nowIso,
    updated_at: nowIso
  };

  const content: GeneratedContent = {
    id: `content-${itemId}`,
    product_queue_id: itemId,
    raw_coupang_url: item.raw_coupang_url,
    product_name: productName,
    selected_affiliate_url: affiliateUrl,
    video_title: "Worker smoke flow test",
    video_script: script,
    caption_1: "worker smoke",
    caption_2: "local storage artifact",
    caption_3: "manual review only",
    threads_text: "",
    blog_title: "",
    blog_body: "",
    hashtags: "#workerSmoke #localTest",
    youtube_description: `${productName}\n\n${disclosureText}`,
    tiktok_caption: "",
    disclosure_text: disclosureText,
    content_source: "fallback",
    creatomate_render_id: "",
    video_url: "",
    video_snapshot_url: "",
    video_status: "not_started",
    blog_draft_url: "",
    blog_draft_status: "not_started",
    created_at: nowIso,
    updated_at: nowIso
  };

  return { item, content };
}
