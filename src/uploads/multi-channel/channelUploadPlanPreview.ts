import fs from "node:fs/promises";
import path from "node:path";

import { type ChannelKey, getChannelProfiles, getChannelProfile } from "./channelProfiles";
import {
  type ChannelRoutingResult,
  type CommerceProductCandidate,
  hasUnsafeProductCategory,
  routeCommerceProduct
} from "./commerceProductRouter";
import { routeAffiliateProvider, type AffiliateProviderRoutingResult } from "./affiliateProviderRouter";
import { buildChannelScriptDraft, generateChannelHooks, validateGeneratedCopySafety, type ChannelHookSet, type ChannelScriptDraft } from "./hookAndScriptGenerator";
import { buildChannelCommentPreview, validateCommentTemplate, type ChannelCommentPreview } from "./commentTemplateBuilder";

export type ChannelScenePromptPlan = {
  channel_key: ChannelKey;
  candidate_id: string;
  product_name: string;
  scene_prompts: Array<{
    scene_key: string;
    purpose: string;
    prompt: string;
    required_visuals: string[];
    forbidden_visuals: string[];
  }>;
};

export type ChannelUploadPlan = {
  candidate: CommerceProductCandidate;
  routing: ChannelRoutingResult;
  provider_routing: AffiliateProviderRoutingResult;
  hook_set: ChannelHookSet;
  script: ChannelScriptDraft;
  scene_prompt_plan: ChannelScenePromptPlan;
  comment_preview: ChannelCommentPreview;
};

export type MultiChannelCommercePlan = {
  version: "v036";
  status: "V036_MULTI_CHANNEL_COMMERCE_ROUTER_READY";
  upload_attempted: false;
  youtube_execute_called: false;
  videos_insert_called: false;
  comment_create_update_delete_called: false;
  raw_affiliate_url_printed: false;
  channels: ReturnType<typeof getChannelProfiles>;
  sample_product_count: number;
  plans: ChannelUploadPlan[];
  routing_accuracy_check: {
    expected_count: number;
    matched_count: number;
    pass: boolean;
  };
  duplicate_cross_channel_guard: {
    same_product_same_script_cross_channel: boolean;
    same_video_reused_across_channels: boolean;
    pass: boolean;
  };
  safety_risk_report: SafetyRiskReport;
};

export type SafetyRiskReport = {
  unsafe_product_category: boolean;
  medical_claim_detected: boolean;
  guaranteed_result_claim_detected: boolean;
  fake_review_or_fake_usage_detected: boolean;
  affiliate_disclosure_missing: boolean;
  comment_link_missing: boolean;
  placeholder_url_present: boolean;
  example_com_present: boolean;
  mojibake_present: boolean;
  raw_affiliate_url_printed: false;
  upload_attempted: false;
  blockers: string[];
};

export const V036_SAMPLE_PRODUCTS: CommerceProductCandidate[] = [
  sample("sample-drying-rack", "\uC811\uC774\uC2DD \uBE68\uB798\uAC74\uC870\uB300", "\uC0DD\uD65C/\uAC74\uC870", ["laundry", "drying rack", "\uC7A5\uB9C8"], ["rainy"], "coupang"),
  sample("sample-car-cup-organizer", "\uCC28\uB7C9\uC6A9 \uCEF5\uD640\uB354 \uC815\uB9AC\uD568", "\uCC28\uB7C9\uC6A9\uD488", ["vehicle", "organizer", "driver"], [], "coupang"),
  sample("sample-driver-bit", "\uC804\uB3D9 \uB4DC\uB77C\uC774\uBC84 \uBE44\uD2B8\uC138\uD2B8", "\uACF5\uAD6C", ["tool", "driver", "work"], [], "coupang"),
  sample("sample-tumbler-bottle", "\uD140\uBE14\uB7EC \uBB3C\uBCD1", "\uC0DD\uD65C/\uC8FC\uBC29", ["kitchen", "daily", "storage"], [], "coupang"),
  sample("sample-bathroom-brush", "\uD654\uC7A5\uC2E4 \uACF0\uD321\uC774 \uC81C\uAC70 \uBE0C\uB7EC\uC2DC", "\uCCAD\uC18C/\uD654\uC7A5\uC2E4", ["cleaning", "bathroom", "life hack"], ["humid"], "coupang"),
  sample("sample-shoe-rack", "\uD604\uAD00 \uC815\uB9AC \uC218\uB0A9\uD568", "\uC218\uB0A9/\uC815\uB9AC", ["storage", "home", "life hack"], [], "coupang"),
  sample("sample-mini-fan", "\uC2E0\uD488 \uBBF8\uB2C8 \uC120\uD48D\uAE30", "\uC18C\uD615\uAC00\uC804", ["mini fan", "electronics", "new product", "value"], ["summer"], "coupang"),
  sample("sample-cable-organizer", "\uD2B9\uAC00 \uCF00\uC774\uBE14 \uC815\uB9AC\uD568", "\uC804\uC790\uC561\uC138\uC11C\uB9AC", ["deal", "cable", "organizer", "value"], [], "coupang"),
  sample("sample-wrist-mouse-pad", "\uC190\uBAA9 \uBCF4\uD638 \uB9C8\uC6B0\uC2A4\uD328\uB4DC", "\uC0AC\uBB34\uC6A9\uD488", ["office", "protection", "work"], [], "coupang")
];

