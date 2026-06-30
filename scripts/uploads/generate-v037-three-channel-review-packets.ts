import { writeV037ThreeChannelReviewPackets } from "../../src/uploads/multi-channel/channelReviewPacketBuilder";

async function main() {
  const result = await writeV037ThreeChannelReviewPackets();
  const summary = {
    FINAL_STATUS: result.FINAL_STATUS,
    V037_REVIEW_PACKETS_READY: result.V037_REVIEW_PACKETS_READY,
    SAFE_TO_UPLOAD: result.SAFE_TO_UPLOAD,
    PUBLIC_UPLOAD_BLOCKED: result.PUBLIC_UPLOAD_BLOCKED,
    channel_count: result.plan.channel_packets.length,
    selected_products: Object.fromEntries(
      result.plan.channel_packets.map((packet) => [packet.channel_key, packet.selected_product.product_name])
    ),
    duplicate_guard: result.plan.duplicate_guard,
    safety_gate: result.plan.safety_gate,
    artifact_paths: result.artifact_paths,
    youtube_execute_called: result.youtube_execute_called,
    videos_insert_called: result.videos_insert_called,
    new_upload_attempted: result.new_upload_attempted,
    comment_create_update_delete_called: result.comment_create_update_delete_called,
    raw_urls_printed: result.raw_urls_printed,
    secrets_printed: result.secrets_printed,
    fake_success: result.fake_success
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
