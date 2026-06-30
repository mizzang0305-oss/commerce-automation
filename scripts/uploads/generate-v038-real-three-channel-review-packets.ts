import { writeV038RealThreeChannelReviewPackets } from "../../src/uploads/multi-channel/realThreeChannelImageSkillReviewBuilder";

async function main() {
  const result = await writeV038RealThreeChannelReviewPackets();
  const channels = result.plan.channel_packets.map((packet) => ({
    channel_key: packet.channel_key,
    product_name: packet.selected_product.product_name,
    test_pattern_detected: packet.visual_gate.color_bar_pattern_detected,
    scene_assets_used: packet.visual_gate.rendered_frame_uses_scene_asset,
    safe_to_upload: packet.human_review_decision.safe_to_upload
  }));

  console.log(JSON.stringify({
    FINAL_STATUS: result.FINAL_STATUS,
    V038_REVIEW_PACKETS_READY: result.test_pattern_gate_summary.pass,
    SAFE_TO_UPLOAD: result.safe_to_upload,
    PUBLIC_UPLOAD_BLOCKED: true,
    youtube_execute_called: result.youtube_execute_called,
    videos_insert_called: result.videos_insert_called,
    raw_urls_printed: result.raw_affiliate_url_printed,
    channels,
    artifacts: {
      three_channel_review_plan: result.artifact_paths.three_channel_review_plan,
      test_pattern_gate_summary: result.artifact_paths.test_pattern_gate_summary,
      three_channel_routing_summary: result.artifact_paths.three_channel_routing_summary
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
