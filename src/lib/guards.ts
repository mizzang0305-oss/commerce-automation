import type { AutomationSettings, GeneratedContent, ProductQueueItem } from "@/types/automation";

export type GuardResult = {
  ok: boolean;
  message: string;
};

export function canRunAutomation(settings: AutomationSettings): GuardResult {
  if (settings.is_paused) {
    return {
      ok: false,
      message: "자동화가 일시정지 상태입니다. 설정에서 재개한 뒤 실행하세요."
    };
  }

  return { ok: true, message: "자동화를 실행할 수 있습니다." };
}

export function canGenerateQueue(settings: AutomationSettings): GuardResult {
  return canRunAutomation(settings);
}

export function canProcessBatch(settings: AutomationSettings): GuardResult {
  return canRunAutomation(settings);
}

export function canUploadToYouTube(
  settings: AutomationSettings,
  item: ProductQueueItem,
  publicUploadsToday = 0
): GuardResult {
  if (!settings.youtube_upload_enabled) {
    return {
      ok: false,
      message: "현재 자동 업로드는 비활성화되어 있습니다."
    };
  }

  if (!item.video_url) {
    return {
      ok: false,
      message: "영상 URL이 없어 업로드 준비 상태로 전환할 수 없습니다."
    };
  }

  if (publicUploadsToday >= settings.max_daily_uploads) {
    return {
      ok: false,
      message: "하루 공개 업로드 제한을 초과하면 업로드 큐에 보류됩니다."
    };
  }

  if (settings.approval_required && item.manual_review_status !== "approved") {
    return {
      ok: false,
      message: "승인 전에는 유튜브 업로드를 실행할 수 없습니다."
    };
  }

  if (settings.run_mode === "generate_only") {
    return {
      ok: false,
      message: "현재 모드는 콘텐츠 생성 전용입니다."
    };
  }

  return {
    ok: true,
    message: "유튜브 업로드 가드를 통과했습니다."
  };
}

export function canMarkReadyForManualUpload(
  item: ProductQueueItem,
  content?: GeneratedContent | null
): GuardResult {
  if (!item.selected_affiliate_url) {
    return {
      ok: false,
      message: "제휴 링크가 없어 업로드 준비 상태로 전환할 수 없습니다."
    };
  }

  if (!content?.disclosure_text) {
    return {
      ok: false,
      message: "제휴 고지 문구가 없어 업로드 준비 상태로 전환할 수 없습니다."
    };
  }

  if (!item.video_url) {
    return {
      ok: false,
      message: "영상 URL이 없어 업로드 준비 상태로 전환할 수 없습니다."
    };
  }

  if (!item.blog_draft_url) {
    return {
      ok: false,
      message: "블로그 초안 URL이 없어 업로드 준비 상태로 전환할 수 없습니다."
    };
  }

  return {
    ok: true,
    message: "수동 업로드 준비 상태로 전환할 수 있습니다."
  };
}

export function getUploadGuardMessage(
  settings: AutomationSettings,
  item: ProductQueueItem,
  publicUploadsToday = 0
): string {
  return canUploadToYouTube(settings, item, publicUploadsToday).message;
}
