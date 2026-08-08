import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { LIVE_PRODUCT_VIDEO_FLAGS } from "../../src/lib/live-product-video";

async function main() {
  const runRoot = resolve(requiredArg("--run"));
  const notes = resolve(requiredArg("--notes"));
  const summaryPath = join(runRoot, "final-summary.json");
  const summary = JSON.parse(await readFile(summaryPath, "utf8")) as Record<string, unknown>;
  const videoRunRoot = typeof summary.videoRunRoot === "string" ? resolve(summary.videoRunRoot) : "";
  if (!videoRunRoot) throw new Error("LIVE_VIDEO_RUN_ROOT_MISSING");
  await runFinalizer(videoRunRoot, notes);
  const manifest = JSON.parse(await readFile(join(videoRunRoot, "run-manifest.json"), "utf8")) as Record<string, unknown> & { items?: Array<Record<string, unknown>> };
  const items = manifest.items ?? [];
  const passed = items.filter((item) => item.finalAutomatedQaPassed === true).length;
  const decision = passed === 3
    ? "LIVE_PRODUCT_TO_AUTONOMOUS_VIDEO_V1_PROVEN_3_OF_3_NO_UPLOAD"
    : passed > 0 ? "LIVE_PRODUCT_TO_VIDEO_V1_PARTIAL" : "BLOCKED_FOR_OWNER_DECISION";
  Object.assign(summary, {
    decision,
    machineQaPassed: Number(manifest.machineQaPassed ?? 0),
    visualReviewExecuted: manifest.visualReviewExecuted === true,
    finalAutomatedQaPassed: passed,
    videoItems: items.map((item) => ({
      productKey: item.productKey,
      creativeScore: item.creativeScore,
      videoQualityScore: item.score,
      finalAutomatedQaPassed: item.finalAutomatedQaPassed,
      visualReviewExecuted: item.visualReviewExecuted,
      repairs: item.repairs,
      exactProductReference: item.exactProductReference,
      genericUsageEvidence: item.genericUsageEvidence,
      exactProductUse: false,
      overclaim: false,
      blockers: item.blockers
    })),
    humanOwnerReviewStatus: "not_requested",
    publishReady: false,
    finalizedAt: new Date().toISOString(),
    ...LIVE_PRODUCT_VIDEO_FLAGS
  });
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ event: "live_product_video_codex_review_finalized", decision, passed, requested: items.length, visualReviewExecuted: manifest.visualReviewExecuted === true, ...LIVE_PRODUCT_VIDEO_FLAGS }));
  if (passed !== 3) process.exitCode = 2;
}

async function runFinalizer(runRoot: string, notes: string) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "scripts/video-automation/finalize-autonomous-video-review-v2.ts", "--run", runRoot, "--notes", notes], { cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => { if (stderr.length < 8_192) stderr += chunk.toString("utf8"); });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolvePromise() : reject(new Error(stderr.includes("MISMATCH") ? "CODEX_VISUAL_REVIEW_MISMATCH" : "CODEX_VISUAL_REVIEW_FINALIZE_FAILED")));
  });
}

function requiredArg(name: string) { const index = process.argv.indexOf(name); const value = index >= 0 ? process.argv[index + 1] : ""; if (!value) throw new Error(`MISSING_ARGUMENT_${name.replace(/^-+/u, "").toUpperCase()}`); return value; }
function safeError(error: unknown) { const value = error instanceof Error ? error.message : "LIVE_PRODUCT_VIDEO_FINALIZE_FAILED"; return /^[A-Z0-9_:-]+$/u.test(value) ? value : "LIVE_PRODUCT_VIDEO_FINALIZE_FAILED"; }
void main().catch((error: unknown) => { console.error(JSON.stringify({ event: "live_product_video_finalize_failed", safeError: safeError(error), ...LIVE_PRODUCT_VIDEO_FLAGS })); process.exitCode = 1; });
