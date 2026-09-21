import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { COMPLETE_SHEET_COLUMNS, COMPLETE_SHEET_MAX_ROWS, readCompleteSheetUserEntered, readCompleteSheetValues, userEnteredPageFromResponse, valuesPageFromResponse } from "@/lib/google-sheets/completeSheetRead";
import type { SheetsGateway, SheetUserEnteredCell } from "@/lib/google-sheets/googleSheetsClient";
import { QUEUE_HEADERS, SHEET_NAMES, type SheetRow } from "@/lib/google-sheets/sheetSchemas";
import { SheetsQueueRepository } from "@/lib/google-sheets/sheetsQueueRepository";
import { capturePreCutoverSheetBaseline, QueueProjectionService, QUEUE_PROJECTION_EXTRA_HEADERS, RESERVE_HEADERS, RESERVE_SHEET_NAME, SYNC_HEADERS, SYNC_SHEET_NAME, verifyFreshNamespaceRows, verifyPreexistingRowsUnchanged } from "@/lib/queue-control-integration";
import { DAILY_69_NO_UPLOAD_SETTINGS, LocalQueueRepository } from "@/lib/queue-scheduler";
import { MemorySheetsGateway } from "../helpers/googleSheetsControl";
import { rankedProducts } from "../daily-69-control/fixtures";
import { NoUploadGoogleSheetsClient } from "@/lib/queue-control-integration/sheetsOnlyClient";

const headers: Record<string, readonly string[]> = { [SHEET_NAMES.queue]: [...QUEUE_HEADERS, ...QUEUE_PROJECTION_EXTRA_HEADERS], [RESERVE_SHEET_NAME]: RESERVE_HEADERS, [SYNC_SHEET_NAME]: SYNC_HEADERS };
const names = Object.keys(headers);
const namespace = "operation-2026-09-05-attempt-2";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

function row(sheet: string, id: string, ns = "historical"): SheetRow {
  const result: SheetRow = headers[sheet].map(() => "");
  const columns = headers[sheet];
  result[columns.indexOf("Namespace")] = ns;
  result[columns.indexOf(sheet === SHEET_NAMES.queue ? "Queue ID" : sheet === RESERVE_SHEET_NAME ? "Product Key Hash" : "Snapshot Hash")] = id;
  if (sheet === SYNC_SHEET_NAME) result[columns.indexOf("Status")] = "completed";
  return result;
}
function seed<T extends MemorySheetsGateway>(gateway: T, counts = [1101, 1101, 1101]): T {
  names.forEach((name, index) => gateway.sheets.set(name, [[...headers[name]], ...Array.from({ length: counts[index] }, (_, rowIndex) => row(name, `old-${rowIndex}`))]));
  return gateway;
}
async function projection(gateway: SheetsGateway) {
  const root = await mkdtemp(join(tmpdir(), "daily69-complete-read-")); roots.push(root);
  const repository = new LocalQueueRepository(root);
  await repository.writeSettings({ ...DAILY_69_NO_UPLOAD_SETTINGS, enabled: true, isPaused: false });
  await repository.insertRanked({ ranked: rankedProducts(83), queueDate: "2026-09-05", now: new Date("2026-09-04T00:00:00Z"), dueNow: false });
  return new QueueProjectionService(gateway, repository, namespace);
}
class CountingGateway extends MemorySheetsGateway {
  writes = 0;
  override async updateValues(...args: Parameters<MemorySheetsGateway["updateValues"]>) { this.writes += 1; return super.updateValues(...args); }
}

