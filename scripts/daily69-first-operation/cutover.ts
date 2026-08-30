import { resolve } from "node:path";
import { readJson } from "../../src/lib/queue-scheduler/atomicJson";
import {
  assertFreshAttemptCutover,
  assertFreshCutoverProjectionPlan,
  NoUploadGoogleSheetsClient,
  QueueProjectionService,
  verifyFreshNamespaceRows,
  verifyPreexistingRowsUnchanged,
  type PreCutoverSheetBaseline,
} from "../../src/lib/queue-control-integration";
import {
  firstOperationStatus,
  transitionFirstOperationArmStatus,
  verifyFirstOperationMaterializationEligibility,
} from "../../src/lib/daily69-first-operation";
import { LocalQueueRepository } from "../../src/lib/queue-scheduler";

const PHASES = ["plan", "project", "verify"] as const;
type Phase = typeof PHASES[number];

async function main() {
  const phase = requiredArg("--phase") as Phase;
  if (!PHASES.includes(phase)) throw new Error("CUTOVER_PHASE_INVALID");
  const operationRoot = resolve(requiredEnv("QUEUE_SCHEDULER_ROOT"));
  const namespace = requiredEnv("QUEUE_CONTROL_NAMESPACE");
  const snapshot = await firstOperationStatus(operationRoot);
  if (snapshot.manifest.schemaVersion !== "daily69-first-operation-v2") throw new Error("CUTOVER_MANIFEST_SCHEMA_INVALID");
  if (snapshot.manifest.namespace !== namespace) throw new Error("CUTOVER_NAMESPACE_BINDING_MISMATCH");
  if (kstDate(new Date()) >= snapshot.manifest.operationDate) throw new Error("TARGET_OPERATION_DATE_WINDOW_MISSED");
  await verifyFirstOperationMaterializationEligibility(operationRoot);
  assertFreshAttemptCutover({
    namespace,
    operationDate: snapshot.manifest.operationDate,
    attemptNumber: snapshot.manifest.attemptNumber ?? 1,
    previousAttemptNamespace: snapshot.manifest.previousAttemptNamespace ?? "",
  });
  const baseline = await readJson<PreCutoverSheetBaseline | null>(resolve(operationRoot, "pre-cutover-sheet-baseline.json"), null);
  if (!baseline) throw new Error("CUTOVER_BASELINE_NOT_FOUND");
  const gateway = new NoUploadGoogleSheetsClient();
  const preexisting = await verifyPreexistingRowsUnchanged(gateway, baseline);
  if (!preexisting.pass) throw new Error("CUTOVER_EXISTING_ROW_IMMUTABILITY_FAILED");

  if (phase === "verify") {
    const newRows = await verifyFreshNamespaceRows(gateway, namespace);
    if (!newRows.pass) throw new Error("CUTOVER_NEW_ROWS_VERIFY_FAILED");
    process.stdout.write(`${JSON.stringify(output(phase, namespace, preexisting, newRows, null))}\n`);
    return;
  }

  if (snapshot.manifest.armStatus !== "prepared") throw new Error("CUTOVER_OPERATION_NOT_PREPARED");
  const projection = new QueueProjectionService(gateway, new LocalQueueRepository(operationRoot), namespace);
  const plan = assertFreshCutoverProjectionPlan(await projection.planProjectionDiff());
  if (phase === "plan") {
    process.stdout.write(`${JSON.stringify(output(phase, namespace, preexisting, null, plan))}\n`);
    return;
  }

  await projection.projectAppendOnly();
  const post = await verifyPreexistingRowsUnchanged(gateway, baseline);
  if (!post.pass) throw new Error("CUTOVER_EXISTING_ROW_IMMUTABILITY_FAILED");
  const newRows = await verifyFreshNamespaceRows(gateway, namespace);
  if (!newRows.pass) throw new Error("CUTOVER_NEW_ROWS_VERIFY_FAILED");
  await transitionFirstOperationArmStatus(operationRoot, "projection_verified");
  process.stdout.write(`${JSON.stringify(output(phase, namespace, post, newRows, plan))}\n`);
}

function output(phase: Phase, namespace: string, immutability: Awaited<ReturnType<typeof verifyPreexistingRowsUnchanged>>, newRows: Awaited<ReturnType<typeof verifyFreshNamespaceRows>> | null, plan: ReturnType<typeof assertFreshCutoverProjectionPlan> | null) {
  return {
    event: `daily69_cutover_${phase}`,
    namespace,
    plan,
    immutability,
    newRows,
    existingRowsChanged: immutability.existingRowsChanged,
    existingRowsDeleted: immutability.existingRowsDeleted,
    existingRowsReorderedByUs: immutability.existingRowsReorderedByUs,
    rawValuesPrinted: false,
    SAFE_TO_UPLOAD: false,
    PLATFORM_UPLOAD: 0,
  };
}
function kstDate(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
function requiredArg(name: string) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : "";
  if (!value) throw new Error(`MISSING_ARGUMENT_${name.replace(/^-+/u, "").toUpperCase()}`);
  return value;
}
function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_MISSING`);
  return value;
}
function safeError(error: unknown) {
  const value = error instanceof Error ? error.message : String(error);
  return /^[A-Z0-9_:-]+$/u.test(value) ? value : "DAILY69_CUTOVER_VALIDATION_FAILED";
}
void main().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({ event: "daily69_cutover_failed", safeError: safeError(error), tasksArmed: false, pointerPromoted: false, SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 })}\n`);
  process.exitCode = 1;
});
