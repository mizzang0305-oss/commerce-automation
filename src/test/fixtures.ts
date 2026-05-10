import type { GeneratedContent, ProductQueueItem } from "@/types/automation";
import { createDefaultSettings } from "@/lib/repositories/mockAutomationRepository";
import { createMockGeneratedContents, createMockQueueItems } from "@/lib/repositories/mockAutomationRepository";

export function createQueueItemFixture(overrides: Partial<ProductQueueItem> = {}): ProductQueueItem {
  const item = createMockQueueItems(createDefaultSettings())[6];
  return {
    ...item,
    queue_status: "ready_for_manual_upload",
    selected_affiliate_url: "https://link.coupang.com/a/fixture",
    video_url: "https://example.com/video.mp4",
    video_snapshot_url: "https://example.com/snapshot.jpg",
    blog_draft_url: "https://example.com/blog-draft",
    ...overrides
  };
}

export function createGeneratedContentFixture(overrides: Partial<GeneratedContent> = {}): GeneratedContent {
  const item = createQueueItemFixture();
  const content = createMockGeneratedContents([item])[0];
  return {
    ...content,
    disclosure_text: "이 포스팅은 쿠팡 파트너스 활동의 일환으로 일정액의 수수료를 제공받을 수 있습니다.",
    ...overrides
  };
}
