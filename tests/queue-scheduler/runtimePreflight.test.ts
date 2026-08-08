import { describe, expect, it, vi } from "vitest";
import { inspectQueueVideoRuntime } from "../../src/lib/queue-scheduler";

const env = { VIDEO_AUTOMATION_ASSET_ROOT: "asset", VIDEO_AUTOMATION_PYTHON: "python", VIDEO_AUTOMATION_TTS_COMMAND: "tts", VIDEO_AUTOMATION_ASR_PYTHON: "asr-python", VIDEO_AUTOMATION_ASR_SCRIPT: "asr-script", VIDEO_AUTOMATION_ASR_MODEL: "asr-model" };

describe("queue runtime preflight", () => {
  it("requires real paths and executable probes without exposing configured values", async () => {
    const result = await inspectQueueVideoRuntime({ env, deps: { exists: vi.fn(async () => true), run: vi.fn(async (command, args) => command === "python" && args[0] === "--version" ? "Python 3.10.11" : "ready") } });
    expect(result.ready).toBe(true); expect(result.pythonVersion).toBe("Python 3.10.11"); expect(JSON.stringify(result)).not.toContain("asr-model"); expect(result.SAFE_TO_UPLOAD).toBe(false);
  });
  it("fails closed when a configured executable is absent", async () => {
    const result = await inspectQueueVideoRuntime({ env, deps: { exists: vi.fn(async (path) => !path.endsWith("tts")), run: vi.fn(async () => "ready") } });
    expect(result.ready).toBe(false); expect(result.blockers).toContain("TTS_COMMAND_NOT_READY");
  });
});
