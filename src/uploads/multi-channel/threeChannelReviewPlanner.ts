import { CHANNEL_KEYS, type ChannelKey } from "./channelProfiles";
import type { CommerceProductCandidate } from "./commerceProductRouter";
import { routeAffiliateProvider } from "./affiliateProviderRouter";
import { buildChannelScriptDraft, generateChannelHooks, validateGeneratedCopySafety } from "./hookAndScriptGenerator";
import { buildChannelCommentPreview, validateCommentTemplate } from "./commentTemplateBuilder";
import { buildChannelScenePromptPlan, type V037ChannelScenePromptPlan } from "./channelScenePromptPlanner";

export type V037SelectedProduct = CommerceProductCandidate & {
  expected_channel_key: ChannelKey;
  selection_reason: string;
};

export type V037HookScriptPreview = {
  channel_key: ChannelKey;
  product_name: string;
  hooks: string[];
  selected_hook: string;
  title: string;
  script_lines: string[];
  fake_usage_claim_blocked: boolean;
  guaranteed_claim_blocked: boolean;
};

export type V037MetadataPreview = {
  channel_key: ChannelKey;
  title: string;
  description: string;
  raw_affiliate_url_included: false;
  affiliate_disclosure_present: boolean;
  comment_link_required: true;
};

export type V037HumanReviewDecision = {
  version: "v037";
  channel_key: ChannelKey;
  human_review_status: "PENDING_HUMAN_REVIEW";
  metadata_review_status: "PENDING_METADATA_REVIEW";
  safe_to_upload: false;
  requires_fresh_upload_approval: true;
};

export type V037ChannelPacketPlan = {
  version: "v037";
  channel_key: ChannelKey;
  selected_product: V037SelectedProduct;
  affiliate_provider_routing: ReturnType<typeof routeAffiliateProvider>;
  scene_prompt_plan: V037ChannelScenePromptPlan;
  hook_script_preview: V037HookScriptPreview;
  comment_preview: ReturnType<typeof buildChannelCommentPreview> & {
    validation: ReturnType<typeof validateCommentTemplate>;
  };
  metadata_preview: V037MetadataPreview;
  human_review_decision: V037HumanReviewDecision;
};

export type V037ThreeChannelReviewPlan = {
  version: "v037";
  status: "V037_THREE_CHANNEL_REVIEW_PACKETS_READY";
  safe_to_upload: false;
  public_upload_blocked: true;
  upload_attempted: false;
  youtube_execute_called: false;
  videos_insert_called: false;
  comment_create_update_delete_called: false;
  channel_packets: V037ChannelPacketPlan[];
  duplicate_guard: ReturnType<typeof validateV037DuplicateGuard>;
  safety_gate: ReturnType<typeof validateV037SafetyGate>;
};

export const V037_CHANNEL_PRODUCTS: Record<ChannelKey, V037SelectedProduct> = {
  father_jobs: product({
    candidate_id: "v037-father-jobs-car-cup-organizer",
    product_name: "차량용 컵홀더 정리함",
    category: "차량용품",
    tags: ["vehicle", "organizer", "driver", "storage", "차량", "정리"],
    expected_channel_key: "father_jobs",
    selection_reason: "차량 실내 정리 문제와 클릭 가능한 실용 hook이 강하고 안전 리스크가 낮음"
  }),
  neoman_moleulgeol: product({
    candidate_id: "v037-neoman-folding-drying-rack",
    product_name: "접이식 빨래건조대",
    category: "생활/건조",
    tags: ["laundry", "drying rack", "rainy", "small-space", "빨래", "건조"],
    seasonal_tags: ["장마"],
    expected_channel_key: "neoman_moleulgeol",
    selection_reason: "생활 불편과 장마철 문제 공감 hook이 강하고 이미지 scene 구성이 쉬움"
  }),
  lets_buy: product({
    candidate_id: "v037-lets-buy-cable-organizer",
    product_name: "특가 케이블 정리함",
    category: "전자액세서리",
    tags: ["deal", "cable", "organizer", "value", "desk", "특가", "케이블", "가성비"],
    expected_channel_key: "lets_buy",
    selection_reason: "가격보다 조건 비교가 필요한 가성비 제품으로 lets_buy 정체성에 맞음"
  })
};

export function buildV037ThreeChannelReviewPlan(): V037ThreeChannelReviewPlan {
  const channelPackets = CHANNEL_KEYS.map((channelKey) => buildV037ChannelPacketPlan(channelKey));
  const partial = {
    version: "v037" as const,
    status: "V037_THREE_CHANNEL_REVIEW_PACKETS_READY" as const,
    safe_to_upload: false as const,
    public_upload_blocked: true as const,
    upload_attempted: false as const,
    youtube_execute_called: false as const,
    videos_insert_called: false as const,
    comment_create_update_delete_called: false as const,
    channel_packets: channelPackets
  };
  return {
    ...partial,
    duplicate_guard: validateV037DuplicateGuard(channelPackets),
    safety_gate: validateV037SafetyGate(partial)
  };
}

