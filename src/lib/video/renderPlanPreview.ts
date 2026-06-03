import type { GeneratedContent, ProductQueueItem } from "@/types/automation";
import type { RenderPlan, RenderPlanShot } from "@/lib/video/renderPlanTypes";

export type RenderPlanPreviewGap =
  | "no_render_plan"
  | "missing_product_name"
  | "missing_affiliate_url"
  | "missing_image"
  | "missing_script"
  | "missing_disclosure"
  | "empty_shots"
  | "invalid_duration"
  | "missing_caption"
  | "missing_voice_text"
  | "too_long_caption"
  | "unsafe_claim_warning";

export type RenderPlanPreviewRow = {
  shot_id: string;
  shot_index: number;
  start_time_sec: number;
  duration_sec: number;
  layout: string;
  image_url: string;
  caption: string;
  voice_text: string;
  readiness_status: "ready" | "needs_review";
  missing_reasons: RenderPlanPreviewGap[];
};

export type RenderPlanPreviewSummary = {
  mode: "render_plan" | "legacy_fallback";
  ready: boolean;
  shot_count: number;
  total_duration_sec: number;
  gaps: RenderPlanPreviewGap[];
  rows: RenderPlanPreviewRow[];
};

const CAPTION_REVIEW_LENGTH = 72;
const UNSAFE_CLAIM_PATTERNS = [
  /guaranteed/i,
  /best price/i,
  /lowest price/i,
  /cures?/i,
  /treats?/i,
  /보장/,
  /최저가/,
  /완치/,
  /치료/
];

export function summarizeRenderPlanPreview(
  renderPlan: RenderPlan | null | undefined,
  item: ProductQueueItem,
  content?: GeneratedContent | null
): RenderPlanPreviewSummary {
  const inputGaps = getInputGaps(item, content);

  if (!renderPlan) {
    return {
      mode: "legacy_fallback",
      ready: false,
      shot_count: 0,
      total_duration_sec: 0,
      gaps: uniqueGaps(["no_render_plan", ...inputGaps]),
      rows: []
    };
  }

  const rows = buildRows(renderPlan.shots);
  const shotGaps = rows.flatMap((row) => row.missing_reasons);
  const planGaps: RenderPlanPreviewGap[] = renderPlan.shots.length === 0 ? ["empty_shots"] : [];
  const gaps = uniqueGaps([...inputGaps, ...planGaps, ...shotGaps]);

  return {
    mode: "render_plan",
    ready: gaps.length === 0,
    shot_count: renderPlan.shots.length,
    total_duration_sec: rows.reduce((sum, row) => sum + Math.max(0, row.duration_sec), 0),
    gaps,
    rows
  };
}

export function formatShotTime(seconds: number) {
  return `${Math.max(0, seconds).toFixed(0)}s`;
}

function buildRows(shots: RenderPlanShot[]): RenderPlanPreviewRow[] {
  let start = 0;
  return shots.map((shot, index) => {
    const missing_reasons = getShotGaps(shot);
    const row: RenderPlanPreviewRow = {
      shot_id: shot.shot_id,
      shot_index: index + 1,
      start_time_sec: start,
      duration_sec: shot.duration_sec,
      layout: shot.layout,
      image_url: shot.image_url,
      caption: shot.caption,
      voice_text: shot.voice_text,
      readiness_status: missing_reasons.length === 0 ? "ready" : "needs_review",
      missing_reasons
    };
    start += Math.max(0, shot.duration_sec);
    return row;
  });
}

function getInputGaps(item: ProductQueueItem, content?: GeneratedContent | null): RenderPlanPreviewGap[] {
  const gaps: RenderPlanPreviewGap[] = [];
  if (!item.product_name.trim()) {
    gaps.push("missing_product_name");
  }
  if (!item.selected_affiliate_url.trim()) {
    gaps.push("missing_affiliate_url");
  }
  if (!item.thumbnail_url.trim()) {
    gaps.push("missing_image");
  }
  if (!content?.video_script?.trim()) {
    gaps.push("missing_script");
  }
  if (!content?.disclosure_text?.trim()) {
    gaps.push("missing_disclosure");
  }
  return gaps;
}

function getShotGaps(shot: RenderPlanShot): RenderPlanPreviewGap[] {
  const gaps: RenderPlanPreviewGap[] = [];
  if (!Number.isFinite(shot.duration_sec) || shot.duration_sec <= 0) {
    gaps.push("invalid_duration");
  }
  if (!shot.image_url.trim()) {
    gaps.push("missing_image");
  }
  if (!shot.caption.trim()) {
    gaps.push("missing_caption");
  }
  if (!shot.voice_text.trim()) {
    gaps.push("missing_voice_text");
  }
  if (shot.caption.length > CAPTION_REVIEW_LENGTH) {
    gaps.push("too_long_caption");
  }
  if (UNSAFE_CLAIM_PATTERNS.some((pattern) => pattern.test(`${shot.caption} ${shot.voice_text}`))) {
    gaps.push("unsafe_claim_warning");
  }
  return gaps;
}

function uniqueGaps(gaps: RenderPlanPreviewGap[]) {
  return [...new Set(gaps)];
}
