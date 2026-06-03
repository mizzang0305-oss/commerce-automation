import type { ChannelProfile, GeneratedContent, ProductQueueItem } from "@/types/automation";

export type ContentGenerationProviderName = "template" | "openai" | "gemini" | "disabled";

export type ContentGenerationInput = {
  queue_item: ProductQueueItem;
  existing_content?: GeneratedContent | null;
  channel_profile?: ChannelProfile | null;
  constraints?: string[];
  source_platform?: string;
};

export type ContentGenerationResult = {
  provider: ContentGenerationProviderName;
  requested_provider: ContentGenerationProviderName;
  provider_configured: boolean;
  used_fallback: boolean;
  video_title: string;
  video_script: string;
  caption_1: string;
  caption_2: string;
  caption_3: string;
  threads_text: string;
  blog_title: string;
  blog_body: string;
  youtube_description: string;
  tiktok_caption: string;
  hashtags: string;
  disclosure_text: string;
  safety_warnings: string[];
  safe_message: string;
};

export type ContentGenerationSafetyResult = {
  ok: boolean;
  blocked: boolean;
  warnings: string[];
  safe_message: string;
};

export type ContentGenerationProvider = {
  name: ContentGenerationProviderName;
  configured: boolean;
  generate(input: ContentGenerationInput): Promise<ContentGenerationResult>;
};
