import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_V095_PRIVATE_PILOT_EXECUTION_CONTEXT_RELATIVE_PATH,
  prepareV095PrivatePilotExecutionContext
} from "../../src/uploads/youtube/v095PrivatePilotExecutionContext";
import {
  buildV084PrivateUploadPilotInvocationFromEnv
} from "../../src/uploads/youtube/v084PrivateUploadExecutionInvocation";

async function main() {
  const cwd = process.env.V095_CWD || process.cwd();
  const env = loadLocalEnv(cwd, process.env);
  const context = await prepareV095PrivatePilotExecutionContext({ cwd, env });
  const contextPath = path.join(cwd, DEFAULT_V095_PRIVATE_PILOT_EXECUTION_CONTEXT_RELATIVE_PATH);
  const v084Plan = await buildV084PrivateUploadPilotInvocationFromEnv({
    dryRun: true,
    env: {
      ...env,
      V095_CWD: cwd,
      V084_PRIVATE_PILOT_EXECUTION_CONTEXT_PATH: contextPath,
      V084_PRIVATE_UPLOAD_APPROVAL_PHRASE: ""
    }
  });
  const readyForFreshApproval = context.status === "context_ready" &&
    v084Plan.blockers.length === 1 &&
    v084Plan.blockers[0] === "BLOCKED_V084_FRESH_APPROVAL_REQUIRED";

  process.stdout.write(`${JSON.stringify({
    version: "v095",
    status: readyForFreshApproval ? "ready_for_fresh_approval" : "blocked",
    mode: "private_pilot_preflight_no_upload",
    context,
    v084Plan,
    uploadExecuteCalled: false,
    videosInsertCalled: false,
    commentThreadsInsertCalled: false,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false,
    raw_urls_printed: false,
    raw_file_paths_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false
  }, null, 2)}\n`);
}

function loadLocalEnv(cwd: string, baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...baseEnv };
  const envPath = path.join(cwd, ".env.local");
  if (!fs.existsSync(envPath)) return env;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    if (!key || env[key] !== undefined) continue;
    const raw = trimmed.slice(index + 1).trim();
    env[key] = raw.replace(/^['"]|['"]$/g, "");
  }

  return env;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stdout.write(`${JSON.stringify({
      version: "v095",
      status: "blocked",
      mode: "private_pilot_preflight_no_upload",
      blockers: ["BLOCKED_V095_CONTEXT_UNSAFE"],
      uploadExecuteCalled: false,
      videosInsertCalled: false,
      commentThreadsInsertCalled: false,
      raw_urls_printed: false,
      raw_file_paths_printed: false,
      raw_video_ids_printed: false,
      raw_channel_ids_printed: false,
      secrets_printed: false,
      fake_success: false
    }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
