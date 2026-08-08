import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { DAILY_69_NO_UPLOAD_SETTINGS, LocalQueueRepository } from "@/lib/queue-scheduler";
import { QueueProjectionService, RESERVE_SHEET_NAME, SYNC_SHEET_NAME } from "@/lib/queue-control-integration";
import { SHEET_NAMES } from "@/lib/google-sheets/sheetSchemas";
import { MemorySheetsGateway } from "../helpers/googleSheetsControl";
import { rankedProducts } from "./fixtures";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("local queue to Sheets projection", () => {
  test("projects 69 and reserve using RAW-safe values without copying local paths back", async () => {
    const root = await mkdtemp(join(tmpdir(), "daily69-projection-")); roots.push(root);
    const repository = new LocalQueueRepository(root); await repository.writeSettings({ ...DAILY_69_NO_UPLOAD_SETTINGS, enabled: true, isPaused: false });
    const now = new Date("2026-08-09T00:00:00.000Z"); await repository.insertRanked({ ranked: rankedProducts(83, true), queueDate: "2026-08-09", now, dueNow: true });
    const [claimed] = await repository.claimDue({ now, runId: "projection-video", limit: 1, leaseMinutes: 10, pilotMax: 69 });
    await repository.complete({ id: claimed.id, videoPath: "C:\\private\\daily69\\output.mp4", reviewPath: "C:\\private\\daily69\\review.json", creativeScore: 90, videoQualityScore: 91, now });
    const revisionBefore = (await repository.controlState()).localRevision;
    const gateway = new MemorySheetsGateway();
    const result = await new QueueProjectionService(gateway, repository, "daily69-canary-test").project();
    const queueRows = gateway.sheets.get(SHEET_NAMES.queue)!; const headers = queueRows[0].map(String);
    const localRows = queueRows.slice(1).filter((row) => row[headers.indexOf("Namespace")] === "daily69-canary-test");
    expect(localRows).toHaveLength(69); expect(gateway.sheets.get(RESERVE_SHEET_NAME)!.slice(1)).toHaveLength(14); expect(gateway.sheets.get(SYNC_SHEET_NAME)!.slice(1)).toHaveLength(1);
    expect(localRows[0][4]).toBe('=HYPERLINK("https://invalid.example","상품")');
    expect(JSON.stringify(localRows)).not.toContain("C:\\private"); expect(localRows[0][headers.indexOf("Artifact Reference ID")]).toMatch(/^artifact-/u);
    expect(result.state.projectionRevision).toBe(revisionBefore); expect((await repository.controlState()).localRevision).toBe(revisionBefore);
    const clientSource = await readFile("src/lib/queue-control-integration/sheetsOnlyClient.ts", "utf8");
    expect(clientSource).toContain("valueInputOption=RAW"); expect(clientSource).not.toContain("drive/v3"); expect(clientSource).not.toContain("uploadVideo");
  });
});
