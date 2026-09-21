// @vitest-environment node
import { createHash } from "node:crypto";
import { chmod, link, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertCodexRuntimeCapsuleReference, computeCodexRuntimeConfigDigest, HISTORICAL_APPROVED_CODEX_RUNTIME,
  inspectCodexRuntimeAdmission, materializeCodexRuntimeCapsule, probeCodexRuntimeCapsule, verifyCodexRuntimeCapsule,
  type CodexRuntimeApproval } from "../../src/lib/queue-scheduler/codexRuntimeCapsule";

const roots: string[] = [];
const bytes = "SYNTHETIC NON-EXECUTABLE CODEX RUNTIME FIXTURE v1";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
// Each case performs several real Windows metadata subprocesses. Allow suite
// contention without changing the production per-process 15-second timeout.
const capsuleTestOptions = { timeout: 30_000 };
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true, maxRetries: 3 }))); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "daily69-capsule-test-")); roots.push(root);
  const sourceDirectory = join(root, "disposable-install"); await mkdir(sourceDirectory);
  const sourceCommand = join(sourceDirectory, "codex.exe"); await writeFile(sourceCommand, bytes);
  const approval: CodexRuntimeApproval = { schemaVersion: "daily69-codex-runtime-approval-v1", purpose: "operation",
    authorizationRef: "synthetic-unit-test-owner-policy", version: "0.153.1", binarySha256: hash(bytes),
    model: "gpt-6-astra", reasoningEffort: "xhigh", ignoreUserConfig: true };
  const policy = { approvedRoot: join(root, "durable-runtime") };
  const run = vi.fn(async (_command: string, args: string[]) => {
    if (args[0] === "--version") return "codex-cli 0.153.1\n";
    if (args[0] === "exec") return "--ignore-user-config";
    return JSON.stringify({ models: [{ slug: "gpt-6-astra", supported_reasoning_levels: [{ effort: "xhigh" }] }] });
  });
  return { root, sourceDirectory, sourceCommand, approval, policy, run,
    build: () => materializeCodexRuntimeCapsule({ sourceCommand, approval, policy }, { run }) };
}

describe("Daily69 immutable runtime capsule: explicit admission", capsuleTestOptions, () => {
  it("preserves the historical approval and requires Owner reapproval for other installed candidates", () => {
    expect(HISTORICAL_APPROVED_CODEX_RUNTIME.version).toBe("0.153.1");
    expect(HISTORICAL_APPROVED_CODEX_RUNTIME.binarySha256).toBe("56a84de2b617af6b95b0c5c5d8ae120d3c2fb69008ab330c7e7df3945b98b782");
    expect(inspectCodexRuntimeAdmission(undefined)).toBe("APPROVED_RUNTIME_UNAVAILABLE");
    expect(inspectCodexRuntimeAdmission(HISTORICAL_APPROVED_CODEX_RUNTIME)).toBe("APPROVED_RUNTIME_AVAILABLE");
    expect(inspectCodexRuntimeAdmission({ version: "0.153.4", binarySha256: "a".repeat(64) })).toBe("RUNTIME_REAPPROVAL_REQUIRED");
    expect(inspectCodexRuntimeAdmission({ version: "0.153.1", binarySha256: "a".repeat(64) })).toBe("RUNTIME_REAPPROVAL_REQUIRED");
  });
  it("never implicitly admits an arbitrary synthetic source when approval is omitted", async () => {
    const f = await fixture();
    await expect(materializeCodexRuntimeCapsule({ sourceCommand: f.sourceCommand, policy: f.policy }, { run: f.run })).rejects.toThrow("CODEX_CAPSULE_HASH_MISMATCH");
    expect(f.run).not.toHaveBeenCalled();
  });
  it("retains diagnostic nonpromotion identity and does not copy adjacent auth/config material", async () => {
    const f = await fixture(); f.approval.purpose = "diagnostic";
    await writeFile(join(f.sourceDirectory, "auth.json"), "SYNTHETIC SHOULD NOT COPY");
    await writeFile(join(f.sourceDirectory, ".env"), "SYNTHETIC SHOULD NOT COPY");
    const result = await f.build();
    expect(result.reference.purpose).toBe("diagnostic");
    expect(result.manifest.purpose).toBe("diagnostic");
    expect(await readdir(result.reference.canonicalPath)).toEqual(expect.arrayContaining(["capsule-manifest.json", "codex.exe"]));
    expect((await readdir(result.reference.canonicalPath)).length).toBe(2);
    const text = await readFile(join(result.reference.canonicalPath, "capsule-manifest.json"), "utf8");
    expect(text).not.toContain(f.sourceCommand); expect(text).not.toContain("SYNTHETIC SHOULD NOT COPY");
    expect(() => assertCodexRuntimeCapsuleReference({ ...result.reference, purpose: "operation" })).toThrow("MANIFEST_INVALID");
  });
});

