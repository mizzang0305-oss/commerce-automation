import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { evaluateAutomatedVideoQuality } from "../../src/lib/video-automation/qa/automatedVideoQuality";
import type { AutomatedReviewInput, CodexVisualReview } from "../../src/lib/video-automation/qa/types";

async function main(): Promise<void> {
  const runRoot = resolve(requiredArg("--run"));
  const notesPath = resolve(requiredArg("--notes"));
  const manifestPath = join(runRoot, "run-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown> & { mode: "reference" | "batch"; items: Array<Record<string, unknown>> };
  const notes = JSON.parse(await readFile(notesPath, "utf8")) as { products?: Array<Record<string, unknown>> };
  if (!Array.isArray(notes.products) || notes.products.length !== manifest.items.length) throw new Error("CODEX_VISUAL_REVIEW_NOTE_COUNT_MISMATCH");
  let passed = 0;
  for (const [index, item] of manifest.items.entries()) {
    const note = notes.products.find((entry) => entry.productKey === item.productKey);
    if (!note) throw new Error("CODEX_VISUAL_REVIEW_NOTE_MISSING");
    for (const key of ["firstFrameNote", "firstThreeSecondsNote", "contactSheetNote"] as const) {
      if (typeof note[key] !== "string" || note[key].trim().length < 20 || note[key] === "looks good") throw new Error("CODEX_VISUAL_REVIEW_NOTE_TOO_GENERIC");
    }
    const productBase = join(runRoot, `product-${String(index + 1).padStart(3, "0")}`);
    const productRoot = join(productBase, "final");
    const reviewInput = JSON.parse(await readFile(join(productRoot, "review-input.json"), "utf8")) as AutomatedReviewInput;
    const visualReview: CodexVisualReview = {
      visualReviewExecuted: true,
      passed: note.passed === true,
      reviewer: "codex_local_visual_inspection",
      inspectedPaths: [reviewInput.measurements.firstFramePath, reviewInput.measurements.firstThreeSecondsContactSheetPath, reviewInput.measurements.contactSheetPath],
      firstFrameNote: String(note.firstFrameNote), firstThreeSecondsNote: String(note.firstThreeSecondsNote), contactSheetNote: String(note.contactSheetNote)
    };
    const review = evaluateAutomatedVideoQuality({ ...reviewInput, codexVisualReview: visualReview });
    await writeFile(join(productRoot, "automated-review.json"), `${JSON.stringify(review, null, 2)}\n`, "utf8");
    const summaryPath = join(productBase, "summary.json");
    const summary = JSON.parse(await readFile(summaryPath, "utf8")) as Record<string, unknown>;
    Object.assign(summary, { status: review.finalAutomatedQaPassed ? "AUTO_QA_PASS" : "AUTO_QA_BLOCKED", visualReviewExecuted: true, finalAutomatedQaPassed: review.finalAutomatedQaPassed, humanOwnerReviewStatus: "not_requested", publishReady: false });
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    Object.assign(item, { status: review.finalAutomatedQaPassed ? "AUTO_QA_PASS" : "AUTO_QA_BLOCKED", score: review.score, visualReviewExecuted: true, finalAutomatedQaPassed: review.finalAutomatedQaPassed, blockers: review.blockers, humanOwnerReviewStatus: "not_requested", publishReady: false });
    if (review.finalAutomatedQaPassed) passed += 1;
  }
  const requested = manifest.items.length;
  const decision = passed === requested
    ? (manifest.mode === "reference" ? "AUTONOMOUS_VIDEO_QA_V2_REFERENCE_PROVEN_BATCH_PARTIAL" : "AUTONOMOUS_VIDEO_QA_V2_PROVEN_3_OF_3_NO_UPLOAD")
    : (manifest.mode === "reference" ? "AUTONOMOUS_VIDEO_QA_V2_REPAIR_REQUIRED" : passed > 0 ? "AUTONOMOUS_VIDEO_QA_V2_REFERENCE_PROVEN_BATCH_PARTIAL" : "AUTONOMOUS_VIDEO_QA_V2_REPAIR_REQUIRED");
  Object.assign(manifest, { decision, visualReviewExecuted: true, finalAutomatedQaPassed: passed, humanOwnerReviewStatus: "not_requested", publishReady: false, finalizedAt: new Date().toISOString() });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ event: "autonomous_video_v2_codex_review_finalized", runRoot, decision, passed, requested, humanOwnerReviewStatus: "not_requested", publishReady: false, SAFE_TO_UPLOAD: false }));
  if (passed !== requested) process.exitCode = 2;
}

function requiredArg(name: string): string { const index = process.argv.indexOf(name); const value = index >= 0 ? process.argv[index + 1] : ""; if (!value) throw new Error(`MISSING_ARGUMENT_${name.replace(/^-+/u, "").toUpperCase()}`); return value; }
void main().catch((error: unknown) => { const message = error instanceof Error && /^[A-Z0-9_:-]+$/u.test(error.message) ? error.message : "AUTONOMOUS_VIDEO_REVIEW_FINALIZE_FAILED"; console.error(JSON.stringify({ event: "autonomous_video_v2_finalize_failed", safeError: message, SAFE_TO_UPLOAD: false })); process.exitCode = 1; });
