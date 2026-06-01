import type { ChannelProfile } from "@/types/automation";

const DEFAULT_NOW = "2026-01-01T00:00:00.000Z";

export function getDefaultChannelProfiles(): ChannelProfile[] {
  return [
    {
      id: "channel-coupang-daily",
      channel_key: "coupang-daily",
      channel_name: "쿠팡 데일리 추천",
      platform: "youtube",
      youtube_channel_id: "",
      youtube_handle: "",
      niche: "생활/가성비/쿠팡 인기템",
      allowed_categories: ["생활", "전자", "자동차", "난방", "주방"],
      excluded_categories: [],
      default_hashtags: ["#쿠팡추천", "#생활템"],
      upload_window: { start_hour: 9, end_hour: 21 },
      status: "active",
      upload_enabled: false,
      manual_upload_only: true,
      created_at: DEFAULT_NOW,
      updated_at: DEFAULT_NOW
    },
    {
      id: "channel-event-gift",
      channel_key: "event-gift",
      channel_name: "이벤트 선물 추천",
      platform: "youtube",
      youtube_channel_id: "",
      youtube_handle: "",
      niche: "시즌/기념일/선물 추천",
      allowed_categories: ["선물", "키즈", "식품", "인테리어", "문구"],
      excluded_categories: [],
      default_hashtags: ["#선물추천", "#시즌추천"],
      upload_window: { start_hour: 10, end_hour: 20 },
      status: "active",
      upload_enabled: false,
      manual_upload_only: true,
      created_at: DEFAULT_NOW,
      updated_at: DEFAULT_NOW
    },
    {
      id: "channel-kitchen-food",
      channel_key: "kitchen-food",
      channel_name: "주방 식품 장보기",
      platform: "youtube",
      youtube_channel_id: "",
      youtube_handle: "",
      niche: "주방/식품/장보기",
      allowed_categories: ["주방", "식품"],
      excluded_categories: ["의약품"],
      default_hashtags: ["#주방템", "#장보기"],
      upload_window: { start_hour: 8, end_hour: 19 },
      status: "active",
      upload_enabled: false,
      manual_upload_only: true,
      created_at: DEFAULT_NOW,
      updated_at: DEFAULT_NOW
    },
    {
      id: "channel-fashion-beauty",
      channel_key: "fashion-beauty",
      channel_name: "패션 뷰티 추천",
      platform: "youtube",
      youtube_channel_id: "",
      youtube_handle: "",
      niche: "패션/무신사/뷰티",
      allowed_categories: ["패션", "뷰티", "의류"],
      excluded_categories: [],
      default_hashtags: ["#패션추천", "#뷰티템"],
      upload_window: { start_hour: 11, end_hour: 22 },
      status: "active",
      upload_enabled: false,
      manual_upload_only: true,
      created_at: DEFAULT_NOW,
      updated_at: DEFAULT_NOW
    },
    {
      id: "channel-kids-family",
      channel_key: "kids-family",
      channel_name: "키즈 가족 추천",
      platform: "youtube",
      youtube_channel_id: "",
      youtube_handle: "",
      niche: "키즈/가족/신학기",
      allowed_categories: ["키즈", "완구", "가족", "문구"],
      excluded_categories: [],
      default_hashtags: ["#키즈템", "#가족추천"],
      upload_window: { start_hour: 9, end_hour: 20 },
      status: "active",
      upload_enabled: false,
      manual_upload_only: true,
      created_at: DEFAULT_NOW,
      updated_at: DEFAULT_NOW
    }
  ];
}
