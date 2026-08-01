import "server-only";

import { GoogleSheetsClient, googleDriveConfigured, googleSheetsConfigured, type SheetsGateway } from "./googleSheetsClient";
import { SheetsCommandRepository } from "./sheetsCommandRepository";
import { SheetsLogRepository } from "./sheetsLogRepository";
import { SheetsQueueRepository } from "./sheetsQueueRepository";
import { SheetsSettingsRepository } from "./sheetsSettingsRepository";
import { toKstDate } from "./sheetSchemas";
import { MockCommerceControlGateway } from "./mockCommerceControlGateway";

export class CommerceControlRepository {
  readonly queue: SheetsQueueRepository;
  readonly commands: SheetsCommandRepository;
  readonly logs: SheetsLogRepository;
  readonly settings: SheetsSettingsRepository;

  constructor(gateway: SheetsGateway) {
    this.queue = new SheetsQueueRepository(gateway);
    this.commands = new SheetsCommandRepository(gateway);
    this.logs = new SheetsLogRepository(gateway);
    this.settings = new SheetsSettingsRepository(gateway);
  }

  async dashboard() {
    const [items, commands, logs] = await Promise.all([this.queue.list(), this.commands.list(), this.logs.list()]);
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
    };
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