describe("metadata-aware bounded complete Sheets reads", () => {
  it.each(names.flatMap((name) => [999, 1000, 1001].map((count) => [name, count] as const)))("reads all %s data rows at boundary %i", async (name, count) => {
    const gateway = seed(new MemorySheetsGateway(), names.map(() => count));
    for (const read of [readCompleteSheetValues, readCompleteSheetUserEntered]) {
      const result = await read(gateway, name);
      expect(result.rows).toHaveLength(count + 1);
      expect(result.pageCount).toBe(4);
    }
    expect(gateway.pageReads.filter((read) => !read.semantic).map((read) => read.range)).toEqual([1, 501, 1001, 1501].map((start) => `A${start}:${name === SHEET_NAMES.queue ? "AH" : "L"}${start + 499}`));
  });

  it("retains physical row offsets across empty middle and trailing pages", async () => {
    const gateway = seed(new MemorySheetsGateway(), [0, 0, 0]);
    const rows = gateway.sheets.get(SHEET_NAMES.queue)!;
    while (rows.length < 1001) rows.push([]);
    rows.push(row(SHEET_NAMES.queue, "after-empty-page"));
    const result = await readCompleteSheetValues(gateway, SHEET_NAMES.queue);
    expect(result.rows).toHaveLength(1002);
    expect(result.rows[1001][0]).toBe("after-empty-page");
    expect(result.rows[501]).toEqual([]);
    expect(gateway.pageReads.map((page) => page.range)).toContain("A1501:AH2000");
  });

  it.each(["missing", "duplicate", "reordered", "overlap", "oversize", "failure"])("rejects %s pages without returning a partial read", async (defect) => {
    class BrokenGateway extends MemorySheetsGateway {
      override async getValuesPage(sheet: string, range: string) {
        const page = await super.getValuesPage(sheet, range);
        if (page.startRow !== 1001) return page;
        if (defect === "failure") throw new Error("SYNTHETIC_API_FAILURE");
        if (defect === "missing") return undefined as unknown as typeof page;
        if (defect === "duplicate") return { ...page, startRow: 501, endRow: 1000 };
        if (defect === "reordered") return { ...page, startRow: 1501, endRow: 2000 };
        if (defect === "overlap") return { ...page, startRow: 1000 };
        return { ...page, rows: Array.from({ length: 501 }, () => []) };
      }
    }
    await expect(readCompleteSheetValues(seed(new BrokenGateway()), SHEET_NAMES.queue)).rejects.toThrow();
  });

  it("fails closed on missing capability, oversized or changing metadata and unexpected columns", async () => {
    const gateway = seed(new MemorySheetsGateway());
    await expect(readCompleteSheetValues({ getValues: gateway.getValues } as unknown as SheetsGateway, SHEET_NAMES.queue)).rejects.toThrow("CAPABILITY_REQUIRED");
    gateway.gridRows.set(SHEET_NAMES.queue, COMPLETE_SHEET_MAX_ROWS + 1);
    await expect(readCompleteSheetValues(gateway, SHEET_NAMES.queue)).rejects.toThrow("ROW_BOUND_EXCEEDED");
    expect(gateway.pageReads).toHaveLength(0);
    class ChangedMetadata extends MemorySheetsGateway {
      calls = 0;
      override async metadata() { const value = await super.metadata(); if (++this.calls > 1) value.sheets[0].properties.gridProperties.rowCount += 1; return value; }
    }
    await expect(readCompleteSheetValues(seed(new ChangedMetadata()), SHEET_NAMES.queue)).rejects.toThrow("METADATA_CHANGED");
    class ShortColumns extends MemorySheetsGateway {
      override async metadata() { const value = await super.metadata(); value.sheets[0].properties.gridProperties.columnCount = 20; return value; }
    }
    await expect(readCompleteSheetValues(seed(new ShortColumns()), SHEET_NAMES.queue)).rejects.toThrow("COLUMN_SCHEMA_INVALID");
  });

  it("uses the API-reported range, including quoting and absolute A1 normalization", () => {
    expect(valuesPageFromResponse("A's", "A501:AH1000", { range: "'A''s'!$A$501:$AH$1000", values: [["ok"]] }).startRow).toBe(501);
    expect(valuesPageFromResponse("Queue", "A1:AH500", { range: "Queue!A1:AH500" }).rows).toEqual([]);
    for (const response of [{}, { range: "Queue!A1:AH500" }, { range: "Queue!A501:AH999" }, { range: "Wrong!A501:AH1000" }, { range: "Queue!A501:AH1000", majorDimension: "COLUMNS" }]) {
      expect(() => valuesPageFromResponse("Queue", "A501:AH1000", response)).toThrow("PAGE_IDENTITY_INVALID");
    }
    expect(() => valuesPageFromResponse("Queue", "A1:AH500", { range: "Queue!A1:AH500", values: [[{} as string]] })).toThrow("PAGE_ROWS_INVALID");
    expect(() => valuesPageFromResponse("Queue", "A1:AH500", { range: "Queue!A1:AH500", values: null as unknown as SheetRow[] })).toThrow("PAGE_ROWS_INVALID");
  });

  it("requires GridData start-row provenance even for an empty trailing page", () => {
    expect(userEnteredPageFromResponse("Queue", "A1001:AH1200", { sheets: [{ properties: { title: "Queue" }, data: [{ startRow: 1000 }] }] }).rows).toEqual([]);
    expect(userEnteredPageFromResponse("Queue", "A1:AH500", { sheets: [{ properties: { title: "Queue" }, data: [{}] }] }).startRow).toBe(1);
    for (const data of [undefined, [], [{ startRow: 500 }], [{ startRow: 1000, startColumn: 1 }], [{ startRow: 1000 }, { startRow: 1000 }]]) {
      expect(() => userEnteredPageFromResponse("Queue", "A1001:AH1200", { sheets: [{ properties: { title: "Queue" }, data }] })).toThrow("PAGE_IDENTITY_INVALID");
    }
  });

  it.each(names.flatMap((name) => ["change", "delete", "reorder", "formula"].map((mutation) => [name, mutation] as const)))("detects %s historical %s after row1000", async (name, mutation) => {
    const gateway = seed(new MemorySheetsGateway());
    const baseline = await capturePreCutoverSheetBaseline(gateway);
    const rows = gateway.sheets.get(name)!;
    if (mutation === "delete") rows.splice(1005, 1);
    else if (mutation === "reorder") [rows[1005], rows[1006]] = [rows[1006], rows[1005]];
    else rows[1005][1] = mutation === "formula" ? "=NOW()" : "changed";
    const result = await verifyPreexistingRowsUnchanged(gateway, baseline);
    expect(result.pass).toBe(false);
    expect(result.existingRowsChanged + result.existingRowsDeleted + result.existingRowsReorderedByUs).toBeGreaterThan(0);
  });

  it("binds header semantics as well as historical data rows", async () => {
    const gateway = seed(new MemorySheetsGateway());
    const baseline = await capturePreCutoverSheetBaseline(gateway);
    gateway.sheets.get(SHEET_NAMES.queue)![0][0] = "changed-header";
    await expect(verifyPreexistingRowsUnchanged(gateway, baseline)).resolves.toMatchObject({ pass: false, headersUnchanged: false });
  });

  it("appends 69 beyond 951 historical rows and reads all69 including row1021; second projection appends0", async () => {
    const gateway = seed(new CountingGateway(), [951, 1000, 1000]);
    gateway.gridRows.set(SHEET_NAMES.queue, 1200);
    const baseline = await capturePreCutoverSheetBaseline(gateway);
    const service = await projection(gateway);
    const result = await service.projectAppendOnly();
    expect(result.diff[SHEET_NAMES.queue]).toMatchObject({ rowsToAppend: 69, rowsToUpdate: 0 });
    expect(gateway.sheets.get(SHEET_NAMES.queue)).toHaveLength(1021);
    expect(gateway.writes).toBe(3);
    await expect(verifyFreshNamespaceRows(gateway, namespace)).resolves.toMatchObject({ queue: 69, reserve: 14, sync: 1, pass: true });
    await expect(verifyPreexistingRowsUnchanged(gateway, baseline)).resolves.toMatchObject({ pass: true });
    await expect(new SheetsQueueRepository(gateway).list(namespace)).resolves.toHaveLength(69);
    const again = await service.planProjectionDiff();
    names.forEach((name) => expect(again[name].rowsToAppend).toBe(0));
    await expect(service.projectAppendOnly()).rejects.toThrow("CUTOVER_WOULD_MUTATE_EXISTING_ROWS");
    expect(gateway.writes).toBe(3);
  });

  it.each([SHEET_NAMES.queue, RESERVE_SHEET_NAME])("detects duplicate %s identity across page1000", async (name) => {
    const gateway = seed(new MemorySheetsGateway(), [970, 990, 1000]);
    const service = await projection(gateway);
    await service.projectAppendOnly();
    const rows = gateway.sheets.get(name)!;
    const targets = rows.map((value, index) => value[headers[name].indexOf("Namespace")] === namespace ? index : -1).filter((index) => index >= 0);
    rows[targets[targets.length - 1]] = structuredClone(rows[targets[0]]);
    await expect(verifyFreshNamespaceRows(gateway, namespace)).resolves.toMatchObject({ pass: false });
    await expect(service.planProjectionDiff()).rejects.toThrow("EXISTING_IDENTITY_DUPLICATE");
  });

  it.each(names)("rejects insufficient %s append capacity before any write", async (name) => {
    const gateway = seed(new CountingGateway(), [951, 1000, 1000]);
    gateway.gridRows.set(name, gateway.sheets.get(name)!.length);
    await expect((await projection(gateway)).projectAppendOnly()).rejects.toThrow("APPEND_CAPACITY_EXCEEDED");
    expect(gateway.writes).toBe(0);
  });

  it("revalidates all three semantic histories before the first write", async () => {
    class ConcurrentEdit extends CountingGateway {
      snapshots = 0;
      override async getUserEnteredPage(sheet: string, range: string) {
        if (sheet === SYNC_SHEET_NAME && range === "A1:L500" && ++this.snapshots === 2) this.sheets.get(sheet)![1005][1] = "concurrent-change";
        return super.getUserEnteredPage(sheet, range);
      }
    }
    const gateway = seed(new ConcurrentEdit());
    await expect((await projection(gateway)).projectAppendOnly()).rejects.toThrow("SHEETS_PROJECTION_PLAN_STALE");
    expect(gateway.writes).toBe(0);
  });

  it("fails closed on malformed semantic cells instead of hashing an incomplete response", async () => {
    class InvalidCell extends MemorySheetsGateway {
      override async getUserEnteredPage(sheet: string, range: string) {
        const page = await super.getUserEnteredPage(sheet, range);
        if (page.startRow === 1001) page.rows = [[{ kind: "unknown" } as unknown as SheetUserEnteredCell]];
        return page;
      }
    }
    await expect(readCompleteSheetUserEntered(seed(new InvalidCell()), SHEET_NAMES.queue)).rejects.toThrow("PAGE_ROWS_INVALID");
    expect(COMPLETE_SHEET_COLUMNS[SHEET_NAMES.queue]).toBe(34);
  });

  it("measures full cutover transport GET count and quota-safe pacing with local-only API responses", async () => {
    const memory = seed(new MemorySheetsGateway(), [951, 112, 10]);
    [1200, 1014, 1001].forEach((count, index) => memory.gridRows.set(names[index], count));
    let now = 0;
    const gets: number[] = []; let writes = 0;
    const client = new NoUploadGoogleSheetsClient({ spreadsheetId: "fixture", serviceAccountEmail: "fixture@example.invalid", privateKey: "fixture-unused", driveVideoFolderId: "", credentialSource: "legacy", keyFileOutsideRepo: true, keyFilePermissionsChecked: true, privateKeyParseReady: true }, {
      getAccessToken: async () => "fixture-token", now: () => now, sleep: async (delay) => { now += delay; },
      fetch: async (input, init) => {
        const url = new URL(String(input));
        const requested = url.searchParams.get("ranges") ?? (url.pathname.includes("/values/") ? decodeURIComponent(url.pathname.split("/values/")[1]) : "");
        const match = /^'((?:[^']|'')+)'!(.+)$/u.exec(requested);
        const sheet = match?.[1].replace(/''/gu, "'") ?? ""; const range = match?.[2] ?? "";
        if (init?.method !== "GET") {
          writes += 1;
          await memory.updateValues(sheet, range, (JSON.parse(String(init?.body)) as { values: SheetRow[] }).values);
          return Response.json({});
        }
        gets.push(now);
        if (!requested) return Response.json(await memory.metadata());
        if (url.pathname.includes("/values/")) {
          const rows = sheet === SHEET_NAMES.commands ? await memory.getValues(sheet) : (await memory.getValuesPage(sheet, range)).rows;
          return Response.json({ range: requested, majorDimension: "ROWS", values: rows });
        }
        const page = await memory.getUserEnteredPage(sheet, range);
        const rowData = page.rows.map((cells) => ({ values: cells.map((cell) => ({ userEnteredValue: cell.kind === "blank" ? {} : {
          [cell.kind === "literal_string" ? "stringValue" : cell.kind === "literal_number" ? "numberValue" : cell.kind === "literal_boolean" ? "boolValue" : "formulaValue"]: cell.value,
        } })) }));
        return Response.json({ sheets: [{ properties: { title: sheet }, data: [{ startRow: page.startRow - 1, startColumn: 0, rowData }] }] });
      },
    });
    const baseline = await capturePreCutoverSheetBaseline(client);
    gets.length = 0;
    const service = await projection(client);
    expect((await verifyPreexistingRowsUnchanged(client, baseline)).pass).toBe(true);
    await service.planProjectionDiff();
    expect((await verifyPreexistingRowsUnchanged(client, baseline)).pass).toBe(true);
    await service.projectAppendOnly();
    expect((await verifyPreexistingRowsUnchanged(client, baseline)).pass).toBe(true);
    expect((await verifyFreshNamespaceRows(client, namespace)).pass).toBe(true);
    expect(gets).toHaveLength(124);
    expect(writes).toBe(3);
    expect(Math.max(...gets.map((start) => gets.filter((time) => time >= start && time < start + 60_000).length))).toBeLessThanOrEqual(55);
    expect(gets[gets.length - 1] - gets[0]).toBe(135_300);
  });
});
