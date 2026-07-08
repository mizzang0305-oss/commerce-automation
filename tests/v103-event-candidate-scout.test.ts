import { describe, expect, test } from "vitest";

import {
  buildV103EventCandidateScoutReport,
  buildV103EventWindow,
  type V103EventCandidateScoutReport
} from "../src/automation/eventCandidateScout";
import { buildV102FirstVideoSettingsPreflight } from "../src/uploads/youtube/v102FirstVideoSettingsPreflight";

const FORBIDDEN_REPORT_PATTERN =
  /https?:\/\/|"UC[A-Za-z0-9_-]{20,}"|Authorization|Bearer|HmacSHA256|client_secret|token=|secret=|signature=/i;

describe("v103 event based candidate scout no-upload", () => {
  test("creates a rolling 30 day event window from the injected date", () => {
    expect(buildV103EventWindow("2026-07-09")).toEqual({
      scoutWindowStart: "2026-07-09",
      scoutWindowEnd: "2026-08-08",
      daysAhead: 30,
      timezone: "Asia/Seoul"
    });
  });

  test("uses Asia Seoul date when the default input is a Date object", () => {
    expect(buildV103EventWindow(new Date("2026-07-08T16:00:00.000Z")).scoutWindowStart)
      .toBe("2026-07-09");
  });

  test("generates channel candidates and ranks food-friendly seasonal events above Constitution Day", async () => {
    const report = await buildV103EventCandidateScoutReport({
      today: "2026-07-09"
    });

    expect(report.version).toBe("v103");
    expect(report.mode).toBe("event_based_candidate_scout_30d_no_upload");
    expect(report.generatedCandidateCount).toBeGreaterThanOrEqual(9);
    expect(report.channelCandidateCounts).toMatchObject({
      father_jobs: expect.any(Number),
      neoman_moleulgeol: expect.any(Number),
      lets_buy: expect.any(Number)
    });
    expect(report.channelCandidateCounts.father_jobs).toBeGreaterThan(0);
    expect(report.channelCandidateCounts.neoman_moleulgeol).toBeGreaterThan(0);
    expect(report.channelCandidateCounts.lets_buy).toBeGreaterThan(0);

    const scores = scoreByEvent(report);
    expect(scores["초복"]).toBeGreaterThan(scores["제헌절"]);
    expect(scores["폭염"]).toBeGreaterThan(scores["제헌절"]);
    expect(scores["캠핑/펜션/계곡"]).toBeGreaterThan(scores["제헌절"]);
    expect(scores["여름방학"]).toBeGreaterThan(scores["제헌절"]);
    expect(report.topCandidates[0].channelKey).toBe("father_jobs");
    expect(report.selectedFirstCandidate).toMatchObject({
      channelKey: "father_jobs",
      queue_status: "manual_review",
      manual_review_status: "not_ready"
    });
    expect(report.selectedChannelKey).toBe("father_jobs");
    expect(report.selectedTheme).toBeTruthy();
    expect(report.selectedEvent).toBeTruthy();
    expect(report.selectedReason).toContain("자동");
  });

  test("links selected candidate into V102 memory fixture so the blocker moves past no-candidate", async () => {
    const report = await buildV103EventCandidateScoutReport({
      today: "2026-07-09",
      runV102LinkedDryRun: true
    });

    expect(report.v102LinkedDryRun).toMatchObject({
      executed: true,
      selectedItemFound: true,
      uploadExecuteCalled: false,
      videosInsertCalled: false,
      videosInsertTotalCount: 0,
      commentThreadsInsertCalled: false,
      SAFE_TO_UPLOAD: false,
      SAFE_TO_PUBLIC_UPLOAD: false
    });
    expect(report.v102LinkedDryRun?.FINAL_STATUS).not.toBe("BLOCKED_NO_FIRST_VIDEO_CANDIDATE_NO_UPLOAD");
    expect([
      "BLOCKED_FIRST_VIDEO_SETTINGS_NOT_READY_NO_UPLOAD",
      "BLOCKED_V081_VIDEO_ASSET_MISSING_NO_UPLOAD"
    ]).toContain(report.v102LinkedDryRun?.FINAL_STATUS);

    const v102Report = await buildV102FirstVideoSettingsPreflight({
      selectedChannelKey: report.selectedChannelKey,
      queueItems: report.v102MemoryFixture.queueItems,
      uploadPackages: [],
      now: () => "2026-07-09T00:00:00.000Z"
    });
    expect(v102Report.selectedItemFound).toBe(true);
    expect(v102Report.FINAL_STATUS).toBe("BLOCKED_FIRST_VIDEO_SETTINGS_NOT_READY_NO_UPLOAD");
  });

  test("keeps dry-run side effects and raw evidence output disabled", async () => {
    const report = await buildV103EventCandidateScoutReport({
      today: "2026-07-09",
      runV102LinkedDryRun: true
    });

    expect(report.queueWritePlanned).toBe(false);
    expect(report.DB_write).toBe(false);
    expect(report.n8nWebhookCalled).toBe(false);
    expect(report.videosInsertCalled).toBe(false);
    expect(report.videosInsertTotalCount).toBe(0);
    expect(report.commentThreadsInsertCalled).toBe(false);
    expect(report.schedulerExecutionCalled).toBe(false);
    expect(report.raw_urls_printed).toBe(false);
    expect(report.raw_video_ids_printed).toBe(false);
    expect(report.raw_channel_ids_printed).toBe(false);
    expect(report.secrets_printed).toBe(false);
    expect(report.fake_success).toBe(false);
    expect(report.SAFE_TO_UPLOAD).toBe(false);
    expect(report.SAFE_TO_PUBLIC_UPLOAD).toBe(false);
    expect(JSON.stringify(report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("excludes outside-window direct events and keeps Liberation Day as a lower-scored preparation candidate", async () => {
    const report = await buildV103EventCandidateScoutReport({
      today: "2026-07-09"
    });

    const directLiberation = report.topCandidates.find((candidate) => candidate.eventName === "광복절");
    const liberationPrep = report.topCandidates.find((candidate) => candidate.eventName === "광복절 사전 준비");
    const chobok = report.topCandidates.find((candidate) => candidate.eventName === "초복");

    expect(directLiberation).toBeUndefined();
    expect(liberationPrep).toBeDefined();
    expect(chobok).toBeDefined();
    expect(liberationPrep!.score).toBeLessThan(chobok!.score);
  });
});

function scoreByEvent(report: V103EventCandidateScoutReport) {
  return Object.fromEntries(
    report.topCandidates.map((candidate) => [candidate.eventName, candidate.score])
  ) as Record<string, number>;
}
