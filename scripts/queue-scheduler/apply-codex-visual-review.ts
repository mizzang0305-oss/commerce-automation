import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { LocalQueueRepository } from "../../src/lib/queue-scheduler";
import { captureCodexReviewEvidence } from "../../src/lib/queue-scheduler/codexReviewEvidence";

async function main(): Promise<void> {
  const runRoot = resolve(requiredArg("--run"));
  const notesPath = resolve(requiredArg("--notes"));
  const queueRoot = resolve(requiredArg("--queue-root"));
  const manifestPath = join(runRoot, "run-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    items?: Array<{ productKey?: unknown; finalVideo?: unknown; finalAutomatedQaPassed?: unknown }>;
    visualReviewExecuted?: unknown;
    finalAutomatedQaPassed?: unknown;
  };
  const notes = JSON.parse(await readFile(notesPath, "utf8")) as {
    products?: Array<{
      queueId?: unknown;
      productKey?: unknown;
      passed?: unknown;
      notes?: unknown;
      firstFrameNote?: unknown;
      firstThreeSecondsNote?: unknown;
      contactSheetNote?: unknown;
      originOperationNamespace?: unknown;
      originQueueId?: unknown;
      originVideoSha256?: unknown;
    }>;
  };
  if (manifest.visualReviewExecuted !== true || !Array.isArray(manifest.items)) {
    throw new Error("CODEX_VISUAL_REVIEW_MANIFEST_NOT_FINAL");
  }
  if (!Array.isArray(notes.products) || notes.products.length !== manifest.items.length) {
    throw new Error("CODEX_VISUAL_REVIEW_NOTE_COUNT_MISMATCH");
  }
  const manifestResults = new Map(manifest.items.map((item) => [String(item.productKey ?? ""), item.finalAutomatedQaPassed === true]));
  const manifestPassed = [...manifestResults.values()].filter(Boolean).length;
  if (manifestResults.size !== manifest.items.length || manifest.finalAutomatedQaPassed !== manifestPassed) {
    throw new Error("CODEX_VISUAL_REVIEW_MANIFEST_NOT_FINAL");
  }
  const repository = new LocalQueueRepository(queueRoot);
  const queueItems = await repository.items();
  const reviewedAt = new Date();
  const reviews = await Promise.all(notes.products.map(async (note) => {
    const queueId = String(note.queueId ?? "");
    const productKey = String(note.productKey ?? "");
    if (!queueId || !productKey || typeof note.passed !== "boolean") {
      throw new Error("CODEX_VISUAL_REVIEW_INPUT_INVALID");
    }
    const manifestItem = manifest.items!.find((item) => item.productKey === productKey);
    const queueItem = queueItems.find((item) => item.id === queueId);
    if (!manifestItem || !queueItem || queueItem.productKey !== productKey || typeof manifestItem.finalVideo !== "string") {
      throw new Error("CODEX_VISUAL_REVIEW_BINDING_MISMATCH");
    }
    if (manifestResults.get(productKey) !== note.passed) throw new Error("CODEX_VISUAL_REVIEW_NOTE_MISMATCH");
    const reviewNotes = exactNotes(note);
    return captureCodexReviewEvidence({
      operationNamespace: basename(queueRoot),
      queueId,
      productKey,
      videoPath: manifestItem.finalVideo,
      reviewedAt,
      reviewResult: note.passed ? "pass" : "block",
      sourceReviewArtifact: queueItem.reviewPath,
      notes: reviewNotes,
      regenerationCount: Math.max(0, queueItem.attemptCount - 1),
      ...(typeof note.originOperationNamespace === "string" ? { originOperationNamespace: note.originOperationNamespace } : {}),
      ...(typeof note.originQueueId === "string" ? { originQueueId: note.originQueueId } : {}),
      ...(typeof note.originVideoSha256 === "string" ? { originVideoSha256: note.originVideoSha256 } : {})
    });
  }));
  const updated = await repository.recordCodexVisualReviews({ reviews, now: reviewedAt });
  console.log(JSON.stringify({ event: "queue_codex_visual_review_applied", reviewed: updated, passed: reviews.filter((review) => review.reviewResult === "pass").length, evidenceSchemaVersion: "queue-codex-review-evidence-v2", historicalTimestampAccepted: false, humanOwnerReviewStatus: "not_requested", publishReady: false, SAFE_TO_UPLOAD: false }));
}

function exactNotes(note: { notes?: unknown; firstFrameNote?: unknown; firstThreeSecondsNote?: unknown; contactSheetNote?: unknown }): string {
  if (typeof note.notes === "string" && note.notes.trim().length >= 20) return note.notes.trim();
  const values = [note.firstFrameNote, note.firstThreeSecondsNote, note.contactSheetNote];
  if (values.some((value) => typeof value !== "string" || value.trim().length < 20)) throw new Error("CODEX_VISUAL_REVIEW_NOTES_INVALID");
  return JSON.stringify({ firstFrameNote: values[0], firstThreeSecondsNote: values[1], contactSheetNote: values[2] });
}

function requiredArg(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : "";
  if (!value) throw new Error(`MISSING_ARGUMENT_${name.replace(/^-+/u, "").toUpperCase()}`);
  return value;
}

void main().catch((error: unknown) => {
  const message = error instanceof Error && /^[A-Z0-9_:-]+$/u.test(error.message) ? error.message : "CODEX_VISUAL_REVIEW_APPLY_FAILED";
  console.error(JSON.stringify({ event: "queue_codex_visual_review_apply_failed", safeError: message, SAFE_TO_UPLOAD: false }));
  process.exitCode = 1;
});
