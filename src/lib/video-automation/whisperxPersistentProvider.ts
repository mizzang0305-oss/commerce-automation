import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface } from "node:readline";

export type WhisperXResponse = {
  id: string;
  status: "success" | "failed";
  words?: Array<{ word: string; start: number; end: number; confidence: number | null }>;
  safe_error?: string;
  processing_seconds?: number;
  aligned_ratio?: number;
};

type SpawnProcess = () => ChildProcessWithoutNullStreams;

export class PersistentWhisperXProvider {
  private child: ChildProcessWithoutNullStreams | null = null;
  private lines: Interface | null = null;
  private pending = new Map<string, { resolve(value: WhisperXResponse): void; reject(error: Error): void; timer: NodeJS.Timeout }>();
  private readyPromise: Promise<number> | null = null;
  private requestCountValue = 0;

  constructor(private readonly spawnProcess: SpawnProcess, private readonly timeoutMs = 180_000) {}

  get requestCount(): number { return this.requestCountValue; }

  async start(): Promise<number> {
    if (this.readyPromise) return this.readyPromise;
    this.child = this.spawnProcess();
    this.lines = createInterface({ input: this.child.stdout });
    this.readyPromise = new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WHISPERX_START_TIMEOUT")), this.timeoutMs);
      const onLine = (line: string) => {
        const message = parseResponse(line);
        if (message && "event" in message && message.event === "ready") {
          clearTimeout(timer);
          this.lines?.off("line", onLine);
          this.lines?.on("line", (value) => this.handleLine(value));
          resolve(typeof message.load_seconds === "number" ? message.load_seconds : 0);
        }
      };
      this.lines?.on("line", onLine);
      this.child?.once("exit", () => { clearTimeout(timer); reject(new Error("WHISPERX_PROCESS_EXITED")); });
    });
    return this.readyPromise;
  }

  async align(audioPath: string): Promise<WhisperXResponse> {
    await this.start();
    if (!this.child || !this.child.stdin.writable) throw new Error("WHISPERX_PROCESS_UNAVAILABLE");
    const id = `align-${String(++this.requestCountValue).padStart(3, "0")}`;
    return new Promise<WhisperXResponse>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("WHISPERX_REQUEST_TIMEOUT")); }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child?.stdin.write(`${JSON.stringify({ id, audio_path: audioPath, language: "ko", model: "tiny", device: "cpu", compute_type: "int8" })}\n`);
    });
  }

  async close(): Promise<void> {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error("WHISPERX_PROCESS_CLOSED")); }
    this.pending.clear();
    this.lines?.close();
    this.child?.kill();
    this.child = null;
  }

  private handleLine(line: string): void {
    const message = parseResponse(line);
    if (!message || !("id" in message) || typeof message.id !== "string") return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    const response = message as WhisperXResponse;
    if (response.status === "failed") pending.reject(new Error(response.safe_error || "WHISPERX_ALIGNMENT_FAILED"));
    else pending.resolve(response);
  }
}

export function createLocalWhisperXProcess(pythonExe: string, servicePath: string, env: NodeJS.ProcessEnv = process.env): ChildProcessWithoutNullStreams {
  if (!pythonExe.trim() || !servicePath.trim()) throw new Error("WHISPERX_LOCAL_RUNTIME_NOT_CONFIGURED");
  return spawn(pythonExe, [servicePath], { cwd: process.cwd(), env: { ...env, PYTHONIOENCODING: "utf-8" }, stdio: ["pipe", "pipe", "pipe" ] });
}

function parseResponse(line: string): Record<string, unknown> | null {
  try { const value = JSON.parse(line) as unknown; return value && typeof value === "object" ? value as Record<string, unknown> : null; } catch { return null; }
}
