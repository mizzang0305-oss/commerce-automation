import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertCodexRuntimeBinding, assertOperationCodexCapsuleRuntimeBinding, inspectCodexRuntimeBinding, readOperationCodexRuntime, verifyCodexRuntimeBeforeInvocation, type CodexRuntimeBinding } from "../../src/lib/queue-scheduler/codexRuntimeBinding";
import { materializeCodexRuntimeCapsule } from "../../src/lib/queue-scheduler/codexRuntimeCapsule";
import { buildCodexCliArguments, classifyCliFailure } from "../../src/lib/queue-scheduler/codexCliReviewExecutor";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const binding: CodexRuntimeBinding = { schemaVersion: "daily69-codex-cli-runtime-v1", command: join(tmpdir(), "codex.exe"), commandSha256: "a".repeat(64), cliVersion: "0.153.1", model: "gpt-6-astra", reasoningEffort: "medium", ignoreUserConfig: true };
function probes() {
  return { canonical: async (p: string) => p, hash: async () => binding.commandSha256, run: vi.fn(async (_: string, args: string[]) => args[0] === "--version" ? "codex-cli 0.153.1\n" : args[0] === "exec" ? "--ignore-user-config" : JSON.stringify({ models: [{ slug: "gpt-6-astra", supported_reasoning_levels: [{ effort: "medium" }] }] })) };
}
// These integration cases materialize and verify a Windows runtime capsule.
// Host-level worker contention can legitimately push the subprocess-backed
// metadata checks past Vitest's 10 second default without changing semantics.
describe("immutable Daily69 Codex runtime", { timeout: 30_000 }, () => {
  it("retains legacy validation but rejects it for every future operation capsule gate", () => {
    expect(() => assertCodexRuntimeBinding(binding)).not.toThrow();
    expect(() => assertOperationCodexCapsuleRuntimeBinding(binding)).toThrow("CODEX_CAPSULE_OPERATION_BINDING_REQUIRED");
  });

  it("reopens a v2 capsule, binds the command/model/config exactly, and probes only its executable", async () => {
    const fixture = await capsuleFixture();
    const p = probes();
    await expect(inspectCodexRuntimeBinding(fixture.binding, { run: p.run, capsulePolicy: fixture.policy })).resolves.toEqual(fixture.binding);
    expect(p.run).toHaveBeenCalledTimes(3);
    for (const [command] of p.run.mock.calls) expect(command).toBe(fixture.binding.command);
    expect(() => assertOperationCodexCapsuleRuntimeBinding(fixture.binding)).not.toThrow();
    for (const mutation of [
      { command: binding.command }, { commandSha256: "b".repeat(64) }, { cliVersion: "0.144.6" },
      { model: "gpt-another" }, { reasoningEffort: "high" as const },
    ]) expect(() => assertCodexRuntimeBinding({ ...fixture.binding, ...mutation })).toThrow("CODEX_CAPSULE_CONFIG_BINDING_MISMATCH");
  });

  it("never promotes a diagnostic capsule into an operation binding", async () => {
    const fixture = await capsuleFixture("diagnostic");
    expect(() => assertCodexRuntimeBinding(fixture.binding)).not.toThrow();
    expect(() => assertOperationCodexCapsuleRuntimeBinding(fixture.binding)).toThrow("CODEX_CAPSULE_DIAGNOSTIC_PROMOTION_FORBIDDEN");
  });

  it("fails before any probe when a capsule disappears or its manifest identity changes, with no ambient fallback", async () => {
    const fixture = await capsuleFixture();
    const p = probes();
    await expect(inspectCodexRuntimeBinding({ ...fixture.binding, capsule: { ...fixture.binding.capsule, manifestSha256: "f".repeat(64) } }, {
      ...p, capsulePolicy: fixture.policy,
    })).rejects.toThrow("CODEX_CAPSULE_MANIFEST_INVALID");
    expect(p.run).not.toHaveBeenCalled();
    await rename(fixture.binding.capsule.canonicalPath, `${fixture.binding.capsule.canonicalPath}.missing`);
    await expect(verifyCodexRuntimeBeforeInvocation(fixture.binding, fixture.policy)).rejects.toThrow("CODEX_CAPSULE_RUNTIME_MISSING");
    await expect(inspectCodexRuntimeBinding(fixture.binding, { ...p, capsulePolicy: fixture.policy })).rejects.toThrow("CODEX_CAPSULE_RUNTIME_MISSING");
    expect(p.run).not.toHaveBeenCalled();
  });

  it("does not let an operation reference redefine the trusted capsule root", async () => {
    const fixture = await capsuleFixture();
    const p = probes();
    await expect(inspectCodexRuntimeBinding(fixture.binding, p)).rejects.toThrow("CODEX_CAPSULE_PATH_ESCAPE");
    expect(p.run).not.toHaveBeenCalled();
  });

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

async function capsuleFixture(purpose: "operation" | "diagnostic" = "operation") {
  const root = await mkdtemp(join(tmpdir(), "codex-runtime-fixture-")); roots.push(root);
  const source = join(root, "source", "codex.exe"), bytes = "synthetic-runtime-not-a-real-executable";
  await mkdir(join(root, "source")); await writeFile(source, bytes);
  const policy = { approvedRoot: join(root, "capsules") };
  const result = await materializeCodexRuntimeCapsule({ sourceCommand: source, policy, approval: {
    schemaVersion: "daily69-codex-runtime-approval-v1", purpose, authorizationRef: "synthetic-unit-test-only",
    version: binding.cliVersion, binarySha256: createHash("sha256").update(bytes).digest("hex"),
    model: binding.model, reasoningEffort: binding.reasoningEffort, ignoreUserConfig: true,
  } }, { run: probes().run });
  return { policy, binding: { ...binding, schemaVersion: "daily69-codex-cli-runtime-v2" as const,
    command: result.command, commandSha256: result.reference.binarySha256, capsule: result.reference } };
}
