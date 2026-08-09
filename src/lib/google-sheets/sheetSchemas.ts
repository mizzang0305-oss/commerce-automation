export const KST_TIME_ZONE = "Asia/Seoul";

export const SHEET_NAMES = {
  dashboard: "대시보드",
  queue: "상품큐",
  settings: "설정",
  guide: "사용법",
  commands: "명령큐",
  logs: "실행로그"
} as const;

export const QUEUE_HEADERS = [
  "Queue ID", "등록일", "시간대", "진행상태", "상품명", "카테고리", "가격", "쿠팡 원본 URL",
  "쿠팡 제휴 URL", "이미지/실사용 장면", "영상 파일/URL", "음성상태", "ASR 점수", "실사용 장면 확인",
  "사람검토", "품질판정", "업로드상태", "YouTube URL", "오류/메모", "최종수정"
] as const;

export const COMMAND_HEADERS = [
  "명령 ID", "Queue ID", "명령", "요청값", "요청자", "요청시각", "상태", "실행결과", "오류/메모",
  "완료시각", "재시도 횟수", "웹 요청 키", "Expected Revision", "Local Revision", "Namespace"
] as const;

export const LOG_HEADERS = [
  "로그 ID", "명령 ID", "Queue ID", "명령", "상태", "안전 메시지", "변경 전", "변경 후", "시작시각",
  "종료시각", "외부호출", "세부결과"
] as const;

export const ALLOWED_COMMANDS = [
  "오늘상품찾기", "영상재생성", "음성재생성", "전체재시도", "보류", "제외", "검토PASS", "검토FAIL",
  "메타데이터수정", "수동업로드완료", "명령취소",
  "PAUSE_AUTOMATION", "RESUME_AUTOMATION", "RUN_NIGHTLY_SCOUT", "RUN_NEXT_BATCH", "RETRY_SLOT",
  "HOLD_SLOT", "SKIP_SLOT", "RELEASE_HOLD", "REPLACE_FROM_RESERVE", "CANCEL_COMMAND", "REFRESH_PROJECTION"
] as const;

export const QUEUE_CONTROL_COMMANDS = [
  "PAUSE_AUTOMATION", "RESUME_AUTOMATION", "RUN_NIGHTLY_SCOUT", "RUN_NEXT_BATCH", "RETRY_SLOT",
  "HOLD_SLOT", "SKIP_SLOT", "RELEASE_HOLD", "REPLACE_FROM_RESERVE", "CANCEL_COMMAND", "REFRESH_PROJECTION"
] as const;

export const COMMAND_STATUSES = ["대기", "처리중", "완료", "실패", "사람확인필요", "취소", "pending", "claimed", "completed", "failed", "cancelled", "stale_rejected"] as const;

export type AllowedCommand = (typeof ALLOWED_COMMANDS)[number];
export type CommandStatus = (typeof COMMAND_STATUSES)[number];
export type QueueControlCommand = (typeof QUEUE_CONTROL_COMMANDS)[number];
export type SheetRow = Array<string | number | boolean | null | undefined>;

export type SheetQueueItem = {
  queueId: string;
  registeredDate: string;
  slot: string;
  progressStatus: string;
  productName: string;
  category: string;
  price: string;
  rawCoupangUrl: string;
  affiliateUrl: string;
  imageOrUsageScene: string;
  videoUrl: string;
  voiceStatus: string;
  asrScore: number | null;
  usageSceneConfirmed: string;
  humanReview: string;
  qualityDecision: string;
  uploadStatus: string;
  youtubeUrl: string;
  errorMemo: string;
  lastModified: string;
  slotId?: string;
  localRevision?: number | null;
  queueDate?: string;
  queueRank?: number | null;
  projectionSource?: string;
  projectionRevision?: number | null;
  artifactReferenceId?: string;
  safeMediaMetadata?: string;
  namespace?: string;
};

export type QueuePatch = Partial<Pick<SheetQueueItem,
  "productName" | "category" | "price" | "affiliateUrl" | "errorMemo" | "progressStatus" | "humanReview" |
  "videoUrl" | "voiceStatus" | "asrScore" | "usageSceneConfirmed" | "qualityDecision" | "uploadStatus" | "youtubeUrl"
>>;

export type SheetCommand = {
  commandId: string;
  queueId: string;
  command: AllowedCommand;
  requestValue: string;
  requester: string;
  requestedAt: string;
  status: CommandStatus;
  result: string;
  errorMemo: string;
  completedAt: string;
  retryCount: number;
  webRequestKey: string;
  expectedRevision: number | null;
  localRevision: number | null;
  namespace: string;
};

