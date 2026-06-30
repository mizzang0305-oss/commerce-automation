export type FrameVisualStatsInput = {
  width: number;
  height: number;
  palette_hex: string[];
  edge_density: number;
  entropy: number;
  brightness: number;
};

export type FrameVisualStats = FrameVisualStatsInput & {
  unique_color_count: number;
  visual_entropy_score: number;
  is_blank_frame: boolean;
  is_dark_placeholder_frame: boolean;
  is_solid_color_frame: boolean;
  is_rect_placeholder_frame: boolean;
};

export type SolidPlaceholderDetection = {
  placeholder_detected: boolean;
  blockers: string[];
};

export function calculateFrameVisualStats(input: FrameVisualStatsInput): FrameVisualStats {
  const uniqueColors = new Set(input.palette_hex.map((color) => color.toLowerCase())).size;
  const visualEntropyScore = clamp01((input.entropy * 0.7) + (input.edge_density * 0.3));
  const isBlankFrame = input.brightness > 0.96 && uniqueColors <= 2 && input.edge_density < 0.03;
  const isDarkPlaceholderFrame = input.brightness < 0.08 && input.entropy < 0.16;
  const isSolidColorFrame = uniqueColors <= 2 || input.entropy < 0.12;
  const isRectPlaceholderFrame = uniqueColors <= 4 && input.edge_density < 0.08 && input.entropy < 0.25;

  return {
    ...input,
    unique_color_count: uniqueColors,
    visual_entropy_score: visualEntropyScore,
    is_blank_frame: isBlankFrame,
    is_dark_placeholder_frame: isDarkPlaceholderFrame,
    is_solid_color_frame: isSolidColorFrame,
    is_rect_placeholder_frame: isRectPlaceholderFrame
  };
}

export function detectSolidPlaceholderFrame(stats: FrameVisualStats): SolidPlaceholderDetection {
  const blockers: string[] = [];

  if (stats.visual_entropy_score < 0.18) blockers.push("LOW_VISUAL_ENTROPY_FRAME");
  if (stats.is_solid_color_frame) blockers.push("SOLID_COLOR_FRAME_DETECTED");
  if (stats.is_blank_frame) blockers.push("BLANK_FRAME_DETECTED");
  if (stats.is_dark_placeholder_frame) blockers.push("DARK_PLACEHOLDER_FRAME_DETECTED");
  if (stats.is_rect_placeholder_frame) blockers.push("RECT_PLACEHOLDER_FRAME_DETECTED");

  return {
    placeholder_detected: blockers.length > 0,
    blockers
  };
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
