import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { DAILY_69_NO_UPLOAD_SETTINGS, LocalQueueRepository } from "@/lib/queue-scheduler";
import { projectionIdentity, QueueProjectionService, RESERVE_SHEET_NAME, SYNC_SHEET_NAME } from "@/lib/queue-control-integration";
import { SHEET_NAMES } from "@/lib/google-sheets/sheetSchemas";
import { createCommerceControlRepository } from "@/lib/google-sheets/commerceControlRepository";
import { MemorySheetsGateway } from "../helpers/googleSheetsControl";
import { rankedProducts } from "./fixtures";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

class CountingMemorySheetsGateway extends MemorySheetsGateway {
  updateCallCount = 0;
  appendCallCount = 0;

  override async updateValues(...args: Parameters<MemorySheetsGateway["updateValues"]>) {
    this.updateCallCount += 1;
    return super.updateValues(...args);
  }

  override async appendValues(...args: Parameters<MemorySheetsGateway["appendValues"]>) {
    this.appendCallCount += 1;
    return super.appendValues(...args);
  }
}

describe("local queue to Sheets projection", () => {
  test("builds delimiter-safe deterministic external identities", () => {
    expect(projectionIdentity("operation-A:x", "queue:1")).toBe(projectionIdentity("operation-A:x", "queue:1"));
    expect(projectionIdentity("operation-A", "x:queue:1")).not.toBe(projectionIdentity("operation-A:x", "queue:1"));
    expect(() => projectionIdentity("", "queue-1")).toThrow("SHEETS_PROJECTION_NAMESPACE_REQUIRED");
  });

  test("projects 69 and reserve using RAW-safe values without copying local paths back", async () => {
    const root = await mkdtemp(join(tmpdir(), "daily69-projection-")); roots.push(root);
    const repository = new LocalQueueRepository(root); await repository.writeSettings({ ...DAILY_69_NO_UPLOAD_SETTINGS, enabled: true, isPaused: false });
    const now = new Date("2026-08-09T00:00:00.000Z"); await repository.insertRanked({ ranked: rankedProducts(83, true), queueDate: "2026-08-09", now, dueNow: true });
    const [claimed] = await repository.claimDue({ now, runId: "projection-video", limit: 1, leaseMinutes: 10, pilotMax: 69 });
    await repository.complete({ id: claimed.id, videoPath: "C:\\private\\daily69\\output.mp4", reviewPath: "C:\\private\\daily69\\review.json", creativeScore: 90, videoQualityScore: 91, now });
    const revisionBefore = (await repository.controlState()).localRevision;
    const gateway = new CountingMemorySheetsGateway();
    const result = await new QueueProjectionService(gateway, repository, "daily69-canary-test").project();
    const queueRows = gateway.sheets.get(SHEET_NAMES.queue)!; const headers = queueRows[0].map(String);
    const localRows = queueRows.slice(1).filter((row) => row[headers.indexOf("Namespace")] === "daily69-canary-test");
    expect(localRows).toHaveLength(69); expect(gateway.sheets.get(RESERVE_SHEET_NAME)!.slice(1)).toHaveLength(14); expect(gateway.sheets.get(SYNC_SHEET_NAME)!.slice(1)).toHaveLength(1);
    expect(localRows[0][4]).toBe('=HYPERLINK("https://invalid.example","상품")');
    expect(JSON.stringify(localRows)).not.toContain("C:\\private"); expect(localRows[0][headers.indexOf("Artifact Reference ID")]).toMatch(/^artifact-/u);
    expect(result.state.projectionRevision).toBe(revisionBefore); expect((await repository.controlState()).localRevision).toBe(revisionBefore);
    expect(gateway.appendCallCount).toBe(0);
    expect(gateway.updateCallCount).toBeLessThanOrEqual(6);
    gateway.appendCallCount = 0; gateway.updateCallCount = 0;
    await new QueueProjectionService(gateway, repository, "daily69-canary-test").project();
    expect(gateway.appendCallCount).toBe(0);
    expect(gateway.updateCallCount).toBeLessThanOrEqual(3);
    const clientSource = await readFile("src/lib/queue-control-integration/sheetsOnlyClient.ts", "utf8");
    expect(clientSource).toContain("valueInputOption=RAW"); expect(clientSource).not.toContain("drive/v3"); expect(clientSource).not.toContain("uploadVideo");
  });

  test("keeps same Queue IDs and reserve hashes isolated across namespaces and idempotent within one namespace", async () => {
    const rootA = await mkdtemp(join(tmpdir(), "daily69-projection-a-")); roots.push(rootA);
    const rootB = await mkdtemp(join(tmpdir(), "daily69-projection-b-")); roots.push(rootB);
    const repositoryA = new LocalQueueRepository(rootA);
    const repositoryB = new LocalQueueRepository(rootB);
    const settings = { ...DAILY_69_NO_UPLOAD_SETTINGS, enabled: true, isPaused: false };
    await Promise.all([repositoryA.writeSettings(settings), repositoryB.writeSettings(settings)]);
    const now = new Date("2026-08-09T00:00:00.000Z");
    const ranked = rankedProducts(83, true);
    await repositoryA.insertRanked({ ranked, queueDate: "2026-08-11", now, dueNow: true });
    await repositoryB.insertRanked({ ranked, queueDate: "2026-08-17", now, dueNow: true });
    const queueAItems = await repositoryA.items();
    const queueBItems = await repositoryB.items();
    await writeFile(repositoryB.queuePath, `${JSON.stringify(queueBItems.map((item, index) => ({ ...item, id: queueAItems[index].id })), null, 2)}\n`, "utf8");
    expect((await repositoryA.items()).map((item) => item.id)).toEqual((await repositoryB.items()).map((item) => item.id));

    const gateway = new CountingMemorySheetsGateway();
    const projectionA = new QueueProjectionService(gateway, repositoryA, "operation-2026-08-11");
    const projectionB = new QueueProjectionService(gateway, repositoryB, "operation-2026-08-17-attempt-2");
    await projectionA.project();
    const queueHeaders = gateway.sheets.get(SHEET_NAMES.queue)![0].map(String);
    const queueNamespace = queueHeaders.indexOf("Namespace");
    const queueA = gateway.sheets.get(SHEET_NAMES.queue)!.slice(1).filter((row) => row[queueNamespace] === "operation-2026-08-11");
    const queueABefore = JSON.stringify(queueA);
    const reserveHeaders = gateway.sheets.get(RESERVE_SHEET_NAME)![0].map(String);
    const reserveNamespace = reserveHeaders.indexOf("Namespace");
    const reserveABefore = JSON.stringify(gateway.sheets.get(RESERVE_SHEET_NAME)!.slice(1).filter((row) => row[reserveNamespace] === "operation-2026-08-11"));

    const planB = await projectionB.planProjectionDiff();
    expect(planB[SHEET_NAMES.queue]).toMatchObject({ rowsToUpdate: 0, rowsToAppend: 69, unrelatedRowsWouldChange: 0 });
    expect(planB[RESERVE_SHEET_NAME]).toMatchObject({ rowsToUpdate: 0, rowsToAppend: 14, unrelatedRowsWouldChange: 0 });
    await projectionB.projectAppendOnly();
    const queueRows = gateway.sheets.get(SHEET_NAMES.queue)!;
    expect(queueRows.slice(1).filter((row) => row[queueNamespace] === "operation-2026-08-11")).toHaveLength(69);
    expect(queueRows.slice(1).filter((row) => row[queueNamespace] === "operation-2026-08-17-attempt-2")).toHaveLength(69);
    expect(JSON.stringify(queueRows.slice(1).filter((row) => row[queueNamespace] === "operation-2026-08-11"))).toBe(queueABefore);
    expect(JSON.stringify(gateway.sheets.get(RESERVE_SHEET_NAME)!.slice(1).filter((row) => row[reserveNamespace] === "operation-2026-08-11"))).toBe(reserveABefore);
    expect(gateway.sheets.get(RESERVE_SHEET_NAME)!.slice(1).filter((row) => row[reserveNamespace] === "operation-2026-08-17-attempt-2")).toHaveLength(14);
    await expect(projectionB.projectAppendOnly()).rejects.toThrow("CUTOVER_WOULD_MUTATE_EXISTING_ROWS");

    const dashboard = await createCommerceControlRepository(gateway).dashboard();
    expect(dashboard.daily69).toMatchObject({ namespace: "operation-2026-08-17-attempt-2", activeCount: 69, reserveCount: 14 });

    const repeatPlan = await projectionB.planProjectionDiff();
    expect(repeatPlan[SHEET_NAMES.queue]).toMatchObject({ rowsToUpdate: 69, rowsToAppend: 0, unrelatedRowsWouldChange: 0 });
    expect(repeatPlan[RESERVE_SHEET_NAME]).toMatchObject({ rowsToUpdate: 14, rowsToAppend: 0, unrelatedRowsWouldChange: 0 });
    await projectionB.project();
    expect(gateway.sheets.get(SHEET_NAMES.queue)!.slice(1).filter((row) => row[queueNamespace] === "operation-2026-08-17-attempt-2")).toHaveLength(69);
    expect(gateway.sheets.get(RESERVE_SHEET_NAME)!.slice(1).filter((row) => row[reserveNamespace] === "operation-2026-08-17-attempt-2")).toHaveLength(14);
  });
});
