import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
const library = resolve("scripts/daily69-first-operation/runtime-capsule-task-contract.ps1");
const installer = resolve("scripts/daily69-first-operation/install-tasks.ps1");
const common = resolve("scripts/daily69-first-operation/common-first-operation-no-upload.ps1");
const hashes = { manifest: "a".repeat(64), bundle: "b".repeat(64), binary: "c".repeat(64) };
const capsulePath = join(tmpdir(), "daily69 task capsule fixture", "approved");
const fixtureManifest = {
  namespace: "operation-fixture",
  codexReviewRuntime: {
    schemaVersion: "daily69-codex-cli-runtime-v2", command: join(capsulePath, "codex.exe"), commandSha256: hashes.binary,
    capsule: { schemaVersion: "daily69-codex-runtime-capsule-v1", canonicalPath: capsulePath, manifestSha256: hashes.manifest, bundleDigest: hashes.bundle, binarySha256: hashes.binary },
  },
};

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("Daily69 capsule-bound PowerShell Task contract", () => {
  it.each(["batch", "control", "closeout", "finalizer"])("keeps PowerShell as %s Task action and exact-binds capsule identifiers without registration", async (role) => {
    const root = await fixture();
    const result = ps(`
$manifest=Get-Content -LiteralPath '${quote(join(root, "operation-manifest.json"))}' -Raw | ConvertFrom-Json
$capsuleBinding=Get-Daily69TaskCapsuleBinding -Manifest $manifest
${extractInstallerFunctions(["Quote", "New-OperationAction"])}
function New-ScheduledTaskAction { param($Execute,$Argument,$WorkingDirectory) [pscustomobject]@{Execute=$Execute;Arguments=$Argument;WorkingDirectory=$WorkingDirectory} }
$root='fixture-worktree'; $queue='fixture-operation'; $Namespace='operation-fixture'; $source='fixture-source'; $ExpectedGitHead='${"d".repeat(40)}'; $envPath='fixture-env-path-only'
New-OperationAction 'run-${role}-no-upload.ps1' | ConvertTo-Json -Compress`);
    expect(result.Execute).toMatch(/WindowsPowerShell\\v1\.0\\powershell\.exe$/u);
    expect(result.WorkingDirectory).toBe("fixture-worktree");
    expect(result.Arguments).toContain(`-CodexRuntimeCapsulePath "${capsulePath}"`);
    expect(result.Arguments).toContain(`-CodexRuntimeCapsuleManifestSha256 "${hashes.manifest}"`);
    expect(result.Arguments).toContain(`-CodexRuntimeCapsuleBundleDigest "${hashes.bundle}"`);
    expect(result.Arguments).toContain(`-CodexRuntimeBinarySha256 "${hashes.binary}"`);
    expect(result.Arguments).not.toMatch(/OpenAI|\s-Command\s|\scodex\s/u);
  });

  it("rejects missing/legacy binding and wrong executable instead of migrating or using ambient Codex", async () => {
    const root = await fixture();
    const before = await readFile(join(root, "operation-manifest.json"), "utf8");
    const result = ps(`
$m=Get-Content -LiteralPath '${quote(join(root, "operation-manifest.json"))}' -Raw | ConvertFrom-Json
$failures=@()
$m.codexReviewRuntime.schemaVersion='daily69-codex-cli-runtime-v1'
try { Get-Daily69TaskCapsuleBinding -Manifest $m | Out-Null } catch { $failures += $_.Exception.Message }
$m.codexReviewRuntime.schemaVersion='daily69-codex-cli-runtime-v2'; $m.codexReviewRuntime.command='codex'
try { Get-Daily69TaskCapsuleBinding -Manifest $m | Out-Null } catch { $failures += $_.Exception.Message }
$m.codexReviewRuntime=$null
try { Get-Daily69TaskCapsuleBinding -Manifest $m | Out-Null } catch { $failures += $_.Exception.Message }
@{failures=$failures} | ConvertTo-Json -Compress`);
    expect(result.failures).toEqual(["CODEX_CAPSULE_TASK_BINDING_REQUIRED", "CODEX_CAPSULE_TASK_BINDING_MISMATCH", "CODEX_CAPSULE_TASK_BINDING_REQUIRED"]);
    expect(await readFile(join(root, "operation-manifest.json"), "utf8")).toBe(before);
  });

  it("passes exact arguments to the canonical read-only verifier and makes no fixture writes", async () => {
    const root = await fixture();
    const before = await readFile(join(root, "operation-manifest.json"), "utf8");
    const result = ps(`
$script:seen=@()
function Invoke-Daily69CapsuleVerifierProcess { param($WorktreeRoot,$VerifierArguments) $script:seen=@($VerifierArguments); [pscustomobject]@{exitCode=0;lines=@('{"event":"daily69_runtime_capsule_verified","verified":true}')} }
${gateCall(root)} | Out-Null
@{args=$script:seen} | ConvertTo-Json -Compress`);
    expect(result.args).toEqual(["--operation-root", root, "--namespace", "operation-fixture", "--capsule-path", capsulePath, "--manifest-sha256", hashes.manifest, "--bundle-digest", hashes.bundle, "--binary-sha256", hashes.binary]);
    expect(await readFile(join(root, "operation-manifest.json"), "utf8")).toBe(before);
    expect(await readdir(root)).toEqual(["operation-manifest.json"]);
  });

  it("captures an actual read-only Node verifier rejection through Windows PowerShell without leaking stderr", async () => {
    const root = await fixture();
    const before = await readFile(join(root, "operation-manifest.json"), "utf8");
    // Invalid diagnostic namespace must stop before runtime inspection. This
    // calls the verifier only, never an authoritative wrapper or Task API.
    const result = ps(`try { ${gateCall(root)} | Out-Null; $code='UNEXPECTED_PASS' } catch { $code=$_.Exception.Message }; @{code=$code} | ConvertTo-Json -Compress`);
    expect(result.code).toBe("CODEX_CAPSULE_TASK_NAMESPACE_MISMATCH");
    expect(await readFile(join(root, "operation-manifest.json"), "utf8")).toBe(before);
    expect(await readdir(root)).toEqual(["operation-manifest.json"]);
  });

  it.each(["canonicalPath", "manifestSha256", "bundleDigest", "binarySha256"] as const)("rejects Task %s mismatch before verifier or claims", async (field) => {
    const root = await fixture();
    const overrides = { [field]: field === "canonicalPath" ? `${capsulePath}-wrong` : "e".repeat(64) };
    const result = ps(`
$script:probes=0; $script:claims=0
function Invoke-Daily69CapsuleVerifierProcess { param($WorktreeRoot,$VerifierArguments) $script:probes++; throw 'MUST_NOT_LAUNCH' }
try { ${gateCall(root, overrides)} | Out-Null; $script:claims++ } catch { $code=$_.Exception.Message }
@{code=$code;probes=$script:probes;claims=$script:claims} | ConvertTo-Json -Compress`);
    expect(result).toEqual({ code: "CODEX_CAPSULE_TASK_BINDING_MISMATCH", probes: 0, claims: 0 });
  });

  it("rejects malformed proof and retains only structured capsule errors, with no fallback or claims", async () => {
    const root = await fixture();
    const result = ps(`
$script:captures=@(
  [pscustomobject]@{exitCode=3;lines=@('{"safeError":"CODEX_CAPSULE_RUNTIME_MISSING"}')},
  [pscustomobject]@{exitCode=3;lines=@('private raw child output')},
  [pscustomobject]@{exitCode=0;lines=@('{"event":"daily69_runtime_capsule_verified","verified":"true"}')},
  [pscustomobject]@{exitCode=0;lines=@('{"event":"daily69_runtime_capsule_verified","verified":true}','unexpected output')},
  [pscustomobject]@{exitCode=0;lines=@('{"event":"unrelated","verified":true}')}
)
$script:index=0; $claims=0; $codes=@()
function Invoke-Daily69CapsuleVerifierProcess { param($WorktreeRoot,$VerifierArguments) $value=$script:captures[$script:index]; $script:index++; return $value }
foreach ($capture in $script:captures) { try { ${gateCall(root)} | Out-Null; $claims++ } catch { $codes += $_.Exception.Message } }
@{codes=$codes;claims=$claims;probes=$script:index} | ConvertTo-Json -Compress`);
    expect(result.codes).toEqual(["CODEX_CAPSULE_RUNTIME_MISSING", ...Array(4).fill("CODEX_CAPSULE_TASK_VERIFICATION_FAILED")]);
    expect(result.claims).toBe(0);
    expect(result.probes).toBe(5);
    expect(JSON.stringify(result)).not.toContain("private raw child output");
  });

  it("rejects command-line quote/control characters and malformed digests", async () => {
    const root = await fixture();
    const result = ps(`
$m=Get-Content -LiteralPath '${quote(join(root, "operation-manifest.json"))}' -Raw | ConvertFrom-Json
$b=Get-Daily69TaskCapsuleBinding -Manifest $m; $codes=@()
foreach ($bad in @('bad"path', ('bad'+[char]10+'path'))) { $b.canonicalPath=$bad; try { Get-Daily69CapsuleTaskArguments -Binding $b | Out-Null } catch { $codes += $_.Exception.Message } }
$b.canonicalPath='${quote(capsulePath)}'; $b.bundleDigest='not-a-hash'
try { Get-Daily69CapsuleTaskArguments -Binding $b | Out-Null } catch { $codes += $_.Exception.Message }
@{codes=$codes} | ConvertTo-Json -Compress`);
    expect(result.codes).toEqual(Array(3).fill("CODEX_CAPSULE_TASK_BINDING_INVALID"));
  });

  it.each([
    ["path", capsulePath, `${capsulePath}-wrong`],
    ["manifest", hashes.manifest, "e".repeat(64)],
    ["bundle", hashes.bundle, "e".repeat(64)],
    ["binary", hashes.binary, "e".repeat(64)],
    ["executable", "unused", "unused"],
  ])("readback rejects a %s substitution before declaring Task binding valid", async (field, original, replacement) => {
    const root = await fixture();
    const result = ps(`
$manifest=Get-Content -LiteralPath '${quote(join(root, "operation-manifest.json"))}' -Raw | ConvertFrom-Json
$capsuleBinding=Get-Daily69TaskCapsuleBinding -Manifest $manifest
${extractInstallerFunctions(["Quote", "New-OperationAction", "Assert-TaskBinding"])}
function New-ScheduledTaskAction { param($Execute,$Argument,$WorkingDirectory) [pscustomobject]@{Execute=$Execute;Arguments=$Argument;WorkingDirectory=$WorkingDirectory} }
$root='fixture-worktree'; $queue='fixture-operation'; $Namespace='operation-fixture'; $source='fixture-source'; $ExpectedGitHead='${"d".repeat(40)}'; $envPath='fixture-env-path-only'; $batchScript='run-batch-no-upload.ps1'
$action=New-OperationAction $batchScript
${field === "executable" ? "$action.Execute='codex'" : `$action.Arguments=$action.Arguments.Replace('${quote(original)}', '${quote(replacement)}')`}
$script:task=[pscustomobject]@{Actions=@($action)}
function Get-ScheduledTask { param($TaskName,$ErrorAction) return $script:task }
try { Assert-TaskBinding 'FixtureOnly' 'batch'; $code='UNEXPECTED_PASS' } catch { $code=$_.Exception.Message }
@{code=$code} | ConvertTo-Json -Compress`);
    expect(result.code).toBe("FIRST_OPERATION_TASK_ACTION_VERIFY_FAILED:FixtureOnly");
  });

  it("gates every wrapper before credentials and gates batch before the hourly slot claim", async () => {
    const commonText = await readFile(common, "utf8");
    const commonBody = commonText.slice(commonText.indexOf("if ($LibraryOnly) { return }"));
    expect(commonBody.indexOf("Assert-Daily69TaskCapsule")).toBeLessThan(commonBody.indexOf('"scripts\\queue-control-integration\\common-control-no-upload.ps1"'));
    for (const role of ["batch", "control", "closeout", "finalizer"]) {
      const wrapper = await readFile(resolve(`scripts/daily69-first-operation/run-${role}-no-upload.ps1`), "utf8");
      for (const name of ["CodexRuntimeCapsulePath", "CodexRuntimeCapsuleManifestSha256", "CodexRuntimeCapsuleBundleDigest", "CodexRuntimeBinarySha256"]) {
        expect(wrapper).toContain(`-` + name + ` $` + name);
        expect(wrapper).toMatch(new RegExp(`\\[Parameter\\(Mandatory = \\$true\\)\\][^\\n]+\\$${name}`, "u"));
      }
      if (role === "batch") expect(wrapper.indexOf('-CodexRuntimeCapsulePath $CodexRuntimeCapsulePath')).toBeLessThan(wrapper.indexOf("$slotClaim = Claim-Daily69BatchSlot"));
      if (role === "finalizer") expect(wrapper.indexOf("Assert-Daily69TaskCapsule")).toBeLessThan(wrapper.indexOf("$capture = Invoke-Daily69FinalizerChild"));
    }
    const install = await readFile(installer, "utf8");
    expect(install.indexOf("Assert-Daily69TaskCapsule")).toBeLessThan(install.indexOf("$backups = @{}"));
    expect(install).toContain("capsuleBinding = $capsuleBinding");
    const source = await readFile(library, "utf8");
    expect(source).not.toMatch(/Start-ScheduledTask|Register-ScheduledTask|Disable-ScheduledTask|auth\.json|Set-Content|WriteAllText|Copy-Item/u);
  });

  it("classifies a capsule integrity failure as guard-blocked without runtime retry", () => {
    const result = ps(`
. '${quote(common)}' -WorktreeRoot library -QueueRoot library -Namespace operation-fixture -SourceRoot library -ExpectedGitHead '${"d".repeat(40)}' -EnvFile library -InvocationRole batch -TaskName FixtureOnly -WrapperPath library -LibraryOnly
Resolve-Daily69FailureOutcome -SafeCode CODEX_CAPSULE_RUNTIME_TAMPERED | ConvertTo-Json -Compress`);
    expect(result).toEqual({ outcome: "guard_blocked", safeError: "CODEX_CAPSULE_RUNTIME_TAMPERED", wrapperExitCode: 3 });
  });

  it("scopes native fail-closed handling to verified wrapper context, never ambient queue state", async () => {
    const root = await fixture();
    const result = ps(`
. '${quote(common)}' -WorktreeRoot library -QueueRoot library -Namespace operation-fixture -SourceRoot library -ExpectedGitHead '${"d".repeat(40)}' -EnvFile library -InvocationRole batch -TaskName FixtureOnly -WrapperPath library -LibraryOnly
$script:observed=@(); $script:disabled=@()
# Every command with potential side effects is a local function stub.
function npm.cmd { $script:observed += [pscustomobject]@{queue=$env:QUEUE_SCHEDULER_ROOT;cwd=(Get-Location).Path}; $global:LASTEXITCODE=0 }
function Disable-ScheduledTask { param($TaskName,$ErrorAction) $script:disabled += $TaskName }
$env:QUEUE_SCHEDULER_ROOT='ambient-must-not-use'
$script:Daily69FailClosedQueueRoot=$null; $script:Daily69FailClosedWorktreeRoot=$null
Stop-FirstOperationFailClosed -Reason CODEX_CAPSULE_RUNTIME_MISSING | Out-Null
$withoutContext=$script:observed.Count
$script:Daily69FailClosedQueueRoot='${quote(root)}'; $script:Daily69FailClosedWorktreeRoot='${quote(resolve("."))}'
Stop-FirstOperationFailClosed -Reason CODEX_CAPSULE_RUNTIME_MISSING | Out-Null
@{withoutContext=$withoutContext;observed=$script:observed;restored=$env:QUEUE_SCHEDULER_ROOT;stubDisableCalls=$script:disabled.Count} | ConvertTo-Json -Depth 4 -Compress`);
    expect(result.withoutContext).toBe(0);
    expect(result.observed).toEqual([{ queue: root, cwd: resolve(".") }]);
    expect(result.restored).toBe("ambient-must-not-use");
    expect(result.stubDisableCalls).toBe(4);
    expect(await readdir(root)).toEqual(["operation-manifest.json"]);
  });
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "daily69-capsule-task-test-")); roots.push(root);
  await writeFile(join(root, "operation-manifest.json"), JSON.stringify(fixtureManifest));
  return root;
}
function quote(value: string) { return value.split("'").join("''"); }
function gateCall(root: string, overrides: Partial<Record<"canonicalPath" | "manifestSha256" | "bundleDigest" | "binarySha256", string>> = {}) {
  return `Assert-Daily69TaskCapsule -WorktreeRoot '${quote(resolve("."))}' -QueueRoot '${quote(root)}' -Namespace operation-fixture -CodexRuntimeCapsulePath '${quote(overrides.canonicalPath ?? capsulePath)}' -CodexRuntimeCapsuleManifestSha256 '${overrides.manifestSha256 ?? hashes.manifest}' -CodexRuntimeCapsuleBundleDigest '${overrides.bundleDigest ?? hashes.bundle}' -CodexRuntimeBinarySha256 '${overrides.binarySha256 ?? hashes.binary}'`;
}
function extractInstallerFunctions(names: string[]) {
  return `$tokens=$null; $errors=$null; $ast=[Management.Automation.Language.Parser]::ParseFile('${quote(installer)}',[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw 'TEST_INSTALLER_PARSE_FAILED' }
foreach ($name in @(${names.map((name) => `'${name}'`).join(",")})) { $function=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$false); if (-not $function) {throw 'TEST_FUNCTION_NOT_FOUND'}; Invoke-Expression $function.Extent.Text }`;
}
function ps(body: string): Record<string, unknown> {
  const script = `$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; . '${quote(library)}'\n${body}`;
  return JSON.parse(execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], { encoding: "utf8", windowsHide: true, timeout: 30_000 }).trim()) as Record<string, unknown>;
}
