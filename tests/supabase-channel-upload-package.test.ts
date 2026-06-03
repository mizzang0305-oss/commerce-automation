import { describe, expect, test } from "vitest";
import { SupabaseAutomationRepository } from "@/lib/repositories/supabaseAutomationRepository";
import type { ChannelUploadPackage } from "@/types/automation";

describe("supabase channel upload package repository", () => {
  test("serializes empty uploaded_at as null for timestamptz columns", async () => {
    let capturedPayload: Record<string, unknown> | null = null;
    const client = {
      from(table: string) {
        expect(table).toBe("channel_upload_packages");
        return {
          upsert(payload: Record<string, unknown>, options: Record<string, unknown>) {
            capturedPayload = payload;
            expect(options).toEqual({ onConflict: "id" });
            return {
              select() {
                return {
                  async single() {
                    return { data: payload, error: null };
                  }
                };
              }
            };
          }
        };
      }
    };

    const repository = new SupabaseAutomationRepository({ client: client as never });
    await repository.upsertChannelUploadPackage(buildPackage({ uploaded_at: "" }));

    expect(capturedPayload).toMatchObject({
      uploaded_at: null,
      upload_enabled: false,
      manual_upload_only: true
    });
  });
});

function buildPackage(overrides: Partial<ChannelUploadPackage> = {}): ChannelUploadPackage {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: "channel-package-test",
    product_queue_id: "queue-test",
    channel_profile_id: "channel-event-gift",
    platform: "youtube",
    title: "Manual upload package",
    description: "Manual upload only.",
    hashtags: "#test",
    disclosure_text: "Affiliate disclosure.",
    video_url: "https://storage.example/video.mp4",
    thumbnail_url: "https://storage.example/thumb.jpg",
    subtitle_url: "https://storage.example/subtitle.srt",
    upload_package_url: "https://storage.example/package.txt",
    status: "manual_ready",
    uploaded_url: "",
    uploaded_at: "",
    uploaded_by: "",
    upload_notes: "",
    platform_upload_status: "manual_ready",
    upload_enabled: false,
    manual_upload_only: true,
    created_at: now,
    updated_at: now,
    ...overrides
  };
}
