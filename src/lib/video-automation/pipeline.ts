import { buildPopGroupCaptions } from "./captionIntegration";
import { selectTopPassingCreative } from "./creativeSelection";
import { validateProductVideoInput } from "./productInput";
import type { PipelineDependencies, PipelineResult, ProductVideoAutomationInput } from "./types";

export async function runProductToVideoPipeline(input: ProductVideoAutomationInput, deps: PipelineDependencies): Promise<PipelineResult> {
  validateProductVideoInput(input);
  const stages: PipelineResult["stages"] = [];
  const candidates = await deps.generateCandidates(input);
  const selection = selectTopPassingCreative(input.product.productKey, candidates);
  stages.push("creative_ready");
  const selected = selection.candidates.find((entry) => entry.selected)?.candidate;
  if (!selected) return { status: "CREATIVE_SELECTION_FAILED", stages, selection, outputPath: null, qaPassed: false, blockers: ["CREATIVE_SELECTION_FAILED"], SAFE_TO_UPLOAD: false };
  try {
    const tts = await deps.synthesize(selected.script);
    stages.push("tts_ready");
    const asr = await deps.validateAsr(tts.audioPath, selected.script, input.product.anchors);
    if (!asr.passed) throw new Error("ASR_FAILED");
    stages.push("asr_ready");
    const alignment = await deps.align(tts.audioPath);
    const captions = buildPopGroupCaptions(alignment.words);
    stages.push("alignment_ready");
    const rendered = await deps.render({ selected, audioPath: tts.audioPath, captions, product: input.product });
    stages.push("rendered");
    const qa = await deps.qa({ outputPath: rendered.outputPath, selected, captions, asrSimilarity: asr.similarity });
    if (!qa.passed) return { status: "MANUAL_REVIEW", stages, selection, outputPath: rendered.outputPath, qaPassed: false, blockers: qa.blockers, SAFE_TO_UPLOAD: false };
    stages.push("qa_pass");
    return { status: "COMPLETED", stages, selection, outputPath: rendered.outputPath, qaPassed: true, blockers: [], SAFE_TO_UPLOAD: false };
  } catch (error) {
    return { status: "FAILED", stages, selection, outputPath: null, qaPassed: false, blockers: [safeError(error)], SAFE_TO_UPLOAD: false };
  }
}

function safeError(error: unknown): string {
  const value = error instanceof Error ? error.message : "VIDEO_AUTOMATION_FAILED";
  return /^[A-Z0-9_:-]+$/u.test(value) ? value : "VIDEO_AUTOMATION_FAILED";
}
