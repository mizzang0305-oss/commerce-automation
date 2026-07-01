import { execFileSync } from "node:child_process";

import { buildV049ThreeChannelUploadPreflight } from "../../src/uploads/multi-channel/threeChannelUploadPreflight";

async function main() {
  const report = await buildV049ThreeChannelUploadPreflight({
    cwd: process.cwd(),
    approvalText: process.env.V049_APPROVAL_TEXT,
    mainHead: currentHead()
  });

  console.log(JSON.stringify(sanitizeReport(report), null, 2));
  if (!report.V049_UPLOAD_PREFLIGHT_READY) {
    process.exitCode = 1;
  }
}

function currentHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return null;
  }
}

function sanitizeReport(report: Awaited<ReturnType<typeof buildV049ThreeChannelUploadPreflight>>) {
  return {
    FINAL_STATUS: report.FINAL_STATUS,
    V049_UPLOAD_PREFLIGHT_READY: report.V049_UPLOAD_PREFLIGHT_READY,
    SAFE_TO_UPLOAD: report.SAFE_TO_UPLOAD,
    main_head: report.main_head,
    v048_review_status_all_pass: report.v048_review_status_all_pass,
    upload_approval_present: report.upload_approval_present,
    paid_promotion_confirmation_present: report.paid_promotion_confirmation_present,
    paid_promotion_required_all: report.paid_promotion_required_all,
    paid_promotion_setting_verified: report.paid_promotion_setting_verified,
    manual_paid_promotion_check_required: report.manual_paid_promotion_check_required,
    father_jobs_preflight_pass: report.father_jobs_preflight_pass,
    father_jobs_blocker: report.father_jobs_blocker,
    neoman_moleulgeol_preflight_pass: report.neoman_moleulgeol_preflight_pass,
    neoman_moleulgeol_blocker: report.neoman_moleulgeol_blocker,
    lets_buy_preflight_pass: report.lets_buy_preflight_pass,
    lets_buy_blocker: report.lets_buy_blocker,
    all_channel_preflight_pass: report.all_channel_preflight_pass,
    upload_plan_generated: report.upload_plan_generated,
    sanitized_upload_requests_generated: report.sanitized_upload_requests_generated,
    comment_previews_generated: report.comment_previews_generated,
    raw_affiliate_url_printed: report.raw_affiliate_url_printed,
    duplicate_upload_risk: report.duplicate_upload_risk,
    youtube_execute_called: report.youtube_execute_called,
    videos_insert_called: report.videos_insert_called,
    comment_create_update_delete_called: report.comment_create_update_delete_called,
    visibility_changed_existing_video: report.visibility_changed_existing_video,
    raw_urls_printed: report.raw_urls_printed,
    secrets_printed: report.secrets_printed,
    fake_success: report.fake_success
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "v049 preflight failed");
  process.exitCode = 1;
});
