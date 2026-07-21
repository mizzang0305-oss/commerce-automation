import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  COMMERCE_DAILY_KST_SLOTS,
  type CommerceDailySlotId
} from "../../src/lib/orchestration/commerceDailyCadence";
import {
  buildScheduledEventProductProviderPlan,
  searchScheduledEventProducts
} from "../../src/lib/coupang/scheduledEventProductProvider";

async function main() {
  const args = new Map(
    process.argv.slice(2).map((argument) => {
      const [key, ...rest] = argument.split("=");
      return [key.replace(/^--/, ""), rest.join("=")];
    })
  );
  const slotId = args.get("slot-id");
  if (!slotId || !COMMERCE_DAILY_KST_SLOTS.some((slot) => slot.id === slotId)) {
    throw new Error(`--slot-id must be one of ${COMMERCE_DAILY_KST_SLOTS.map((slot) => slot.id).join(", ")}`);
  }

  const approval = args.get("execute-live-search");
  if (approval === undefined) {
    const plan = buildScheduledEventProductProviderPlan({
      slotId: slotId as CommerceDailySlotId,
      now: args.get("now")
    });
    console.log(JSON.stringify(plan, null, 2));
    console.log("Live search remains blocked until the exact one-shot approval argument is supplied manually.");
    return;
  }

  const result = await searchScheduledEventProducts({
    slotId: slotId as CommerceDailySlotId,
    approval,
    now: args.get("now"),
    env: process.env
  });
  if (!result.ok) {
    console.log(JSON.stringify({
      ok: false,
      blocker: result.blocker,
      schedule_id: result.plan.schedule_id,
      external_api_called: result.external_api_called,
      credential_input_used: result.credential_input_used,
      automatic_retry_attempted: result.automatic_retry_attempted,
      local_pool_written: false,
      publish_attempted: false,
      SAFE_TO_UPLOAD: false,
      SAFE_TO_PUBLIC_UPLOAD: false
    }, null, 2));
    process.exitCode = 2;
    return;
  }

  const dataDirectory = resolve(process.cwd(), "data", "commerce-poc");
  const outputPath = resolve(dataDirectory, `provider-products-${slotId}.jsonl`);
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(outputPath, `${result.products.map((product) => JSON.stringify(product)).join("\n")}\n`, "utf8");
  console.log(JSON.stringify({
    ok: true,
    blocker: null,
    schedule_id: result.plan.schedule_id,
    products_written: result.products.length,
    product_hash_prefixes: result.products.map((product) => product.raw_hash.slice(0, 12)),
    external_api_called: true,
    credential_input_used: true,
    automatic_retry_attempted: false,
    local_pool_written: true,
    owner_review_required: true,
    publish_attempted: false,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false
  }, null, 2));
}

void main();
