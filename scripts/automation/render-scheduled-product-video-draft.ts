import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  buildScheduledProductVideoDraftPlan,
  renderScheduledProductVideoDraft
} from "../../src/lib/coupang/scheduledProductVideoDraft";
import { parseCommerceProductPreview } from "../../src/lib/orchestration/commercePocPreview";
import {
  COMMERCE_DAILY_KST_SLOTS,
  type CommerceDailySlotId
} from "../../src/lib/orchestration/commerceDailyCadence";

async function main() {
  const args = new Map(process.argv.slice(2).map((argument) => {
    const [key, ...rest] = argument.split("=");
    return [key.replace(/^--/, ""), rest.join("=")];
  }));
  const slotId = args.get("slot-id");
  if (!slotId || !COMMERCE_DAILY_KST_SLOTS.some((slot) => slot.id === slotId)) {
    throw new Error(`--slot-id must be one of ${COMMERCE_DAILY_KST_SLOTS.map((slot) => slot.id).join(", ")}`);
  }
  const inputPath = path.join(process.cwd(), "data", "commerce-poc", `provider-products-${slotId}.jsonl`);
  const products = parseCommerceProductPreview(await readFile(inputPath, "utf8")).products;
  const plan = buildScheduledProductVideoDraftPlan({
    slotId: slotId as CommerceDailySlotId,
    products,
    now: args.get("now")
  });
  const result = await renderScheduledProductVideoDraft({
    plan,
    approval: args.get("render"),
    voiceoverApproval: args.get("voiceover")
  });
  console.log(JSON.stringify({
    ok: result.ok,
    blocker: result.blocker,
    schedule_id: plan.schedule_id,
    slot_id: plan.slot_id,
    event_name: plan.event_name,
    product_hash_prefix: plan.product.raw_hash.slice(0, 12),
    video_generated: result.video_generated,
    voiceover_generated: result.voiceover_generated,
    audio_muxed: result.audio_muxed,
    image_downloaded: result.image_downloaded,
    ffmpeg_executed: result.ffmpeg_executed,
    local_video_path_present: Boolean(result.local_video_path),
    manifest_path_present: Boolean(result.manifest_path),
    quality_status: plan.quality.status,
    quality_blockers: result.voiceover_generated
      ? plan.quality.blockers.filter((blocker) => blocker !== "VOICEOVER_REQUIRED")
      : plan.quality.blockers,
    publish_attempted: false,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false
  }, null, 2));
  if (!result.ok) {
    process.exitCode = 2;
  }
}

void main();
