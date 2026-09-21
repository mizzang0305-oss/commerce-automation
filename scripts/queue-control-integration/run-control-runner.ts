import { basename } from "node:path";
import { acquireSheetsRunnerLock } from "../../src/lib/commerce-control/runnerLock";
import { LocalQueueRepository } from "../../src/lib/queue-scheduler";
import { NoUploadGoogleSheetsClient, processOneQueueControlCommand, QueueProjectionService, RESERVE_SHEET_NAME, SYNC_SHEET_NAME } from "../../src/lib/queue-control-integration";

void (async () => {
  const runnerId = process.env.COMMAND_RUNNER_ID?.trim() || "daily69-control-runner";
  const repository = new LocalQueueRepository();
  const client = new NoUploadGoogleSheetsClient();
  await client.ensureSheets([RESERVE_SHEET_NAME, SYNC_SHEET_NAME]);
  const namespace = process.env.QUEUE_CONTROL_NAMESPACE?.trim() || basename(repository.root);
  const lock = await acquireSheetsRunnerLock(process.cwd(), runnerId);
  try {
    const result = await processOneQueueControlCommand({ gateway: client, repository, projection: new QueueProjectionService(client, repository, namespace), runnerId });
    process.stdout.write(`${JSON.stringify({ event: result.processed ? "control_command_processed" : "no_pending_control_command", ...result, namespace, uploadCalls: 0, driveCalls: 0 })}\n`);
  } finally { await lock.release(); }
})().catch((error: unknown) => { process.stderr.write(`${JSON.stringify({ event: "control_runner_failed", safeError: safeError(error), uploadCalls: 0, driveCalls: 0 })}\n`); process.exitCode = 1; });

function safeError(error: unknown) { const value = error instanceof Error ? error.message : String(error); return /^[A-Z0-9_:-]+$/u.test(value) ? value : "CONTROL_RUNNER_FAILED"; }
