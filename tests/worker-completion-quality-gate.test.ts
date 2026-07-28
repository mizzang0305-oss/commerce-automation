import { describe, expect, test } from "vitest";
import { validateSignedVideoWorkerCompletion } from "@/lib/server/workerCompletionGate";
import type { WorkerJob } from "@/types/automation";

describe("signed worker completion quality gate", () => {
  test("blocks ASR or asset failure before video_ready persistence", () => {
    const result = validResult();
    result.asr_gate = { pass: false };
    expect(validateSignedVideoWorkerCompletion(jobFixture(), result)).toEqual({
      ok: false,
      blocker: "WORKER_RESULT_GATE_FAILED:asr_gate"
    });

    const missingAsset = validResult();
    missingAsset.video_url = "";
    expect(validateSignedVideoWorkerCompletion(jobFixture(), missingAsset)).toEqual({
      ok: false,
      blocker: "WORKER_RESULT_ASSET_MISSING:video_url"
    });
  });

  test("accepts all four R2-bound assets only after every quality gate passes", () => {
    expect(validateSignedVideoWorkerCompletion(jobFixture(), validResult())).toEqual({ ok: true });
  });
});

function jobFixture(): WorkerJob {
  return {
    id: "job-1",
    job_type: "video_render",
    status: "processing",
    product_queue_id: "queue-1",
    product_candidate_id: "candidate-1",
    priority: 1,
    payload: { server_visual_binding: { signature: "signed" } },
    result: {},
    claimed_by: "worker-1",
    claimed_at: "",
    heartbeat_at: "",
    error_message: "",
    retry_count: 0,
    max_retries: 3,
    created_at: "",
    started_at: "",
    finished_at: ""
  };
}

function validResult() {
  return {
    video_url: "https://r2.example/video.mp4",
    thumbnail_url: "https://r2.example/thumbnail.jpg",
    srt_url: "https://r2.example/captions.srt",
    upload_package_url: "https://r2.example/package.txt",
    creative_policy_gate: { gate_pass: true },
    visual_gate: { gate_pass: true },
    asr_gate: { pass: true },
    render_output_gate: { pass: true }
  };
}
