export type PlaceholderVisualStats = {
  color_cluster_count: number;
  repeated_tile_ratio: number;
  edge_direction_uniformity: number;
  entropy_score: number;
  alternating_grid_score: number;
  random_noise_score: number;
  gradient_smoothness_score: number;
  abstract_color_grid_score: number;
};

export type MosaicDetectionInput = Pick<
  PlaceholderVisualStats,
  "color_cluster_count" | "repeated_tile_ratio" | "edge_direction_uniformity" | "entropy_score"
> & {
  width: number;
  height: number;
};

export type MosaicDetectionResult = {
  mosaic_pattern_detected: boolean;
  blockers: string[];
};

export type PixelPlaceholderDetectionResult = {
  checkerboard_pattern_detected: boolean;
  noise_texture_detected: boolean;
  solid_or_gradient_placeholder_detected: boolean;
  abstract_color_grid_detected: boolean;
  blockers: string[];
};

export function detectMosaicPlaceholder(input: MosaicDetectionInput): MosaicDetectionResult {
  const blockers: string[] = [];
  const mosaicPatternDetected =
    input.color_cluster_count <= 8 &&
    input.repeated_tile_ratio >= 0.55 &&
    input.edge_direction_uniformity >= 0.65 &&
    input.entropy_score <= 0.45;

  if (mosaicPatternDetected) {
    blockers.push("MOSAIC_PATTERN_DETECTED");
  }

  return {
    mosaic_pattern_detected: mosaicPatternDetected,
    blockers
  };
}

export function detectPixelPlaceholderPattern(input: Pick<
  PlaceholderVisualStats,
  "alternating_grid_score" | "random_noise_score" | "gradient_smoothness_score" | "abstract_color_grid_score"
>): PixelPlaceholderDetectionResult {
  const checkerboard = input.alternating_grid_score >= 0.75;
  const noise = input.random_noise_score >= 0.72;
  const gradient = input.gradient_smoothness_score >= 0.82;
  const abstractGrid = input.abstract_color_grid_score >= 0.75;
  const blockers: string[] = [];

  if (checkerboard) blockers.push("CHECKERBOARD_PATTERN_DETECTED");
  if (noise) blockers.push("NOISE_TEXTURE_DETECTED");
  if (gradient) blockers.push("SOLID_OR_GRADIENT_PLACEHOLDER_DETECTED");
  if (abstractGrid) blockers.push("ABSTRACT_COLOR_GRID_DETECTED");

  return {
    checkerboard_pattern_detected: checkerboard,
    noise_texture_detected: noise,
    solid_or_gradient_placeholder_detected: gradient,
    abstract_color_grid_detected: abstractGrid,
    blockers
  };
}
