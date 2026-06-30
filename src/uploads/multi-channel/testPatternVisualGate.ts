import type { ChannelKey } from "./channelProfiles";

export type TestPatternVisualGateInput = {
  channel_key: ChannelKey;
  frame_palette_hex: string[];
  actual_frame_contact_sheet_palette_hex?: string[];
  scene_asset_sha256: string;
  representative_frame_sha256: string;
  rendered_with_scene_asset: boolean;
  generated_by_fixture_renderer: boolean;
};

export type TestPatternVisualGateResult = {
  channel_key: ChannelKey;
  pass: boolean;
  color_bar_pattern_detected: boolean;
  rgb_test_pattern_detected: boolean;
  placeholder_video_detected: boolean;
  rendered_frame_uses_scene_asset: boolean;
  scene_asset_pixels_present_in_video: boolean;
  actual_frame_contact_sheet_not_color_bars: boolean;
  blockers: string[];
};

const COLOR_BAR_RGB_SET = new Set([
  "#ffffff",
  "#ffff00",
  "#00ffff",
  "#00ff00",
  "#ff00ff",
  "#ff0000",
  "#0000ff",
  "#000000"
]);

export function detectColorBarPalette(paletteHex: string[]) {
  const normalized = paletteHex.map((color) => color.toLowerCase());
  const exactHits = normalized.filter((color) => COLOR_BAR_RGB_SET.has(color)).length;
  const uniqueCount = new Set(normalized).size;
  const color_bar_pattern_detected = exactHits >= 6 && uniqueCount >= 6;

  return {
    color_bar_pattern_detected,
    rgb_test_pattern_detected: color_bar_pattern_detected
  };
}

export function validateTestPatternVisualGate(input: TestPatternVisualGateInput): TestPatternVisualGateResult {
  const palette = detectColorBarPalette(input.frame_palette_hex);
  const contactSheetPalette = detectColorBarPalette(
    input.actual_frame_contact_sheet_palette_hex ?? input.frame_palette_hex
  );
  const renderedFrameUsesSceneAsset = input.rendered_with_scene_asset &&
    input.scene_asset_sha256 === input.representative_frame_sha256;
  const placeholderVideoDetected = input.generated_by_fixture_renderer || !input.rendered_with_scene_asset;
  const blockers: string[] = [];

  if (palette.color_bar_pattern_detected) blockers.push("COLOR_BAR_PATTERN_DETECTED");
  if (palette.rgb_test_pattern_detected) blockers.push("RGB_TEST_PATTERN_DETECTED");
  if (placeholderVideoDetected) blockers.push("PLACEHOLDER_VIDEO_DETECTED");
  if (!renderedFrameUsesSceneAsset) blockers.push("SCENE_ASSET_NOT_USED_IN_RENDER");
  if (contactSheetPalette.color_bar_pattern_detected) blockers.push("ACTUAL_FRAME_CONTACT_SHEET_IS_TEST_PATTERN");

  return {
    channel_key: input.channel_key,
    pass: blockers.length === 0,
    color_bar_pattern_detected: palette.color_bar_pattern_detected,
    rgb_test_pattern_detected: palette.rgb_test_pattern_detected,
    placeholder_video_detected: placeholderVideoDetected,
    rendered_frame_uses_scene_asset: renderedFrameUsesSceneAsset,
    scene_asset_pixels_present_in_video: renderedFrameUsesSceneAsset,
    actual_frame_contact_sheet_not_color_bars: !contactSheetPalette.color_bar_pattern_detected,
    blockers
  };
}
