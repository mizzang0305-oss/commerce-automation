import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { assertOperationCodexCapsuleRuntimeBinding, inspectCodexRuntimeBinding, type CodexRuntimeBinding } from "../queue-scheduler/codexRuntimeBinding";
import type { VerifiedCodexRuntimeCapsule } from "../queue-scheduler/codexRuntimeCapsule";

export function bindingForCodexRuntimeCapsule(capsule: VerifiedCodexRuntimeCapsule): CodexRuntimeBinding {
  const ref = capsule.reference;
  return { schemaVersion: "daily69-codex-cli-runtime-v2", capsule: ref, command: capsule.command,
    commandSha256: ref.binarySha256, cliVersion: ref.version, model: ref.model,
    reasoningEffort: ref.reasoningEffort, ignoreUserConfig: true };
}

/** Future admission only: legacy records remain readable, never implicitly migrated. */
export async function verifyFirstOperationCapsuleAdmission(value: unknown): Promise<CodexRuntimeBinding> {
  assertOperationCodexCapsuleRuntimeBinding(value);
  return inspectCodexRuntimeBinding(value);
}

export type TaskCapsuleBinding = {
  operationRoot: string;
  namespace: string;
  capsulePath: string;
  manifestSha256: string;
  bundleDigest: string;
  binarySha256: string;
};

/** Read-only gate used before Task claim/environment loading; never creates evidence. */
export async function verifyFirstOperationTaskCapsule(input: TaskCapsuleBinding): Promise<void> {
  if (!/^operation-\d{4}-\d{2}-\d{2}(?:-attempt-\d+)?$/u.test(input.namespace)
    || basename(resolve(input.operationRoot)) !== input.namespace) throw new Error("CODEX_CAPSULE_TASK_NAMESPACE_MISMATCH");
  let manifest: Record<string, unknown>;
  try { manifest = JSON.parse(await readFile(join(input.operationRoot, "operation-manifest.json"), "utf8")); }
  catch { throw new Error("CODEX_CAPSULE_MANIFEST_INVALID"); }
  if (manifest.namespace !== input.namespace) throw new Error("CODEX_CAPSULE_TASK_NAMESPACE_MISMATCH");
  const runtime = manifest.codexReviewRuntime;
  assertOperationCodexCapsuleRuntimeBinding(runtime);
  if (runtime.capsule.canonicalPath !== input.capsulePath || runtime.capsule.manifestSha256 !== input.manifestSha256
    || runtime.capsule.bundleDigest !== input.bundleDigest || runtime.commandSha256 !== input.binarySha256) {
    throw new Error("CODEX_CAPSULE_TASK_BINDING_MISMATCH");
  }
  await verifyFirstOperationCapsuleAdmission(runtime);
}
