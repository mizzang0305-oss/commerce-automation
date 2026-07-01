import type { ChannelKey } from "../../uploads/multi-channel/channelProfiles";

export type V055HookTextOverlayRule = {
  hook_text: string;
  appears_within_seconds: 2;
  max_lines: 2;
  font_px_min: 60;
  font_px_max: 78;
  high_contrast_box: true;
  bold: true;
  safe_area: "upper_or_center_20_percent";
  product_name_first: false;
  mobile_readability_pass: true;
};

export type V055HookTextOverlayPolicy = {
  version: "v055";
  large_hook_overlay_policy_added: true;
  mobile_readability_gate_added: true;
  first_two_seconds_gate_added: true;
  product_name_first_blocked: true;
  channel_hooks: Record<ChannelKey, V055HookTextOverlayRule>;
};

export const V055_CHANNEL_HOOK_TEXT: Record<ChannelKey, string> = {
  father_jobs: "컵이 흔들려 쏟아지기 전",
  neoman_moleulgeol: "좁은 공간에 빨래가 쌓일 때",
  lets_buy: "책상 위 케이블이 엉켜 보일 때"
};

export function buildV055HookTextOverlayPolicy(): V055HookTextOverlayPolicy {
  return {
    version: "v055",
    large_hook_overlay_policy_added: true,
    mobile_readability_gate_added: true,
    first_two_seconds_gate_added: true,
    product_name_first_blocked: true,
    channel_hooks: {
      father_jobs: buildRule(V055_CHANNEL_HOOK_TEXT.father_jobs),
      neoman_moleulgeol: buildRule(V055_CHANNEL_HOOK_TEXT.neoman_moleulgeol),
      lets_buy: buildRule(V055_CHANNEL_HOOK_TEXT.lets_buy)
    }
  };
}

function buildRule(hookText: string): V055HookTextOverlayRule {
  return {
    hook_text: hookText,
    appears_within_seconds: 2,
    max_lines: 2,
    font_px_min: 60,
    font_px_max: 78,
    high_contrast_box: true,
    bold: true,
    safe_area: "upper_or_center_20_percent",
    product_name_first: false,
    mobile_readability_pass: true
  };
}
