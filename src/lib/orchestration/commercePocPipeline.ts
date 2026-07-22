import { createHash } from "node:crypto";
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

  const candidateReviews = reviewCollectedProducts(products, input.sourcePolicy, input.now, knownProducts);
  const reviews = await store.appendReviews(input.batchId, candidateReviews);

  const candidateDrafts = buildCommerceContentDrafts(reviews, input.now);
  const drafts = await store.appendDrafts(input.batchId, candidateDrafts);

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

export function buildCommercePocRunId(input: {
  inputContent: string;
  allowedHost: string;
  target: OrchestratorTarget;
}) {
  const digest = createHash("sha256")
    .update(input.target)
    .update("\0")
    .update(input.allowedHost.trim().toLowerCase())
    .update("\0")
    .update(input.inputContent)
    .digest("hex");
  return `commerce-poc-${digest.slice(0, 24)}`;
}
