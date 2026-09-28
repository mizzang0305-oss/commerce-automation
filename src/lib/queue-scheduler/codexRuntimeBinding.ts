import { execFile } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { sha256File } from "./mediaEvidence";
import { assertCodexRuntimeCapsuleReference, computeCodexRuntimeConfigDigest, verifyCodexRuntimeCapsule, type CodexRuntimeCapsuleReference } from "./codexRuntimeCapsule";

type CodexRuntimeBindingFields = {
  command: string;
  commandSha256: string;
  cliVersion: string;
  model: string;
  reasoningEffort: "low" | "medium" | "high" | "xhigh";
  ignoreUserConfig: true;
};

// V1 remains readable as historical evidence. Future operations must use V2;
// no existing operation record is migrated or rebound by this module.
export type CodexRuntimeBinding = CodexRuntimeBindingFields & (
  | { schemaVersion: "daily69-codex-cli-runtime-v1" }
  | { schemaVersion: "daily69-codex-cli-runtime-v2"; capsule: CodexRuntimeCapsuleReference }
);

const execute = promisify(execFile);
const keys = ["schemaVersion", "command", "commandSha256", "cliVersion", "model", "reasoningEffort", "ignoreUserConfig"].sort();

export function assertCodexRuntimeBinding(value: unknown): asserts value is CodexRuntimeBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("CODEX_REVIEW_RUNTIME_BINDING_REQUIRED");
  const v = value as Record<string, unknown>;
  const capsuleBinding = v.schemaVersion === "daily69-codex-cli-runtime-v2";
  const expectedKeys = capsuleBinding ? [...keys, "capsule"].sort() : keys;
  const versionPattern = capsuleBinding ? /^\d+\.\d+\.\d+(?:-[a-z0-9]+(?:\.[a-z0-9]+)*)?$/u : /^\d+\.\d+\.\d+$/u;
  if (Object.keys(v).sort().join(",") !== expectedKeys.join(",") || !["daily69-codex-cli-runtime-v1", "daily69-codex-cli-runtime-v2"].includes(String(v.schemaVersion))
    || typeof v.command !== "string" || !isAbsolute(v.command) || !/\.exe$/iu.test(v.command)
    || typeof v.commandSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(v.commandSha256)
    || typeof v.cliVersion !== "string" || !versionPattern.test(v.cliVersion)
    || typeof v.model !== "string" || !/^gpt-[a-z0-9.-]{1,64}$/u.test(v.model)
    || !["low", "medium", "high", "xhigh"].includes(String(v.reasoningEffort)) || v.ignoreUserConfig !== true) {
    throw new Error("CODEX_REVIEW_RUNTIME_BINDING_INVALID");
  }
  if (capsuleBinding) {
    assertCodexRuntimeCapsuleReference(v.capsule);
    const capsule = v.capsule;
    if (v.command !== join(capsule.canonicalPath, "codex.exe") || v.commandSha256 !== capsule.binarySha256
      || v.cliVersion !== capsule.version || v.model !== capsule.model || v.reasoningEffort !== capsule.reasoningEffort
      || capsule.ignoreUserConfig !== true || capsule.configBindingDigest !== computeCodexRuntimeConfigDigest({
        model: capsule.model, reasoningEffort: capsule.reasoningEffort, ignoreUserConfig: true,
      })) throw new Error("CODEX_CAPSULE_CONFIG_BINDING_MISMATCH");
  }
}

export function assertOperationCodexCapsuleRuntimeBinding(value: unknown): asserts value is Extract<CodexRuntimeBinding, { schemaVersion: "daily69-codex-cli-runtime-v2" }> {
  assertCodexRuntimeBinding(value);
  if (value.schemaVersion !== "daily69-codex-cli-runtime-v2") throw new Error("CODEX_CAPSULE_OPERATION_BINDING_REQUIRED");
  if (value.capsule.purpose !== "operation") throw new Error("CODEX_CAPSULE_DIAGNOSTIC_PROMOTION_FORBIDDEN");
}