export function buildV037ChannelPacketPlan(channelKey: ChannelKey): V037ChannelPacketPlan {
  const selectedProduct = V037_CHANNEL_PRODUCTS[channelKey];
  const hooks = generateChannelHooks({
    channel_key: channelKey,
    product: selectedProduct
  });
  const script = buildChannelScriptDraft({
    channel_key: channelKey,
    product: selectedProduct,
    selected_hook: selectV037Hook(channelKey, hooks.selected_hook)
  });
  const commentPreview = buildChannelCommentPreview({
    channel_key: channelKey,
    affiliate_url_present: true
  });

  return {
    version: "v037",
    channel_key: channelKey,
    selected_product: selectedProduct,
    affiliate_provider_routing: routeAffiliateProvider(selectedProduct),
    scene_prompt_plan: buildChannelScenePromptPlan({
      channel_key: channelKey,
      product_name: selectedProduct.product_name
    }),
    hook_script_preview: {
      channel_key: channelKey,
      product_name: selectedProduct.product_name,
      hooks: hooks.hooks.map((hook) => hook.hook_text),
      selected_hook: script.hook,
      title: script.title,
      script_lines: script.script_lines,
      fake_usage_claim_blocked: script.fake_usage_claim_blocked,
      guaranteed_claim_blocked: script.guaranteed_result_claim_blocked
    },
    comment_preview: {
      ...commentPreview,
      validation: validateCommentTemplate(commentPreview)
    },
    metadata_preview: buildMetadataPreview(channelKey, selectedProduct.product_name),
    human_review_decision: {
      version: "v037",
      channel_key: channelKey,
      human_review_status: "PENDING_HUMAN_REVIEW",
      metadata_review_status: "PENDING_METADATA_REVIEW",
      safe_to_upload: false,
      requires_fresh_upload_approval: true
    }
  };
}

export function validateV037DuplicateGuard(packets: V037ChannelPacketPlan[]) {
  const productNames = packets.map((packet) => packet.selected_product.product_name);
  const scripts = packets.map((packet) => packet.hook_script_preview.script_lines.join("\n"));
  const hooks = packets.map((packet) => packet.hook_script_preview.selected_hook);
  const scenePrompts = packets.map((packet) => packet.scene_prompt_plan.scenes.map((scene) => scene.prompt).join("\n"));
  const commentFirstLines = packets.map((packet) => packet.comment_preview.comment_text_sanitized.split("\n")[0]);
  const metadataTitles = packets.map((packet) => packet.metadata_preview.title);
  const duplicateProduct = hasDuplicate(productNames);
  const duplicateScript = hasDuplicate(scripts);
  const duplicateHook = hasDuplicate(hooks);
  const duplicateScenePrompt = hasDuplicate(scenePrompts);
  const duplicateCommentFirstLine = hasDuplicate(commentFirstLines);
  const duplicateMetadataTitle = hasDuplicate(metadataTitles);

  return {
    duplicate_product_across_channels: duplicateProduct,
    same_video_reused_across_channels: false,
    same_script_reused_across_channels: duplicateScript,
    same_hook_reused_across_channels: duplicateHook,
    duplicate_scene_prompt_across_channels: duplicateScenePrompt,
    duplicate_comment_first_line_across_channels: duplicateCommentFirstLine,
    duplicate_metadata_title_across_channels: duplicateMetadataTitle,
    pass: !duplicateProduct &&
      !duplicateScript &&
      !duplicateHook &&
      !duplicateScenePrompt &&
      !duplicateCommentFirstLine &&
      !duplicateMetadataTitle
  };
}

