import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { generateV018ReviewPacket } from "../scripts/uploads/generate-v018-review-packet.mjs";

describe("v018 Korean voice provider review packet orchestration", () => {
  test("creates setup artifacts but no review video when approved Korean voice provider is missing", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "commerce-v018-provider-missing-"));
    const result = await generateV018ReviewPacket({ cwd, env: {} });

    expect(result).toMatchObject({
      target_version: "v018",
      setup_wizard_added: true,
      voice_provider_configured: false,
      voice_provider_approved: false,
      voice_provider_blocker: "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED",
      review_console_generated: false,
      voiceover_generated: false,
      real_asr_probe_executed: false,
      local_review_packet_ready: false,
      SAFE_TO_REQUEST_PRIVATE_UPLOAD: false
    });

    await expect(stat(result.local_review_video_path)).rejects.toThrow();
    const decision = JSON.parse(await readFile(result.human_review_decision_path, "utf8"));
    expect(decision).toMatchObject({
      candidate_id: "candidate-3c4f2ee364ba5b07",
      version: "v018",
      human_review_status: "VOICE_PROVIDER_BLOCKED",
      private_upload_allowed: false,
      requires_fresh_upload_approval: true,
      blocker: "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED"
    });
    const setupGuide = await readFile(result.voice_provider_setup_guide_path, "utf8");
    expect(setupGuide).toContain("owner_recorded");
    expect(setupGuide).toContain("local_command");
  });
});
