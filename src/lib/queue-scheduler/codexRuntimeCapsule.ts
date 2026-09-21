import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, readdir, realpath, rename, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { sha256File } from "./mediaEvidence";

// This is a Daily69-owned data root, not an application install path. Neither an
// operation manifest nor an environment variable can redefine the trusted root.
export const DEFAULT_CODEX_CAPSULE_ROOT = "D:/CodexData/commerce-runtime/codex";
const SCHEMA = "daily69-codex-runtime-capsule-v1" as const;
const MANIFEST_FILE = "capsule-manifest.json";
const EXECUTABLE_FILE = "codex.exe";
const shaPattern = /^[a-f0-9]{64}$/u;
const versionPattern = /^\d+\.\d+\.\d+(?:-[a-z0-9]+(?:\.[a-z0-9]+)*)?$/u;
type ReasoningEffort = "low" | "medium" | "high" | "xhigh";
type Purpose = "operation" | "diagnostic";

export type CodexRuntimeApproval = {
  schemaVersion: "daily69-codex-runtime-approval-v1";
  purpose: Purpose;
  authorizationRef: string;
  version: string;
  binarySha256: string;
  model: string;
  reasoningEffort: ReasoningEffort;
  ignoreUserConfig: true;
};

export const HISTORICAL_APPROVED_CODEX_RUNTIME: Readonly<CodexRuntimeApproval> = Object.freeze({
  schemaVersion: "daily69-codex-runtime-approval-v1", purpose: "operation",
  authorizationRef: "owner-approved-daily69-20260906-runtime",
  version: "0.153.1", binarySha256: "56a84de2b617af6b95b0c5c5d8ae120d3c2fb69008ab330c7e7df3945b98b782",
  model: "gpt-6-astra", reasoningEffort: "xhigh", ignoreUserConfig: true,
});

export type CodexRuntimeCapsuleReference = {
  schemaVersion: typeof SCHEMA;
  purpose: Purpose;
  capsuleId: string;
  canonicalPath: string;
  manifestSha256: string;
  bundleDigest: string;
  version: string;
  binarySha256: string;
  model: string;
  reasoningEffort: ReasoningEffort;
  ignoreUserConfig: true;
  configBindingDigest: string;
};

export type CodexRuntimeCapsuleManifest = Omit<CodexRuntimeCapsuleReference, "canonicalPath" | "manifestSha256"> & {
  runtimeKind: "codex-cli";
  bundleShape: "standalone-executable-v1";
  authorizationRef: string;
  sourcePathFingerprint: string;
  materializedAt: string;
  files: [{ path: "codex.exe"; sizeBytes: number; sha256: string }];
  status: "verified";
};

export type CodexRuntimeCapsulePolicy = { approvedRoot: string; forbiddenRoots?: string[] };
export type VerifiedCodexRuntimeCapsule = {
  reference: CodexRuntimeCapsuleReference;
  manifest: CodexRuntimeCapsuleManifest;
  command: string;
};
type Probe = (command: string, args: string[]) => Promise<string>;
export class CodexRuntimeCapsuleError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = "CodexRuntimeCapsuleError"; this.code = code; }
}
function fail(code: string): never { throw new CodexRuntimeCapsuleError(code); }
function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
function exactKeys(value: Record<string, unknown>, keys: string[]) { return Object.keys(value).sort().join(",") === keys.sort().join(","); }
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function configValid(value: Record<string, unknown>) {
  return typeof value.model === "string" && /^gpt-[a-z0-9.-]{1,64}$/u.test(value.model)
    && ["low", "medium", "high", "xhigh"].includes(String(value.reasoningEffort)) && value.ignoreUserConfig === true;
}
export function computeCodexRuntimeConfigDigest(value: Pick<CodexRuntimeApproval, "model" | "reasoningEffort" | "ignoreUserConfig">): string {
  if (!configValid(value)) fail("CODEX_CAPSULE_CONFIG_BINDING_MISMATCH");
  return digest(stableJson({ schemaVersion: "daily69-codex-runtime-config-v1", model: value.model,
    reasoningEffort: value.reasoningEffort, ignoreUserConfig: true, sandbox: "read-only", ephemeral: true,
    timestampContract: "request-start-iso-const-v1" }));
}
function assertApproval(value: unknown): asserts value is CodexRuntimeApproval {
  if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "purpose", "authorizationRef", "version", "binarySha256", "model", "reasoningEffort", "ignoreUserConfig"])
    || value.schemaVersion !== "daily69-codex-runtime-approval-v1" || !["operation", "diagnostic"].includes(String(value.purpose))
    || typeof value.authorizationRef !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(value.authorizationRef)
    || typeof value.version !== "string" || !versionPattern.test(value.version)
    || typeof value.binarySha256 !== "string" || !shaPattern.test(value.binarySha256) || !configValid(value)) fail("CODEX_CAPSULE_APPROVAL_INVALID");
}

