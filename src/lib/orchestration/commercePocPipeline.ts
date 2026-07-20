import {
  collectedProductSchema,
  type CollectorSourcePolicy,
  type OrchestratorTarget
} from "@/lib/orchestration/commercePocSchemas";
import { buildCommerceContentDrafts } from "@/lib/orchestration/commerceDraft";
import { reviewCollectedProducts } from "@/lib/orchestration/commerceReview";
import { JsonlCommercePocStore } from "@/lib/orchestration/jsonlCommercePocStore";
import { buildCommerceOrchestratorPayload } from "@/lib/orchestration/orchestratorContract";

export async function runCommerceAutomationPoc(input: {
  batchId: string;
  requestId: string;
  target: OrchestratorTarget;
  now: string;
  products: unknown[];
  sourcePolicy: CollectorSourcePolicy;
  store?: JsonlCommercePocStore;
}) {
  const products = input.products.map((product) => collectedProductSchema.parse(product));
  const store = input.store ?? new JsonlCommercePocStore();
  const knownProducts = await store.readCollected(input.batchId);
  await store.appendCollected(input.batchId, products);

  const reviews = reviewCollectedProducts(products, input.sourcePolicy, input.now, knownProducts);
  await store.appendReviews(input.batchId, reviews);

  const drafts = buildCommerceContentDrafts(reviews, input.now);
  await store.appendDrafts(input.batchId, drafts);

  const orchestrator_payload = buildCommerceOrchestratorPayload({
    target: input.target,
    requestId: input.requestId,
    batchId: input.batchId,
    emittedAt: input.now,
    reviews,
    drafts
  });

  return {
    ok: true,
    reviews,
    drafts,
    orchestrator_payload,
    webhook_called: false,
    notification_sent: false,
    publish_attempted: false,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false
  } as const;
}
