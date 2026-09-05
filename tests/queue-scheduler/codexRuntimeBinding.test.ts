import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertCodexRuntimeBinding, inspectCodexRuntimeBinding, readOperationCodexRuntime, type CodexRuntimeBinding } from "../../src/lib/queue-scheduler/codexRuntimeBinding";
import { buildCodexCliArguments, classifyCliFailure } from "../../src/lib/queue-scheduler/codexCliReviewExecutor";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const binding: CodexRuntimeBinding = { schemaVersion: "daily69-codex-cli-runtime-v1", command: join(tmpdir(), "codex.exe"), commandSha256: "a".repeat(64), cliVersion: "0.153.1", model: "gpt-6-astra", reasoningEffort: "medium", ignoreUserConfig: true };
function probes() {
  return { canonical: async (p: string) => p, hash: async () => binding.commandSha256, run: vi.fn(async (_: string, args: string[]) => args[0] === "--version" ? "codex-cli 0.153.1\n" : args[0] === "exec" ? "--ignore-user-config" : JSON.stringify({ models: [{ slug: "gpt-6-astra", supported_reasoning_levels: [{ effort: "medium" }] }] })) };
}
describe("immutable Daily69 Codex runtime", () => {
  it("classifies the reproduced HTTP 400 before unrelated MCP auth warnings", () => {
    expect(classifyCliFailure(`authentication warning\nThe 'gpt-6-astra' model requires a newer version of Codex. Please upgrade to the latest app or CLI and try again.`)).toBe("CODEX_REVIEW_CLI_UPGRADE_REQUIRED");
  });
  it("pins the model and disables ambient user configuration without widening sandbox access", () => {
    const args = buildCodexCliArguments({ imagePaths: [], cwd: "C:/diagnostic", schemaPath: "schema.json", outputPath: "output.json", runtimeBinding: binding });
    expect(args).toContain("--ignore-user-config");
    expect(args.slice(args.indexOf("--model"), args.indexOf("--model") + 2)).toEqual(["--model", "gpt-6-astra"]);
    expect(args).toContain('model_reasoning_effort="medium"');
    expect(args.slice(args.indexOf("--sandbox"), args.indexOf("--sandbox") + 2)).toEqual(["--sandbox", "read-only"]);
    expect(args).toContain("--ephemeral");
  });
  it("accepts only exact binary/version plus locally bundled model and reasoning capability", async () => {
    await expect(inspectCodexRuntimeBinding(binding, probes())).resolves.toEqual(binding);
  });
  it("rejects binary drift before executing any command", async () => {
    const p = probes(); p.hash = async () => "b".repeat(64);
    await expect(inspectCodexRuntimeBinding(binding, p)).rejects.toThrow("CODEX_REVIEW_RUNTIME_BINARY_DRIFT");
    expect(p.run).not.toHaveBeenCalled();
  });
  it("rejects version drift and missing config isolation support", async () => {
    await expect(inspectCodexRuntimeBinding({ ...binding, cliVersion: "0.144.6" }, probes())).rejects.toThrow("VERSION_DRIFT");
    const p = probes(); p.run.mockImplementation(async (_, args) => args[0] === "--version" ? "codex-cli 0.153.1" : "old help");
    await expect(inspectCodexRuntimeBinding(binding, p)).rejects.toThrow("UPGRADE_REQUIRED");
  });
  it("rejects an unsupported model or reasoning effort before inference", async () => {
    await expect(inspectCodexRuntimeBinding({ ...binding, model: "gpt-unknown" }, probes())).rejects.toThrow("MODEL_NOT_BUNDLED");
    await expect(inspectCodexRuntimeBinding({ ...binding, reasoningEffort: "high" }, probes())).rejects.toThrow("MODEL_NOT_BUNDLED");
  });
  it.each([null, { ...binding, command: "relative.exe" }, { ...binding, command: join(tmpdir(), "codex.ps1") }, { ...binding, model: "--yolo" }, { ...binding, ignoreUserConfig: false }, { ...binding, secret: "never accept" }])("rejects malformed or unsafe bindings", v => {
    expect(() => assertCodexRuntimeBinding(v)).toThrow(/CODEX_REVIEW_RUNTIME_BINDING_/);
  });
  it("never falls back when an operation manifest lacks a binding or has the wrong identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "codex-runtime-")); roots.push(root);
    const namespace = root.split(/[\\/]/).at(-1)!;
    await expect(readOperationCodexRuntime(root, namespace, false)).resolves.toBeUndefined();
    await expect(readOperationCodexRuntime(root, namespace)).rejects.toThrow("MANIFEST_REQUIRED");
    await writeFile(join(root, "operation-manifest.json"), JSON.stringify({ namespace }));
    await expect(readOperationCodexRuntime(root, namespace, false)).rejects.toThrow("BINDING_REQUIRED");
    await expect(readOperationCodexRuntime(root, "different", false)).rejects.toThrow("NAMESPACE_MISMATCH");
  });
});
