import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { planImmutableReviewOperationBindings } from "../../src/lib/queue-scheduler/immutableReviewBinding";
import type { LocalQueueItem } from "../../src/lib/queue-scheduler/types";

export async function planImmutableBindings(input: {
  sourceRoot: string;
  targetNamespace: string;
  targetDate: string;
  originRegistryPath: string;
  now?: Date;
}) {
  assertNoUploadEnvironment(process.env);
  const sourceRoot = resolve(input.sourceRoot);
  const queue = JSON.parse(await readFile(resolve(sourceRoot, "queue.json"), "utf8")) as LocalQueueItem[];
  const ready = queue.filter((item) => item.status === "video_ready_autoqa" && item.reviewMetadata.codexReview === "pass")
    .sort((left, right) => left.queueRank - right.queueRank || left.id.localeCompare(right.id));
  const now = input.now ?? new Date();
  const result = await planImmutableReviewOperationBindings({
    items: ready,
    targetOperationNamespace: input.targetNamespace,
    targetOperationDate: input.targetDate,
    originRegistryPath: resolve(input.originRegistryPath),
    boundToOperationAt: now,
    requirePreparedItems: false,
    now,
  });
  return { sourceNamespace: basename(sourceRoot), targetNamespace: input.targetNamespace, targetDate: input.targetDate, ...result.summary };
}

async function main() {
  const result = await planImmutableBindings({
    sourceRoot: requiredArg("--source-root"),
    targetNamespace: requiredArg("--target-namespace"),
    targetDate: requiredArg("--target-date"),
    originRegistryPath: requiredArg("--origin-registry"),
  });
  process.stdout.write(`${JSON.stringify({ event: "daily69_immutable_review_binding_plan", decision: "IMMUTABLE_REVIEW_BINDING_DRY_RUN_PASS", ...result })}\n`);
}

function requiredArg(name: string) { const index = process.argv.indexOf(name); const value = index >= 0 ? process.argv[index + 1] : ""; if (!value) throw new Error(`MISSING_ARGUMENT_${name.replace(/^-+/u, "").toUpperCase()}`); return value; }
function assertNoUploadEnvironment(env: NodeJS.ProcessEnv) { if (["SAFE_TO_UPLOAD", "SAFE_TO_PUBLIC_UPLOAD", "YOUTUBE_AUTO_UPLOAD", "PUBLIC_UPLOAD", "UNLISTED_UPLOAD", "TIKTOK_AUTO_UPLOAD", "THREADS_AUTO_POST", "COMMENT_AUTOMATION", "GOOGLE_DRIVE_VIDEO_UPLOAD"].some((name) => env[name]?.trim().toLowerCase() === "true")) throw new Error("UPLOAD_SAFETY_FLAG_BLOCKED"); }
function safeError(error: unknown) { const value = error instanceof Error ? error.message : String(error); return /^[A-Z0-9_:-]+$/u.test(value) ? value : "IMMUTABLE_REVIEW_BINDING_PLAN_FAILED"; }

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/gu, "/"))) {
  void main().catch((error: unknown) => { process.stderr.write(`${JSON.stringify({ event: "daily69_immutable_review_binding_plan_failed", safeError: safeError(error), SAFE_TO_UPLOAD: false })}\n`); process.exitCode = 1; });
}
