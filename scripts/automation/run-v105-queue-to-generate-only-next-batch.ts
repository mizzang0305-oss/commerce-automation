import { pathToFileURL } from "node:url";

import {
  buildV105QueueToGenerateOnlyNextBatchReport,
  type V105QueueToGenerateOnlyNextBatchMode
} from "../../src/automation/queueToGenerateOnlyNextBatchPlanner";
import { isChannelKey } from "../../src/uploads/multi-channel/channelProfiles";

async function main() {
  const report = await buildV105QueueToGenerateOnlyNextBatchReport({
    cwd: process.cwd(),
    env: process.env,
    selectedChannelKey: isChannelKey(process.env.V105_CHANNEL_KEY) ? process.env.V105_CHANNEL_KEY : undefined,
    maxBatchSize: process.env.V105_BATCH_SIZE,
    mode: resolveMode(process.env.V105_MODE),
    now: process.env.V103_SCOUT_TODAY
  });

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function resolveMode(value: string | undefined): V105QueueToGenerateOnlyNextBatchMode {
  if (value === "dry_run" || value === "plan_only" || value === "execute") {
    return value;
  }
  return "dry_run";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stdout.write(`${JSON.stringify({
      version: "v105",
      mode: "queue_to_generate_only_next_batch_no_upload",
      FINAL_STATUS: "BLOCKED_V105_NO_QUEUE_ITEM_FOR_NEXT_BATCH_NO_UPLOAD",
      selectedChannelKey: isChannelKey(process.env.V105_CHANNEL_KEY) ? process.env.V105_CHANNEL_KEY : "father_jobs",
      requestedMode: resolveMode(process.env.V105_MODE),
      queueItemFound: false,
      selectedItemShortId: null,
      selectedItemStatus: null,
      selectedManualReviewStatus: null,
      selectedItemPromotedToUploadReadiness: false,
      plannedBatchSize: 0,
      plannedPayloadCreated: false,
      plannedPayloadMode: null,
      plannedPayloadSanitized: true,
      plannedPayload: null,
      n8nWebhookPlanned: false,
      n8nWebhookCalled: false,
      uploadExecuteAllowed: false,
      videosInsertCalled: false,
      videosInsertTotalCount: 0,
      commentThreadsInsertCalled: false,
      schedulerExecutionCalled: false,
      DB_write: false,
      Supabase_write: false,
      R2_upload: false,
      storage_write: false,
      raw_urls_printed: false,
      raw_video_ids_printed: false,
      raw_channel_ids_printed: false,
      secrets_printed: false,
      fake_success: false,
      SAFE_TO_UPLOAD: false,
      SAFE_TO_PUBLIC_UPLOAD: false,
      currentBlocker: "BLOCKED_V105_NO_QUEUE_ITEM_FOR_NEXT_BATCH_NO_UPLOAD"
    }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
