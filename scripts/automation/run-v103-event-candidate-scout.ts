import { pathToFileURL } from "node:url";

import { buildV103EventCandidateScoutReport } from "../../src/automation/eventCandidateScout";

async function main() {
  const report = await buildV103EventCandidateScoutReport({
    today: process.env.V103_SCOUT_TODAY,
    runV102LinkedDryRun: true
  });

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stdout.write(`${JSON.stringify({
      version: "v103",
      mode: "event_based_candidate_scout_30d_no_upload",
      FINAL_STATUS: "BLOCKED_V103_NO_EVENT_CANDIDATES_CREATED",
      scoutWindowStart: null,
      scoutWindowEnd: null,
      generatedCandidateCount: 0,
      selectedFirstCandidate: null,
      selectedChannelKey: "father_jobs",
      selectedTheme: null,
      selectedEvent: null,
      selectedReason: null,
      currentBlocker: "BLOCKED_V103_NO_EVENT_CANDIDATES_CREATED",
      queueWritePlanned: false,
      DB_write: false,
      n8nWebhookCalled: false,
      videosInsertCalled: false,
      videosInsertTotalCount: 0,
      commentThreadsInsertCalled: false,
      schedulerExecutionCalled: false,
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
