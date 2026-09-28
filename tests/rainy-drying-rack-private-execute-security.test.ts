import { beforeEach, describe, expect, test } from "vitest";

import { POST as postPrivateExecute } from "../app/api/uploads/youtube/rainy-drying-rack/private-execute/route";
import { getAutomationRepository, resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";
import { APPROVE_MERGE_PR122_AND_COMPLETE_RAINY_DRYING_RACK_PRIVATE_UPLOAD } from "@/lib/uploads/youtube/rainyDryingRackPrivateUploadApproval";

describe("rainy drying rack private execute security ordering", () => {
  beforeEach(() => {
    resetMockRepositoryForTests();
    for (const name of [
      "YOUTUBE_CLIENT_ID",
      "YOUTUBE_CLIENT_SECRET",
      "YOUTUBE_PRIVATE_UPLOAD_ENABLED",
      "YOUTUBE_UPLOAD_ENABLED",
      "PUBLIC_UPLOAD_ENABLED",
      "YOUTUBE_TOKEN_PROVIDER_MODE",
      "YOUTUBE_TOKEN_FILE",
      "YOUTUBE_UPLOAD_SCOPES_READY",
      "YOUTUBE_UPLOAD_QUOTA_READY",
      "YOUTUBE_UPLOAD_ACCOUNT_READY",
      "YOUTUBE_UPLOAD_POLICY_READY"
    ]) {
      delete process.env[name];
    }
  });

  test("blocks on readiness before candidate or asset writes", async () => {
    const repository = getAutomationRepository();
    const beforeCandidates = await repository.getProductCandidates();
    const beforeAssets = await repository.getProductAssets();

    const response = await postPrivateExecute(new Request(
      "http://localhost/api/uploads/youtube/rainy-drying-rack/private-execute",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirmation: APPROVE_MERGE_PR122_AND_COMPLETE_RAINY_DRYING_RACK_PRIVATE_UPLOAD,
          visibility: "private"
        })
      }
    ));
    const payload = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(403);
    expect(payload.error_code).toBe("BLOCKED_BY_YOUTUBE_READINESS");
    expect(payload.render_attempted).toBe(false);
    expect(payload.rows_written).toBe(0);
    expect(await repository.getProductCandidates()).toEqual(beforeCandidates);
    expect(await repository.getProductAssets()).toEqual(beforeAssets);
  });
});
