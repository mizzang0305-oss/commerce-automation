import { writeV036MultiChannelCommercePreviewArtifacts } from "../../src/uploads/multi-channel/channelUploadPlanPreview";

async function main() {
  const result = await writeV036MultiChannelCommercePreviewArtifacts({
    cwd: process.cwd()
  });

  console.log(JSON.stringify({
    FINAL_STATUS: result.FINAL_STATUS,
    sample_product_count: result.plan.sample_product_count,
    routing_accuracy_check: result.plan.routing_accuracy_check,
    duplicate_cross_channel_guard: result.plan.duplicate_cross_channel_guard,
    safety_risk_report: result.plan.safety_risk_report,
    artifact_paths: result.artifact_paths,
    youtube_execute_called: false,
    videos_insert_called: false,
    new_upload_attempted: false,
    comment_create_update_delete_called: false,
    raw_urls_printed: false,
    secrets_printed: false
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    FINAL_STATUS: "BLOCKED_V036_MULTI_CHANNEL_COMMERCE_ROUTER",
    error: error instanceof Error ? error.message : String(error),
    youtube_execute_called: false,
    videos_insert_called: false,
    new_upload_attempted: false,
    raw_urls_printed: false,
    secrets_printed: false
  }, null, 2));
  process.exitCode = 1;
});
