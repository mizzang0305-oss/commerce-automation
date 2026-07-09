import { pathToFileURL } from "node:url";

import {
  buildV104EventCandidateToQueueReport,
  type V104EventCandidateMaterializationMode
} from "../../src/automation/eventCandidateQueueMaterializer";
import { isChannelKey } from "../../src/uploads/multi-channel/channelProfiles";

async function main() {
  const report = await buildV104EventCandidateToQueueReport({
    today: process.env.V103_SCOUT_TODAY,
    selectedChannelKey: isChannelKey(process.env.V104_CHANNEL_KEY) ? process.env.V104_CHANNEL_KEY : undefined,
    materializationMode: resolveMode(process.env.V104_MODE),
    env: process.env,
    cwd: process.cwd()
  });

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function resolveMode(value: string | undefined): V104EventCandidateMaterializationMode {
  if (value === "local_write" || value === "supabase_write" || value === "dry_run") {
    return value;
  }
  return "dry_run";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stdout.write(`${JSON.stringify({
      version: "v104",
      mode: "event_candidate_to_queue_no_upload",
      FINAL_STATUS: "BLOCKED_V104_LOCAL_QUEUE_WRITE_FAILED_NO_UPLOAD",
      materializationMode: resolveMode(process.env.V104_MODE),
      selectedCandidateFound: false,
      selectedChannelKey: isChannelKey(process.env.V104_CHANNEL_KEY) ? process.env.V104_CHANNEL_KEY : "father_jobs",
      selectedEvent: null,
      selectedTheme: null,
      queueItemCreated: false,
      queueItemAlreadyExists: false,
      queueItemShortId: null,
      plannedQueueItem: null,
      queueWritePlanned: false,
      localQueueWrite: false,
      duplicateGuard: {
        duplicateDetected: false,
        duplicatePrevented: false,
        duplicateKeyHashPrefix: null
      },
      currentBlocker: "BLOCKED_V104_LOCAL_QUEUE_WRITE_FAILED_NO_UPLOAD",
      v103Scout: {
        executed: false,
        FINAL_STATUS: null,
        generatedCandidateCount: 0,
        selectedFirstCandidateFound: false
      },
      v102AfterMaterialization: null,
      DB_write: false,
      Supabase_write: false,
      n8nWebhookCalled: false,
      schedulerExecutionCalled: false,
      videosInsertCalled: false,
      videosInsertTotalCount: 0,
      commentThreadsInsertCalled: false,
      raw_urls_printed: false,
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
