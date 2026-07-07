import type {
  AutomationSettings,
  ChannelAutomationKey,
  ChannelAutomationSettings,
  ProductQueueItem,
  QueueStatus
} from "@/types/automation";

export const CHANNEL_AUTOMATION_KEYS = ["father_jobs", "neoman_moleulgeol", "lets_buy"] as const;

const BLOCKED_QUEUE_STATUSES: QueueStatus[] = ["hold", "skipped", "error", "manual_review"];

const DISPLAY_NAMES: Record<ChannelAutomationKey, string> = {
  father_jobs: "father_jobs",
  neoman_moleulgeol: "neoman_moleulgeol",
  lets_buy: "lets_buy"
};

export type ChannelAutomationCard = {
  channelKey: ChannelAutomationKey;
  displayName: string;
  enabled: boolean;
  runMode: "generate_only";
  youtubeUploadEnabled: false;
  approvalRequired: true;
  todayGeneratedCount: number;
  processingCount: number;
  readyForManualUploadCount: number;
  errorCount: number;
  nextDuePreview: Array<{
    id: string;
    queue_rank: number;
    product_name: string;
    scheduled_at: string;
    missing_affiliate: boolean;
    missing_disclosure: boolean;
    missing_video: boolean;
  }>;
};

export type ChannelNextBatchPayload = {
  type: "next_batch";
  request_id: string;
  requested_at: string;
  channel_key: ChannelAutomationKey;
  settings: ChannelAutomationSettings;
  batch_size: number;
  interval_hours: number;
  mode: "process_next_batch";
  callback: { method: "POST"; url: string } | null;
  items: Array<{
    id: string;
    channel_key: ChannelAutomationKey;
    queue_rank: number;
    scheduled_at: string;
    product_name: string;
    keyword: string;
    theme: string;
    category_path: string;
    affiliate_url_present: boolean;
    disclosure_evidence_present: boolean;
    video_url_present: boolean;
  }>;
};

export function isChannelAutomationKey(value: unknown): value is ChannelAutomationKey {
  return typeof value === "string" && CHANNEL_AUTOMATION_KEYS.includes(value as ChannelAutomationKey);
}

export function getDefaultChannelAutomationSettings(
  channelKey: ChannelAutomationKey,
  overrides: Partial<ChannelAutomationSettings> = {}
): ChannelAutomationSettings {
  const base: ChannelAutomationSettings = {
    channelKey,
    displayName: DISPLAY_NAMES[channelKey],
    enabled: true,
    daily_target_count: 3,
    batch_size: 1,
    interval_hours: 1,
    run_mode: "generate_only",
    youtube_upload_enabled: false,
    approval_required: true,
    max_daily_uploads: 0,
    category_include: [],
    category_exclude: [],
    updated_at: new Date(0).toISOString()
  };

  return {
    ...base,
    ...overrides,
    run_mode: "generate_only",
    youtube_upload_enabled: false,
    approval_required: true,
    max_daily_uploads: 0
  };
}

export function toChannelAutomationSettings(
  channelKey: ChannelAutomationKey,
  settings: AutomationSettings
): ChannelAutomationSettings {
  return getDefaultChannelAutomationSettings(channelKey, {
    enabled: !settings.is_paused,
    daily_target_count: settings.daily_target_count,
    batch_size: settings.batch_size,
    interval_hours: settings.interval_hours,
    category_include: settings.category_include,
    category_exclude: settings.category_exclude,
    updated_at: settings.updated_at
  });
}

export function getItemChannelKey(item: ProductQueueItem): ChannelAutomationKey {
  return isChannelAutomationKey(item.channelKey) ? item.channelKey : "father_jobs";
}

export function getDueQueueItems(
  items: ProductQueueItem[],
  settings: ChannelAutomationSettings,
  now: Date,
  channelKey: ChannelAutomationKey
): ProductQueueItem[] {
  if (!settings.enabled) {
    return [];
  }

  return items
    .filter((item) => getItemChannelKey(item) === channelKey)
    .filter((item) => item.queue_status === "scheduled")
    .filter((item) => new Date(item.scheduled_at).getTime() <= now.getTime())
    .filter((item) => !BLOCKED_QUEUE_STATUSES.includes(item.queue_status))
    .sort((a, b) => a.queue_rank - b.queue_rank)
    .slice(0, settings.batch_size);
}

export function buildChannelNextBatchPayload(input: {
  channelKey: ChannelAutomationKey;
  settings: ChannelAutomationSettings;
  requestId: string;
  requestedAt: string;
  items: ProductQueueItem[];
  callbackBaseUrl?: string | null;
}): ChannelNextBatchPayload {
  return {
    type: "next_batch",
    request_id: input.requestId,
    requested_at: input.requestedAt,
    channel_key: input.channelKey,
    settings: input.settings,
    batch_size: input.settings.batch_size,
    interval_hours: input.settings.interval_hours,
    mode: "process_next_batch",
    callback: input.callbackBaseUrl
      ? {
          method: "POST",
          url: `${input.callbackBaseUrl.replace(/\/$/, "")}/api/callback/n8n/batch-result`
        }
      : null,
    items: input.items.map((item) => ({
      id: item.id,
      channel_key: getItemChannelKey(item),
      queue_rank: item.queue_rank,
      scheduled_at: item.scheduled_at,
      product_name: item.product_name,
      keyword: item.keyword,
      theme: item.theme,
      category_path: item.category_path,
      affiliate_url_present: Boolean(item.selected_affiliate_url?.trim()),
      disclosure_evidence_present: item.youtube_upload_status === "ready_to_upload" || item.manual_review_status !== "not_ready",
      video_url_present: Boolean(item.video_url?.trim())
    }))
  };
}

export function buildChannelAutomationCards(input: {
  items: ProductQueueItem[];
  settings: ChannelAutomationSettings[];
  now?: Date;
}): ChannelAutomationCard[] {
  const now = input.now ?? new Date();

  return input.settings.map((settings) => {
    const channelItems = input.items.filter((item) => getItemChannelKey(item) === settings.channelKey);
    const due = getDueQueueItems(channelItems, settings, now, settings.channelKey).slice(0, 3);

    return {
      channelKey: settings.channelKey,
      displayName: settings.displayName,
      enabled: settings.enabled,
      runMode: "generate_only",
      youtubeUploadEnabled: false,
      approvalRequired: true,
      todayGeneratedCount: channelItems.filter((item) =>
        ["content_ready", "video_render_started", "video_ready", "blog_draft_created", "ready_for_manual_upload"].includes(
          item.queue_status
        )
      ).length,
      processingCount: channelItems.filter((item) => item.queue_status === "processing").length,
      readyForManualUploadCount: channelItems.filter((item) => item.queue_status === "ready_for_manual_upload").length,
      errorCount: channelItems.filter((item) => item.queue_status === "error").length,
      nextDuePreview: due.map((item) => ({
        id: item.id,
        queue_rank: item.queue_rank,
        product_name: item.product_name,
        scheduled_at: item.scheduled_at,
        missing_affiliate: !item.selected_affiliate_url?.trim(),
        missing_disclosure: item.manual_review_status === "not_ready",
        missing_video: !item.video_url?.trim()
      }))
    };
  });
}
