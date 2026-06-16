import { describe, expect, test } from "vitest";
import { buildYouTubeUploadRequest } from "@/lib/uploads/youtube";
import { validateYouTubeDisclosureText } from "@/lib/uploads/youtube/youtubeDisclosureTextGuard";

const CANONICAL_DISCLOSURE =
  "※ 이 콘텐츠는 쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.";

const VALID_UPLOAD_INPUT = {
  candidate_id: "candidate-disclosure-guard-001",
  video_path_or_url: "https://assets.example.test/candidate-disclosure-guard-001.mp4",
  prepared_video_asset: {
    asset_id: "asset-candidate-disclosure-guard-001",
    provider: "signed_url",
    signed_url: "https://assets.example.test/candidate-disclosure-guard-001.mp4",
    prepared_video_asset_url: "https://assets.example.test/candidate-disclosure-guard-001.mp4",
    mime_type: "video/mp4",
    size_bytes: 2048,
    server_accessible: true
  },
  title: "Private product upload validation",
  description: `Operator private upload package.\n\n${CANONICAL_DISCLOSURE}`,
  disclosure_text: CANONICAL_DISCLOSURE,
  selected_affiliate_url: "https://link.coupang.com/a/disclosure-guard-test",
  tags: ["coupang", "private"],
  visibility: "private"
};

describe("YouTube Coupang Partners disclosure guard", () => {
  test("canonical Korean Coupang Partners disclosure passes", () => {
    expect(validateYouTubeDisclosureText({
      description: `상품 영상 설명\n\n${CANONICAL_DISCLOSURE}`,
      disclosure_text: CANONICAL_DISCLOSURE
    })).toEqual([]);
  });

  test("Korean disclosure with whitespace variation passes", () => {
    const disclosure = [
      "※ 이 콘텐츠는",
      "쿠팡파트너스 활동의 일환으로,",
      "이에 따른 일정액의 수수료를 제공받을 수 있습니다."
    ].join("   \n  ");

    expect(validateYouTubeDisclosureText({
      description: disclosure,
      disclosure_text: disclosure
    })).toEqual([]);
  });

  test("Korean disclosure with spaced Coupang Partners spelling passes", () => {
    const disclosure =
      "※ 이 콘텐츠는 쿠팡 파트너스 활동의 일환으로 이에 따른 일정액의 수수료를 제공받을 수 있습니다.";

    expect(validateYouTubeDisclosureText({
      description: disclosure,
      disclosure_text: disclosure
    })).toEqual([]);
  });

  test.each([
    ["missing Coupang Partners", "※ 이 콘텐츠는 제휴 활동의 일환으로 일정액의 수수료를 제공받을 수 있습니다."],
    ["missing activity wording", "※ 이 콘텐츠는 쿠팡파트너스 관련 콘텐츠이며 일정액의 수수료를 제공받을 수 있습니다."],
    ["missing commission wording", "※ 이 콘텐츠는 쿠팡파트너스 활동의 일환으로 제작되었습니다."]
  ])("%s fails with the existing compatibility error code", (_label, disclosure) => {
    expect(validateYouTubeDisclosureText({
      description: disclosure,
      disclosure_text: disclosure
    })).toEqual(["disclosure_text_missing_required_korean"]);
  });

  test("garbled disclosure fails before upload readiness", () => {
    const garbled = "? ???? ?? ???? ??? ????, ?? ?? ???? ???? ? ????.";

    expect(validateYouTubeDisclosureText({
      description: garbled,
      disclosure_text: garbled
    })).toEqual(["disclosure_text_garbled"]);
  });

  test("execute request builder accepts canonical Korean disclosure without calling YouTube", () => {
    const result = buildYouTubeUploadRequest(VALID_UPLOAD_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(`expected valid request, got ${result.missing_reasons.join(",")}`);
    }
    expect(result.request.disclosure_text).toBe(CANONICAL_DISCLOSURE);
    expect(result.request.description).toContain(CANONICAL_DISCLOSURE);
    expect(result.request.visibility).toBe("private");
  });

  test("execute request builder blocks missing disclosure with existing error contract", () => {
    const result = buildYouTubeUploadRequest({
      ...VALID_UPLOAD_INPUT,
      description: "Operator private upload package.",
      disclosure_text: "※ 이 콘텐츠는 쿠팡파트너스 관련 콘텐츠입니다."
    });

    expect(result).toMatchObject({
      ok: false,
      missing_reasons: expect.arrayContaining(["disclosure_text_missing_required_korean"])
    });
  });
});
