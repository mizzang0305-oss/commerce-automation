import { describe, expect, test } from "vitest";
import type { RenderPlan } from "@/lib/video/renderPlanTypes";
import { buildWorkerVisualBinding } from "@/lib/server/workerVisualBinding";

const SECRET = "v140-test-secret-0123456789abcdef";
const EXPECTED_SIGNATURE = "74ca7a4c1c3db3b2ffddd3659fd15366f1b020c3a7abc287fe325d3223c540cf";

describe("server-authoritative Worker visual binding", () => {
  test("matches the Python cross-runtime HMAC vector", () => {
    const result = buildWorkerVisualBinding({
      queueId: "queue-visual-001",
      productName: "Rear seat organizer",
      affiliateUrl: "https://link.coupang.com/a/visual",
      categoryPath: "vehicle",
      theme: "",
      keyword: "",
      renderPlan: renderPlanFixture(),
      secret: SECRET
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.message);
    }
    expect(result.binding).toMatchObject({
      version: "1",
      issuer: "commerce-web-next-batch",
      queue_id: "queue-visual-001",
      format_name: "product_reference_repeat",
      target_category: "vehicle",
      manifest_purpose: "worker_video_render",
      scene_category_labels: ["vehicle", "vehicle", "vehicle", "vehicle", "vehicle"],
      signature: EXPECTED_SIGNATURE
    });
    expect(JSON.stringify(result.binding)).not.toContain(SECRET);
  });

  test("changes the signature when a bound script, image, or creative policy changes", () => {
    const base = buildFixture(renderPlanFixture());
    const scriptSpoof = renderPlanFixture();
    scriptSpoof.shots[0].voice_text = "Spoofed script";
    const imageSpoof = renderPlanFixture();
    imageSpoof.shots[0].image_url = "https://evil.invalid/spoof.jpg";
    const policySpoof = renderPlanFixture();
    policySpoof.creative_policy = {
      ...policySpoof.creative_policy!,
      real_usage_scene_present: true,
      usage_source_role: "generic_usage_example"
    };

    const changedScript = buildFixture(scriptSpoof);
    const changedImage = buildFixture(imageSpoof);
    const changedPolicy = buildFixture(policySpoof);

    expect(base.ok && changedScript.ok && changedImage.ok && changedPolicy.ok).toBe(true);
    if (!base.ok || !changedScript.ok || !changedImage.ok || !changedPolicy.ok) {
      throw new Error("fixture binding failed");
    }
    expect(changedScript.binding.signature).not.toBe(base.binding.signature);
    expect(changedImage.binding.signature).not.toBe(base.binding.signature);
    expect(changedPolicy.binding.signature).not.toBe(base.binding.signature);
  });

  test("fails closed for a missing or short secret", () => {
    const result = buildWorkerVisualBinding({
      queueId: "queue-visual-001",
      productName: "Rear seat organizer",
      affiliateUrl: "https://link.coupang.com/a/visual",
      categoryPath: "vehicle",
      theme: "",
      keyword: "",
      renderPlan: renderPlanFixture(),
      secret: "short"
    });

    expect(result).toEqual({ ok: false, message: "Worker visual binding secret is missing or too short." });
  });
});

function buildFixture(renderPlan: RenderPlan) {
  return buildWorkerVisualBinding({
    queueId: "queue-visual-001",
    productName: "Rear seat organizer",
    affiliateUrl: "https://link.coupang.com/a/visual",
    categoryPath: "vehicle",
    theme: "",
    keyword: "",
    renderPlan,
    secret: SECRET
  });
}

function renderPlanFixture(): RenderPlan {
  const imageUrl = "https://image.example/product.jpg";
  const voices = ["Line one", "Line two", "Line three", "Line four", "Line five"];
  return {
    version: "1",
    queue_id: "queue-visual-001",
    product_name: "Rear seat organizer",
    source: "storyboard_template",
    disclosure_text: "Affiliate disclosure",
    creative_policy: {
      real_usage_scene_present: false,
      usage_source_role: "product_reference_still",
      usage_label_present: false,
      exact_product_identity_claim: false,
      exact_product_identity_verified: false,
      actor_nationality_claim: null,
      actor_nationality_verified: false
    },
    shots: voices.map((voice, index) => ({
      shot_id: `shot-${index + 1}`,
      duration_sec: 4,
      layout: "detail_check",
      image_role: "product",
      image_url: imageUrl,
      caption: `Caption ${index + 1}`,
      voice_text: voice,
      safe_area: "center_focus",
      metadata: { source: "template", sequence: index + 1 }
    })),
    render_target: { width: 1080, height: 1920, fps: 30, aspect_ratio: "9:16" },
    safety: {
      external_api_call: false,
      platform_upload: false,
      vimax_dependency: false,
      worker_jobs_created: false
    }
  };
}
