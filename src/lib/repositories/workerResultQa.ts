import type { JsonRecord, ProductAsset } from "@/types/automation";

export function buildWorkerResultQa(result: JsonRecord): {
  metadata: JsonRecord;
  status: ProductAsset["qa_status"];
  note: string;
} {
  const creative = record(result.creative_policy_gate);
  const visual = record(result.visual_gate);
  const asr = record(result.asr_gate);
  const output = record(result.render_output_gate);
  const preparedAsset = record(result.prepared_video_asset);
  if (!creative && !visual && !asr && !output) {
    return { metadata: {}, status: "pending", note: "" };
  }
  const passed =
    creative?.gate_pass === true &&
    visual?.gate_pass === true &&
    asr?.pass === true &&
    output?.pass === true;
  return {
    metadata: {
      creative_policy_gate_pass: creative?.gate_pass === true,
      visual_gate_pass: visual?.gate_pass === true,
      korean_asr_pass: asr?.pass === true,
      korean_asr_similarity: number(asr?.similarity),
      product_anchor_recognized: asr?.product_anchor_recognized === true,
      render_output_pass: output?.pass === true,
      width: number(output?.width),
      height: number(output?.height),
      video_codec: text(output?.video_codec),
      audio_codec: text(output?.audio_codec),
      audio_present: output?.audio_present === true,
      video_checksum_sha256: sha256(preparedAsset?.checksum_sha256),
      video_size_bytes: positiveNumber(preparedAsset?.size_bytes),
      prepared_video_asset_provider: provider(preparedAsset?.provider),
      prepared_video_asset_storage_key: boundedText(preparedAsset?.storage_key, 512),
      prepared_video_asset_url: safeHttpsUrl(preparedAsset?.prepared_video_asset_url),
      prepared_video_asset_expires_at: timestamp(preparedAsset?.expires_at),
      prepared_video_asset_server_accessible: preparedAsset?.server_accessible === true,
      raw_urls_persisted: false,
      transcript_persisted: false
    },
    status: passed ? "passed" : "needs_fix",
    note: passed ? "Worker creative, ASR, and render output gates passed." : "Worker result gates require review."
  };
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function text(value: unknown) {
  return typeof value === "string" ? value.slice(0, 40) : "";
}

function boundedText(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function sha256(value: unknown) {
  const normalized = boundedText(value, 64).toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : "";
}

function positiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function provider(value: unknown) {
  return [
    "local_dev",
    "r2",
    "supabase_storage",
    "external_https"
  ].includes(String(value)) ? String(value) : "";
}

function safeHttpsUrl(value: unknown) {
  const normalized = boundedText(value, 2048);
  return /^https:\/\//i.test(normalized) ? normalized : "";
}

function timestamp(value: unknown) {
  const normalized = boundedText(value, 64);
  if (!normalized) return "";
  return Number.isFinite(Date.parse(normalized)) ? new Date(normalized).toISOString() : "";
}
