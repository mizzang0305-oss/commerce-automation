import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { DEFAULT_QUEUE_SCHEDULER_SETTINGS, LocalQueueRepository } from "@/lib/queue-scheduler";
import { processOneQueueControlCommand, QueueProjectionService } from "@/lib/queue-control-integration";
import { SheetsCommandRepository } from "@/lib/google-sheets/sheetsCommandRepository";
import { SHEET_NAMES, type SheetRow } from "@/lib/google-sheets/sheetSchemas";
import { MemorySheetsGateway } from "../helpers/googleSheetsControl";
import { rankedProducts } from "./fixtures";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));
async function setup() { const root = await mkdtemp(join(tmpdir(), "queue-control-")); roots.push(root); const repository = new LocalQueueRepository(root); await repository.writeSettings({ ...DEFAULT_QUEUE_SCHEDULER_SETTINGS, enabled: true }); const now = new Date("2026-08-09T00:00:00.000Z"); await repository.insertRanked({ ranked: rankedProducts(12), queueDate: "2026-08-09", now, dueNow: true }); return { repository, now }; }

describe("Sheets command bus over local authority", () => {
  test("applies hold once, prevents duplicate execution, and stale-rejects an old revision", async () => {
    const { repository, now } = await setup(); const gateway = new MemorySheetsGateway(); const commands = new SheetsCommandRepository(gateway);
    const item = (await repository.items())[0];
    const created = await commands.create({ queueId: item.id, command: "HOLD_SLOT", expectedRevision: item.localRevision, namespace: "daily69-canary-test", webRequestKey: crypto.randomUUID() });
    const projection = new QueueProjectionService(gateway, repository, "daily69-canary-test");
    const first = await processOneQueueControlCommand({ gateway, repository, projection, runnerId: "runner-test", now });
    expect(first).toMatchObject({ status: "completed", localApplied: true });
    const held = (await repository.items()).find((entry) => entry.id === item.id)!; expect(held.status).toBe("hold");
    const revisionAfterHold = (await repository.controlState()).localRevision;
    const row = gateway.sheets.get(SHEET_NAMES.commands)!.find((entry) => entry[0] === created.command.commandId)!; row[6] = "claimed"; row[7] = "runner:runner-test";
    const duplicate = await processOneQueueControlCommand({ gateway, repository, projection, runnerId: "runner-test", now });
    expect(duplicate).toMatchObject({ duplicateExecutionPrevented: true }); expect((await repository.controlState()).localRevision).toBe(revisionAfterHold);
    await commands.create({ queueId: item.id, command: "SKIP_SLOT", expectedRevision: item.localRevision, namespace: "daily69-canary-test", webRequestKey: crypto.randomUUID() });
    const stale = await processOneQueueControlCommand({ gateway, repository, projection, runnerId: "runner-test", now });
    expect(stale).toMatchObject({ status: "stale_rejected", safeMessage: "STALE_CONTROL_COMMAND", localApplied: false });
    expect((await repository.items()).find((entry) => entry.id === item.id)!.status).toBe("hold");
  });

  test("keeps local mutation when projection fails", async () => {
    const { repository, now } = await setup();
    class ProjectionFailGateway extends MemorySheetsGateway {
      override async updateValues(sheetName: string, range: string, values: SheetRow[]) { if (sheetName === SHEET_NAMES.queue) throw new Error("SYNTHETIC_SHEETS_FAILURE"); return super.updateValues(sheetName, range, values); }
    }
    const gateway = new ProjectionFailGateway(); const commands = new SheetsCommandRepository(gateway); const item = (await repository.items())[0];
    await commands.create({ queueId: item.id, command: "HOLD_SLOT", expectedRevision: item.localRevision, namespace: "daily69-canary-test", webRequestKey: crypto.randomUUID() });
    const result = await processOneQueueControlCommand({ gateway, repository, projection: new QueueProjectionService(gateway, repository, "daily69-canary-test"), runnerId: "runner-test", now });
    expect(result).toMatchObject({ status: "completed", safeMessage: "SLOT_HELD_PROJECTION_PENDING", localApplied: true });
    expect((await repository.items()).find((entry) => entry.id === item.id)!.status).toBe("hold");
  });
});
