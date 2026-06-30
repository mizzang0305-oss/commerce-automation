import { type ChannelKey, getChannelProfile } from "./channelProfiles";
import type { CommerceProductCandidate } from "./commerceProductRouter";

export type HookType = "loss_aversion" | "mistake_prevention" | "problem_empathy" | "comparison" | "targeted";

export type ChannelHookSet = {
  channel_key: ChannelKey;
  product_name: string;
  hooks: Array<{
    hook_text: string;
    hook_type: HookType;
    strength_score: number;
    risk_score: number;
    reason: string;
  }>;
  selected_hook: string;
};

export type ChannelScriptDraft = {
  channel_key: ChannelKey;
  product_name: string;
  title: string;
  hook: string;
  script_lines: string[];
  disclosure_line: string;
  fake_usage_claim_blocked: true;
  guaranteed_result_claim_blocked: true;
  risk_score: number;
};

const FORBIDDEN_CLAIM_PATTERNS = [
  /guarantee/i,
  /100%/,
  /cure/i,
  /\uBB34\uC870\uAC74/,
  /\uBCF4\uC7A5/,
  /\uC644\uC804\s*\uD574\uACB0/,
  /\uC2E4\uC81C\uB85C\s*\uC368\s*\uBD24/,
  /\uB0B4\uB3C8\uB0B4\uC0B0/
];

export function generateChannelHooks(input: {
  channel_key: ChannelKey;
  product: CommerceProductCandidate;
}): ChannelHookSet {
  const profile = getChannelProfile(input.channel_key);
  const productName = input.product.product_name;
  const hooks = buildHookTemplates(input.channel_key, productName).map((hook, index) => {
    const riskScore = calculateHookRiskScore(hook.text);
    return {
      hook_text: hook.text,
      hook_type: hook.type,
      strength_score: Math.max(55, Math.min(96, 92 - index * 5 - riskScore)),
      risk_score: riskScore,
      reason: `${profile.display_name} ${hook.type} opener for ${productName}.`
    };
  });
  const selected = hooks
    .filter((hook) => hook.risk_score < 30)
    .sort((left, right) => right.strength_score - left.strength_score)[0] ?? hooks[0];

  return {
    channel_key: input.channel_key,
    product_name: productName,
    hooks,
    selected_hook: selected.hook_text
  };
}

export function buildChannelScriptDraft(input: {
  channel_key: ChannelKey;
  product: CommerceProductCandidate;
  selected_hook?: string;
}): ChannelScriptDraft {
  const hookSet = generateChannelHooks({
    channel_key: input.channel_key,
    product: input.product
  });
  const profile = getChannelProfile(input.channel_key);
  const hook = input.selected_hook ?? hookSet.selected_hook;
  const productName = input.product.product_name;
  const title = buildChannelTitle(input.channel_key, productName);
  const scriptLines = [
    hook,
    buildProblemLine(input.channel_key, productName),
    "\uAD6C\uB9E4 \uC804\uC5D0\uB294 \uD06C\uAE30, \uD558\uC911, \uBCF4\uAD00\uACF5\uAC04\uC744 \uBA3C\uC800 \uD655\uC778\uD558\uC138\uC694.",
    buildChannelSpecificLine(input.channel_key),
    "\uC0C1\uD488 \uB9C1\uD06C\uB294 \uB313\uAE00\uC5D0\uC11C \uD655\uC778\uD558\uC138\uC694."
  ];
  const combined = [title, ...scriptLines].join("\n");

  return {
    channel_key: input.channel_key,
    product_name: productName,
    title,
    hook,
    script_lines: scriptLines,
    disclosure_line: "\uCFE0\uD321 \uD30C\uD2B8\uB108\uC2A4 \uD65C\uB3D9\uC73C\uB85C \uC218\uC218\uB8CC\uB97C \uC81C\uACF5\uBC1B\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
    fake_usage_claim_blocked: true,
    guaranteed_result_claim_blocked: true,
    risk_score: calculateHookRiskScore(combined) + profile.avoid_categories.length * 0
  };
}

