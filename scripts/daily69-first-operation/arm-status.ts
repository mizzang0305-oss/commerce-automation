import { resolve } from "node:path";
import {
  FIRST_OPERATION_ARM_STATUSES,
  promoteFirstOperationActivePointer,
  transitionFirstOperationArmStatus,
  type FirstOperationArmStatus,
} from "../../src/lib/daily69-first-operation";

async function main() {
  const operationRoot = resolve(requiredArg("--operation-root"));
  const status = requiredArg("--status") as FirstOperationArmStatus;
  if (!FIRST_OPERATION_ARM_STATUSES.includes(status)) throw new Error("FIRST_OPERATION_ARM_STATUS_INVALID");
  const manifest = await transitionFirstOperationArmStatus(operationRoot, status);
  const pointer = process.argv.includes("--promote") ? await promoteFirstOperationActivePointer(operationRoot) : null;
  process.stdout.write(`${JSON.stringify({ event: "daily69_first_operation_arm_status", namespace: manifest.namespace, armStatus: manifest.armStatus, pointerPromoted: Boolean(pointer), SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 })}\n`);
}

function requiredArg(name: string) { const index = process.argv.indexOf(name); const value = index >= 0 ? process.argv[index + 1] : ""; if (!value) throw new Error(`MISSING_ARGUMENT_${name.replace(/^-+/u, "").toUpperCase()}`); return value; }
void main().catch((error: unknown) => { process.stderr.write(`${JSON.stringify({ event: "daily69_first_operation_arm_status_failed", safeError: safeError(error), SAFE_TO_UPLOAD: false })}\n`); process.exitCode = 1; });
function safeError(error: unknown) { const value = error instanceof Error ? error.message : String(error); return /^[A-Z0-9_:-]+$/u.test(value) ? value : "FIRST_OPERATION_ARM_STATUS_FAILED"; }
