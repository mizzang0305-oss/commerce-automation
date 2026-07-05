import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  resolveV088CoupangProductSource
} from "../../src/uploads/youtube/v088CoupangProductSourceResolver";

async function main() {
  const env = loadLocalEnv(process.cwd(), process.env);
  const report = await resolveV088CoupangProductSource({
    cwd: env.V088_CWD || process.cwd(),
    env
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
      version: "v088",
      status: "blocked",
      mode: "coupang_api_product_source_resolution_no_upload",
      selectedChannelKey: "father_jobs",
      blockers: ["BLOCKED_V088_UNSAFE_REPORT_REQUESTED"],
      productSearchApiCalled: false,
      deeplinkApiCalled: false,
      rawUrlsPrinted: false,
      rawFilePathsPrinted: false,
      rawVideoIdsPrinted: false,
      rawChannelIdsPrinted: false,
      secretsPrinted: false,
      authorizationHeaderPrinted: false,
      hmacSignaturePrinted: false,
      v084ExecuteCalled: false,
      videosInsertCalled: false,
      commentThreadsInsertCalled: false,
      visibilityChanged: false,
      R2Upload: false,
      DBWrite: false,
      productAssetsWrite: false,
      n8nWebhookCalled: false,
      fakeSuccess: false,
      safeToUpload: false,
      safeToPublicUpload: false
    }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
