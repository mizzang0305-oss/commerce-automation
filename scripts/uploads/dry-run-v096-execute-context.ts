import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  buildV084PrivateUploadPilotInvocationFromEnv
} from "../../src/uploads/youtube/v084PrivateUploadExecutionInvocation";
import {
  DEFAULT_V095_PRIVATE_PILOT_EXECUTION_CONTEXT_RELATIVE_PATH,
  loadV095PrivatePilotExecutionContextForV084
} from "../../src/uploads/youtube/v095PrivatePilotExecutionContext";

async function main() {
  const cwd = process.env.V095_CWD || process.env.V084_CWD || process.cwd();
  const env = loadLocalEnv(cwd, process.env);
  const contextLoad = await loadV095PrivatePilotExecutionContextForV084({
    cwd,
    env: {
      ...env,
      V084_PRIVATE_UPLOAD_APPROVAL_PHRASE: ""
    }
  });
  const v084Plan = await buildV084PrivateUploadPilotInvocationFromEnv({
    dryRun: true,
    env: {
      ...env,
      V095_CWD: cwd,
      V084_PRIVATE_UPLOAD_APPROVAL_PHRASE: ""
    }
  });

  const onlyFreshApprovalBlocker = v084Plan.blockers.length === 1 &&
    v084Plan.blockers[0] === "BLOCKED_V084_FRESH_APPROVAL_REQUIRED";

  process.stdout.write(`${JSON.stringify({
    version: "v096",
    status: onlyFreshApprovalBlocker ? "execute_context_ready_for_fresh_approval" : "blocked",
    mode: "execute_context_dry_run_no_upload",
    defaultContextPathLabel: DEFAULT_V095_PRIVATE_PILOT_EXECUTION_CONTEXT_RELATIVE_PATH,
    contextFound: contextLoad.found,
    contextLoaded: Boolean(contextLoad.values),
    contextBlockers: contextLoad.blockers,
    v084PlanStatus: v084Plan.status,
    v084PlanBlockers: v084Plan.blockers,
    v084ContextBacked: v084Plan.queueItemIdPresent &&
      v084Plan.uploadPackageIdPresent &&
      v084Plan.v088ResolverBound &&
      v084Plan.v087BinderReady &&
      v084Plan.v085BinderReady,
    approvalAccepted: false,
    approvalPhraseStored: false,
    uploadExecuteCalled: false,
    videosInsertCalled: false,
    videosInsertTotalCount: 0,
    commentThreadsInsertCalled: false,
    publicUploadAllowed: false,
    unlistedUploadAllowed: false,
    commentAutomationAllowed: false,
    schedulerExecutionAllowed: false,
    raw_urls_printed: false,
    raw_file_paths_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false
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
      version: "v096",
      status: "blocked",
      mode: "execute_context_dry_run_no_upload",
      blockers: ["BLOCKED_V096_EXECUTE_CONTEXT_DRY_RUN_FAILED"],
      uploadExecuteCalled: false,
      videosInsertCalled: false,
      videosInsertTotalCount: 0,
      commentThreadsInsertCalled: false,
      raw_urls_printed: false,
      raw_file_paths_printed: false,
      raw_video_ids_printed: false,
      raw_channel_ids_printed: false,
      secrets_printed: false,
      fake_success: false,
      SAFE_TO_UPLOAD: false,
      SAFE_TO_PUBLIC_UPLOAD: false
    }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
