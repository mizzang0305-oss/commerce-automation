import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  V034_COUPANG_DISCLOSURE,
  buildV033MetadataFailureDecision,
  buildV034KoreanMetadataPreview,
  validateYouTubeKoreanMetadata,
  writeV034YoutubeMetadataReviewPacket
} from "@/lib/uploads/youtube/youtubeMetadataHardening";

const CANDIDATE_ID = "candidate-v034-metadata-hardening";
const AFFILIATE_URL = "https://link.coupang.com/a/v034-hardening";

describe("YouTube Korean metadata hardening", () => {
  test("metadata_utf8_roundtrip_tests", () => {
    const preview = buildV034KoreanMetadataPreview({
      candidate_id: CANDIDATE_ID,
      selected_affiliate_url: AFFILIATE_URL
    });

    expect(preview.utf8_roundtrip_report).toMatchObject({
      korean_utf8_roundtrip_pass: true,
      json_roundtrip_pass: true
    });
    expect(preview.gate.blocked_reasons).toEqual([]);
  });

  test("youtube_description_mojibake_guard_tests", () => {
    const gate = validateYouTubeKoreanMetadata({
      title: "???",
      description: [
        "???",
        "\u5360\uc38e\ub07d\u5360\uc388\uc2a3",
        "\uFFFD"
      ].join("\n"),
      selected_affiliate_url: AFFILIATE_URL,
      upload_request_body_preview_generated: true,
      local_metadata_preview_html_generated: true,
      post_upload_metadata_verification_plan_generated: true
    });

    expect(gate.blocked_reasons).toEqual(expect.arrayContaining([
      "METADATA_MOJIBAKE_DETECTED",
      "DESCRIPTION_CONTAINS_QUESTION_MARK_RUN",
      "DESCRIPTION_CONTAINS_REPLACEMENT_CHAR",
      "COUPANG_DISCLOSURE_MISSING"
    ]));
    expect(gate.can_pass_metadata_gate).toBe(false);
  });

  test("placeholder_url_blocker_tests", () => {
    const gate = validateYouTubeKoreanMetadata({
      title: "민즈 커머스 v034",
      description: [
        "상품 확인",
        "https://example.com/minz-commerce-v033-check",
        "placeholder product link",
        AFFILIATE_URL,
        V034_COUPANG_DISCLOSURE
      ].join("\n"),
      selected_affiliate_url: AFFILIATE_URL,
      upload_request_body_preview_generated: true,
      local_metadata_preview_html_generated: true,
      post_upload_metadata_verification_plan_generated: true
    });

    expect(gate.blocked_reasons).toEqual(expect.arrayContaining([
      "DESCRIPTION_CONTAINS_EXAMPLE_DOT_COM",
      "DESCRIPTION_CONTAINS_PLACEHOLDER_URL",
      "DESCRIPTION_CONTAINS_RAW_AFFILIATE_URL"
    ]));
    expect(gate.example_com_blocked).toBe(true);
    expect(gate.raw_affiliate_url_blocked).toBe(true);
  });

  test("coupang_disclosure_required_tests", () => {
    const gate = validateYouTubeKoreanMetadata({
      title: "민즈 커머스 v034 빨래건조대 체크",
      description: "장마철 빨래건조대 크기와 보관 공간을 확인하세요.",
      selected_affiliate_url: AFFILIATE_URL,
      upload_request_body_preview_generated: true,
      local_metadata_preview_html_generated: true,
      post_upload_metadata_verification_plan_generated: true
    });

    expect(gate.coupang_disclosure_required).toBe(true);
    expect(gate.blocked_reasons).toContain("COUPANG_DISCLOSURE_MISSING");
  });

  test("sanitized_upload_request_preview_tests", () => {
    const preview = buildV034KoreanMetadataPreview({
      candidate_id: CANDIDATE_ID,
      selected_affiliate_url: AFFILIATE_URL
    });
    const serialized = JSON.stringify(preview.sanitized_upload_request_preview);

    expect(preview.metadata.description).toContain("[상품 확인]");
    expect(preview.metadata.description).toContain(V034_COUPANG_DISCLOSURE);
    expect(preview.metadata.description).not.toContain("???");
    expect(preview.metadata.description).not.toContain("example.com");
    expect(preview.metadata.description).not.toContain("placeholder");
    expect(preview.metadata.description).not.toContain(AFFILIATE_URL);
    expect(serialized).toContain("<AFFILIATE_URL_PRESENT>");
    expect(serialized).not.toContain(AFFILIATE_URL);
    expect(preview.metadata_preview_html).toContain("<meta charset=\"utf-8\"");
    expect(preview.metadata_preview_html).not.toContain(AFFILIATE_URL);
    expect(preview.placeholder_scan_report.placeholder_url_gate_added).toBe(true);
  });

  test("post_upload_metadata_verification_plan_tests", () => {
    const preview = buildV034KoreanMetadataPreview({
      candidate_id: CANDIDATE_ID,
      selected_affiliate_url: AFFILIATE_URL,
      v033_uploaded_video_id: "ldSNhRKJLe0"
    });

    expect(preview.post_upload_metadata_verification_plan).toMatchObject({
      target_video_id: "ldSNhRKJLe0",
      videos_insert_allowed: false,
      visibility_change_allowed: false,
      raw_url_output_allowed: false
    });
    expect(preview.gate.post_upload_metadata_verification_plan).toBe(true);
  });

  test("records v033 as FAIL_METADATA_REVIEW after upload metadata failure", () => {
    expect(buildV033MetadataFailureDecision({ video_id: "ldSNhRKJLe0" })).toMatchObject({
      version: "v033",
      video_id: "ldSNhRKJLe0",
      review_status: "FAIL_METADATA_REVIEW",
      private_upload_allowed: false,
      safe_to_request_private_upload: false,
      fail_reasons: expect.arrayContaining([
        "YOUTUBE_DESCRIPTION_MOJIBAKE",
        "KOREAN_TEXT_RENDERED_AS_QUESTION_MARKS",
        "PLACEHOLDER_URL_EXAMPLE_COM_EXPOSED",
        "METADATA_PREFLIGHT_FALSE_NEGATIVE",
        "DISCLOSURE_TEXT_NOT_VERIFIED_AFTER_UPLOAD"
      ])
    });
  });

  test("writes v034 review packet artifacts without raw affiliate URL output", async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "v034-metadata-hardening-"));
    try {
      const result = await writeV034YoutubeMetadataReviewPacket({
        cwd,
        candidate_id: CANDIDATE_ID,
        selected_affiliate_url: AFFILIATE_URL,
        v033_uploaded_video_id: "ldSNhRKJLe0"
      });

      expect(result).toMatchObject({
        human_review_status: "PENDING_METADATA_REVIEW",
        private_upload_allowed: false,
        SAFE_TO_REQUEST_PRIVATE_UPLOAD: false,
        PUBLIC_UPLOAD_BLOCKED: true
      });
      for (const filePath of Object.values(result.artifact_paths)) {
        const text = readFileSync(filePath, "utf8");
        expect(text).not.toContain(AFFILIATE_URL);
      }
      expect(readFileSync(result.artifact_paths.youtube_metadata_preview_json, "utf8")).toContain(
        "V034_METADATA_GATE_READY"
      );
      expect(readFileSync(result.v033_failure_decision_path, "utf8")).toContain("FAIL_METADATA_REVIEW");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("package script exposes review:v034", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

    expect(packageJson.scripts["review:v034"]).toBe(
      "tsx scripts/uploads/generate-v034-youtube-metadata-korean-hardening-review-packet.ts"
    );
  });
});
