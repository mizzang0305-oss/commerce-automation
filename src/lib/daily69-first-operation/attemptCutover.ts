import { readFile, realpath } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { assertFreshAttemptCutover, projectionNamespaceRegistryEntry } from "@/lib/queue-control-integration/quarantine";
import type { FirstOperationManifest } from "./index";
import { assertFirstOperationIdentity } from "./operationIdentity";

/** Read the held predecessor from the same canonical operation base; never accept a caller-supplied path. */
export async function assertFirstOperationAttemptCutover(operationRoot: string, manifest: FirstOperationManifest) {
  const identity = assertFirstOperationIdentity(manifest);
  const root = resolve(operationRoot);
  if (basename(root) !== identity.namespace) throw new Error("CUTOVER_NAMESPACE_BINDING_MISMATCH");
  const previousAttemptNamespace = manifest.previousAttemptNamespace ?? "";
  let previousAttemptManifest: unknown;
  if (identity.attemptNumber > 1 && !projectionNamespaceRegistryEntry(previousAttemptNamespace)) {
    const operationBase = await realpath(dirname(root));
    let predecessorRoot: string;
    try { predecessorRoot = await realpath(join(operationBase, previousAttemptNamespace)); }
    catch { throw new Error("CUTOVER_PREVIOUS_ATTEMPT_MANIFEST_MISSING"); }
    if (!samePath(dirname(predecessorRoot), operationBase) || basename(predecessorRoot) !== previousAttemptNamespace) {
      throw new Error("CUTOVER_PREVIOUS_ATTEMPT_ROOT_INVALID");
    }
    try {
      const manifestPath = await realpath(join(predecessorRoot, "operation-manifest.json"));
      if (!samePath(dirname(manifestPath), predecessorRoot)) throw new Error("CUTOVER_PREVIOUS_ATTEMPT_ROOT_INVALID");
      previousAttemptManifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch (error) {
      if (error instanceof Error && error.message === "CUTOVER_PREVIOUS_ATTEMPT_ROOT_INVALID") throw error;
      throw new Error("CUTOVER_PREVIOUS_ATTEMPT_MANIFEST_INVALID");
    }
  }
  return assertFreshAttemptCutover({ ...identity, previousAttemptNamespace, previousAttemptManifest });
}

function samePath(left: string, right: string) {
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}
