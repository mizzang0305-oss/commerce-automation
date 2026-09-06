import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { armFirstOperation, promoteFirstOperationActivePointer, transitionFirstOperationArmStatus } from "../../src/lib/daily69-first-operation";
import { bindingForCodexRuntimeCapsule, verifyFirstOperationCapsuleAdmission, verifyFirstOperationTaskCapsule } from "../../src/lib/daily69-first-operation/runtimeCapsule";
import { materializeCodexRuntimeCapsule } from "../../src/lib/queue-scheduler/codexRuntimeCapsule";
import type { CodexRuntimeBinding } from "../../src/lib/queue-scheduler/codexRuntimeBinding";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
const legacy: CodexRuntimeBinding = { schemaVersion: "daily69-codex-cli-runtime-v1", command: join(tmpdir(), "codex.exe"), commandSha256: "a".repeat(64), cliVersion: "0.153.1", model: "gpt-6-astra", reasoningEffort: "xhigh", ignoreUserConfig: true };

describe("future Daily69 capsule admission", () => {
  it.each([undefined, legacy])("rejects absent/legacy runtime before reading sources or creating operation namespace", async runtime => {
    const root = await temp();
    await expect(armFirstOperation({ sourceRoot: join(root, "missing-source"), operationBase: join(root, "operations"),
      usageMaterializationAssetRoot: join(root, "missing-assets"), expectedGitHead: "a".repeat(40), now: new Date("2026-09-06T00:00:00Z"), codexReviewRuntime: runtime })).rejects.toThrow(/CODEX_/u);
    expect(await readdir(root)).toEqual([]);
  });

  it("rejects diagnostic capsule promotion and caller-chosen root before operation writes", async () => {
    const fixture = await capsule("diagnostic");
    await expect(verifyFirstOperationCapsuleAdmission(fixture.binding)).rejects.toThrow("CODEX_CAPSULE_DIAGNOSTIC_PROMOTION_FORBIDDEN");
    const operational = await capsule("operation");
    await expect(verifyFirstOperationCapsuleAdmission(operational.binding)).rejects.toThrow("CODEX_CAPSULE_PATH_ESCAPE");
    expect(fixture.run).toHaveBeenCalledTimes(3); // materialization probes only
  });

  it("blocks lifecycle ARM and pointer promotion for legacy runtime without mutating existing records", async () => {
    const root = await temp(), op = join(root, "operation-2026-09-07"); await mkdir(op);
    const manifestPath = join(op, "operation-manifest.json");
    const manifest = { schemaVersion: "daily69-first-operation-v2", namespace: "operation-2026-09-07", operationDate: "2026-09-07", armStatus: "projection_verified", decision: "NO_UPLOAD_DAILY69_FIRST_OPERATION_DAY_ARMED", expectedGitHead: "a".repeat(40), codexReviewRuntime: legacy };
    await writeFile(manifestPath, JSON.stringify(manifest));
    const before = await readFile(manifestPath, "utf8");
    await expect(transitionFirstOperationArmStatus(op, "tasks_armed")).rejects.toThrow("CODEX_CAPSULE_OPERATION_BINDING_REQUIRED");
    expect(await readFile(manifestPath, "utf8")).toBe(before);
    await writeFile(manifestPath, JSON.stringify({ ...manifest, armStatus: "tasks_armed" }));
    await expect(promoteFirstOperationActivePointer(op)).rejects.toThrow("CODEX_CAPSULE_OPERATION_BINDING_REQUIRED");
    expect(await readdir(root)).toEqual(["operation-2026-09-07"]);
  });

  it("Task argument mismatches are rejected before probing any executable", async () => {
    const fixture = await capsule("operation"), op = join(fixture.root, "operation-2026-09-07"); await mkdir(op);
    await writeFile(join(op, "operation-manifest.json"), JSON.stringify({ namespace: "operation-2026-09-07", codexReviewRuntime: fixture.binding }));
    const ref = fixture.binding.capsule;
    const args = { operationRoot: op, namespace: "operation-2026-09-07", capsulePath: ref.canonicalPath,
      manifestSha256: ref.manifestSha256, bundleDigest: ref.bundleDigest, binarySha256: ref.binarySha256 };
    for (const mutation of [{ capsulePath: "C:/other" }, { manifestSha256: "b".repeat(64) }, { bundleDigest: "b".repeat(64) }, { binarySha256: "b".repeat(64) }]) {
      await expect(verifyFirstOperationTaskCapsule({ ...args, ...mutation })).rejects.toThrow("CODEX_CAPSULE_TASK_BINDING_MISMATCH");
    }
    await expect(verifyFirstOperationTaskCapsule({ ...args, namespace: "operation-2026-09-08" })).rejects.toThrow("CODEX_CAPSULE_TASK_NAMESPACE_MISMATCH");
    expect(fixture.run).toHaveBeenCalledTimes(3);
  });
});

async function temp() { const root = await mkdtemp(join(tmpdir(), "daily69-capsule-admission-")); roots.push(root); return root; }
async function capsule(purpose: "diagnostic" | "operation") {
  const root = await temp(), source = join(root, "source"); await mkdir(source); const command = join(source, "codex.exe");
  const bytes = Buffer.from("synthetic-not-executable-runtime"); await writeFile(command, bytes);
  const run = vi.fn(async (_command: string, args: string[]) => args[0] === "--version" ? "codex-cli 0.153.1" : args[0] === "exec" ? "--ignore-user-config" : JSON.stringify({ models: [{ slug: "gpt-6-astra", supported_reasoning_levels: [{ effort: "xhigh" }] }] }));
  const result = await materializeCodexRuntimeCapsule({ sourceCommand: command, policy: { approvedRoot: join(root, "capsules") },
    approval: { schemaVersion: "daily69-codex-runtime-approval-v1", purpose, authorizationRef: "synthetic-test-only", version: "0.153.1", binarySha256: createHash("sha256").update(bytes).digest("hex"), model: "gpt-6-astra", reasoningEffort: "xhigh", ignoreUserConfig: true } }, { run });
  const binding = bindingForCodexRuntimeCapsule(result); if (binding.schemaVersion !== "daily69-codex-cli-runtime-v2") throw Error("TEST_BINDING_INVALID");
  return { root, binding, run };
}
