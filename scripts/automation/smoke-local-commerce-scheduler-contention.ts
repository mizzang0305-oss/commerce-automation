import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import {
  LocalCommerceSchedulerStore,
  runLocalCommerceSchedule
} from "../../src/lib/orchestration/localCommerceScheduler";

const args = new Map(process.argv.slice(2).map((value) => {
  const [key, ...rest] = value.split("=");
  return [key.replace(/^--/, ""), rest.join("=")];
}));

async function main() {
  const worker = args.get("worker");
  if (worker === "holder" || worker === "contender") {
    await runWorker(worker, requireArg("data-dir"), requireArg("ready-file"), requireArg("release-file"));
  } else {
    await runParent();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "UNKNOWN_SMOKE_ERROR");
  process.exitCode = 1;
});

async function runParent() {
  const smokeDir = await mkdtemp(join(tmpdir(), "commerce-scheduler-contention-"));
  const readyFile = join(smokeDir, "holder.ready");
  const releaseFile = join(smokeDir, "holder.release");
  try {
    const holder = spawnWorker("holder", smokeDir, readyFile, releaseFile);
    await waitForFile(readyFile, 10_000);
    const contender = await spawnWorker("contender", smokeDir, readyFile, releaseFile).result;
    await writeFile(releaseFile, "release", "utf8");
    const holderResult = await holder.result;

    const statusLines = await readJsonlCount(join(smokeDir, "scheduler-status.jsonl"));
    const queueLines = await readJsonlCount(join(smokeDir, "draft-queue.jsonl"));
    const lockResidue = await fileExists(join(smokeDir, "scheduler.lock"));
    const passed = holderResult.exitCode === 0
      && contender.exitCode === 23
      && contender.stdout.includes("LOCAL_SCHEDULER_ALREADY_RUNNING")
      && statusLines === 3
      && queueLines === 1
      && !lockResidue;

    console.log(JSON.stringify({
      result: passed ? "PASS" : "FAIL",
      separate_os_processes: 2,
      holder_exit_code: holderResult.exitCode,
      contender_exit_code: contender.exitCode,
      contender_blocked: contender.stdout.includes("LOCAL_SCHEDULER_ALREADY_RUNNING"),
      status_lines: statusLines,
      draft_queue_lines: queueLines,
      lock_residue: lockResidue,
      external_call_attempted: false,
      publish_attempted: false,
      SAFE_TO_UPLOAD: false,
      SAFE_TO_PUBLIC_UPLOAD: false
    }, null, 2));
    if (!passed) {
      process.exitCode = 1;
    }
  } finally {
    await rm(smokeDir, { recursive: true, force: true });
  }
}

async function runWorker(
  role: "holder" | "contender",
  dataDir: string,
  readyFile: string,
  releaseFile: string
) {
  try {
    const result = await runLocalCommerceSchedule({
      scheduleId: "two-process-smoke",
      batchId: "two-process-smoke",
      target: "activepieces",
      scheduledAt: new Date(0).toISOString(),
      maxAttempts: 1,
      store: new LocalCommerceSchedulerStore(dataDir),
      execute: async () => {
        if (role === "holder") {
          await writeFile(readyFile, "ready", "utf8");
          await waitForFile(releaseFile, 10_000);
        }
        return {
          ok: true,
          drafts: [{
            schema_version: "1",
            id: "two-process-smoke-draft",
            product_raw_hash: "a".repeat(64),
            state: "draft",
            title: "Two process smoke",
            short_caption: "Local only",
            description: "Local scheduler contention smoke",
            image_url: "https://shop.example/images/smoke.jpg",
            source_url: "https://shop.example/products/smoke",
            channels: ["shopping_mall"],
            approval_required: true,
            publish_allowed: false,
            created_at: new Date(0).toISOString()
          }],
          webhook_called: false,
          notification_sent: false,
          publish_attempted: false,
          SAFE_TO_UPLOAD: false,
          SAFE_TO_PUBLIC_UPLOAD: false
        } as const;
      }
    });
    console.log(JSON.stringify({ role, status: result.status }));
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.log(JSON.stringify({ role, error_code: code }));
    process.exitCode = code === "LOCAL_SCHEDULER_ALREADY_RUNNING" ? 23 : 1;
  }
}

function spawnWorker(role: "holder" | "contender", dataDir: string, readyFile: string, releaseFile: string) {
  const scriptPath = process.argv[1];
  const child = spawn(process.execPath, [
    "--import",
    "tsx",
    scriptPath,
    `--worker=${role}`,
    `--data-dir=${dataDir}`,
    `--ready-file=${readyFile}`,
    `--release-file=${releaseFile}`
  ], {
    cwd: dirname(dirname(dirname(scriptPath))),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  const result = new Promise<{ exitCode: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
  return { result };
}

async function waitForFile(path: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fileExists(path)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("SMOKE_COORDINATION_TIMEOUT");
}

async function fileExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJsonlCount(path: string) {
  const content = await readFile(path, "utf8");
  return content.split(/\r?\n/).filter(Boolean).length;
}

function requireArg(name: string) {
  const value = args.get(name);
  if (!value) {
    throw new Error(`MISSING_${name.toUpperCase().replace(/-/g, "_")}`);
  }
  return value;
}
