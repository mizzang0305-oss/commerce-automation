import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";

export type QueueVideoRuntimeReadiness = {
  ready: boolean;
  assetRoot: boolean;
  python: boolean;
  pythonVersion: string;
  whisperXRuntime: boolean;
  ttsCommand: boolean;
  asrPython: boolean;
  asrScript: boolean;
  asrModel: boolean;
  ffmpeg: boolean;
  ffprobe: boolean;
  diskSpace: boolean;
  durationMs: number;
  blockers: string[];
  configured: Record<string, boolean>;
  SAFE_TO_UPLOAD: false;
};

type PreflightDependencies = {
  exists(path: string, kind: "file" | "directory"): Promise<boolean>;
  run(command: string, args: string[], timeoutMs: number): Promise<string>;
};

const DEFAULT_DEPS: PreflightDependencies = {
  async exists(path, kind) {
    try { const value = await stat(path); return kind === "file" ? value.isFile() : value.isDirectory(); } catch { return false; }
  },
  run: runProbe
};

export async function inspectQueueVideoRuntime(input: { env?: NodeJS.ProcessEnv; diskSpace?: boolean; deps?: PreflightDependencies } = {}): Promise<QueueVideoRuntimeReadiness> {
  const started = performance.now();
  const env = input.env ?? process.env;
  const deps = input.deps ?? DEFAULT_DEPS;
  const configured = {
    assetRoot: Boolean(env.VIDEO_AUTOMATION_ASSET_ROOT?.trim()), python: Boolean(env.VIDEO_AUTOMATION_PYTHON?.trim()),
    ttsCommand: Boolean(env.VIDEO_AUTOMATION_TTS_COMMAND?.trim()), asrPython: Boolean(env.VIDEO_AUTOMATION_ASR_PYTHON?.trim()),
    asrScript: Boolean(env.VIDEO_AUTOMATION_ASR_SCRIPT?.trim()), asrModel: Boolean(env.VIDEO_AUTOMATION_ASR_MODEL?.trim())
  };
  const assetRootPath = env.VIDEO_AUTOMATION_ASSET_ROOT?.trim() ?? "";
  const pythonPath = env.VIDEO_AUTOMATION_PYTHON?.trim() ?? "";
  const ttsPath = env.VIDEO_AUTOMATION_TTS_COMMAND?.trim() ?? "";
  const asrPythonPath = env.VIDEO_AUTOMATION_ASR_PYTHON?.trim() ?? "";
  const asrScriptPath = env.VIDEO_AUTOMATION_ASR_SCRIPT?.trim() ?? "";
  const asrModelPath = env.VIDEO_AUTOMATION_ASR_MODEL?.trim() ?? "";
  const [assetRoot, pythonFile, ttsCommand, asrPythonFile, asrScript, asrModel] = await Promise.all([
    assetRootPath ? deps.exists(resolve(assetRootPath), "directory") : false,
    pythonPath ? deps.exists(resolve(pythonPath), "file") : false,
    ttsPath ? deps.exists(resolve(ttsPath), "file") : false,
    asrPythonPath ? deps.exists(resolve(asrPythonPath), "file") : false,
    asrScriptPath ? deps.exists(resolve(asrScriptPath), "file") : false,
    asrModelPath ? deps.exists(resolve(asrModelPath), "directory") : false
  ]);
  const pythonProbe = pythonFile ? await safeRun(deps, pythonPath, ["--version"], 30_000) : null;
  const asrProbe = asrPythonFile ? await safeRun(deps, asrPythonPath, ["--version"], 30_000) : null;
  const [whisperProbe, ffmpegProbe, ffprobeProbe] = await Promise.all([
    pythonProbe ? safeRun(deps, pythonPath, ["-c", "import whisperx; print('ready')"], 180_000) : Promise.resolve(null),
    safeRun(deps, "ffmpeg", ["-version"], 30_000),
    safeRun(deps, "ffprobe", ["-version"], 30_000)
  ]);
  const result = {
    ready: false,
    assetRoot, python: Boolean(pythonProbe), pythonVersion: sanitizeVersion(pythonProbe ?? ""), whisperXRuntime: Boolean(whisperProbe),
    ttsCommand, asrPython: Boolean(asrProbe), asrScript, asrModel, ffmpeg: Boolean(ffmpegProbe), ffprobe: Boolean(ffprobeProbe),
    diskSpace: input.diskSpace !== false, durationMs: Math.round(performance.now() - started), blockers: [] as string[], configured,
    SAFE_TO_UPLOAD: false as const
  };
  const checks: Array<[boolean, string]> = [
    [result.assetRoot, "ASSET_ROOT_NOT_READY"], [result.python, "PYTHON_NOT_READY"], [result.whisperXRuntime, "WHISPERX_RUNTIME_NOT_READY"],
    [result.ttsCommand, "TTS_COMMAND_NOT_READY"], [result.asrPython, "ASR_PYTHON_NOT_READY"], [result.asrScript, "ASR_SCRIPT_NOT_READY"],
    [result.asrModel, "ASR_MODEL_NOT_READY"], [result.ffmpeg, "FFMPEG_NOT_READY"], [result.ffprobe, "FFPROBE_NOT_READY"], [result.diskSpace, "DISK_SPACE_GUARD_BLOCKED"]
  ];
  result.blockers = checks.filter(([passed]) => !passed).map(([, code]) => code);
  result.ready = result.blockers.length === 0;
  return result;
}

async function safeRun(deps: PreflightDependencies, command: string, args: string[], timeoutMs: number): Promise<string | null> {
  try { return await deps.run(command, args, timeoutMs); } catch { return null; }
}

function runProbe(command: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), env: { ...process.env, PYTHONIOENCODING: "utf-8" }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let output = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("RUNTIME_PROBE_TIMEOUT")); }, timeoutMs);
    const collect = (chunk: Buffer) => { if (output.length < 512) output += chunk.toString("utf8"); };
    child.stdout.on("data", collect); child.stderr.on("data", collect);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code) => { clearTimeout(timer); if (code === 0) resolvePromise(output.trim()); else reject(new Error("RUNTIME_PROBE_FAILED")); });
  });
}

function sanitizeVersion(value: string): string {
  const match = value.match(/Python\s+\d+(?:\.\d+){1,2}/u);
  return match?.[0] ?? (value ? "configured" : "");
}
