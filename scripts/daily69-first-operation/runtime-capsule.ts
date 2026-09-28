import { readFile } from "node:fs/promises";
import { inspectCodexRuntimeAdmission, materializeCodexRuntimeCapsule, type CodexRuntimeApproval } from "../../src/lib/queue-scheduler/codexRuntimeCapsule";
import { assertCodexRuntimeBinding, inspectCodexRuntimeBinding } from "../../src/lib/queue-scheduler/codexRuntimeBinding";
import { bindingForCodexRuntimeCapsule } from "../../src/lib/daily69-first-operation/runtimeCapsule";

// Local operator command only. Approval JSON is an explicit Owner attestation,
// never candidate discovery output. This command cannot create/ARM an operation.
void (async () => {
  const action = requiredArg("--action");
  const approvalPath = optionalArg("--approval-file");
  const approval: CodexRuntimeApproval | undefined = approvalPath ? JSON.parse(await readFile(approvalPath, "utf8")) : undefined;
  if (action === "admission") {
    const version = optionalArg("--candidate-version"), binarySha256 = optionalArg("--candidate-sha256");
    if (Boolean(version) !== Boolean(binarySha256)) throw new Error("CODEX_CAPSULE_ARGUMENT_REQUIRED");
    const state = inspectCodexRuntimeAdmission(version && binarySha256 ? { version, binarySha256 } : undefined, approval);
    output({ state, autoApproval: false });
  } else if (action === "materialize") {
    // No root override and no bundled credential/config input are exposed by CLI.
    const result = await materializeCodexRuntimeCapsule({ sourceCommand: requiredArg("--source-command"), approval });
    output({ state: "CAPSULE_VERIFIED", runtimeBinding: bindingForCodexRuntimeCapsule(result),
      nextOperationAuthorized: false, purpose: result.reference.purpose });
  } else if (action === "verify") {
    const input: unknown = JSON.parse(await readFile(requiredArg("--runtime-capsule-binding"), "utf8"));
    assertCodexRuntimeBinding(input);
    if (input.schemaVersion !== "daily69-codex-cli-runtime-v2") throw new Error("CODEX_CAPSULE_OPERATION_BINDING_REQUIRED");
    const binding = await inspectCodexRuntimeBinding(input);
    output({ state: "CAPSULE_VERIFIED", runtimeBinding: binding, nextOperationAuthorized: false });
  } else throw new Error("CODEX_CAPSULE_ACTION_INVALID");
})().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  const safeError = /^CODEX_[A-Z0-9_]+$/u.test(message) ? message : "CODEX_CAPSULE_COMMAND_FAILED";
  process.stderr.write(`${JSON.stringify({ event: "daily69_runtime_capsule_failed", safeError, SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 })}\n`);
  process.exitCode = 3;
});

function optionalArg(name: string) { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; }
function requiredArg(name: string) { const value = optionalArg(name); if (!value || value.startsWith("--")) throw new Error("CODEX_CAPSULE_ARGUMENT_REQUIRED"); return value; }
function output(data: Record<string, unknown>) { process.stdout.write(`${JSON.stringify({ event: "daily69_runtime_capsule", ...data, SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 })}\n`); }
