import { resolve } from "node:path";
import { capturePreCutoverSheetBaseline, NoUploadGoogleSheetsClient } from "../../src/lib/queue-control-integration";
import { atomicWriteJson } from "../../src/lib/queue-scheduler/atomicJson";

async function main() {
  const operationRoot = resolve(requiredEnv("QUEUE_SCHEDULER_ROOT"));
  const baseline = await capturePreCutoverSheetBaseline(new NoUploadGoogleSheetsClient());
  await atomicWriteJson(resolve(operationRoot, "pre-cutover-sheet-baseline.json"), baseline);
  process.stdout.write(`${JSON.stringify({
    event: "daily69_pre_cutover_sheet_baseline",
    queueRows: baseline.queue.length,
    reserveRows: baseline.reserve.length,
    syncRows: baseline.sync.length,
    schemaVersion: baseline.schemaVersion,
    fingerprintMode: baseline.fingerprintMode,
    aggregateHash: baseline.aggregateHash,
    rawValuesStored: false,
    formulaTextStored: false,
    effectiveValuesStored: false,
    formattedValuesStored: false,
    credentialIdentifiersStored: false,
    sheetWrites: 0,
    SAFE_TO_UPLOAD: false,
    PLATFORM_UPLOAD: 0,
  })}\n`);
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_MISSING`);
  return value;
}
function safeError(error: unknown) {
  const value = error instanceof Error ? error.message : String(error);
  return /^[A-Z0-9_:-]+$/u.test(value) ? value : "CUTOVER_BASELINE_CAPTURE_FAILED";
}
void main().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({ event: "daily69_pre_cutover_sheet_baseline_failed", safeError: safeError(error), sheetWrites: 0, SAFE_TO_UPLOAD: false })}\n`);
  process.exitCode = 1;
});
