import type { JsonRecord, WorkerJob } from "@/types/automation";

export function validateSignedVideoWorkerCompletion(job: WorkerJob, result: JsonRecord) {
  if (job.job_type !== "video_render" || !isRecord(job.payload.server_visual_binding)) {
    return { ok: true as const };
  }
  const requiredUrls = ["video_url", "thumbnail_url", "srt_url", "upload_package_url"] as const;
  const missingUrl = requiredUrls.find((key) => !text(result[key]));
  if (missingUrl) {
    return { ok: false as const, blocker: `WORKER_RESULT_ASSET_MISSING:${missingUrl}` };
  }
  const gates = [
    ["creative_policy_gate", "gate_pass"],
    ["visual_gate", "gate_pass"],
    ["asr_gate", "pass"],
    ["render_output_gate", "pass"]
  ] as const;
  for (const [gateName, passField] of gates) {
    const gate = record(result[gateName]);
    if (!gate || gate[passField] !== true) {
      return { ok: false as const, blocker: `WORKER_RESULT_GATE_FAILED:${gateName}` };
    }
  }
  return { ok: true as const };
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown) {
  return isRecord(value) ? value : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
