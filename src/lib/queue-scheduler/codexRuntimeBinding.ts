import { execFile } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { sha256File } from "./mediaEvidence";

export type CodexRuntimeBinding = {
  schemaVersion: "daily69-codex-cli-runtime-v1";
  command: string;
  commandSha256: string;
  cliVersion: string;
  model: string;
  reasoningEffort: "low" | "medium" | "high" | "xhigh";
  ignoreUserConfig: true;
};

const execute = promisify(execFile);
const keys = ["schemaVersion", "command", "commandSha256", "cliVersion", "model", "reasoningEffort", "ignoreUserConfig"].sort();

export function assertCodexRuntimeBinding(value: unknown): asserts value is CodexRuntimeBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("CODEX_REVIEW_RUNTIME_BINDING_REQUIRED");
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(",") !== keys.join(",") || v.schemaVersion !== "daily69-codex-cli-runtime-v1"
    || typeof v.command !== "string" || !isAbsolute(v.command) || !/\.exe$/iu.test(v.command)
    || typeof v.commandSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(v.commandSha256)
    || typeof v.cliVersion !== "string" || !/^\d+\.\d+\.\d+$/u.test(v.cliVersion)
    || typeof v.model !== "string" || !/^gpt-[a-z0-9.-]{1,64}$/u.test(v.model)
    || !["low", "medium", "high", "xhigh"].includes(String(v.reasoningEffort)) || v.ignoreUserConfig !== true) {
    throw new Error("CODEX_REVIEW_RUNTIME_BINDING_INVALID");
  }
}

export async function inspectCodexRuntimeBinding(value: unknown, dependencies: {
  hash?: (path: string) => Promise<string>;
  canonical?: (path: string) => Promise<string>;
  run?: (command: string, args: string[]) => Promise<string>;
} = {}): Promise<CodexRuntimeBinding> {
  assertCodexRuntimeBinding(value);
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
  return inspectCodexRuntimeBinding(manifest.codexReviewRuntime);
}
