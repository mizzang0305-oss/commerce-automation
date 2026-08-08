import { basename } from "node:path";
import { LocalQueueRepository } from "../../src/lib/queue-scheduler";
import { NoUploadGoogleSheetsClient, QueueProjectionService, RESERVE_SHEET_NAME, SYNC_SHEET_NAME } from "../../src/lib/queue-control-integration";

void (async () => {
  const repository = new LocalQueueRepository();
  const client = new NoUploadGoogleSheetsClient();
  await client.ensureSheets([RESERVE_SHEET_NAME, SYNC_SHEET_NAME]);
  const namespace = process.env.QUEUE_CONTROL_NAMESPACE?.trim() || basename(repository.root);
  const result = await new QueueProjectionService(client, repository, namespace).project();
  process.stdout.write(`${JSON.stringify({ event: "queue_projection_completed", namespace, queueCount: result.queueCount, reserveCount: result.reserveCount, projectionRevision: result.state.projectionRevision, snapshotHash: result.snapshotHash, uploadCalls: 0, driveCalls: 0 })}\n`);
})().catch((error: unknown) => { process.stderr.write(`${JSON.stringify({ event: "queue_projection_failed", safeError: safeError(error), uploadCalls: 0, driveCalls: 0 })}\n`); process.exitCode = 1; });

function safeError(error: unknown) { const value = error instanceof Error ? error.message : String(error); return /^[A-Z0-9_:-]+$/u.test(value) ? value : "QUEUE_PROJECTION_FAILED"; }
