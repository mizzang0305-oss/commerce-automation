import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { atomicWriteJson } from "../../src/lib/queue-scheduler/atomicJson";
import { planImmutableReviewOperationBindings } from "../../src/lib/queue-scheduler/immutableReviewBinding";
import { LocalQueueRepository } from "../../src/lib/queue-scheduler/repository";
import type { ImmutableCodexReviewOperationBindingRefV1 } from "../../src/lib/queue-scheduler/types";
import { assertFirstOperationIdentity } from "../../src/lib/daily69-first-operation/operationIdentity";

export async function applyImmutableBindings(input: { queueRoot: string; originRegistryPath: string; now?: Date }) {
  assertNoUploadEnvironment(process.env);
  const queueRoot = resolve(input.queueRoot);
  const repository = new LocalQueueRepository(queueRoot);
  const [items, manifest] = await Promise.all([repository.items(), readJson(join(queueRoot, "operation-manifest.json"))]);
  if (manifest.schemaVersion !== "daily69-first-operation-v2" || manifest.namespace !== basename(queueRoot)
    || manifest.armStatus !== "prepared") {
    throw new Error("IMMUTABLE_REVIEW_BINDING_OPERATION_NOT_PREPARED");
  }
  assertFirstOperationIdentity({ namespace: manifest.namespace, operationDate: manifest.operationDate, attemptNumber: manifest.attemptNumber, previousAttemptNamespace: manifest.previousAttemptNamespace });
  const pending = items.filter((item) => item.operationCarryover && item.status === "video_ready_machine_qa" && item.reviewMetadata.codexReview === "not_executed")
    .sort((left, right) => left.queueRank - right.queueRank || left.id.localeCompare(right.id));
  const now = input.now ?? new Date();
  const planned = await planImmutableReviewOperationBindings({
    items: pending,
    targetOperationNamespace: String(manifest.namespace),
    targetOperationDate: String(manifest.operationDate),
    originRegistryPath: resolve(input.originRegistryPath),
    boundToOperationAt: now,
    requirePreparedItems: true,
    now,
  });
  const bindingRoot = join(queueRoot, "review-bindings");
  await mkdir(bindingRoot, { recursive: false });
  const records: Array<{ binding: typeof planned.bindings[number]; reference: ImmutableCodexReviewOperationBindingRefV1 }> = [];
  for (const binding of planned.bindings) {
    const bindingPath = join(bindingRoot, `${safeName(binding.targetQueueId)}.json`);
    await atomicWriteJson(bindingPath, binding);
    const bindingSha256 = createHash("sha256").update(await readFile(bindingPath)).digest("hex");
    records.push({ binding, reference: { schemaVersion: "queue-codex-review-operation-binding-ref-v1", bindingPath, bindingSha256 } });
  }
  const updated = await repository.recordImmutableReviewOperationBindings({ bindings: records, now });
  const registry = {
    schemaVersion: "daily69-immutable-review-operation-binding-registry-v1",
    targetOperationNamespace: manifest.namespace,
    targetOperationDate: manifest.operationDate,
    boundToOperationAt: now.toISOString(),
    originRegistryPath: resolve(input.originRegistryPath),
    originRegistrySha256: planned.summary.originRegistrySha256,
    bindings: records.map(({ binding, reference }) => ({ queueId: binding.targetQueueId, productKey: binding.targetProductKey, originReviewedAt: binding.originReviewedAt, ...reference })),
    bindingsPassed: updated,
    fakeReviewedAtMutations: 0,
    aiReviewExecutions: 0,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false,
    PLATFORM_UPLOAD: 0,
  } as const;
  await atomicWriteJson(join(bindingRoot, "registry.json"), registry);
  await atomicWriteJson(join(queueRoot, "operation-manifest.json"), {
    ...manifest,
    verifiedReady: updated,
    reviewBindingContract: {
      schemaVersion: registry.schemaVersion,
      originRegistrySha256: registry.originRegistrySha256,
      bindingsPassed: updated,
      fakeReviewedAtMutations: 0,
      aiReviewExecutions: 0,
    },
  });
  return { updated, registry };
}

async function main() {
  const result = await applyImmutableBindings({ queueRoot: requiredArg("--queue-root"), originRegistryPath: requiredArg("--origin-registry") });
  process.stdout.write(`${JSON.stringify({ event: "daily69_immutable_review_bindings_applied", targetNamespace: result.registry.targetOperationNamespace, bindings: result.updated, fakeReviewedAtMutations: 0, aiReviewExecutions: 0, SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 })}\n`);
}

async function readJson(path: string): Promise<Record<string, unknown>> { return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>; }
function safeName(value: string) { if (!/^[A-Za-z0-9_-]{1,128}$/u.test(value)) throw new Error("IMMUTABLE_REVIEW_BINDING_QUEUE_ID_INVALID"); return value; }
function requiredArg(name: string) { const index = process.argv.indexOf(name); const value = index >= 0 ? process.argv[index + 1] : ""; if (!value) throw new Error(`MISSING_ARGUMENT_${name.replace(/^-+/u, "").toUpperCase()}`); return value; }
function assertNoUploadEnvironment(env: NodeJS.ProcessEnv) { if (["SAFE_TO_UPLOAD", "SAFE_TO_PUBLIC_UPLOAD", "YOUTUBE_AUTO_UPLOAD", "PUBLIC_UPLOAD", "UNLISTED_UPLOAD", "TIKTOK_AUTO_UPLOAD", "THREADS_AUTO_POST", "COMMENT_AUTOMATION", "GOOGLE_DRIVE_VIDEO_UPLOAD"].some((name) => env[name]?.trim().toLowerCase() === "true")) throw new Error("UPLOAD_SAFETY_FLAG_BLOCKED"); }
function safeError(error: unknown) { const value = error instanceof Error ? error.message : String(error); return /^[A-Z0-9_:-]+$/u.test(value) ? value : "IMMUTABLE_REVIEW_BINDING_APPLY_FAILED"; }

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/gu, "/"))) {
  void main().catch((error: unknown) => { process.stderr.write(`${JSON.stringify({ event: "daily69_immutable_review_binding_apply_failed", safeError: safeError(error), SAFE_TO_UPLOAD: false })}\n`); process.exitCode = 1; });
}
