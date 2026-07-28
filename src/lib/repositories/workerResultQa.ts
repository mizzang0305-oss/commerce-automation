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