export function validateGeneratedCopySafety(text: string) {
  const forbidden_hits = FORBIDDEN_CLAIM_PATTERNS
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.source);
  return {
    safe: forbidden_hits.length === 0,
    forbidden_hits,
    fake_review_or_fake_usage_detected: /\uC2E4\uC81C\uB85C\s*\uC368\s*\uBD24|\uB0B4\uB3C8\uB0B4\uC0B0/i.test(text),
    guaranteed_result_claim_detected: /guarantee|100%|\uBB34\uC870\uAC74|\uBCF4\uC7A5|\uC644\uC804\s*\uD574\uACB0/i.test(text)
  };
}

function buildHookTemplates(channelKey: ChannelKey, productName: string): Array<{ type: HookType; text: string }> {
  if (channelKey === "father_jobs") {
    return [
      { type: "targeted", text: `\uC9D1\uC548\uC77C\uC774 \uACC4\uC18D \uBC00\uB9B0\uB2E4\uBA74 ${productName} \uC870\uAC74\uBD80\uD130 \uBCF4\uC138\uC694.` },
      { type: "mistake_prevention", text: `\uC0AC\uAE30 \uC804\uC5D0 ${productName} \uD06C\uAE30\uC640 \uBCF4\uAD00\uC131\uC744 \uBA3C\uC800 \uCCB4\uD06C\uD558\uC138\uC694.` },
      { type: "problem_empathy", text: `\uC791\uC740 \uACF5\uAC04\uC5D0\uC11C \uC77C\uC774 \uB298\uC5B4\uB098\uBA74 \uC815\uB9AC\uBD80\uD130 \uBD10\uC57C \uD569\uB2C8\uB2E4.` },
      { type: "comparison", text: `\uAC19\uC740 \uC6A9\uB3C4\uB77C\uB3C4 \uD558\uC911\uACFC \uBCF4\uAD00 \uBC29\uC2DD\uC740 \uCC28\uC774\uAC00 \uD07D\uB2C8\uB2E4.` },
      { type: "loss_aversion", text: `\uC774\uAC70 \uC5C6\uC774 \uC9D1\uC548\uC77C\uD558\uBA74 \uC2DC\uAC04\uC774 \uB354 \uAC78\uB9B4 \uC218 \uC788\uC2B5\uB2C8\uB2E4.` }
    ];
  }
  if (channelKey === "lets_buy") {
    return [
      { type: "comparison", text: `${productName}, \uAC00\uACA9\uB9CC \uBCF4\uC9C0 \uB9D0\uACE0 \uC870\uAC74\uBD80\uD130 \uBE44\uAD50\uD574\uBCF4\uC138\uC694.` },
      { type: "mistake_prevention", text: `\uD2B9\uAC00\uB77C\uACE0 \uBC14\uB85C \uC0AC\uAE30 \uC804\uC5D0 ${productName} \uCCB4\uD06C\uD3EC\uC778\uD2B8\uB97C \uBCF4\uC138\uC694.` },
      { type: "targeted", text: `\uAC00\uC131\uBE44\uB97C \uCC3E\uB294 \uBD84\uC774\uB77C\uBA74 ${productName} \uC870\uAC74\uC744 \uD655\uC778\uD558\uC138\uC694.` },
      { type: "loss_aversion", text: `\uC2FC \uAC00\uACA9\uC774\uB77C\uB3C4 \uD06C\uAE30\uC640 \uB0B4\uAD6C\uC131\uC774 \uC548 \uB9DE\uC73C\uBA74 \uC190\uD574\uC785\uB2C8\uB2E4.` },
      { type: "problem_empathy", text: `\uB611\uAC19\uC544 \uBCF4\uC774\uB294 \uC81C\uD488\uB3C4 \uBE44\uAD50\uD558\uBA74 \uCC28\uC774\uAC00 \uB098\uC635\uB2C8\uB2E4.` }
    ];
  }
  return [
    { type: "loss_aversion", text: `${productName}, \uC774\uAC70 \uBAA8\uB974\uBA74 \uBD88\uD3B8\uD568\uC774 \uACC4\uC18D\uB420 \uC218 \uC788\uC2B5\uB2C8\uB2E4.` },
    { type: "mistake_prevention", text: `\uAD6C\uB9E4 \uC804\uC5D0 ${productName} \uD06C\uAE30\u00B7\uD558\uC911\u00B7\uBCF4\uAD00\uC131 \uC138 \uAC00\uC9C0\uB294 \uAF2D \uBCF4\uC138\uC694.` },
    { type: "problem_empathy", text: `\uC7A5\uB9C8\uCCA0 \uC2E4\uB0B4\uC0DD\uD65C\uC774 \uBD88\uD3B8\uD558\uBA74 ${productName} \uC870\uAC74\uBD80\uD130 \uBCF4\uC138\uC694.` },
    { type: "comparison", text: `\uBE44\uC2B7\uD55C \uC0DD\uD65C\uC6A9\uD488\uB3C4 \uBCF4\uAD00 \uBC29\uC2DD\uC5D0\uC11C \uCC28\uC774\uAC00 \uB0A9\uB2C8\uB2E4.` },
    { type: "targeted", text: `\uC791\uC740 \uC9D1\uC5D0\uC11C \uC0AC\uB294 \uBD84\uC740 ${productName} \uC0AC\uC774\uC988\uB97C \uBA3C\uC800 \uBCF4\uC138\uC694.` }
  ];
}