const EXPECTED_SAMPLE_ROUTES: Record<string, ChannelKey> = {
  "sample-drying-rack": "neoman_moleulgeol",
  "sample-car-cup-organizer": "father_jobs",
  "sample-driver-bit": "father_jobs",
  "sample-tumbler-bottle": "neoman_moleulgeol",
  "sample-bathroom-brush": "neoman_moleulgeol",
  "sample-shoe-rack": "neoman_moleulgeol",
  "sample-mini-fan": "lets_buy",
  "sample-cable-organizer": "lets_buy",
  "sample-wrist-mouse-pad": "father_jobs"
};

export function buildMultiChannelCommercePlan(candidates: CommerceProductCandidate[] = V036_SAMPLE_PRODUCTS): MultiChannelCommercePlan {
  const plans = candidates.map(buildChannelUploadPlan);
  const routingAccuracy = calculateRoutingAccuracy(plans.map((plan) => plan.routing));
  const duplicateGuard = validateDuplicateCrossChannelGuard(candidates[0]);
  const safetyRiskReport = buildSafetyRiskReport(plans);

  return {
    version: "v036",
    status: "V036_MULTI_CHANNEL_COMMERCE_ROUTER_READY",
    upload_attempted: false,
    youtube_execute_called: false,
    videos_insert_called: false,
    comment_create_update_delete_called: false,
    raw_affiliate_url_printed: false,
    channels: getChannelProfiles(),
    sample_product_count: candidates.length,
    plans,
    routing_accuracy_check: routingAccuracy,
    duplicate_cross_channel_guard: duplicateGuard,
    safety_risk_report: safetyRiskReport
  };
}

export function buildChannelUploadPlan(candidate: CommerceProductCandidate): ChannelUploadPlan {
  const routing = routeCommerceProduct(candidate);
  const providerRouting = routeAffiliateProvider(candidate);
  const hookSet = generateChannelHooks({
    channel_key: routing.selected_channel_key,
    product: candidate
  });
  const script = buildChannelScriptDraft({
    channel_key: routing.selected_channel_key,
    product: candidate,
    selected_hook: hookSet.selected_hook
  });
  const scenePromptPlan = buildChannelScenePromptPlan({
    channel_key: routing.selected_channel_key,
    candidate
  });
  const commentPreview = buildChannelCommentPreview({
    channel_key: routing.selected_channel_key,
    affiliate_url_present: candidate.affiliate_url_present
  });

  return {
    candidate,
    routing,
    provider_routing: providerRouting,
    hook_set: hookSet,
    script,
    scene_prompt_plan: scenePromptPlan,
    comment_preview: commentPreview
  };
}

export function buildChannelScenePromptPlan(input: {
  channel_key: ChannelKey;
  candidate: CommerceProductCandidate;
}): ChannelScenePromptPlan {
  const profile = getChannelProfile(input.channel_key);
  const base = `${input.candidate.product_name} for ${profile.display_name}`;
  return {
    channel_key: input.channel_key,
    candidate_id: input.candidate.candidate_id,
    product_name: input.candidate.product_name,
    scene_prompts: [
      scene("scene_01_hook", "show the opening problem", `${base}, ${profile.scene_tone[0]}, clear problem state, portrait commerce shorts frame`),
      scene("scene_02_check", "show buyer checklist", `${base}, size load storage checklist, readable object scale, no text in image`),
      scene("scene_03_use", "show practical use context", `${base}, ${profile.scene_tone[1]}, realistic hands or room context`),
      scene("scene_04_compare", "show comparison or result", `${base}, ${profile.scene_tone[2]}, before after or condition comparison`),
      scene("scene_05_cta", "show final CTA setup", `${base}, ${profile.scene_tone[3]}, product centered, comment link CTA planned outside image`)
    ]
  };
}

