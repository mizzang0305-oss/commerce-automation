import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { buildCommerceContentDrafts } from "@/lib/orchestration/commerceDraft";
import {
  buildCommercePocRunId,
  runCommerceAutomationPoc
} from "@/lib/orchestration/commercePocPipeline";
import {
  commerceOrchestratorPayloadSchema,
  type CollectedProduct,
  type CollectorSourcePolicy
} from "@/lib/orchestration/commercePocSchemas";
import { reviewCollectedProducts } from "@/lib/orchestration/commerceReview";
import { JsonlCommercePocStore } from "@/lib/orchestration/jsonlCommercePocStore";
import { BlockedCommerceNotificationAdapter } from "@/lib/orchestration/notificationAdapter";
import {
  buildCommerceOrchestratorPayload,
  parseCommerceOrchestratorCallback
} from "@/lib/orchestration/orchestratorContract";
import { evaluatePublishApproval } from "@/lib/orchestration/publishApprovalGate";

const temporaryDirectories: string[] = [];
const NOW = "2026-07-20T10:00:00.000Z";
const LATER_NOW = "2026-07-20T10:01:00.000Z";
const LATEST_NOW = "2026-07-20T10:02:00.000Z";
const POLICY: CollectorSourcePolicy = {
  allowed_hosts: ["shop.example"],
  authorization_basis: "public_page",
  forbidden_words: ["판매금지"],
  exaggeration_terms: ["대박보장"]
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("commerce orchestration PoC", () => {
  test("reviews missing, duplicate, forbidden, exaggerated, and invalid source records", () => {
    const records = [
      productFixture(),
      productFixture({
        product_name: "가격 이미지 누락",
        price: null,
        image_url: "",
        raw_hash: "b".repeat(64)
      }),
      productFixture({
        product_name: "   ",
        raw_hash: "f".repeat(64)
      }),
      productFixture({
        product_name: "중복 복사본",
        raw_hash: "a".repeat(64)
      }),
      productFixture({
        product_name: "판매금지 대박보장 상품",
        raw_hash: "c".repeat(64)
      }),
      productFixture({
        product_name: "잘못된 링크 상품",
        source_url: "javascript:alert(1)",
        raw_hash: "d".repeat(64)
      }),
      productFixture({
        product_name: "허용되지 않은 판매처",
        source_url: "https://other.example/products/1",
        raw_hash: "e".repeat(64)
      })
    ];

    const reviews = reviewCollectedProducts(records, POLICY, NOW);

    expect(reviews[0]).toMatchObject({ status: "pass", issues: [] });
    expect(issueCodes(reviews[1])).toEqual(expect.arrayContaining(["PRICE_MISSING", "IMAGE_MISSING"]));
    expect(issueCodes(reviews[2])).toContain("PRODUCT_NAME_MISSING");
    expect(issueCodes(reviews[3])).toContain("DUPLICATE_PRODUCT");
    expect(issueCodes(reviews[4])).toEqual(expect.arrayContaining(["FORBIDDEN_WORD", "EXAGGERATED_CLAIM"]));
    expect(issueCodes(reviews[5])).toContain("SOURCE_URL_INVALID");
    expect(issueCodes(reviews[6])).toContain("SOURCE_NOT_ALLOWED");
  });

  test("rejects source and image URLs containing embedded credentials", () => {
    const reviews = reviewCollectedProducts([
      productFixture({
        source_url: "https://user:secret@shop.example/products/1",
        image_url: "https://user:secret@shop.example/images/1.jpg"
      })
    ], POLICY, NOW);

    expect(issueCodes(reviews[0])).toEqual(expect.arrayContaining([
      "IMAGE_URL_INVALID",
      "SOURCE_URL_INVALID"
    ]));
  });

  test("creates drafts only for review-passed products and keeps publishing blocked", () => {
    const reviews = reviewCollectedProducts([
      productFixture(),
      productFixture({ price: null, raw_hash: "b".repeat(64) })
    ], POLICY, NOW);

    const drafts = buildCommerceContentDrafts(reviews, NOW);

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      state: "draft",
      approval_required: true,
      publish_allowed: false
    });
    expect(evaluatePublishApproval(drafts[0])).toEqual({
      publish_allowed: false,
      approval_valid: false,
      blocker: "PUBLISH_APPROVAL_REQUIRED",
      approval_id: ""
    });
    expect(evaluatePublishApproval(drafts[0], {
      draft_id: drafts[0].id,
      approval_id: "approval-12345678",
      approved_by: "owner",
      approved_at: NOW,
      approved: true
    })).toEqual({
      publish_allowed: false,
      approval_valid: true,
      blocker: "PUBLISH_EXECUTOR_NOT_IMPLEMENTED",
      approval_id: "approval-12345678"
    });
  });

  test("builds Activepieces and Windmill contract-only payloads that pass schema validation", () => {
    const reviews = reviewCollectedProducts([productFixture()], POLICY, NOW);
    const drafts = buildCommerceContentDrafts(reviews, NOW);

    for (const target of ["activepieces", "windmill"] as const) {
      const payload = buildCommerceOrchestratorPayload({
        target,
        requestId: `request-${target}`,
        batchId: "batch-001",
        emittedAt: NOW,
        reviews,
        drafts
      });
      expect(commerceOrchestratorPayloadSchema.safeParse(payload).success).toBe(true);
      expect(payload).toMatchObject({
        target,
        dispatch_mode: "contract_only",
        approval: { required: true, publish_allowed: false },
        side_effects: {
          webhook_called: false,
          notification_sent: false,
          platform_upload_attempted: false
        }
      });
    }

    expect(parseCommerceOrchestratorCallback({
      schema_version: "1",
      request_id: "request-activepieces",
      target: "activepieces",
      status: "accepted",
      accepted_draft_ids: [drafts[0].id],
      publish_requested: false,
      received_at: NOW
    }).publish_requested).toBe(false);
    expect(() => parseCommerceOrchestratorCallback({
      schema_version: "1",
      request_id: "request-activepieces",
      target: "activepieces",
      status: "accepted",
      accepted_draft_ids: [drafts[0].id],
      publish_requested: true,
      received_at: NOW
    })).toThrow();
  });

  test("persists staging, review, and draft JSONL without webhook, notification, or upload side effects", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "commerce-poc-"));
    temporaryDirectories.push(dataDir);

    const result = await runCommerceAutomationPoc({
      batchId: "batch-001",
      requestId: "request-001",
      target: "activepieces",
      now: NOW,
      products: [productFixture()],
      sourcePolicy: POLICY,
      store: new JsonlCommercePocStore(dataDir)
    });

    expect(result).toMatchObject({
      ok: true,
      webhook_called: false,
      notification_sent: false,
      publish_attempted: false,
      SAFE_TO_UPLOAD: false,
      SAFE_TO_PUBLIC_UPLOAD: false
    });
    expect(await jsonlCount(join(dataDir, "staging-products.jsonl"))).toBe(1);
    expect(await jsonlCount(join(dataDir, "review-results.jsonl"))).toBe(1);
    expect(await jsonlCount(join(dataDir, "content-drafts.jsonl"))).toBe(1);
  });

  test("blocks products already present in staging across pipeline runs", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "commerce-poc-"));
    temporaryDirectories.push(dataDir);
    const store = new JsonlCommercePocStore(dataDir);
    const input = {
      requestId: "request-duplicate",
      target: "windmill" as const,
      now: NOW,
      products: [productFixture()],
      sourcePolicy: POLICY,
      store
    };

    const first = await runCommerceAutomationPoc({ ...input, batchId: "batch-001" });
    const second = await runCommerceAutomationPoc({ ...input, batchId: "batch-002" });

    expect(first.drafts).toHaveLength(1);
    expect(second.drafts).toHaveLength(0);
    expect(issueCodes(second.reviews[0])).toContain("DUPLICATE_PRODUCT");
  });

  test("retries the same batch after review persistence without timestamp poisoning", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "commerce-poc-"));
    temporaryDirectories.push(dataDir);
    const store = new FailOnceDraftStore(dataDir);
    const input = {
      batchId: "batch-retry",
      requestId: "request-retry",
      target: "activepieces" as const,
      now: NOW,
      products: [productFixture()],
      sourcePolicy: POLICY,
      store
    };

    await expect(runCommerceAutomationPoc(input)).rejects.toThrow("INJECTED_DRAFT_WRITE_FAILURE");

    const retried = await runCommerceAutomationPoc({ ...input, now: LATER_NOW });
    const retriedAgain = await runCommerceAutomationPoc({ ...input, now: LATEST_NOW });

    expect(retried.drafts).toHaveLength(1);
    expect(issueCodes(retried.reviews[0])).not.toContain("DUPLICATE_PRODUCT");
    expect(retried.reviews[0].reviewed_at).toBe(NOW);
    expect(retried.drafts[0].created_at).toBe(LATER_NOW);
    expect(retriedAgain.reviews).toEqual(retried.reviews);
    expect(retriedAgain.drafts).toEqual(retried.drafts);
    expect(await jsonlCount(join(dataDir, "staging-products.jsonl"))).toBe(1);
    expect(await jsonlCount(join(dataDir, "review-results.jsonl"))).toBe(1);
    expect(await jsonlCount(join(dataDir, "content-drafts.jsonl"))).toBe(1);
  });

  test("builds a stable run id for the same local input and source contract", () => {
    const input = {
      inputContent: `${JSON.stringify(productFixture())}\n`,
      allowedHost: "SHOP.EXAMPLE ",
      target: "activepieces" as const
    };

    expect(buildCommercePocRunId(input)).toBe(buildCommercePocRunId({
      ...input,
      allowedHost: "shop.example"
    }));
    expect(buildCommercePocRunId(input)).not.toBe(buildCommercePocRunId({
      ...input,
      target: "windmill"
    }));
  });

  test("uses a blocked notification adapter until Novu or another adapter is configured", async () => {
    const adapter = new BlockedCommerceNotificationAdapter();
    await expect(adapter.send({
      event_type: "commerce.poc.review_ready",
      request_id: "request-001",
      batch_id: "batch-001",
      review_passed: 1,
      review_blocked: 0,
      draft_ids: ["draft-001"]
    })).resolves.toEqual({
      dispatched: false,
      adapter: "blocked",
      blocker: "NOTIFICATION_ADAPTER_NOT_CONFIGURED"
    });
  });
});

function productFixture(overrides: Partial<CollectedProduct> = {}): CollectedProduct {
  return {
    schema_version: "1",
    product_name: "휴대용 정리함",
    price: 12900,
    image_url: "https://shop.example/images/organizer.jpg",
    stock_status: "in_stock",
    seller: "Example Store",
    collected_at: NOW,
    source_url: "https://shop.example/products/organizer",
    raw_hash: "a".repeat(64),
    ...overrides
  };
}

function issueCodes(review: ReturnType<typeof reviewCollectedProducts>[number]) {
  return review.issues.map((issue) => issue.code);
}

async function jsonlCount(path: string) {
  return (await readFile(path, "utf8")).trim().split(/\r?\n/).filter(Boolean).length;
}

class FailOnceDraftStore extends JsonlCommercePocStore {
  private shouldFail = true;

  override appendDrafts(batchId: string, records: Parameters<JsonlCommercePocStore["appendDrafts"]>[1]) {
    if (this.shouldFail) {
      this.shouldFail = false;
      return Promise.reject(new Error("INJECTED_DRAFT_WRITE_FAILURE"));
    }
    return super.appendDrafts(batchId, records);
  }
}
