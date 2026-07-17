import { createHash, createHmac } from "node:crypto";
import type { RenderPlan } from "@/lib/video/renderPlanTypes";

export type WorkerVisualFormat = "real_usage_storyboard" | "product_reference_repeat";

export type WorkerVisualBinding = {
  version: "1";
  issuer: "commerce-web-next-batch";
  queue_id: string;
  product_name_sha256: string;
  affiliate_url_sha256: string;
  script_sha256: string;
  render_plan_sha256: string;
  format_name: WorkerVisualFormat;
  target_category: string;
  manifest_purpose: "worker_video_render";
  scene_image_url_sha256: string[];
  scene_category_labels: string[];
  signature: string;
};

type BuildWorkerVisualBindingResult =
  | { ok: true; binding: WorkerVisualBinding }
  | { ok: false; message: string };

const MINIMUM_SECRET_LENGTH = 32;

export function buildWorkerVisualBinding(input: {
  queueId: string;
  productName: string;
  affiliateUrl: string;
  categoryPath: string;
  theme: string;
  keyword: string;
  renderPlan: RenderPlan;
  secret: string | undefined;
}): BuildWorkerVisualBindingResult {
  const secret = input.secret?.trim() ?? "";
  if (secret.length < MINIMUM_SECRET_LENGTH) {
    return { ok: false, message: "Worker visual binding secret is missing or too short." };
  }

  const targetCategory = normalizeCategory(
    [input.categoryPath, input.theme, input.keyword].find((value) => value.trim()) ?? ""
  );
  if (!targetCategory) {
    return { ok: false, message: "Server-authoritative product category is required." };
  }

  const shots = input.renderPlan.shots;
  if (shots.length === 0 || shots.some((shot) => !shot.image_url.trim() || !shot.voice_text.trim())) {
    return { ok: false, message: "Render plan cannot be bound without complete shots." };
  }

  const imageUrls = shots.map((shot) => shot.image_url.trim());
  const formatName = inferWorkerVisualFormat(imageUrls);
  const unsigned = {
    version: "1" as const,
    issuer: "commerce-web-next-batch" as const,
    queue_id: input.queueId.trim(),
    product_name_sha256: sha256(input.productName.trim()),
    affiliate_url_sha256: sha256(input.affiliateUrl.trim()),
    script_sha256: sha256(shots.map((shot) => shot.voice_text.trim()).join("\n")),
    render_plan_sha256: sha256(canonicalJson(input.renderPlan)),
    format_name: formatName,
    target_category: targetCategory,
    manifest_purpose: "worker_video_render" as const,
    scene_image_url_sha256: imageUrls.map(sha256),
    scene_category_labels: imageUrls.map(() => targetCategory)
  };

  return {
    ok: true,
    binding: {
      ...unsigned,
      signature: createHmac("sha256", secret).update(JSON.stringify(unsigned), "utf8").digest("hex")
    }
  };
}

export function inferWorkerVisualFormat(imageUrls: string[]): WorkerVisualFormat {
  const exactSourceCount = new Set(imageUrls.map((value) => value.trim())).size;
  return exactSourceCount >= 1 && exactSourceCount <= 3
    ? "product_reference_repeat"
    : "real_usage_storyboard";
}

function normalizeCategory(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 120);
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value: unknown) {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, sortJson(entry)])
    );
  }
  return value;
}
