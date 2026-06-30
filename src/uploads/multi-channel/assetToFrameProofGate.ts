export type AssetToFrameProofGateInput = {
  scene_count: number;
  scene_asset_files_exist: boolean;
  scene_asset_decode_success: boolean;
  scene_asset_min_width: number;
  scene_asset_min_height: number;
  scene_asset_file_size_bytes: number;
  rendered_video_exists: boolean;
  rendered_video_duration_seconds: number;
  rendered_video_frame_extract_success: boolean;
  frame_visual_entropy_avg: number;
  solid_color_frame_ratio: number;
  blank_frame_ratio: number;
  dark_placeholder_frame_ratio: number;
  rect_placeholder_frame_ratio: number;
  frame_scene_asset_similarity_pass: boolean;
  at_least_one_frame_matches_each_scene_asset: boolean;
  scene_asset_visible_frame_count: number;
  actual_frame_contact_sheet_not_blank: boolean;
  actual_frame_contact_sheet_not_solid_rectangles: boolean;
};

export type AssetToFrameProofGateResult = AssetToFrameProofGateInput & {
  pass: boolean;
  blockers: string[];
};

const MIN_ENTROPY_AVG = 0.35;

export function validateAssetToFrameProofGate(input: AssetToFrameProofGateInput): AssetToFrameProofGateResult {
  const blockers: string[] = [];

  if (!input.scene_asset_files_exist) blockers.push("SCENE_ASSET_MISSING");
  if (!input.scene_asset_decode_success) blockers.push("SCENE_ASSET_DECODE_FAIL");
  if (input.scene_asset_min_width < 720 || input.scene_asset_min_height < 1280) blockers.push("SCENE_ASSET_DIMENSION_TOO_SMALL");
  if (input.scene_asset_file_size_bytes <= 50000) blockers.push("SCENE_ASSET_FILE_TOO_SMALL");
  if (!input.rendered_video_exists) blockers.push("RENDERED_VIDEO_MISSING");
  if (input.rendered_video_duration_seconds < 18) blockers.push("RENDERED_VIDEO_TOO_SHORT");
  if (!input.rendered_video_frame_extract_success) blockers.push("VIDEO_FRAME_EXTRACT_FAIL");
  if (input.frame_visual_entropy_avg < MIN_ENTROPY_AVG) blockers.push("LOW_VISUAL_ENTROPY_FRAME");
  if (input.solid_color_frame_ratio > 0.05) blockers.push("SOLID_COLOR_FRAME_RATIO_TOO_HIGH");
  if (input.blank_frame_ratio > 0.02) blockers.push("BLANK_FRAME_RATIO_TOO_HIGH");
  if (input.dark_placeholder_frame_ratio > 0.05) blockers.push("DARK_PLACEHOLDER_FRAME_RATIO_TOO_HIGH");
  if (input.rect_placeholder_frame_ratio > 0.05) blockers.push("RECT_PLACEHOLDER_FRAME_RATIO_TOO_HIGH");
  if (!input.frame_scene_asset_similarity_pass) blockers.push("FRAME_SCENE_ASSET_SIMILARITY_FAIL");
  if (!input.at_least_one_frame_matches_each_scene_asset || input.scene_asset_visible_frame_count < input.scene_count) {
    blockers.push("SCENE_ASSET_NOT_VISIBLE_IN_VIDEO");
  }
  if (!input.actual_frame_contact_sheet_not_blank || !input.actual_frame_contact_sheet_not_solid_rectangles) {
    blockers.push("CONTACT_SHEET_PLACEHOLDER_DETECTED");
  }

  return {
    ...input,
    pass: blockers.length === 0,
    blockers
  };
}
