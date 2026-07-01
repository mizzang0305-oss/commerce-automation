import { checkV050ThreeChannelAdapterInjection } from "../../src/uploads/multi-channel/v050ThreeChannelUploadExecutorWiring";

async function main() {
  const report = await checkV050ThreeChannelAdapterInjection({
    cwd: process.cwd()
  });

  console.log(JSON.stringify(sanitizeReport(report), null, 2));
  if (report.FINAL_STATUS !== "SUCCESS_V050_YOUTUBE_ADAPTERS_READY_NO_UPLOAD") {
    process.exitCode = 1;
  }
}

function sanitizeReport(report: Awaited<ReturnType<typeof checkV050ThreeChannelAdapterInjection>>) {
  return {
    version: report.version,
    FINAL_STATUS: report.FINAL_STATUS,
    V050_ADAPTERS_READY: report.V050_ADAPTERS_READY,
    CHANNEL_ROUTING_READY: report.CHANNEL_ROUTING_READY,
    SAFE_TO_UPLOAD: report.SAFE_TO_UPLOAD,
    upload_adapter_injected: report.upload_adapter_injected,
    comment_adapter_injected: report.comment_adapter_injected,
    token_provider_injected: report.token_provider_injected,
    channel_account_router_injected: report.channel_account_router_injected,
    duplicate_upload_guard_injected: report.duplicate_upload_guard_injected,
    metadata_gate_injected: report.metadata_gate_injected,
    channel_routing_blocker: report.channel_routing_blocker,
    injection_blocker: report.injection_blocker,
    youtube_execute_called: report.youtube_execute_called,
    videos_insert_called: report.videos_insert_called,
    comment_create_update_delete_called: report.comment_create_update_delete_called,
    upload_attempted: report.upload_attempted,
    visibility_changed: report.visibility_changed,
    R2_upload: report.R2_upload,
    product_assets_write: report.product_assets_write,
    DB_write: report.DB_write,
    raw_urls_printed: report.raw_urls_printed,
    secrets_printed: report.secrets_printed,
    fake_success: report.fake_success
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "v050 adapter injection check failed");
  process.exitCode = 1;
});
