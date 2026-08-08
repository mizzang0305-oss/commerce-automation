import "server-only";

import { GoogleSheetsClient, googleDriveConfigured, googleSheetsConfigured, type SheetsGateway } from "./googleSheetsClient";
import { SheetsCommandRepository } from "./sheetsCommandRepository";
import { SheetsLogRepository } from "./sheetsLogRepository";
import { SheetsQueueRepository } from "./sheetsQueueRepository";
import { SheetsSettingsRepository } from "./sheetsSettingsRepository";
import { assertHeaders, rowValue, toKstDate } from "./sheetSchemas";
import { MockCommerceControlGateway } from "./mockCommerceControlGateway";
import { RESERVE_HEADERS, RESERVE_SHEET_NAME, SYNC_SHEET_NAME } from "@/lib/queue-control-integration/contracts";

export class CommerceControlRepository {
  readonly queue: SheetsQueueRepository;
  readonly commands: SheetsCommandRepository;
  readonly logs: SheetsLogRepository;
  readonly settings: SheetsSettingsRepository;

  constructor(private readonly gateway: SheetsGateway) {
    this.queue = new SheetsQueueRepository(gateway);
    this.commands = new SheetsCommandRepository(gateway);
    this.logs = new SheetsLogRepository(gateway);
    this.settings = new SheetsSettingsRepository(gateway);
  }

  async dashboard() {
    const [items, commands, logs, integration] = await Promise.all([this.queue.list(), this.commands.list(), this.logs.list(), this.integrationDashboard()]);
    const today = toKstDate();
    return {
      counts: {
        today: items.filter((item) => item.registeredDate === today).length,
        generating: items.filter((item) => item.progressStatus === "영상생성중").length,
        reviewPending: items.filter((item) => item.progressStatus === "검토대기").length,
        needsFix: items.filter((item) => ["수정필요", "실패"].includes(item.progressStatus)).length,
        uploadReady: items.filter((item) => item.qualityDecision === "업로드가능").length,
        manualUploaded: items.filter((item) => item.uploadStatus === "완료").length
      },
      recentErrors: logs.filter((log) => log.status === "실패").slice(-5).reverse(),
      recentCommands: commands.slice(-8).reverse(),
      workerLastSeenAt: logs.length > 0 ? logs[logs.length - 1].completedAt || "확인 기록 없음" : "확인 기록 없음"
      , daily69: integration
    };
  }

  async queueControlReserve() {
    const rows = await this.gateway.getValues(RESERVE_SHEET_NAME, "A1:L1000");
    const columns = assertHeaders(rows[0] ?? [], RESERVE_HEADERS, RESERVE_SHEET_NAME);
    return rows.slice(1).filter((row) => rowValue(row, columns, "Product Key Hash")).map((row) => ({
      queueDate: rowValue(row, columns, "Queue Date"), rank: Number(rowValue(row, columns, "Reserve Rank") || 0),
      productName: rowValue(row, columns, "Product Name"), useCase: rowValue(row, columns, "Use Case"), category: rowValue(row, columns, "Category"),
      score: Number(rowValue(row, columns, "Score") || 0), productKeyHash: rowValue(row, columns, "Product Key Hash"),
      claimedSlot: rowValue(row, columns, "Claimed Slot"), insertedAt: rowValue(row, columns, "Inserted At"), namespace: rowValue(row, columns, "Namespace")
    }));
  }

  private async integrationDashboard() {
    try {
      const [reserveRows, syncRows] = await Promise.all([this.gateway.getValues(RESERVE_SHEET_NAME, "A1:L1000"), this.gateway.getValues(SYNC_SHEET_NAME, "A1:L100")]);
      const sync = syncRows.length > 1 ? syncRows[syncRows.length - 1] : [];
      const namespace = String(sync?.[0] ?? "");
      const projected = (await this.queue.list()).filter((item) => item.projectionSource === "local_queue_scheduler" && (!namespace || item.namespace === namespace));
      const statusCount = (status: string) => projected.filter((item) => item.progressStatus === status).length;
      return {
        namespace, activeCount: projected.length, reserveCount: reserveRows.slice(1).filter((row) => !namespace || String(row[11] ?? "") === namespace).length,
        scheduled: statusCount("scheduled"), processing: statusCount("claimed") + statusCount("processing"), ready: statusCount("video_ready_autoqa"),
        failed: statusCount("failed") + statusCount("blocked"), hold: statusCount("hold"), skipped: statusCount("skipped"),
        localRevision: Number(sync?.[2] ?? 0), projectionRevision: Number(sync?.[3] ?? 0), snapshotHash: String(sync?.[4] ?? ""), projectedAt: String(sync?.[5] ?? ""),
        paused: String(sync?.[8] ?? "").toLowerCase() === "true", enabled: String(sync?.[9] ?? "").toLowerCase() === "true", uploadEnabled: false
      };
    } catch {
      return { namespace: "", activeCount: 0, reserveCount: 0, scheduled: 0, processing: 0, ready: 0, failed: 0, hold: 0, skipped: 0, localRevision: 0, projectionRevision: 0, snapshotHash: "", projectedAt: "", paused: true, enabled: false, uploadEnabled: false };
    }
  }
}

let singleton: CommerceControlRepository | null = null;

export function getCommerceControlRepository() {
  if (!singleton) {
    const mockRequested = process.env.COMMERCE_CONTROL_MOCK_MODE === "true";
    if (mockRequested && process.env.NODE_ENV === "production") throw new Error("COMMERCE_CONTROL_MOCK_MODE_FORBIDDEN_IN_PRODUCTION");
    singleton = new CommerceControlRepository(mockRequested ? new MockCommerceControlGateway(process.env.COMMERCE_CONTROL_MOCK_SEED_COMMAND) : new GoogleSheetsClient());
  }
  return singleton;
}

export function createCommerceControlRepository(gateway: SheetsGateway) {
  return new CommerceControlRepository(gateway);
}

export function resetCommerceControlRepositoryForTests() {
  singleton = null;
}

export function setCommerceControlRepositoryForTests(repository: CommerceControlRepository) {
  singleton = repository;
}

export function commerceControlHealth() {
  return {
    ok: googleSheetsConfigured(),
    googleSheetsConfigured: googleSheetsConfigured(),
    googleDriveConfigured: googleDriveConfigured(),
    mockMode: process.env.NODE_ENV !== "production" && process.env.COMMERCE_CONTROL_MOCK_MODE === "true",
    spreadsheetIdConfigured: Boolean(process.env.GOOGLE_SHEETS_SPREADSHEET_ID),
    runnerIdConfigured: Boolean(process.env.COMMAND_RUNNER_ID),
    safeToUpload: false,
    safeToPublicUpload: false,
    youtubeAutoUpload: false,
    publicUpload: false,
    unlistedUpload: false,
    commentAutomation: false,
    supabaseRequired: false,
    dockerRequired: false,
    svmRequired: false
  };
}
