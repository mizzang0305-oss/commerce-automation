export type MoneyPrinterTurboGenerateInput = {
  subject: string;
  script?: string;
  terms?: string[];
  language?: string;
  aspect?: "9:16" | "16:9" | "1:1";
  videoSource?: string;
  matchMaterialsToScript?: boolean;
};

export type MoneyPrinterTurboTask = {
  taskId: string;
  state: number;
  progress: number;
  videos: string[];
  combinedVideos: string[];
  failedStage: string;
  error: string;
};

export type MoneyPrinterTurboClientConfig = {
  baseUrl: string;
  apiKey?: string;
};

type HttpResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

type HttpRequest = (url: string, init?: RequestInit) => Promise<HttpResponse>;

export class MoneyPrinterTurboClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly request: HttpRequest;

  constructor(config: MoneyPrinterTurboClientConfig, request: HttpRequest = fetch) {
    const baseUrl = config.baseUrl.trim().replace(/\/+$/u, "");
    if (!/^https?:\/\//u.test(baseUrl)) {
      throw new Error("MPT_BASE_URL_INVALID");
    }
    this.baseUrl = baseUrl;
    this.apiKey = config.apiKey?.trim() ?? "";
    this.request = request;
  }

  async createVideo(input: MoneyPrinterTurboGenerateInput): Promise<string> {
    const subject = input.subject.trim();
    if (!subject) throw new Error("MPT_SUBJECT_REQUIRED");

    const response = await this.request(`${this.baseUrl}/api/v1/videos`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({
        video_subject: subject,
        video_script: input.script?.trim() ?? "",
        video_terms: input.terms?.length ? input.terms : null,
        video_aspect: input.aspect ?? "9:16",
        video_count: 1,
        video_source: input.videoSource ?? "pexels",
        video_language: input.language ?? "ko",
        subtitle_enabled: true,
        match_materials_to_script: input.matchMaterialsToScript ?? true
      })
    });

    const json = await readJson(response);
    if (!response.ok) throw new Error(`MPT_CREATE_HTTP_${response.status}`);
    const taskId = readString(readRecord(readRecord(json).data).task_id);
    if (!taskId) throw new Error("MPT_CREATE_RESPONSE_INVALID");
    return taskId;
  }

  async getTask(taskId: string): Promise<MoneyPrinterTurboTask> {
    const id = taskId.trim();
    if (!id) throw new Error("MPT_TASK_ID_REQUIRED");
    const response = await this.request(
      `${this.baseUrl}/api/v1/tasks/${encodeURIComponent(id)}`,
      { method: "GET", headers: this.headers(false) }
    );
    const json = await readJson(response);
    if (!response.ok) throw new Error(`MPT_TASK_HTTP_${response.status}`);
    const data = readRecord(readRecord(json).data);
    return {
      taskId: readString(data.task_id) || id,
      state: readNumber(data.state),
      progress: readNumber(data.progress),
      videos: readStringArray(data.videos),
      combinedVideos: readStringArray(data.combined_videos),
      failedStage: readString(data.failed_stage),
      error: readString(data.error)
    };
  }

  async waitForVideo(taskId: string, options: { pollMs?: number; maxWaitMs?: number } = {}): Promise<MoneyPrinterTurboTask> {
    const pollMs = options.pollMs ?? 2_000;
    const maxWaitMs = options.maxWaitMs ?? 10 * 60_000;
    const startedAt = Date.now();

    while (Date.now() - startedAt <= maxWaitMs) {
      const task = await this.getTask(taskId);
      if (task.videos.length > 0 || task.combinedVideos.length > 0) return task;
      if (task.state < 0 || task.error) {
        throw new Error(task.failedStage ? `MPT_TASK_FAILED_${safeCode(task.failedStage)}` : "MPT_TASK_FAILED");
      }
      await sleep(pollMs);
    }
    throw new Error("MPT_TASK_TIMEOUT");
  }

  private headers(hasJsonBody: boolean): Record<string, string> {
    const headers: Record<string, string> = {};
    if (hasJsonBody) headers["content-type"] = "application/json";
    if (this.apiKey) headers["x-api-key"] = this.apiKey;
    return headers;
  }
}

async function readJson(response: HttpResponse): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error("MPT_RESPONSE_NOT_JSON");
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function safeCode(value: string): string {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9_:-]+/gu, "_");
  return normalized || "UNKNOWN";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