// Hash verification is also called immediately before launch. Do not inspect
// installed candidates or resolve PATH when a capsule identity is present.
export async function verifyCodexRuntimeBeforeInvocation(value: CodexRuntimeBinding, capsulePolicy?: { approvedRoot: string; forbiddenRoots?: string[] }): Promise<void> {
  assertCodexRuntimeBinding(value);
  if (value.schemaVersion === "daily69-codex-cli-runtime-v2") {
    const verified = await verifyCodexRuntimeCapsule(value.capsule, capsulePolicy);
    if (verified.command !== value.command) throw new Error("CODEX_CAPSULE_PATH_ESCAPE");
  }
}

export async function inspectCodexRuntimeBinding(value: unknown, dependencies: {
  hash?: (path: string) => Promise<string>;
  canonical?: (path: string) => Promise<string>;
  run?: (command: string, args: string[]) => Promise<string>;
  capsulePolicy?: { approvedRoot: string; forbiddenRoots?: string[] };
} = {}): Promise<CodexRuntimeBinding> {
  assertCodexRuntimeBinding(value);
  await verifyCodexRuntimeBeforeInvocation(value, dependencies.capsulePolicy);
  const canonical = await (dependencies.canonical ?? realpath)(value.command);
  if (canonical.toLowerCase() !== value.command.toLowerCase()) throw new Error("CODEX_REVIEW_RUNTIME_COMMAND_NOT_CANONICAL");
  if (await (dependencies.hash ?? sha256File)(value.command) !== value.commandSha256) throw new Error("CODEX_REVIEW_RUNTIME_BINARY_DRIFT");
  const run = dependencies.run ?? (async (command, args) => {
    try { return (await execute(command, args, { windowsHide: true, timeout: 15_000, maxBuffer: 2 * 1024 * 1024 })).stdout; }
    catch { throw new Error("CODEX_REVIEW_RUNTIME_PROBE_FAILED"); }
  });
  if ((await run(value.command, ["--version"])).trim() !== `codex-cli ${value.cliVersion}`) throw new Error("CODEX_REVIEW_RUNTIME_VERSION_DRIFT");
  const help = await run(value.command, ["exec", "--help"]);
  if (!help.includes("--ignore-user-config")) throw new Error("CODEX_REVIEW_CLI_UPGRADE_REQUIRED");
  let catalog: { models?: Array<{ slug?: string; supported_reasoning_levels?: Array<{ effort?: string }> }> };
  try { catalog = JSON.parse(await run(value.command, ["debug", "models", "--bundled"])); }
  catch { throw new Error("CODEX_REVIEW_RUNTIME_CATALOG_INVALID"); }
  const model = catalog.models?.find((entry) => entry.slug === value.model);
  if (!model || !model.supported_reasoning_levels?.some((entry) => entry.effort === value.reasoningEffort)) throw new Error("CODEX_REVIEW_RUNTIME_MODEL_NOT_BUNDLED");
  return value;
}

// Legacy queue users without a Daily69 manifest retain their existing invocation path.
// An operation manifest can never silently fall back to a mutable per-user CLI/model.
export async function readOperationCodexRuntime(operationRoot: string, namespace: string, required = true) {
  let manifest: Record<string, unknown>;
  try { manifest = JSON.parse(await readFile(join(operationRoot, "operation-manifest.json"), "utf8")); }
  catch (error) {
    if (!required && (error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error("CODEX_REVIEW_RUNTIME_MANIFEST_REQUIRED");
  }
  if (manifest.namespace !== namespace || basename(operationRoot) !== namespace) throw new Error("CODEX_REVIEW_RUNTIME_NAMESPACE_MISMATCH");
  assertCodexRuntimeBinding(manifest.codexReviewRuntime);
  if (manifest.codexReviewRuntime.schemaVersion === "daily69-codex-cli-runtime-v2") assertOperationCodexCapsuleRuntimeBinding(manifest.codexReviewRuntime);
  return inspectCodexRuntimeBinding(manifest.codexReviewRuntime);
}