function buildChannelTitle(channelKey: ChannelKey, productName: string) {
  if (channelKey === "father_jobs") return `${productName} \uC2E4\uC6A9 \uCCB4\uD06C\uD3EC\uC778\uD2B8`;
  if (channelKey === "lets_buy") return `${productName} \uAC00\uC131\uBE44 \uBE44\uAD50 \uCCB4\uD06C`;
  return `${productName} \uC0DD\uD65C\uAFC0\uD301 \uCCB4\uD06C`;
}

function buildProblemLine(channelKey: ChannelKey, productName: string) {
  if (channelKey === "father_jobs") return `${productName}\uC740 \uC2E4\uC81C \uACF5\uAC04\uC5D0\uC11C \uC4F8 \uB54C \uBCF4\uAD00\uACFC \uD558\uC911\uC774 \uC911\uC694\uD569\uB2C8\uB2E4.`;
  if (channelKey === "lets_buy") return `${productName}\uC740 \uAC00\uACA9\uBCF4\uB2E4 \uC0AC\uC774\uC988\uC640 \uC870\uAC74 \uBE44\uAD50\uAC00 \uBA3C\uC800\uC785\uB2C8\uB2E4.`;
  return `${productName}\uC740 \uBAA8\uB974\uACE0 \uC9C0\uB098\uCE58\uBA74 \uBD88\uD3B8\uD568\uC744 \uC9C0\uC18D\uC2DC\uD0AC \uC218 \uC788\uC2B5\uB2C8\uB2E4.`;
}

function buildChannelSpecificLine(channelKey: ChannelKey) {
  if (channelKey === "father_jobs") return "\uC9D1\uC548\uC77C\uC774\uB098 \uC791\uC5C5 \uC804\uC5D0 \uC2E4\uC6A9\uC131\uC744 \uBA3C\uC800 \uBCF4\uC138\uC694.";
  if (channelKey === "lets_buy") return "\uBE44\uAD50\uD560 \uB54C\uB294 \uAC00\uACA9\uBCF4\uB2E4 \uC870\uAC74\uC774 \uB9DE\uB294\uC9C0 \uD655\uC778\uD558\uC138\uC694.";
  return "\uC0DD\uD65C \uBD88\uD3B8\uC744 \uC904\uC774\uB294 \uC6A9\uB3C4\uC778\uC9C0 \uCCB4\uD06C\uD558\uC138\uC694.";
}

function calculateHookRiskScore(text: string) {
  return FORBIDDEN_CLAIM_PATTERNS.filter((pattern) => pattern.test(text)).length * 30;
}
