import { afterEach, describe, expect, test, vi } from "vitest";
import { POST as createApproval } from "../app/api/automation/scheduled-private-pilot/approvals/route";
import { POST as executeUpload } from "../app/api/automation/scheduled-private-pilot/upload/route";

afterEach(() => vi.unstubAllEnvs());

describe("scheduled discovery, owner approval, and upload executor auth separation", () => {
  test("scheduler discovery secret cannot create owner approval or execute upload", async () => {
    const schedulerSecret = "scheduler-secret-012345678901234567890";
    vi.stubEnv("SCHEDULED_PRIVATE_PILOT_API_SECRET", schedulerSecret);
    vi.stubEnv("PRIVATE_PILOT_OWNER_APPROVAL_SECRET", "owner-secret-012345678901234567890123");
    vi.stubEnv("PRIVATE_PILOT_UPLOAD_EXECUTOR_SECRET", "executor-secret-012345678901234567890");
    const approvalResponse = await createApproval(request(schedulerSecret, {
      upload_package_id: "package-1",
      video_asset_id: "asset-1",
      expires_in_seconds: 300
    }));
    const uploadResponse = await executeUpload(request(schedulerSecret, {
      upload_package_id: "package-1",
      approval_id: "approval-1"
    }));
    expect(approvalResponse.status).toBe(401);
    expect(uploadResponse.status).toBe(401);
  });

  test("body decision=PASS and caller-provided asset cannot authorize executor", async () => {
    const executorSecret = "executor-secret-012345678901234567890";
    vi.stubEnv("PRIVATE_PILOT_UPLOAD_EXECUTOR_SECRET", executorSecret);
    const response = await executeUpload(request(executorSecret, {
      upload_package_id: "package-1",
      approval_id: "approval-1",
      decision: "PASS",
      prepared_video_asset: {
        asset_id: "caller-forged"
      }
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      blocker: "CALLER_ASSERTED_APPROVAL_OR_ASSET_FORBIDDEN"
    });
  });
});

function request(secret: string, body: Record<string, unknown>) {
  return new Request("http://localhost/private-pilot", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}