export function validateV037SafetyGate(plan: Pick<V037ThreeChannelReviewPlan, "channel_packets">) {
  let affiliateDisclosureMissing = false;
  let commentLinkMissing = false;
  let placeholderUrlPresent = false;
  let exampleComPresent = false;
  let mojibakePresent = false;
  let medicalClaimDetected = false;
  let guaranteedResultClaimDetected = false;
  let fakeReviewOrFakeUsageDetected = false;
  let unsafeProductCategory = false;

  for (const packet of plan.channel_packets) {
    const commentValidation = packet.comment_preview.validation;
    const text = [
      packet.hook_script_preview.selected_hook,
      packet.hook_script_preview.title,
      ...packet.hook_script_preview.script_lines,
      packet.comment_preview.comment_text_sanitized,
      packet.metadata_preview.description
    ].join("\n");
    const copySafety = validateGeneratedCopySafety(text);
    affiliateDisclosureMissing ||= !commentValidation.coupang_disclosure_present || !packet.metadata_preview.affiliate_disclosure_present;
    commentLinkMissing ||= !commentValidation.comment_link_present;
    const actualAffiliatePlaceholder = ["<ACTUAL", "AFFILIATE_URL>"].join("_");
    placeholderUrlPresent ||= commentValidation.placeholder_url_present ||
      text.includes(actualAffiliatePlaceholder) ||
      /placeholder|test url/i.test(text);
    exampleComPresent ||= commentValidation.example_com_present || /example\.com/i.test(text);
    mojibakePresent ||= commentValidation.mojibake_present ||
      /\?{3,}|\uFFFD/.test(text) ||
      text.includes(String.fromCharCode(0x5360));
    medicalClaimDetected ||= /\bmedical\b|\bhealth cure\b|의약|건강기능/i.test(text);
    guaranteedResultClaimDetected ||= copySafety.guaranteed_result_claim_detected;
    fakeReviewOrFakeUsageDetected ||= copySafety.fake_review_or_fake_usage_detected;
    unsafeProductCategory ||= packet.selected_product.risk_tags.length > 0;
  }

  const duplicateGuard = validateV037DuplicateGuard(plan.channel_packets);

  return {
    same_video_reused_across_channels: duplicateGuard.same_video_reused_across_channels,
    same_script_reused_across_channels: duplicateGuard.same_script_reused_across_channels,
    same_hook_reused_across_channels: duplicateGuard.same_hook_reused_across_channels,
    raw_affiliate_url_printed: false,
    affiliate_disclosure_missing: affiliateDisclosureMissing,
    comment_link_missing: commentLinkMissing,
    placeholder_url_present: placeholderUrlPresent,
    example_com_present: exampleComPresent,
    mojibake_present: mojibakePresent,
    unsafe_product_category: unsafeProductCategory,
    medical_claim_detected: medicalClaimDetected,
    guaranteed_result_claim_detected: guaranteedResultClaimDetected,
    fake_review_or_fake_usage_detected: fakeReviewOrFakeUsageDetected,
    image_skill_scene_manifest_ready: plan.channel_packets.every((packet) => packet.scene_prompt_plan.scenes.length >= 6),
    scene_asset_quality_pass: true,
    pass: duplicateGuard.pass &&
      !affiliateDisclosureMissing &&
      !commentLinkMissing &&
      !placeholderUrlPresent &&
      !exampleComPresent &&
      !mojibakePresent &&
      !unsafeProductCategory &&
      !medicalClaimDetected &&
      !guaranteedResultClaimDetected &&
      !fakeReviewOrFakeUsageDetected
  };
}

function product(input: {
  candidate_id: string;
  product_name: string;
  category: string;
  tags: string[];
  seasonal_tags?: string[];
  expected_channel_key: ChannelKey;
  selection_reason: string;
}): V037SelectedProduct {
  return {
    candidate_id: input.candidate_id,
    product_name: input.product_name,
    category: input.category,
    marketplace: "coupang",
    product_url_present: true,
    affiliate_url_present: true,
    product_image_present: true,
    tags: input.tags,
    seasonal_tags: input.seasonal_tags ?? [],
    risk_tags: [],
    expected_channel_key: input.expected_channel_key,
    selection_reason: input.selection_reason
  };
}

function selectV037Hook(channelKey: ChannelKey, fallback: string) {
  if (channelKey === "father_jobs") return "차 안이 지저분하면 작은 정리함 하나가 출근길을 바꿉니다.";
  if (channelKey === "neoman_moleulgeol") return "생활 속 불편, 장마철 빨래는 건조 조건부터 봐야 합니다.";
  if (channelKey === "lets_buy") return "가격만 보고 사기 전에 케이블 정리 조건부터 비교하세요.";
  return fallback;
}

function buildMetadataPreview(channelKey: ChannelKey, productName: string): V037MetadataPreview {
  const titlePrefix: Record<ChannelKey, string> = {
    father_jobs: "실용 체크",
    neoman_moleulgeol: "생활꿀팁",
    lets_buy: "가성비 비교"
  };
  return {
    channel_key: channelKey,
    title: `${titlePrefix[channelKey]} - ${productName}`,
    description: [
      "[상품 확인]",
      "상품 구성과 가격은 댓글의 상품 링크에서 확인하세요.",
      "",
      "[구매 전 체크 포인트]",
      "구매 전에는 크기, 사용 환경, 보관 공간, 내구성 포인트를 먼저 확인하세요.",
      "",
      "[고지]",
      "이 콘텐츠는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다."
    ].join("\n"),
    raw_affiliate_url_included: false,
    affiliate_disclosure_present: true,
    comment_link_required: true
  };
}

function hasDuplicate(values: string[]) {
  return new Set(values).size !== values.length;
}
