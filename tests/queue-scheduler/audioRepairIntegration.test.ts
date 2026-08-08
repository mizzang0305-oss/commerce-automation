import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("deterministic audio pause repair", () => {
  it("compresses 850ms and 950ms internal silence while preserving speech bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "audio-repair-")); roots.push(root);
    const source = join(root, "source.wav"); const target = join(root, "repaired.wav");
    const speech = pcmTone(400); const silence850 = Buffer.alloc(16_000 * 2 * 850 / 1000); const silence950 = Buffer.alloc(16_000 * 2 * 950 / 1000);
    await writeFile(source, wave(Buffer.concat([speech, silence850, speech, silence950, speech])));
    const result = await runPython({ source_path: source, output_path: target, threshold_ms: 700, target_ms: 500, minimum_ms: 300 });
    expect(result.audioRepairApplied).toBe(true); expect((result.before as { longestSilenceMs: number }).longestSilenceMs).toBeGreaterThanOrEqual(900); expect((result.after as { longestSilenceMs: number }).longestSilenceMs).toBeLessThanOrEqual(550);
    const repaired = await readFile(target); expect(repaired.subarray(44, 44 + speech.length).equals(speech)).toBe(true); expect(repaired.length).toBeLessThan((await readFile(source)).length);
  });
});

function pcmTone(ms: number) { const samples = 16_000 * ms / 1000; const value = Buffer.alloc(samples * 2); for (let index = 0; index < samples; index += 1) value.writeInt16LE(Math.round(Math.sin(index / 8) * 8_000), index * 2); return value; }
function wave(pcm: Buffer) { const value = Buffer.alloc(44 + pcm.length); value.write("RIFF", 0); value.writeUInt32LE(36 + pcm.length, 4); value.write("WAVEfmt ", 8); value.writeUInt32LE(16, 16); value.writeUInt16LE(1, 20); value.writeUInt16LE(1, 22); value.writeUInt32LE(16_000, 24); value.writeUInt32LE(32_000, 28); value.writeUInt16LE(2, 32); value.writeUInt16LE(16, 34); value.write("data", 36); value.writeUInt32LE(pcm.length, 40); pcm.copy(value, 44); return value; }
function runPython(payload: object): Promise<Record<string, unknown>> { return new Promise((resolvePromise, reject) => { const child = spawn("python", [resolve("tools/video-automation/audio_pause_repair.py")], { stdio: ["pipe", "pipe", "pipe"] }); let stdout = ""; child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); }); child.once("error", reject); child.once("close", (code) => { if (code === 0) resolvePromise(JSON.parse(stdout)); else reject(new Error("AUDIO_REPAIR_TEST_FAILED")); }); child.stdin.end(JSON.stringify(payload)); }); }
