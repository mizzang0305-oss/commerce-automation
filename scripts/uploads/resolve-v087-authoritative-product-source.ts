import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  buildV087AuthoritativeProductSourceBinding
} from "../../src/uploads/youtube/v087AuthoritativeProductSourceBinding";

async function main() {
  const env = loadLocalEnv(process.cwd(), process.env);
  const report = await buildV087AuthoritativeProductSourceBinding({
    cwd: env.V087_CWD || process.cwd(),
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
      version: "v087",
      status: "blocked",
      mode: "authoritative_product_source_binding_no_upload",
      blockers: ["BLOCKED_V087_UNSAFE_REPORT_REQUESTED"],
      v084ExecuteCalled: false,
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
