import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { LocalQueueRepository } from "../../src/lib/queue-scheduler";

async function main(): Promise<void> {
  const runRoot = resolve(requiredArg("--run"));
  const notesPath = resolve(requiredArg("--notes"));
  const queueRoot = resolve(requiredArg("--queue-root"));
  const manifest = JSON.parse(await readFile(join(runRoot, "run-manifest.json"), "utf8")) as {
    items?: Array<{ productKey?: unknown; finalAutomatedQaPassed?: unknown }>;
    visualReviewExecuted?: unknown;
    finalAutomatedQaPassed?: unknown;
  };
  const notes = JSON.parse(await readFile(notesPath, "utf8")) as {
    products?: Array<{ productKey?: unknown; passed?: unknown }>;
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
  if (notes.products.some((note) => typeof note.passed !== "boolean")) throw new Error("CODEX_VISUAL_REVIEW_INPUT_INVALID");
  const reviews = notes.products.map((note) => ({ productKey: String(note.productKey ?? ""), passed: note.passed === true }));
  if (reviews.some((review) => !review.productKey)) throw new Error("CODEX_VISUAL_REVIEW_INPUT_INVALID");
  if (reviews.some((review) => manifestResults.get(review.productKey) !== review.passed)) throw new Error("CODEX_VISUAL_REVIEW_NOTE_MISMATCH");
  const updated = await new LocalQueueRepository(queueRoot).recordCodexVisualReviews({ reviews, now: new Date() });
  console.log(JSON.stringify({ event: "queue_codex_visual_review_applied", reviewed: updated, passed: reviews.filter((review) => review.passed).length, humanOwnerReviewStatus: "not_requested", publishReady: false, SAFE_TO_UPLOAD: false }));
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
