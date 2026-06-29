import { describe, expect, test } from "vitest";
import { POST as postProductPackagePrepare } from "../app/api/uploads/youtube/product-package/prepare/route";
import {
  DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT,
  buildYouTubeProductVideoUploadPackage,
  verifyYouTubeProductVideoUploadPackage
} from "@/lib/uploads/youtube";
import { PASSING_SHORTS_CONTENT_QUALITY } from "./fixtures/youtubeShortsContentQuality";

const validProductPackageInput = {
  candidate_id: "candidate-product-video-001",
  product_name: "무선 미니 청소기",
  product_source: "coupang",
  selected_affiliate_url: "https://link.coupang.com/a/product-video-001",
  video_path_or_url: "C:\\Users\\LOVE\\MyProjects\\commerce-automation\\commerce-assets\\output\\video-packages\\product-video-001.mp4",
  prepared_video_asset: {
    asset_id: "asset-product-video-001",
    provider: "signed_url",
    signed_url: "https://assets.example.test/product-video-001.mp4",
    prepared_video_asset_url: "https://assets.example.test/product-video-001.mp4",
    mime_type: "video/mp4",
    size_bytes: 1024,
    server_accessible: true
  },
  visibility: "private",
  title: "[무선 미니 청소기] 실제 구매 전 확인 포인트",
  description: [
    "상품명: 무선 미니 청소기",
    "제휴 링크: https://link.coupang.com/a/product-video-001",
    `쿠팡파트너스 고지: ${DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT}`
  ].join("\n"),
  disclosure_text: DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT,
  shorts_content_quality: PASSING_SHORTS_CONTENT_QUALITY,
  tags: ["coupang", "private upload"],
  made_for_kids: false
};

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

async function prepare(body: Record<string, unknown>) {
  return postProductPackagePrepare(new Request("http://localhost/api/uploads/youtube/product-package/prepare", {
    method: "POST",
    body: JSON.stringify(body)
  }));
}

