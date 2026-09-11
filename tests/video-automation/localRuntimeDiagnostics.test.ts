import { describe, expect, test } from "vitest";
import { LocalJsonProcessError, runJsonProcess } from "../../src/lib/video-automation/localRuntime";

describe("local media process diagnostics", () => {
  test("retains sanitized structured diagnostics from a failed local bridge", async () => {
    const diagnostic = {
      schemaVersion: "local-media-failure-diagnostic-v1",
      failurePhase: "SPAWN_FFMPEG",
      errno: 2,
      winerror: 2,
      missingObject: {
        kind: "executable",
        primary: {
          basename: "ffmpeg.exe",
          allowedRootClassification: "RUNTIME_EXECUTABLE",
          relativePath: "ffmpeg.exe",
          pathStringSha256: "a".repeat(64),
        },
      },
      rawAbsolutePathsStored: false,
    };
    const script = `process.stdin.resume();process.stdin.on("end",()=>{process.stdout.write(${JSON.stringify(JSON.stringify({ status: "failed", safe_error: "LOCAL_MEDIA_BRIDGE_FAILED", error_type: "FileNotFoundError", diagnostic }))});process.exitCode=2;});`;

    let failure: unknown;
    try {
      await runJsonProcess(process.execPath, ["-e", script], {}, 10_000);
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(LocalJsonProcessError);
    expect((failure as LocalJsonProcessError).message).toBe("LOCAL_MEDIA_BRIDGE_FAILED:FILENOTFOUNDERROR");
    expect((failure as LocalJsonProcessError).diagnostic).toEqual(diagnostic);
  });

  test("does not invent diagnostics for a legacy failed child", async () => {
    const script = `process.stdin.resume();process.stdin.on("end",()=>{process.stdout.write(${JSON.stringify(JSON.stringify({ status: "failed", safe_error: "LOCAL_MEDIA_BRIDGE_FAILED", error_type: "FileNotFoundError" }))});process.exitCode=2;});`;
    await expect(runJsonProcess(process.execPath, ["-e", script], {}, 10_000)).rejects.toMatchObject({
      message: "LOCAL_MEDIA_BRIDGE_FAILED:FILENOTFOUNDERROR",
      diagnostic: null,
    });
  });

  test("redacts absolute paths even if a failed child emits an unsafe diagnostic field", async () => {
    const payload = {
      status: "failed",
      safe_error: "LOCAL_MEDIA_BRIDGE_FAILED",
      error_type: "FileNotFoundError",
      diagnostic: { failurePhase: "SPAWN_FFMPEG", rawPath: "D:\\private\\ffmpeg.exe", nested: { value: "C:\\secret\\input.jpg" } },
    };
    const script = `process.stdin.resume();process.stdin.on("end",()=>{process.stdout.write(${JSON.stringify(JSON.stringify(payload))});process.exitCode=2;});`;
    let failure: LocalJsonProcessError | null = null;
    try {
      await runJsonProcess(process.execPath, ["-e", script], {}, 10_000);
    } catch (error) {
      failure = error as LocalJsonProcessError;
    }
    expect(failure?.diagnostic).toEqual({
      failurePhase: "SPAWN_FFMPEG",
      redactedField: "REDACTED_PATH_FIELD",
      nested: { value: "REDACTED_ABSOLUTE_PATH" },
    });
  });
});
