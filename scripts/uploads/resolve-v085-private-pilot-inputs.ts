import { pathToFileURL } from "node:url";

import {
  buildV085PrivatePilotInputBinding
} from "../../src/uploads/youtube/v085PrivatePilotInputBinding";

async function main() {
  const report = await buildV085PrivatePilotInputBinding({
    cwd: process.env.V085_CWD || process.cwd(),
    env: process.env
  });

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stdout.write(`${JSON.stringify({
      version: "v085",
      status: "blocked",
      mode: "private_pilot_input_binding_no_upload",
      blockers: ["BLOCKED_V085_UNSAFE_REPORT_REQUESTED"],
      videosInsertCalled: false,
      commentThreadsInsertCalled: false,
      raw_urls_printed: false,
      raw_video_ids_printed: false,
      raw_channel_ids_printed: false,
      secrets_printed: false,
      fake_success: false
    }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
