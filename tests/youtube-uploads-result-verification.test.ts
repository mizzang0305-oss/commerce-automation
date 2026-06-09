import { describe, expect, test } from "vitest";
import {
  buildYouTubeUploadResultVerification,
  youtubeUploadResultVerificationSideEffects
} from "@/lib/uploads/youtube";

const successfulSmokeInput = {
  candidate_id: "candidate-video-smoke-001",
  youtube_video_id: "ryZpIUWnbJA",
  youtube_url: "https://www.youtube.com/watch?v=ryZpIUWnbJA",
  visibility: "private",
  studio_visibility_verified: true,
  disclosure_verified: true,
  title_verified: true,
  public_upload_blocked: true,
  access_token: "should-not-be-accepted",
  refresh_token: "should-not-be-accepted",
  Authorization: "Bearer should-not-be-accepted"
};

describe("YouTube private upload result verification", () => {
  test("accepts valid private smoke result evidence without production side effects", () => {
    const result = buildYouTubeUploadResultVerification(successfulSmokeInput);

    expect(result).toMatchObject({
      ok: true,
      verification: {
        candidate_id: "candidate-video-smoke-001",
        youtube_video_id: "ryZpIUWnbJA",
        youtube_url: "https://www.youtube.com/watch?v=ryZpIUWnbJA",
        visibility: "private",
        studio_visibility_verified: true,
        disclosure_verified: true,
        title_verified: true,
        public_upload_blocked: true,
        token_exposed: false,
        authorization_exposed: false,
        final_verified: true,
        side_effects: youtubeUploadResultVerificationSideEffects
      }
    });
    expect(JSON.stringify(result)).not.toMatch(/access_token|refresh_token|Authorization|Bearer/);
  });

  test("rejects missing video id and missing candidate id", () => {
    expect(buildYouTubeUploadResultVerification({
      ...successfulSmokeInput,
      youtube_video_id: ""
    })).toMatchObject({
      ok: false,
      missing_reasons: expect.arrayContaining(["youtube_video_id"]),
      side_effects: youtubeUploadResultVerificationSideEffects
    });

    expect(buildYouTubeUploadResultVerification({
      ...successfulSmokeInput,
      candidate_id: ""
    })).toMatchObject({
      ok: false,
      missing_reasons: expect.arrayContaining(["candidate_id"]),
      side_effects: youtubeUploadResultVerificationSideEffects
    });
  });

  test("rejects public visibility and keeps final verification false when disclosure is not verified", () => {
    expect(buildYouTubeUploadResultVerification({
      ...successfulSmokeInput,
      visibility: "public"
    })).toMatchObject({
      ok: false,
      missing_reasons: expect.arrayContaining(["visibility_private_required"]),
      side_effects: youtubeUploadResultVerificationSideEffects
    });

    const notFinal = buildYouTubeUploadResultVerification({
      ...successfulSmokeInput,
      disclosure_verified: false
    });

    expect(notFinal).toMatchObject({
      ok: true,
      verification: {
        disclosure_verified: false,
        final_verified: false,
        upload_ready: false
      }
    });
  });
});
