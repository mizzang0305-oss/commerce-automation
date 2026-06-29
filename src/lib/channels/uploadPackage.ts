import type {
  ChannelProfile,
  ChannelUploadPackage,
  GeneratedContent,
  ProductAsset,
  ProductQueueItem
} from "@/types/automation";
import { mergeChannelHashtags } from "@/lib/channels/channelRouting";
import { buildYouTubeLinkCtaMetadata } from "@/lib/uploads/youtube/youtubeLinkCtaMetadata";

export type UploadPackageBuildResult =
  | { ok: true; package: ChannelUploadPackage; checklist: ManualUploadChecklistItem[] }
  | { ok: false; message: string; status: number; missing_reasons: string[] };

export type ManualUploadChecklistItem = {
  label: string;
  ok: boolean;
  help: string;
};

const MISSING_REASON_MESSAGES: Record<string, string> = {
  queue_status_video_ready: "video_ready 상태의 상품만 채널 업로드 패키지를 만들 수 있습니다.",
  video_url: "video_url이 없어 업로드 패키지를 만들 수 없습니다.",
  selected_affiliate_url: "제휴 링크가 없어 업로드 패키지를 만들 수 없습니다.",
  generated_contents: "생성 콘텐츠가 없어 업로드 패키지를 만들 수 없습니다.",
  disclosure_text: "제휴 고지 문구가 없어 업로드 패키지를 만들 수 없습니다."
};

export function buildManualUploadChecklist(
  item: ProductQueueItem,
  content: GeneratedContent | null,
  assets: ProductAsset[]
): ManualUploadChecklistItem[] {
  return [
    {
      label: "영상 파일",
      ok: Boolean(item.video_url.trim()),
      help: "video_ready 항목에는 실제 영상 URL이 있어야 합니다."
    },
    {
      label: "썸네일",
      ok: Boolean(item.video_snapshot_url.trim() || findAssetUrl(assets, "thumbnail") || item.thumbnail_url.trim()),
      help: "수동 업로드 전에 썸네일 이미지를 확인하세요."
    },
    {
      label: "제목",
      ok: Boolean((content?.video_title || item.product_name).trim()),
      help: "플랫폼에 붙여 넣을 제목이 필요합니다."
    },
    {
      label: "설명/고지",
      ok: Boolean(content?.disclosure_text.trim()),
      help: "제휴 고지 문구가 없으면 업로드 패키지를 만들 수 없습니다."
    },
    {
      label: "해시태그",
      ok: Boolean(content?.hashtags.trim()),
      help: "채널 기본 해시태그와 콘텐츠 해시태그를 함께 검토하세요."
    },
    {
      label: "제휴 링크",
      ok: Boolean(item.selected_affiliate_url.trim()),
      help: "제휴 링크가 없으면 수동 업로드 패키지를 만들 수 없습니다."
    }
  ];
}

export function buildChannelUploadPackage(input: {
  item: ProductQueueItem;
  content: GeneratedContent | null;
  assets: ProductAsset[];
  channel: ChannelProfile;
  now?: string;
}): UploadPackageBuildResult {
  const { item, content, assets, channel } = input;
  const missingReasons: string[] = [];

  if (item.queue_status !== "video_ready") {
    missingReasons.push("queue_status_video_ready");
  }
  if (!item.video_url.trim()) {
    missingReasons.push("video_url");
  }
  if (!item.selected_affiliate_url.trim()) {
    missingReasons.push("selected_affiliate_url");
  }
  if (!content) {
    missingReasons.push("generated_contents");
  }
  if (content && !content.disclosure_text.trim()) {
    missingReasons.push("disclosure_text");
  }

  if (missingReasons.length > 0) {
    return {
      ok: false,
      status: 400,
      message: MISSING_REASON_MESSAGES[missingReasons[0]] ?? "업로드 패키지를 만들 수 없습니다.",
      missing_reasons: missingReasons
    };
  }

  const now = input.now ?? new Date().toISOString();
  const baseTitle = (content?.video_title || item.product_name).trim();
  const hashtags = mergeChannelHashtags([content?.hashtags ?? "", channel.hashtag_template ?? ""].join(" "), channel);
  const disclosure = content?.disclosure_text.trim() ?? "";
  const baseDescription = content?.youtube_description?.trim() || `${item.product_name} 수동 업로드용 설명입니다.`;
  const linkCtaMetadata = buildYouTubeLinkCtaMetadata({
    selected_affiliate_url: item.selected_affiliate_url,
    description: baseDescription,
    disclosure_text: disclosure
  });
  const templateContext = {
    product_name: item.product_name,
    channel_name: channel.channel_name,
    video_title: baseTitle,
    description: linkCtaMetadata.description,
    affiliate_url: item.selected_affiliate_url,
    disclosure_text: disclosure,
    hashtags,
    price_now_text: item.price_now_text,
    category_path: item.category_path
  };
  const title = applyChannelTemplate(channel.title_template, templateContext) || baseTitle;
  const description = buildYouTubeLinkCtaMetadata({
    selected_affiliate_url: item.selected_affiliate_url,
    description: applyChannelTemplate(channel.description_template, templateContext) || linkCtaMetadata.description,
    disclosure_text: disclosure
  }).description;

  return {
    ok: true,
    checklist: buildManualUploadChecklist(item, content, assets),
    package: {
      id: `channel-package-${item.id}-${channel.id}`,
      product_queue_id: item.id,
      channel_profile_id: channel.id,
      platform: channel.platform,
      title,
      description,
      hashtags,
      disclosure_text: disclosure,
      video_url: item.video_url,
      thumbnail_url: item.video_snapshot_url || findAssetUrl(assets, "thumbnail") || item.thumbnail_url,
      subtitle_url: findAssetUrl(assets, "subtitle"),
      upload_package_url: findAssetUrl(assets, "upload_package"),
      status: "manual_ready",
      uploaded_url: "",
      uploaded_at: "",
      uploaded_by: "",
      upload_notes: "",
      platform_upload_status: "manual_ready",
      upload_enabled: false,
      manual_upload_only: true,
      created_at: now,
      updated_at: now
    }
  };
}

function findAssetUrl(assets: ProductAsset[], assetType: ProductAsset["asset_type"]) {
  return assets.find((asset) => asset.asset_type === assetType)?.url ?? "";
}

function applyChannelTemplate(template: string | undefined, values: Record<string, string>) {
  const source = template?.trim();
  if (!source) {
    return "";
  }
  return source.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => values[key] ?? "").trim();
}