export async function writeV036MultiChannelCommercePreviewArtifacts(input: {
  cwd?: string;
  candidates?: CommerceProductCandidate[];
} = {}) {
  const cwd = input.cwd ?? process.cwd();
  const outputDir = path.join(cwd, "commerce-assets", "review", "v036");
  const plan = buildMultiChannelCommercePlan(input.candidates);
  await fs.mkdir(outputDir, { recursive: true });

  const paths = {
    multi_channel_plan: path.join(outputDir, "multi-channel-commerce-plan.json"),
    routing_preview_html: path.join(outputDir, "channel-routing-preview.html"),
    hook_preview_json: path.join(outputDir, "channel-hook-preview.json"),
    comment_preview_json: path.join(outputDir, "channel-comment-preview.json"),
    provider_routing_preview: path.join(outputDir, "affiliate-provider-routing-preview.json"),
    safety_risk_report: path.join(outputDir, "safety-risk-report.json")
  };
  await fs.writeFile(paths.multi_channel_plan, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  await fs.writeFile(paths.routing_preview_html, buildRoutingPreviewHtml(plan), "utf8");
  await fs.writeFile(paths.hook_preview_json, `${JSON.stringify(plan.plans.map((item) => item.hook_set), null, 2)}\n`, "utf8");
  await fs.writeFile(paths.comment_preview_json, `${JSON.stringify(plan.plans.map((item) => item.comment_preview), null, 2)}\n`, "utf8");
  await fs.writeFile(paths.provider_routing_preview, `${JSON.stringify(plan.plans.map((item) => item.provider_routing), null, 2)}\n`, "utf8");
  await fs.writeFile(paths.safety_risk_report, `${JSON.stringify(plan.safety_risk_report, null, 2)}\n`, "utf8");

  return {
    FINAL_STATUS: "SUCCESS_V036_MULTI_CHANNEL_COMMERCE_ROUTER_READY" as const,
    plan,
    artifact_paths: paths,
    youtube_execute_called: false,
    videos_insert_called: false,
    new_upload_attempted: false,
    comment_create_update_delete_called: false,
    raw_urls_printed: false,
    secrets_printed: false
  };
}

export function calculateRoutingAccuracy(results: ChannelRoutingResult[]) {
  const matched = results.filter((result) =>
    EXPECTED_SAMPLE_ROUTES[result.candidate_id] === result.selected_channel_key
  ).length;
  return {
    expected_count: Object.keys(EXPECTED_SAMPLE_ROUTES).length,
    matched_count: matched,
    pass: matched === Object.keys(EXPECTED_SAMPLE_ROUTES).length
  };
}

export function validateDuplicateCrossChannelGuard(candidate: CommerceProductCandidate) {
  const scripts = new Set<string>();
  const comments = new Set<string>();
  for (const channelKey of ["father_jobs", "neoman_moleulgeol", "lets_buy"] as const) {
    scripts.add(buildChannelScriptDraft({ channel_key: channelKey, product: candidate }).script_lines.join("\n"));
    comments.add(buildChannelCommentPreview({ channel_key: channelKey, affiliate_url_present: true }).comment_text_sanitized);
  }
  return {
    same_product_same_script_cross_channel: scripts.size !== 3,
    same_video_reused_across_channels: false,
    pass: scripts.size === 3 && comments.size === 3
  };
}

export function buildSafetyRiskReport(plans: ChannelUploadPlan[]): SafetyRiskReport {
  const blockers: string[] = [];
  let affiliateDisclosureMissing = false;
  let commentLinkMissing = false;
  let placeholderUrlPresent = false;
  let exampleComPresent = false;
  let mojibakePresent = false;
  let medicalClaimDetected = false;
  let guaranteedResultClaimDetected = false;
  let fakeReviewOrFakeUsageDetected = false;
  let unsafeProductCategory = false;

  for (const plan of plans) {
    const copySafety = validateGeneratedCopySafety([
      plan.script.title,
      plan.script.hook,
      ...plan.script.script_lines
    ].join("\n"));
    const commentValidation = validateCommentTemplate(plan.comment_preview);
    unsafeProductCategory ||= hasUnsafeProductCategory(plan.candidate);
    medicalClaimDetected ||= plan.candidate.risk_tags.some((tag) => /medical|health|\uC758\uC57D|\uAC74\uAC15/i.test(tag));
    guaranteedResultClaimDetected ||= copySafety.guaranteed_result_claim_detected;
    fakeReviewOrFakeUsageDetected ||= copySafety.fake_review_or_fake_usage_detected;
    affiliateDisclosureMissing ||= !commentValidation.coupang_disclosure_present;
    commentLinkMissing ||= !commentValidation.comment_link_present;
    placeholderUrlPresent ||= commentValidation.placeholder_url_present;
    exampleComPresent ||= commentValidation.example_com_present;
    mojibakePresent ||= commentValidation.mojibake_present;
  }

  if (unsafeProductCategory) blockers.push("unsafe_product_category");
  if (medicalClaimDetected) blockers.push("medical_claim_detected");
  if (guaranteedResultClaimDetected) blockers.push("guaranteed_result_claim_detected");
  if (fakeReviewOrFakeUsageDetected) blockers.push("fake_review_or_fake_usage_detected");
  if (affiliateDisclosureMissing) blockers.push("affiliate_disclosure_missing");
  if (commentLinkMissing) blockers.push("comment_link_missing");
  if (placeholderUrlPresent) blockers.push("placeholder_url_present");
  if (exampleComPresent) blockers.push("example_com_present");
  if (mojibakePresent) blockers.push("mojibake_present");

  return {
    unsafe_product_category: unsafeProductCategory,
    medical_claim_detected: medicalClaimDetected,
    guaranteed_result_claim_detected: guaranteedResultClaimDetected,
    fake_review_or_fake_usage_detected: fakeReviewOrFakeUsageDetected,
    affiliate_disclosure_missing: affiliateDisclosureMissing,
    comment_link_missing: commentLinkMissing,
    placeholder_url_present: placeholderUrlPresent,
    example_com_present: exampleComPresent,
    mojibake_present: mojibakePresent,
    raw_affiliate_url_printed: false,
    upload_attempted: false,
    blockers
  };
}

function sample(
  candidate_id: string,
  product_name: string,
  category: string,
  tags: string[],
  seasonal_tags: string[],
  marketplace: CommerceProductCandidate["marketplace"]
): CommerceProductCandidate {
  return {
    candidate_id,
    product_name,
    category,
    marketplace,
    price: 19900,
    product_url_present: true,
    affiliate_url_present: true,
    product_image_present: true,
    tags,
    seasonal_tags,
    risk_tags: []
  };
}

function scene(scene_key: string, purpose: string, prompt: string) {
  return {
    scene_key,
    purpose,
    prompt,
    required_visuals: ["real product visible", "portrait shorts framing", "clear use context"],
    forbidden_visuals: ["fake review text", "guaranteed result claim", "raw URL in image", "watermark"]
  };
}

function buildRoutingPreviewHtml(plan: MultiChannelCommercePlan) {
  const rows = plan.plans.map((item) => {
    const profile = getChannelProfile(item.routing.selected_channel_key);
    return `<tr><td>${escapeHtml(item.candidate.product_name)}</td><td>${escapeHtml(profile.display_name)}</td><td>${item.routing.channel_fit_score}</td><td>${item.routing.hook_strength_score}</td><td>${item.routing.safety_risk_score}</td></tr>`;
  }).join("\n");
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>v036 Multi-Channel Commerce Router Preview</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #17202a; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d5d8dc; padding: 8px; text-align: left; }
    th { background: #f2f4f7; }
  </style>
</head>
<body>
  <h1>v036 Multi-Channel Commerce Router Preview</h1>
  <p>Upload execution is blocked. This preview contains sanitized routing, hooks, comments, providers, and scene prompt plans.</p>
  <table>
    <thead><tr><th>Product</th><th>Selected channel</th><th>Fit</th><th>Hook</th><th>Risk</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>
`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