describe("materialization, atomic publication and disappearance", capsuleTestOptions, () => {
  it("publishes/reopens exactly two files and survives disposable source-install disappearance", async () => {
    const f = await fixture(); const result = await f.build();
    expect(result.manifest.status).toBe("verified");
    expect(result.manifest.files).toEqual([{ path: "codex.exe", sizeBytes: Buffer.byteLength(bytes), sha256: hash(bytes) }]);
    expect(result.reference.configBindingDigest).toBe(computeCodexRuntimeConfigDigest(f.approval));
    expect((await verifyCodexRuntimeCapsule(result.reference, f.policy)).command).toBe(result.command);
    await rename(f.sourceDirectory, `${f.sourceDirectory}-disappeared`);
    await expect(probeCodexRuntimeCapsule(result.command, f.approval, f.run)).resolves.toBeUndefined();
    const reused = await f.build();
    expect(reused.reference).toEqual(result.reference);
    expect(reused.manifest.materializedAt).toBe(result.manifest.materializedAt);
    expect((await readdir(dirname(result.reference.canonicalPath))).some(name => /staging|lock/u.test(name))).toBe(false);
    expect(f.run.mock.calls.every(([, args]) => args[0] === "--version" || args.join(" ") === "exec --help" || args.join(" ") === "debug models --bundled")).toBe(true);
  });
  it("serializes concurrent builders without publishing a partial canonical directory", async () => {
    const f = await fixture();
    let copied!: () => void; let release!: () => void;
    const copiedPromise = new Promise<void>(resolve => { copied = resolve; });
    const releasePromise = new Promise<void>(resolve => { release = resolve; });
    const first = materializeCodexRuntimeCapsule(f, { run: f.run, afterCopy: async () => { copied(); await releasePromise; } });
    await copiedPromise;
    try { await expect(f.build()).rejects.toThrow("CODEX_CAPSULE_MATERIALIZATION_BUSY"); }
    finally { release(); }
    const published = await first;
    expect((await f.build()).reference).toEqual(published.reference);
    expect((await readdir(dirname(published.reference.canonicalPath))).length).toBe(1);
  });
  it("uses a short staging sibling so Windows can launch the safe probe without a namespace bypass", async () => {
    const f = await fixture(); const result = await f.build();
    const stageCommand = f.run.mock.calls[0][0];
    expect(dirname(stageCommand).split(/[\\/]/u).pop()).toMatch(/^\.staging-[a-f0-9-]{36}$/u);
    expect(dirname(dirname(stageCommand))).toBe(dirname(result.reference.canonicalPath));
    expect(stageCommand.length).toBeLessThan(result.command.length);
    if (process.platform === "win32") expect(stageCommand.length).toBeLessThan(260);
  });
  it("rejects an overlong final Windows path before creating staging or calling any probe", async () => {
    if (process.platform !== "win32") return;
    const f = await fixture();
    const approvedRoot = join(f.root, "too-long-owner-root-".repeat(5));
    await expect(materializeCodexRuntimeCapsule({ ...f, policy: { approvedRoot } }, { run: f.run })).rejects.toThrow("CODEX_CAPSULE_PATH_TOO_LONG");
    expect(f.run).not.toHaveBeenCalled();
    await expect(lstat(approvedRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("fails source TOCTOU before any probe and retains unpublished staging for forensics", async () => {
    const f = await fixture();
    await expect(materializeCodexRuntimeCapsule(f, { run: f.run, afterCopy: async () => { await writeFile(f.sourceCommand, "changed during copy"); } })).rejects.toThrow("CODEX_CAPSULE_SOURCE_CHANGED");
    expect(f.run).not.toHaveBeenCalled();
    const parent = join(f.policy.approvedRoot, f.approval.purpose, f.approval.version, f.approval.binarySha256);
    const names = await readdir(parent);
    expect(names.some(name => name.includes(".staging-"))).toBe(true);
    expect(names.some(name => name.endsWith(".lock"))).toBe(true);
    expect(names).not.toContain(computeCodexRuntimeConfigDigest(f.approval));
  });
  it("reports missing source without searching any installed or ambient executable", async () => {
    const f = await fixture(); await rename(f.sourceCommand, `${f.sourceCommand}.missing`);
    await expect(f.build()).rejects.toThrow("CODEX_CAPSULE_SOURCE_NOT_FOUND");
    expect(f.run).not.toHaveBeenCalled();
  });
  it("rejects probe version mismatch and the historical unsupported model fixture", async () => {
    const f = await fixture(); f.approval.version = "0.144.6";
    await expect(f.build()).rejects.toThrow("CODEX_CAPSULE_RUNTIME_VERSION_MISMATCH");
    expect(f.run.mock.calls.length).toBe(1);
    const g = await fixture(); g.approval.model = "gpt-unapproved";
    await expect(g.build()).rejects.toThrow("CODEX_CAPSULE_CONFIG_BINDING_MISMATCH");
  });
  it("does not overwrite a corrupt existing canonical directory", async () => {
    const f = await fixture();
    const target = join(f.policy.approvedRoot, f.approval.purpose, f.approval.version, f.approval.binarySha256, computeCodexRuntimeConfigDigest(f.approval));
    await mkdir(target, { recursive: true }); await writeFile(join(target, "preserved.txt"), "DO NOT OVERWRITE");
    await expect(f.build()).rejects.toThrow();
    expect(await readFile(join(target, "preserved.txt"), "utf8")).toBe("DO NOT OVERWRITE");
    expect(f.run).not.toHaveBeenCalled();
  });
});

describe("exact identity and tamper rejection", capsuleTestOptions, () => {
  it.each(["modified", "missing", "replacement", "extra", "manifest", "timestamp", "stream"] as const)("rejects %s tampering without invoking another runtime", async (kind) => {
    if (kind === "stream" && process.platform !== "win32") return;
    const f = await fixture(); const result = await f.build(); f.run.mockClear();
    const manifestPath = join(result.reference.canonicalPath, "capsule-manifest.json");
    await chmod(result.command, 0o600); await chmod(manifestPath, 0o600);
    if (kind === "modified") await writeFile(result.command, `${bytes.slice(0, -1)}2`);
    if (kind === "missing") await rename(result.command, join(f.root, "removed-copy.exe"));
    if (kind === "replacement") { await rename(result.command, join(f.root, "replaced-copy.exe")); await writeFile(result.command, "substitute"); }
    if (kind === "extra") await writeFile(join(result.reference.canonicalPath, ".env"), "SYNTHETIC EXTRA");
    if (kind === "manifest") await writeFile(manifestPath, (await readFile(manifestPath, "utf8")).replace('"verified"', '"tampered"'));
    if (kind === "timestamp") await writeFile(manifestPath, (await readFile(manifestPath, "utf8")).replace(/"materializedAt":"[^"]+"/u, '"materializedAt":"2026-99-99T00:00:00.000Z"'));
    if (kind === "stream") await writeFile(`${result.command}:synthetic-extra`, "SYNTHETIC STREAM");
    await expect(verifyCodexRuntimeCapsule(result.reference, f.policy)).rejects.toThrow(/CODEX_CAPSULE_/u);
    expect(f.run).not.toHaveBeenCalled();
  });
  it("rejects wrong version/config/model/digest references and secret/unknown manifest fields", async () => {
    const f = await fixture(); const result = await f.build();
    for (const changed of [{ version: "0.153.4" }, { model: "gpt-other" }, { reasoningEffort: "low" }, { configBindingDigest: "0".repeat(64) }, { bundleDigest: "0".repeat(64) }, { secret: "SYNTHETIC" }]) {
      await expect(verifyCodexRuntimeCapsule({ ...result.reference, ...changed }, f.policy)).rejects.toThrow(/CODEX_CAPSULE_/u);
    }
    await expect(verifyCodexRuntimeCapsule(result.reference)).rejects.toThrow("CODEX_CAPSULE_PATH_ESCAPE");
  });
});

describe("path, link and secret-stream containment", capsuleTestOptions, () => {
  it("rejects sources with hard links", async () => {
    const f = await fixture(); await link(f.sourceCommand, join(f.sourceDirectory, "same-file.exe"));
    await expect(f.build()).rejects.toThrow("CODEX_CAPSULE_PATH_ESCAPE"); expect(f.run).not.toHaveBeenCalled();
  });
  it("rejects root junction/symlink escapes", async () => {
    const f = await fixture(); const external = join(f.root, "external"); await mkdir(external);
    await symlink(external, f.policy.approvedRoot, process.platform === "win32" ? "junction" : "dir");
    await expect(f.build()).rejects.toThrow("CODEX_CAPSULE_PATH_ESCAPE"); expect(f.run).not.toHaveBeenCalled();
  });
  it("rejects linked source parents", async () => {
    const f = await fixture(); const alias = join(f.root, "install-alias");
    await symlink(f.sourceDirectory, alias, process.platform === "win32" ? "junction" : "dir");
    await expect(materializeCodexRuntimeCapsule({ ...f, sourceCommand: join(alias, "codex.exe") }, { run: f.run })).rejects.toThrow("CODEX_CAPSULE_PATH_ESCAPE");
  });
  it("rejects worktree/operation/updater roots and source overlap before copying", async () => {
    const f = await fixture(); const isolated = join(f.root, "worktree"); await mkdir(isolated); await writeFile(join(isolated, ".git"), "fixture-marker");
    const operation = join(f.root, "held-operation"); await mkdir(operation); await writeFile(join(operation, "operation-manifest.json"), "fixture-marker");
    for (const approvedRoot of [join(isolated, "runtime"), join(operation, "runtime"), join(f.root, "OpenAI", "Codex", "capsules"), join(f.sourceDirectory, "runtime")]) {
      await expect(materializeCodexRuntimeCapsule({ ...f, policy: { approvedRoot } }, { run: f.run })).rejects.toThrow("CODEX_CAPSULE_PATH_ESCAPE");
    }
    expect(f.run).not.toHaveBeenCalled();
  });
  it("rejects traversal, ADS path syntax, device names and forbidden roots", async () => {
    const f = await fixture();
    for (const sourceCommand of ["codex.exe", join(f.sourceDirectory, "codex.exe") + ":stream", `${f.sourceDirectory}${process.platform === "win32" ? "\\" : "/"}..${process.platform === "win32" ? "\\" : "/"}codex.exe`, join(f.sourceDirectory, "CON.exe")]) {
      await expect(materializeCodexRuntimeCapsule({ ...f, sourceCommand }, { run: f.run })).rejects.toThrow("CODEX_CAPSULE_PATH_ESCAPE");
    }
    await expect(materializeCodexRuntimeCapsule({ ...f, policy: { ...f.policy, forbiddenRoots: [f.root] } }, { run: f.run })).rejects.toThrow("CODEX_CAPSULE_PATH_ESCAPE");
  });
  it("never copies a source alternate stream", async () => {
    if (process.platform !== "win32") return;
    const f = await fixture(); await writeFile(`${f.sourceCommand}:synthetic-extra`, "SYNTHETIC STREAM");
    await expect(f.build()).rejects.toThrow("CODEX_CAPSULE_RUNTIME_TAMPERED");
    expect(f.run).not.toHaveBeenCalled();
    await expect(lstat(f.policy.approvedRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
