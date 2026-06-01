import { NextResponse } from "next/server";
import type { GeneratedContent, ProductCandidate, ProductQueueItem } from "@/types/automation";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { denyDevRouteIfDisabled } from "@/lib/server/devRouteGuard";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = denyDevRouteIfDisabled();
  if (denied) {
    return denied;
  }

  const body = await request.json().catch(() => ({}));
  const requestedMode = getRequestedMode(body);

  try {
    return await createDevSeedResponse(requestedMode);
  } catch (error) {
    const safeError = summarizeDevSeedError(error);
    console.error("Dev seed failed", {
      mode: requestedMode,
      safe_error: safeError,
      stack: sanitizeSecretText(error instanceof Error ? error.stack ?? error.message : String(error))
    });

    return NextResponse.json(
      {
        ok: false,
        mode: requestedMode,
        message: "개발용 seed 생성 중 오류가 발생했습니다.",
        error_code: "DEV_SEED_FAILED",
        safe_error: safeError
      },
      { status: 500 }
    );
  }
}

async function createDevSeedResponse(requestedMode: string) {
  const repository = getAutomationRepository();
  if (requestedMode === "worker-smoke") {
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

  if (requestedMode === "candidate-video-smoke") {
    const candidate = createCandidateVideoSmokeSeed();
    await repository.updateSettings({
      is_paused: false,
      python_worker_enabled: true,
      batch_size: 1,
      run_mode: "generate_only",
      youtube_upload_enabled: false,
      approval_required: true,
      allowed_worker_job_types: ["video_render", "sheet_sync"]
    });
    await repository.upsertProductCandidates([candidate]);

    return NextResponse.json({
      ok: true,
      mode: "candidate-video-smoke",
      message: "candidate-to-video smoke 검증용 후보를 생성했습니다.",
      candidate_id: candidate.id,
      next_steps: [
        "후보 검수 화면에서 큐로 승격합니다.",
        "큐 상세에서 콘텐츠 초안을 생성합니다.",
        "다음 배치를 실행해 worker job을 생성합니다.",
        "Python Worker를 실행해 R2 artifact와 video_ready를 확인합니다."
      ],
      safety: {
        worker_jobs_created: 0,
        public_upload_enabled: false,
        youtube_upload_enabled: false
      }
    });
  }

  const mode = requestedMode === "error-sample" || requestedMode === "simulate-transition" ? requestedMode : "default";
  const items = await repository.seedQueue(mode);

  return NextResponse.json({
    ok: true,
    message: "개발용 샘플 데이터가 갱신되었습니다.",
    count: items.length
  });
}

function getRequestedMode(body: unknown) {
  if (!body || typeof body !== "object" || !("mode" in body)) {
    return "default";
  }
  const mode = (body as { mode?: unknown }).mode;
  return typeof mode === "string" && mode.trim() ? mode.trim() : "default";
}

function summarizeDevSeedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/upsertProductCandidates|product_candidates/i.test(message)) {
    return "product_candidates 저장 중 오류가 발생했습니다. Supabase migration 002 적용 여부와 PostgREST schema cache를 확인하세요.";
  }
  if (/updateSettings/i.test(message)) {
    return "automation_settings 갱신 중 오류가 발생했습니다. Supabase migration 적용 상태를 확인하세요.";
  }
  if (/upsertQueueItems|upsertGeneratedContent/i.test(message)) {
    return "상품 큐 seed 저장 중 오류가 발생했습니다. Supabase migration 적용 상태를 확인하세요.";
  }
  return "seed 저장 단계에서 오류가 발생했습니다. dev server 로그에서 server-only stack trace를 확인하세요.";
}

function sanitizeSecretText(value: string) {
  return value
    .replace(/SUPABASE_SERVICE_ROLE_KEY/gi, "[redacted-secret-name]")
    .replace(/WORKER_API_SECRET/gi, "[redacted-secret-name]")
    .replace(/R2_SECRET_ACCESS_KEY/gi, "[redacted-secret-name]")
    .replace(/R2_SECRET/gi, "[redacted-secret-name]")
    .replace(/YOUTUBE_CLIENT_SECRET/gi, "[redacted-secret-name]")
    .replace(/Authorization/gi, "[redacted-header]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]")
    .replace(/raw-secret/gi, "[redacted]");
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

function createCandidateVideoSmokeSeed(): ProductCandidate {
  const nowIso = new Date().toISOString();
  return {
    id: "candidate-video-smoke-001",
    product_name: "Candidate Video Smoke Event Product",
    raw_coupang_url: "https://www.coupang.com/vp/products/candidate-video-smoke-001",
    selected_affiliate_url: "https://link.coupang.com/a/candidate-video-smoke-001",
    product_key: "test:candidate-video-smoke-001",
    platform: "test",
    source_type: "event",
    source_name: "Worker Smoke Event",
    category: "선물",
    candidate_score: 91,
    score_reason: "candidate-to-video E2E smoke 검증용 이벤트 후보입니다.",
    duplicate_status: "unique",
    duplicate_reason: "",
    promotion_status: "ready",
    promoted_queue_id: "",
    payload: {
      event_key: "year-end-gift",
      event_name: "Worker Smoke Event",
      category_path: "선물/생활",
      keywords: ["연말", "선물", "추천"],
      thumbnail_url: "https://picsum.photos/seed/candidate-video-smoke/1080/1920",
      price_now_text: "12,900원",
      source: "dev_seed"
    },
    created_at: nowIso,
    updated_at: nowIso
  };
}
