import type { CaptionAnimation } from "../qa/types";

export type RenderRepairProfile = {
  motionPreset: "static" | "push_pan";
  primaryVisualWidthRatio: number;
  canvasFillRatio: number;
  captionFontPx: number;
  captionAnimation: CaptionAnimation;
  usageLabelMode: "always_full" | "full_then_abbreviated";
  maxVisualBeatSeconds: number;
};

export type RepairPlan = {
  cycle: 1 | 2;
  reasons: string[];
  changes: string[];
  profile: RenderRepairProfile;
  reselectCreative: boolean;
};

export const LEGACY_INITIAL_PROFILE: RenderRepairProfile = Object.freeze({
  motionPreset: "static", primaryVisualWidthRatio: 0.62, canvasFillRatio: 0.62,
  captionFontPx: 44, captionAnimation: "none", usageLabelMode: "always_full", maxVisualBeatSeconds: 2.4
});

export const V2_PROVEN_PROFILE: RenderRepairProfile = Object.freeze({
  motionPreset: "push_pan", primaryVisualWidthRatio: 0.92, canvasFillRatio: 0.93,
  captionFontPx: 66, captionAnimation: "pop", usageLabelMode: "full_then_abbreviated", maxVisualBeatSeconds: 1.35
});

export function buildDeterministicRepairPlan(input: { cycle: 1 | 2; blockers: readonly string[]; signals: readonly string[]; current: RenderRepairProfile }): RepairPlan {
  const reasons = [...new Set([...input.blockers, ...input.signals])];
  const changes: string[] = [];
  const profile: RenderRepairProfile = { ...input.current };
  if (reasons.some((value) => ["SLIDESHOW_FREEZE_RATIO_HIGH", "VISUAL_BEAT_TOO_LONG", "VISUAL_REPETITION_HIGH"].includes(value))) {
    profile.motionPreset = "push_pan"; profile.maxVisualBeatSeconds = 1.35; changes.push("ENABLE_DETERMINISTIC_PUSH_PAN");
  }
  if (reasons.some((value) => ["PRIMARY_VISUAL_TOO_SMALL", "EMPTY_CANVAS_EXCESSIVE"].includes(value))) {
    profile.primaryVisualWidthRatio = 0.92; profile.canvasFillRatio = 0.93; changes.push("EXPAND_PRIMARY_VISUAL_TO_FULL_BLEED");
  }
  if (reasons.some((value) => ["CAPTION_TOO_SMALL", "CAPTION_MOTION_WEAK", "CAPTION_SAFE_TIMELINE_FAILED"].includes(value))) {
    profile.captionFontPx = 66; profile.captionAnimation = "pop"; changes.push("UPGRADE_DYNAMIC_POP_GROUP_CAPTIONS");
  }
  if (profile.usageLabelMode !== "full_then_abbreviated") { profile.usageLabelMode = "full_then_abbreviated"; changes.push("REDUCE_GENERIC_USAGE_BADGE_AFTER_INTRO"); }
  return { cycle: input.cycle, reasons, changes, profile, reselectCreative: reasons.includes("HOOK_TEMPLATE_REPETITION") };
}
