import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  buildV109ProductSourceAffiliateEvidenceReport
} from "../../src/automation/productSourceAffiliateEvidenceBinder";

async function main() {
  const cwd = process.env.V109_CWD ||
    process.env.V108_CWD ||
    process.env.V107_CWD ||
    process.env.V106_CWD ||
    process.cwd();
  const env = loadLocalEnv(cwd, process.env);
  const report = await buildV109ProductSourceAffiliateEvidenceReport({
    cwd,
    env,
    selectedChannelKey: env.V109_CHANNEL_KEY ||
      env.V108_CHANNEL_KEY ||
      env.V107_CHANNEL_KEY ||
      env.V106_CHANNEL_KEY ||
      "father_jobs",
    mode: env.V109_MODE || "dry_run",
    now: env.V103_SCOUT_TODAY
  });

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
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
      version: "v109",
      mode: "product_source_and_affiliate_evidence_binding_no_upload",
      FINAL_STATUS: "BLOCKED_V109_PRODUCT_SOURCE_EVIDENCE_MISSING_NO_UPLOAD",
      selectedChannelKey: "father_jobs",
      selectedItemFound: false,
      queuePatchApplied: false,
      videosInsertCalled: false,
      videosInsertTotalCount: 0,
      commentThreadsInsertCalled: false,
      n8nWebhookCalled: false,
      schedulerExecutionCalled: false,
      DB_write: false,
      Supabase_write: false,
      R2_upload: false,
      storage_write: false,
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
