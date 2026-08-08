import { PassThrough } from "node:stream";
import { describe, expect, test, vi } from "vitest";
import { PersistentWhisperXProvider } from "@/lib/video-automation/whisperxPersistentProvider";

describe("persistent WhisperX provider", () => {
  test("starts one process and reuses it for three requests", async () => {
    const stdin = new PassThrough(); const stdout = new PassThrough(); const stderr = new PassThrough();
    const child = Object.assign(new PassThrough(), { stdin, stdout, stderr, kill: vi.fn(), once: PassThrough.prototype.once.bind(new PassThrough()) });
    const spawnProcess = vi.fn(() => child as never);
    stdin.on("data", (chunk) => { const request = JSON.parse(chunk.toString()); stdout.write(`${JSON.stringify({ id: request.id, status: "success", words: [{ word: "정리", start: 0, end: 0.2, confidence: 0.9 }], aligned_ratio: 1 })}\n`); });
    const provider = new PersistentWhisperXProvider(spawnProcess, 1_000);
    const started = provider.start(); stdout.write(`${JSON.stringify({ event: "ready", load_seconds: 1.2 })}\n`); await started;
    await Promise.all([provider.align("a.wav"), provider.align("b.wav"), provider.align("c.wav")]);
    expect(spawnProcess).toHaveBeenCalledTimes(1); expect(provider.requestCount).toBe(3);
    await provider.close();
  });
});
