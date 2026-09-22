export type LayoutBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const VIDEO_LAYOUT = Object.freeze({
  width: 1080,
  height: 1920,
  topUiExclusion: 96,
  bottomUiExclusion: 240,
  rightControlExclusion: 180,
  hookBox: Object.freeze({ x: 64, y: 118, width: 952, height: 360 }),
  usageBadgeBox: Object.freeze({ x: 72, y: 510, width: 520, height: 72 }),
  hookMaxCharsPerLine: 12,
  hookMaxLines: 2,
  usageBadgeHorizontalPadding: 24,
  usageBadgeFontPx: 38,
  usageBadgeMaxChars: 12,
  HOOK_USAGE_MIN_GAP_PX: 32
} as const);

export type LayoutCollisionResult = {
  passed: boolean;
  blockers: string[];
  hookBox: LayoutBox;
  usageBadgeBox: LayoutBox;
  minimumGapPx: number;
  actualGapPx: number;
  collision: boolean;
};

export function boxesOverlap(left: LayoutBox, right: LayoutBox): boolean {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
}

export function evaluateHookUsageLayout(input: { hook: string; usageLabel: string; hookBox?: LayoutBox; usageBadgeBox?: LayoutBox }): LayoutCollisionResult {
  const hookBox = input.hookBox ?? VIDEO_LAYOUT.hookBox;
  const usageBadgeBox = input.usageBadgeBox ?? VIDEO_LAYOUT.usageBadgeBox;
  const blockers: string[] = [];
  const collision = boxesOverlap(hookBox, usageBadgeBox);
  const actualGapPx = usageBadgeBox.y - (hookBox.y + hookBox.height);
  const normalizedHook = normalizeText(input.hook);
  const normalizedLabel = normalizeText(input.usageLabel);

  if (!normalizedHook || normalizedHook.length > VIDEO_LAYOUT.hookMaxCharsPerLine * VIDEO_LAYOUT.hookMaxLines || normalizedHook.includes("...")) blockers.push("VIDEO_LAYOUT_HOOK_CLIPPED");
  if (!normalizedLabel) blockers.push("VIDEO_LAYOUT_USAGE_BADGE_REQUIRED");
  if (normalizedLabel.length > VIDEO_LAYOUT.usageBadgeMaxChars) blockers.push("VIDEO_LAYOUT_USAGE_BADGE_TOO_WIDE");
  if (collision || actualGapPx < VIDEO_LAYOUT.HOOK_USAGE_MIN_GAP_PX) blockers.push("VIDEO_LAYOUT_HOOK_USAGE_COLLISION");
  for (const box of [hookBox, usageBadgeBox]) {
    if (box.x < 0 || box.y < VIDEO_LAYOUT.topUiExclusion || box.x + box.width > VIDEO_LAYOUT.width || box.y + box.height > VIDEO_LAYOUT.height - VIDEO_LAYOUT.bottomUiExclusion) blockers.push("VIDEO_LAYOUT_SAFE_AREA_VIOLATION");
  }
  if (usageBadgeBox.x + usageBadgeBox.width > VIDEO_LAYOUT.width - VIDEO_LAYOUT.rightControlExclusion) blockers.push("VIDEO_LAYOUT_RIGHT_CONTROL_COLLISION");

  return { passed: blockers.length === 0, blockers: [...new Set(blockers)], hookBox: { ...hookBox }, usageBadgeBox: { ...usageBadgeBox }, minimumGapPx: VIDEO_LAYOUT.HOOK_USAGE_MIN_GAP_PX, actualGapPx, collision };
}

export function buildLocalQaStatus(input: Omit<LocalQaInput, "ownerReviewStatus"> & { ownerReviewStatus?: "pending" | "pass" | "fail" }) {
  const ownerReviewStatus = input.ownerReviewStatus ?? "pending";
  const publishQualityPassed = input.technicalQaPassed && input.captionQaPassed && input.layoutQaPassed && input.visualEvidencePassed && ownerReviewStatus === "pass";
  return { ...input, ownerReviewStatus, publishQualityPassed };
}

type LocalQaInput = {
  technicalQaPassed: boolean;
  captionQaPassed: boolean;
  layoutQaPassed: boolean;
  visualEvidencePassed: boolean;
  ownerReviewStatus: "pending" | "pass" | "fail";
};

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}