export type SheetExecutionLog = {
  logId: string;
  commandId: string;
  queueId: string;
  command: string;
  status: string;
  safeMessage: string;
  before: string;
  after: string;
  startedAt: string;
  completedAt: string;
  externalCall: string;
  details: string;
};

export type SheetSetting = { name: string; value: string; description: string };

export class SheetsControlError extends Error {
  constructor(
    public readonly code: "GOOGLE_SHEETS_NOT_CONFIGURED" | "GOOGLE_SHEETS_READ_FAILED" |
      "GOOGLE_SHEETS_WRITE_FAILED" | "GOOGLE_SHEETS_ROW_NOT_FOUND" | "GOOGLE_SHEETS_SCHEMA_MISMATCH" |
      "ROW_CHANGED_RELOAD_REQUIRED" | "COMMAND_NOT_ALLOWED" | "COMMAND_STATE_CONFLICT" | "UNSAFE_SETTING_FORBIDDEN" |
      "SHEETS_PROJECTION_READ_ONLY" | "STALE_CONTROL_COMMAND" | "GOOGLE_SHEETS_SPREADSHEET_ID_MISSING" |
      "GOOGLE_SERVICE_ACCOUNT_KEY_FILE_MISSING" | "GOOGLE_SERVICE_ACCOUNT_KEY_FILE_INVALID" |
      "GOOGLE_SERVICE_ACCOUNT_EMAIL_MISSING" | "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_MISSING" |
      "GOOGLE_SERVICE_ACCOUNT_CONFIGURATION_CONFLICT",
    message: string,
    public readonly status = 500
  ) {
    super(message);
    this.name = "SheetsControlError";
  }
}

export function assertHeaders(actual: SheetRow, expected: readonly string[], sheetName: string) {
  const normalized = actual.map(stringValue);
  const missing = expected.filter((header) => !normalized.includes(header));
  if (missing.length > 0) {
    throw new SheetsControlError(
      "GOOGLE_SHEETS_SCHEMA_MISMATCH",
      `${sheetName} 시트 필수 열이 누락되었습니다: ${missing.join(", ")}`,
      503
    );
  }
  return new Map(normalized.map((header, index) => [header, index]));
}

export function stringValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function numberValue(value: unknown) {
  const parsed = Number(stringValue(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function rowValue(row: SheetRow, columns: Map<string, number>, header: string) {
  const index = columns.get(header);
  return index === undefined ? "" : stringValue(row[index]);
}

export function isExampleQueueId(queueId: string) {
  return queueId.startsWith("예시-") || queueId.startsWith("EXAMPLE_");
}

export function isAllowedCommand(value: string): value is AllowedCommand {
  return (ALLOWED_COMMANDS as readonly string[]).includes(value);
}

export function isQueueControlCommand(value: string): value is QueueControlCommand {
  return (QUEUE_CONTROL_COMMANDS as readonly string[]).includes(value);
}

export function isCommandStatus(value: string): value is CommandStatus {
  return (COMMAND_STATUSES as readonly string[]).includes(value);
}

export function toKstTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute}:${value.second}`;
}

export function toKstDate(date = new Date()) {
  return toKstTimestamp(date).slice(0, 10);
}

export function safeJson(value: unknown) {
  return JSON.stringify(value, (key, entry) => {
    if (/private.?key|password|secret|token|service.?account|client.?email|key.?file|credential.?path/i.test(key)) return "[REDACTED]";
    if (/url$/i.test(key) && typeof entry === "string" && entry) return "[REDACTED_URL]";
    if (typeof entry !== "string") return entry;
    return entry
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
      .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, "[REDACTED_PRIVATE_KEY]")
      .replace(/https?:\/\/[^\s"']+/g, "[REDACTED_URL]");
  });
}

export function safeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function driveVideoLinks(value: string) {
  const trimmed = value.trim();
  const directId = /^[A-Za-z0-9_-]{10,}$/.test(trimmed) ? trimmed : "";
  let fileId = directId;
  if (!fileId) {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== "https:" || !["drive.google.com", "docs.google.com"].includes(url.hostname)) return null;
      fileId = /\/d\/([A-Za-z0-9_-]{10,})/.exec(url.pathname)?.[1] ?? url.searchParams.get("id") ?? "";
    } catch {
      return null;
    }
  }
  if (!/^[A-Za-z0-9_-]{10,}$/.test(fileId)) return null;
  const encoded = encodeURIComponent(fileId);
  return {
    previewUrl: `https://drive.google.com/file/d/${encoded}/preview`,
    openUrl: `https://drive.google.com/file/d/${encoded}/view`,
    downloadUrl: `https://drive.google.com/uc?export=download&id=${encoded}`
  };
}