describe("YouTube product video private upload package", () => {
  test("valid product video package prepare passes with no external side effects", async () => {
    const response = await prepare(validProductPackageInput);
    const payload = await json(response);

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      package: {
        candidate_id: "candidate-product-video-001",
        product_name: "무선 미니 청소기",
        product_source: "coupang",
        visibility: "private",
        selected_affiliate_url: validProductPackageInput.selected_affiliate_url,
        upload_confirmation_phrase_required: "APPROVE_YOUTUBE_PRIVATE_UPLOAD",
        private_execute_approval_required: "APPROVE_YOUTUBE_PRIVATE_UPLOAD",
        readiness: {
          candidate_ready: true,
          video_ready: true,
          affiliate_url_ready: true,
          disclosure_ready: true,
          public_upload_blocked: true
        },
        side_effects: {
          external_api_called: false,
          youtube_upload_executed: false,
          uploaded: false,
          db_written: false,
          r2_uploaded: false,
          queue_created: false,
          worker_job_created: false,
          upload_package_created: false,
          copy_only_package_created: true
        }
      },
      side_effects: {
        external_api_called: false,
        youtube_upload_executed: false,
        uploaded: false
      },
      execute_in_this_pr: false
    });
    expect(JSON.stringify(payload.package)).not.toContain("RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE");
    expect(JSON.stringify(payload)).not.toMatch(/access_token|refresh_token|client_secret|Authorization: Bearer/i);
  });

  test.each([
    ["candidate_id", { candidate_id: "" }],
    ["product_name", { product_name: "" }],
    ["selected_affiliate_url", { selected_affiliate_url: "" }],
    ["prepared_video_asset_ref", { video_path_or_url: "", prepared_video_asset: null }],
    ["title", { title: "" }],
    ["description", { description: "", disclosure_text: "" }]
  ])("missing %s blocks prepare", async (expectedReason, patch) => {
    const response = await prepare({ ...validProductPackageInput, ...patch });
    const payload = await json(response);

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      ok: false,
      error_code: "YOUTUBE_PRODUCT_UPLOAD_PACKAGE_NOT_READY",
      blocked_reasons: expect.arrayContaining([expectedReason]),
      side_effects: {
        external_api_called: false,
        youtube_upload_executed: false,
        uploaded: false,
        db_written: false,
        r2_uploaded: false,
        queue_created: false,
        worker_job_created: false
      }
    });
  });

  test("public visibility blocks package prepare", async () => {
    const response = await prepare({ ...validProductPackageInput, visibility: "public" });
    const payload = await json(response);

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      ok: false,
      blocked_reasons: expect.arrayContaining(["visibility_public_blocked"]),
      readiness: {
        visibility_ready: false,
        public_upload_blocked: false
      }
    });
  });

  test("unlisted visibility blocks package prepare", async () => {
    const response = await prepare({ ...validProductPackageInput, visibility: "unlisted" });
    const payload = await json(response);

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      ok: false,
      blocked_reasons: expect.arrayContaining(["visibility_unlisted_blocked"]),
      readiness: {
        visibility_ready: false,
        public_upload_blocked: true
      }
    });
  });

  test("missing Coupang Partners or commission disclosure blocks prepare", async () => {
    const response = await prepare({
      ...validProductPackageInput,
      description: "상품 설명만 있습니다.",
      disclosure_text: "이 콘텐츠는 제휴 활동을 포함합니다."
    });
    const payload = await json(response);

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      ok: false,
      blocked_reasons: expect.arrayContaining(["disclosure_text_missing_required_korean"])
    });
  });

  test("garbled disclosure is repaired with canonical package fallback", async () => {
    const response = await prepare({
      ...validProductPackageInput,
      description: "? ???? ?? ???? ??? ????, ?? ?? ???? ???? ? ????.",
      disclosure_text: "? ???? ?? ???? ??? ????, ?? ?? ???? ???? ? ????."
    });
    const payload = await json(response);

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      package: {
        disclosure_text: DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT,
        blocked_reasons: [],
        readiness: {
          disclosure_ready: true
        }
      }
    });
    expect(JSON.stringify(payload)).not.toContain("disclosure_text_garbled");
  });

  test("builder preserves title and description with affiliate and disclosure text", () => {
    const result = buildYouTubeProductVideoUploadPackage({
      ...validProductPackageInput
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected product video package build success");
    }
    expect(result.package.title).toBe(validProductPackageInput.title);
    expect(result.package.description).toContain("쿠팡파트너스");
    expect(result.package.description).toContain("수수료");
    expect(result.package.description).toContain(validProductPackageInput.selected_affiliate_url);
    expect(result.package.description.split(/\r?\n/)[0]).toBe(validProductPackageInput.selected_affiliate_url);
    expect(result.package.pinned_comment_template).toContain(validProductPackageInput.selected_affiliate_url);
    expect(result.package.on_screen_cta_text).toContain("\uACE0\uC815\uB313\uAE00");
    expect(result.package.visibility).not.toBe("public");
  });

  test("final verification requires youtube_video_id and Studio checks", () => {
    const blocked = verifyYouTubeProductVideoUploadPackage({
      studio_visibility_private: true,
      studio_title_correct: true,
      studio_disclosure_korean_correct: true,
      studio_affiliate_link_present: true,
      no_public_or_scheduled_state: true
    });
    expect(blocked).toMatchObject({
      final_verified: false,
      blocked_reasons: expect.arrayContaining(["youtube_video_id"]),
      side_effects: {
        external_api_called: false,
        youtube_upload_executed: false,
        uploaded: false
      }
    });

    const verified = verifyYouTubeProductVideoUploadPackage({
      youtube_video_id: "abc123",
      studio_visibility_private: true,
      studio_title_correct: true,
      studio_disclosure_korean_correct: true,
      studio_affiliate_link_present: true,
      no_public_or_scheduled_state: true
    });
    expect(verified.final_verified).toBe(true);
  });
});