// Candidate discovery never grants admission. A changed version or hash requires
// an explicit, separately authorized approval object, not a newest-version rule.
export function inspectCodexRuntimeAdmission(candidate: { version: string; binarySha256: string } | undefined,
  approval: CodexRuntimeApproval = HISTORICAL_APPROVED_CODEX_RUNTIME): "APPROVED_RUNTIME_AVAILABLE" | "APPROVED_RUNTIME_UNAVAILABLE" | "RUNTIME_REAPPROVAL_REQUIRED" {
  assertApproval(approval);
  if (!candidate) return "APPROVED_RUNTIME_UNAVAILABLE";
  return candidate.version === approval.version && candidate.binarySha256 === approval.binarySha256
    ? "APPROVED_RUNTIME_AVAILABLE" : "RUNTIME_REAPPROVAL_REQUIRED";
}

const refKeys = ["schemaVersion", "purpose", "capsuleId", "canonicalPath", "manifestSha256", "bundleDigest", "version", "binarySha256", "model", "reasoningEffort", "ignoreUserConfig", "configBindingDigest"];
function capsuleIdentity(value: Pick<CodexRuntimeCapsuleReference, "purpose" | "version" | "binarySha256" | "configBindingDigest">) {
  return digest(stableJson({ schemaVersion: SCHEMA, purpose: value.purpose, version: value.version, binarySha256: value.binarySha256, configBindingDigest: value.configBindingDigest }));
}
export function assertCodexRuntimeCapsuleReference(value: unknown): asserts value is CodexRuntimeCapsuleReference {
  if (!isRecord(value) || !exactKeys(value, refKeys) || value.schemaVersion !== SCHEMA
    || !["operation", "diagnostic"].includes(String(value.purpose)) || typeof value.canonicalPath !== "string"
    || typeof value.version !== "string" || !versionPattern.test(value.version) || !configValid(value)
    || ["capsuleId", "manifestSha256", "bundleDigest", "binarySha256", "configBindingDigest"].some(k => typeof value[k] !== "string" || !shaPattern.test(value[k] as string))) fail("CODEX_CAPSULE_MANIFEST_INVALID");
  assertPathSpelling(value.canonicalPath);
  const ref = value as CodexRuntimeCapsuleReference;
  if (computeCodexRuntimeConfigDigest(ref) !== ref.configBindingDigest) fail("CODEX_CAPSULE_CONFIG_BINDING_MISMATCH");
  if (capsuleIdentity(ref) !== ref.capsuleId) fail("CODEX_CAPSULE_MANIFEST_INVALID");
}
function pathKey(value: string) { return process.platform === "win32" ? resolve(value).toLowerCase() : resolve(value); }
function inside(root: string, target: string) {
  const rel = relative(pathKey(root), pathKey(target));
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
function assertPathSpelling(value: string) {
  if (!isAbsolute(value) || value.includes("\0") || /^[\\/]{2}/u.test(value)) fail("CODEX_CAPSULE_PATH_ESCAPE");
  const pathRoot = parse(value).root;
  const tail = value.slice(pathRoot.length);
  if (tail.includes(":") || (tail !== "" && tail.split(/[\\/]/u).some(part => part === "" || part === "." || part === ".." || /[ .]$/u.test(part)
    || /[<>"|?*\x00-\x1f]/u.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part)))) fail("CODEX_CAPSULE_PATH_ESCAPE");
}
async function checkPath(value: string, allowMissing = false): Promise<void> {
  assertPathSpelling(value);
  for (let current = resolve(value);; current = dirname(current)) {
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink() || (metadata.isFile() && metadata.nlink !== 1)) fail("CODEX_CAPSULE_PATH_ESCAPE");
      if (pathKey(await realpath(current)) !== pathKey(current)) fail("CODEX_CAPSULE_PATH_ESCAPE");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || !allowMissing) throw error;
    }
    if (dirname(current) === current) break;
  }
}
async function checkRoot(policy: CodexRuntimeCapsulePolicy) {
  const root = policy.approvedRoot;
  assertPathSpelling(root);
  if (pathKey(root) === pathKey(parse(root).root) || /(?:^|[\\/])(?:node_modules|\.git|\.next|\.vercel)(?:[\\/]|$)/iu.test(root)
    || /(?:^|[\\/])OpenAI[\\/]Codex(?:[\\/]|$)/iu.test(root)) fail("CODEX_CAPSULE_PATH_ESCAPE");
  for (const forbidden of policy.forbiddenRoots ?? []) {
    assertPathSpelling(forbidden);
    if (pathKey(forbidden) === pathKey(root) || inside(forbidden, root) || inside(root, forbidden)) fail("CODEX_CAPSULE_PATH_ESCAPE");
  }
  await checkPath(root, true);
  await assertWindowsMetadata([root], false);
  for (let current = resolve(root);; current = dirname(current)) {
    for (const marker of [".git", "operation-manifest.json", "active-operation.json", "queue-settings.json", "queue-items.json"]) {
      try { await lstat(join(current, marker)); fail("CODEX_CAPSULE_PATH_ESCAPE"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    if (dirname(current) === current) break;
  }
  return resolve(root);
}
function expectedPath(root: string, ref: Pick<CodexRuntimeCapsuleReference, "purpose" | "version" | "binarySha256" | "configBindingDigest">) {
  return join(root, ref.purpose, ref.version, ref.binarySha256, ref.configBindingDigest);
}
function assertWindowsPathBudget(...paths: string[]) {
  // CreateProcess without an extended namespace can reject an existing file at
  // MAX_PATH with ENOENT. Do not loosen namespace/link policy to bypass this.
  if (process.platform === "win32" && paths.some(path => path.length >= 260)) fail("CODEX_CAPSULE_PATH_TOO_LONG");
}
function bundleDigest(files: CodexRuntimeCapsuleManifest["files"]) { return digest(stableJson({ bundleShape: "standalone-executable-v1", files })); }
function assertManifest(value: unknown): asserts value is CodexRuntimeCapsuleManifest {
  const keys = [...refKeys.filter(key => !["canonicalPath", "manifestSha256"].includes(key)), "runtimeKind", "bundleShape", "authorizationRef", "sourcePathFingerprint", "materializedAt", "files", "status"];
  if (!isRecord(value) || !exactKeys(value, keys) || value.runtimeKind !== "codex-cli" || value.bundleShape !== "standalone-executable-v1"
    || value.status !== "verified" || typeof value.sourcePathFingerprint !== "string" || !shaPattern.test(value.sourcePathFingerprint)
    || typeof value.authorizationRef !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(value.authorizationRef)
    || typeof value.materializedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value.materializedAt)
    || !Number.isFinite(Date.parse(value.materializedAt)) || new Date(value.materializedAt).toISOString() !== value.materializedAt
    || !Array.isArray(value.files) || value.files.length !== 1 || value.schemaVersion !== SCHEMA
    || !["operation", "diagnostic"].includes(String(value.purpose)) || !configValid(value)
    || typeof value.version !== "string" || !versionPattern.test(value.version)
    || ["capsuleId", "bundleDigest", "binarySha256", "configBindingDigest"].some(key => typeof value[key] !== "string" || !shaPattern.test(value[key] as string))) fail("CODEX_CAPSULE_MANIFEST_INVALID");
  const file = value.files[0];
  if (!isRecord(file) || !exactKeys(file, ["path", "sizeBytes", "sha256"]) || file.path !== EXECUTABLE_FILE
    || typeof file.sizeBytes !== "number" || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes <= 0
    || file.sha256 !== value.binarySha256) fail("CODEX_CAPSULE_MANIFEST_INVALID");
  const manifest = value as CodexRuntimeCapsuleManifest;
  if (computeCodexRuntimeConfigDigest(manifest) !== manifest.configBindingDigest) fail("CODEX_CAPSULE_CONFIG_BINDING_MISMATCH");
  if (capsuleIdentity(manifest) !== manifest.capsuleId) fail("CODEX_CAPSULE_MANIFEST_INVALID");
}
function referenceFor(manifest: CodexRuntimeCapsuleManifest, canonicalPath: string, manifestSha256: string): CodexRuntimeCapsuleReference {
  return { schemaVersion: SCHEMA, purpose: manifest.purpose, capsuleId: manifest.capsuleId, canonicalPath, manifestSha256,
    bundleDigest: manifest.bundleDigest, version: manifest.version, binarySha256: manifest.binarySha256, model: manifest.model,
    reasoningEffort: manifest.reasoningEffort, ignoreUserConfig: true, configBindingDigest: manifest.configBindingDigest };
}
async function verifyFiles(directory: string, manifest: CodexRuntimeCapsuleManifest) {
  await checkPath(directory);
  const names = (await readdir(directory)).sort();
  if (names.join(",") !== [MANIFEST_FILE, EXECUTABLE_FILE].sort().join(",")) fail(names.includes(EXECUTABLE_FILE) ? "CODEX_CAPSULE_RUNTIME_TAMPERED" : "CODEX_CAPSULE_RUNTIME_MISSING");
  await assertWindowsMetadata([join(directory, MANIFEST_FILE), ...manifest.files.map(file => join(directory, file.path))], true);
  for (const file of manifest.files) {
    const path = join(directory, file.path);
    await checkPath(path);
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.size !== file.sizeBytes || await sha256File(path) !== file.sha256) fail("CODEX_CAPSULE_RUNTIME_TAMPERED");
    await checkPath(path);
  }
  if (bundleDigest(manifest.files) !== manifest.bundleDigest) fail("CODEX_CAPSULE_HASH_MISMATCH");
}
async function loadManifest(directory: string) {
  const path = join(directory, MANIFEST_FILE);
  await checkPath(path);
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.size > 16_384) fail("CODEX_CAPSULE_MANIFEST_INVALID");
  const text = await readFile(path, "utf8");
  let value: unknown;
  try { value = JSON.parse(text); } catch { fail("CODEX_CAPSULE_MANIFEST_INVALID"); }
  assertManifest(value);
  // Exact canonical bytes also reject duplicate JSON keys and appended payloads.
  if (text !== `${stableJson(value)}\n`) fail("CODEX_CAPSULE_MANIFEST_INVALID");
  await checkPath(path);
  return { manifest: value, manifestSha256: digest(text) };
}

export async function verifyCodexRuntimeCapsule(value: unknown,
  policy: CodexRuntimeCapsulePolicy = { approvedRoot: DEFAULT_CODEX_CAPSULE_ROOT }): Promise<VerifiedCodexRuntimeCapsule> {
  assertCodexRuntimeCapsuleReference(value);
  try {
    const root = await checkRoot(policy);
    if (pathKey(value.canonicalPath) !== pathKey(expectedPath(root, value))) fail("CODEX_CAPSULE_PATH_ESCAPE");
    assertWindowsPathBudget(join(value.canonicalPath, EXECUTABLE_FILE), join(value.canonicalPath, MANIFEST_FILE));
    const { manifest, manifestSha256 } = await loadManifest(value.canonicalPath);
    if (manifestSha256 !== value.manifestSha256 || stableJson(referenceFor(manifest, value.canonicalPath, manifestSha256)) !== stableJson(value)) fail("CODEX_CAPSULE_MANIFEST_INVALID");
    await verifyFiles(value.canonicalPath, manifest);
    if ((await loadManifest(value.canonicalPath)).manifestSha256 !== manifestSha256) fail("CODEX_CAPSULE_MANIFEST_INVALID");
    return { reference: value, manifest, command: join(value.canonicalPath, EXECUTABLE_FILE) };
  } catch (error) {
    if (error instanceof CodexRuntimeCapsuleError) throw error;
    fail((error as NodeJS.ErrnoException).code === "ENOENT" ? "CODEX_CAPSULE_RUNTIME_MISSING" : "CODEX_CAPSULE_VERIFICATION_FAILED");
  }
}

const execute = promisify(execFile);
async function assertWindowsMetadata(paths: string[], inspectStreams: boolean) {
  if (process.platform !== "win32") return;
  // Static script, literal paths through a private process environment variable;
  // no shell interpolation and no stream names/content are returned or retained.
  const systemRoot = process.env.SystemRoot;
  if (!systemRoot || !/^[a-z]:[\\/]Windows$/iu.test(systemRoot)) fail("CODEX_CAPSULE_STREAM_INSPECTION_FAILED");
  const powershell = join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const script = "$ErrorActionPreference='Stop'; $paths=ConvertFrom-Json $env:DAILY69_CAPSULE_STREAM_PATHS; foreach($p in $paths) { $cursor=$p; while($cursor) { if(Test-Path -LiteralPath $cursor) { $item=Get-Item -LiteralPath $cursor -Force; if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Write-Output 'LINK'; exit 0 } }; $parent=[IO.Path]::GetDirectoryName($cursor.TrimEnd([char[]]'\\/')); if($parent -eq $cursor) { break }; $cursor=$parent }; if($env:DAILY69_CAPSULE_INSPECT_STREAMS -eq '1') { $streams=@(Get-Item -LiteralPath $p -Stream *); if($streams.Count -ne 1 -or $streams[0].Stream -ne ':$DATA') { Write-Output 'EXTRA'; exit 0 } } }; Write-Output 'CLEAR'";
  let stdout: string;
  try { stdout = (await execute(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
    windowsHide: true, timeout: 15_000, maxBuffer: 16_384,
    env: { ...process.env, DAILY69_CAPSULE_STREAM_PATHS: JSON.stringify(paths), DAILY69_CAPSULE_INSPECT_STREAMS: inspectStreams ? "1" : "0" },
  })).stdout; } catch { fail("CODEX_CAPSULE_STREAM_INSPECTION_FAILED"); }
  if (stdout.trim() === "LINK") fail("CODEX_CAPSULE_PATH_ESCAPE");
  if (stdout.trim() !== "CLEAR") fail("CODEX_CAPSULE_RUNTIME_TAMPERED");
}
const defaultProbe: Probe = async (command, args) => {
  try { return (await execute(command, args, { windowsHide: true, timeout: 15_000, maxBuffer: 2 * 1024 * 1024 })).stdout; }
  catch { fail("CODEX_CAPSULE_FUNCTIONAL_PROBE_FAILED"); }
};
export async function probeCodexRuntimeCapsule(command: string, approval: CodexRuntimeApproval, run: Probe = defaultProbe) {
  assertApproval(approval);
  assertWindowsPathBudget(command);
  await checkPath(command);
  if (await sha256File(command) !== approval.binarySha256) fail("CODEX_CAPSULE_HASH_MISMATCH");
  const safeRun: Probe = async (executable, args) => {
    try { return await run(executable, args); } catch { fail("CODEX_CAPSULE_FUNCTIONAL_PROBE_FAILED"); }
  };
  if ((await safeRun(command, ["--version"])).trim() !== `codex-cli ${approval.version}`) fail("CODEX_CAPSULE_RUNTIME_VERSION_MISMATCH");
  if (!(await safeRun(command, ["exec", "--help"])).includes("--ignore-user-config")) fail("CODEX_CAPSULE_FUNCTIONAL_PROBE_FAILED");
  let catalog: unknown;
  try { catalog = JSON.parse(await safeRun(command, ["debug", "models", "--bundled"])); }
  catch { fail("CODEX_CAPSULE_FUNCTIONAL_PROBE_FAILED"); }
  if (!isRecord(catalog) || !Array.isArray(catalog.models)
    || !catalog.models.some(model => isRecord(model) && model.slug === approval.model && Array.isArray(model.supported_reasoning_levels)
      && model.supported_reasoning_levels.some(level => isRecord(level) && level.effort === approval.reasoningEffort))) fail("CODEX_CAPSULE_CONFIG_BINDING_MISMATCH");
  await checkPath(command);
  if (await sha256File(command) !== approval.binarySha256) fail("CODEX_CAPSULE_RUNTIME_TAMPERED");
}

// Dependencies are only for synthetic/disposable tests; production callers use
// the hash-gated, version/help/bundled-model-only local probe above.
export async function materializeCodexRuntimeCapsule(input: {
  sourceCommand: string; approval?: CodexRuntimeApproval; policy?: CodexRuntimeCapsulePolicy;
}, dependencies: { run?: Probe; afterCopy?: () => Promise<void> } = {}): Promise<VerifiedCodexRuntimeCapsule> {
  try { return await materialize(input, dependencies); }
  catch (error) { if (error instanceof CodexRuntimeCapsuleError) throw error; fail("CODEX_CAPSULE_COPY_FAILED"); }
}
async function materialize(input: {
  sourceCommand: string; approval?: CodexRuntimeApproval; policy?: CodexRuntimeCapsulePolicy;
}, dependencies: { run?: Probe; afterCopy?: () => Promise<void> }): Promise<VerifiedCodexRuntimeCapsule> {
  const approval = input.approval ?? HISTORICAL_APPROVED_CODEX_RUNTIME;
  assertApproval(approval);
  const policy = input.policy ?? { approvedRoot: DEFAULT_CODEX_CAPSULE_ROOT };
  const root = await checkRoot(policy);
  assertPathSpelling(input.sourceCommand);
  if (basename(input.sourceCommand) !== EXECUTABLE_FILE || inside(root, input.sourceCommand) || inside(dirname(input.sourceCommand), root)) fail("CODEX_CAPSULE_PATH_ESCAPE");
  const configBindingDigest = computeCodexRuntimeConfigDigest(approval);
  const identity = { purpose: approval.purpose, version: approval.version, binarySha256: approval.binarySha256, configBindingDigest };
  const target = expectedPath(root, identity);
  // Staging is a short sibling, not the full config digest plus a UUID suffix.
  // Its temporary name never becomes part of the immutable capsule identity.
  const stage = join(dirname(target), `.staging-${randomUUID()}`);
  const lockPath = `${target}.lock`;
  assertWindowsPathBudget(join(target, EXECUTABLE_FILE), join(target, MANIFEST_FILE),
    join(stage, EXECUTABLE_FILE), join(stage, MANIFEST_FILE), lockPath);
  const reuse = async (): Promise<VerifiedCodexRuntimeCapsule | undefined> => {
    try { await lstat(target); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
    const loaded = await loadManifest(target);
    if (loaded.manifest.capsuleId !== capsuleIdentity(identity) || loaded.manifest.model !== approval.model
      || loaded.manifest.reasoningEffort !== approval.reasoningEffort || loaded.manifest.purpose !== approval.purpose) fail("CODEX_CAPSULE_MANIFEST_INVALID");
    const verified = await verifyCodexRuntimeCapsule(referenceFor(loaded.manifest, target, loaded.manifestSha256), policy);
    await probeCodexRuntimeCapsule(verified.command, approval, dependencies.run);
    return verified;
  };
  const existing = await reuse();
  if (existing) return existing;
  try { await checkPath(input.sourceCommand); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") fail("CODEX_CAPSULE_SOURCE_NOT_FOUND"); throw error; }
  const sourceBefore = await lstat(input.sourceCommand);
  if (!sourceBefore.isFile() || sourceBefore.size <= 0 || await sha256File(input.sourceCommand) !== approval.binarySha256) fail("CODEX_CAPSULE_HASH_MISMATCH");
  await assertWindowsMetadata([input.sourceCommand], true);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await checkRoot(policy);
  await checkPath(dirname(target));
  let lock;
  try { lock = await open(lockPath, "wx", 0o600); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") { const published = await reuse(); if (published) return published; fail("CODEX_CAPSULE_MATERIALIZATION_BUSY"); } throw error; }
  const lockToken = randomUUID();
  await lock.writeFile(lockToken); await lock.sync(); await lock.close();
  try {
    const published = await reuse();
    if (published) { await releaseLock(); return published; }
    await mkdir(stage, { mode: 0o700 });
    await checkPath(stage);
    const copy = join(stage, EXECUTABLE_FILE);
    await checkPath(input.sourceCommand);
    // Copy the approved unnamed data stream only. Windows CopyFile can clone
    // alternate streams, so it is intentionally not used for executable bytes.
    const source = await open(input.sourceCommand, "r");
    try {
      const openedSource = await source.stat();
      if (!openedSource.isFile() || openedSource.nlink !== 1 || openedSource.dev !== sourceBefore.dev || openedSource.ino !== sourceBefore.ino
        || openedSource.size !== sourceBefore.size || openedSource.mtimeMs !== sourceBefore.mtimeMs) fail("CODEX_CAPSULE_SOURCE_CHANGED");
      const destination = await open(copy, "wx", 0o600);
      try {
        const buffer = Buffer.alloc(1024 * 1024);
        for (;;) {
          const { bytesRead } = await source.read(buffer, 0, buffer.length, null);
          if (!bytesRead) break;
          let offset = 0;
          while (offset < bytesRead) {
            const { bytesWritten } = await destination.write(buffer, offset, bytesRead - offset, null);
            if (!bytesWritten) fail("CODEX_CAPSULE_COPY_FAILED");
            offset += bytesWritten;
          }
        }
        await destination.sync();
      } finally { await destination.close(); }
    } finally { await source.close(); }
    await dependencies.afterCopy?.();
    try { await checkPath(input.sourceCommand); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") fail("CODEX_CAPSULE_SOURCE_CHANGED"); throw error; }
    const sourceAfter = await lstat(input.sourceCommand);
    if (sourceBefore.dev !== sourceAfter.dev || sourceBefore.ino !== sourceAfter.ino || sourceBefore.size !== sourceAfter.size
      || sourceBefore.mtimeMs !== sourceAfter.mtimeMs || await sha256File(input.sourceCommand) !== approval.binarySha256) fail("CODEX_CAPSULE_SOURCE_CHANGED");
    await checkPath(copy);
    if ((await lstat(copy)).size !== sourceBefore.size || await sha256File(copy) !== approval.binarySha256) fail("CODEX_CAPSULE_HASH_MISMATCH");
    await probeCodexRuntimeCapsule(copy, approval, dependencies.run);
    const files: CodexRuntimeCapsuleManifest["files"] = [{ path: EXECUTABLE_FILE, sizeBytes: sourceBefore.size, sha256: approval.binarySha256 }];
    const manifest: CodexRuntimeCapsuleManifest = { schemaVersion: SCHEMA, ...identity, capsuleId: capsuleIdentity(identity),
      runtimeKind: "codex-cli", bundleShape: "standalone-executable-v1", authorizationRef: approval.authorizationRef,
      sourcePathFingerprint: digest(pathKey(input.sourceCommand)), materializedAt: new Date().toISOString(), files,
      bundleDigest: bundleDigest(files), model: approval.model, reasoningEffort: approval.reasoningEffort, ignoreUserConfig: true, status: "verified" };
    const manifestText = `${stableJson(manifest)}\n`;
    const manifestHandle = await open(join(stage, MANIFEST_FILE), "wx", 0o600);
    await manifestHandle.writeFile(manifestText); await manifestHandle.sync(); await manifestHandle.close();
    await verifyFiles(stage, manifest);
    if ((await loadManifest(stage)).manifestSha256 !== digest(manifestText)) fail("CODEX_CAPSULE_MANIFEST_INVALID");
    await chmod(copy, 0o444); await chmod(join(stage, MANIFEST_FILE), 0o444);
    await checkRoot(policy); await checkPath(stage); await checkPath(dirname(target));
    // The exclusive lock serializes cooperating materializers. An existing target
    // is never overwritten, including an empty or corrupt capsule directory.
    try { await lstat(target); fail("CODEX_CAPSULE_TARGET_EXISTS"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    await rename(stage, target);
    const result = await verifyCodexRuntimeCapsule(referenceFor(manifest, target, digest(manifestText)), policy);
    await releaseLock();
    return result;
  } catch (error) {
    // Preserve failed staging and lock for explicit forensic review. No GC,
    // overwrite, installed-runtime fallback, or automatic lock stealing.
    if (error instanceof CodexRuntimeCapsuleError) throw error;
    fail("CODEX_CAPSULE_COPY_FAILED");
  }
  async function releaseLock() {
    await checkPath(lockPath);
    if (await readFile(lockPath, "utf8") !== lockToken) fail("CODEX_CAPSULE_MATERIALIZATION_LOCK_CHANGED");
    await unlink(lockPath);
  }
}
