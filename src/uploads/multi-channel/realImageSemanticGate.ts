import { type ChannelKey } from "./channelProfiles";
import {
  type PlaceholderVisualStats,
  detectMosaicPlaceholder,
  detectPixelPlaceholderPattern
} from "./mosaicPlaceholderDetector";
import { validateSceneObjectRequirements } from "./sceneObjectRequirementGate";

export type RealImageSemanticAsset = {
  scene_key: string;
  file_exists: boolean;
  decode_success: boolean;
  width: number;
  height: number;
  file_size_bytes: number;
  real_photo_likeness_score: number;
  detected_objects: string[];
  visual_stats: PlaceholderVisualStats;
};

export type RealImageSemanticGateResult = {
  channel_key: ChannelKey;
  pass: boolean;
  generated_scene_asset_count: number;
  all_scene_assets_exist: boolean;
  scene_asset_decode_success: boolean;
  scene_asset_min_width_pass: boolean;
  scene_asset_min_height_pass: boolean;
  scene_asset_file_size_pass: boolean;
  mosaic_pattern_detected: boolean;
  checkerboard_pattern_detected: boolean;
  noise_texture_detected: boolean;
  solid_or_gradient_placeholder_detected: boolean;
  abstract_color_grid_detected: boolean;
  real_photo_likeness_score: number;
  real_photo_likeness_pass: boolean;
  required_scene_objects_detected: boolean;
  scene_context_visible: boolean;
  product_or_related_object_visible: boolean;
  human_reviewable_contact_sheet: boolean;
  blockers: string[];
};

const REQUIRED_SCENE_ASSET_COUNT = 6;
const MIN_WIDTH = 720;
const MIN_HEIGHT = 1280;
const MIN_FILE_SIZE_BYTES = 50000;
const MIN_REAL_PHOTO_LIKENESS_SCORE = 0.75;

export function validateRealImageSemanticGate(input: {
  channel_key: ChannelKey;
  assets: RealImageSemanticAsset[];
  human_reviewable_contact_sheet?: boolean;
}): RealImageSemanticGateResult {
  const blockers: string[] = [];
  const generatedSceneAssetCount = input.assets.filter((asset) => asset.file_exists).length;
  const allSceneAssetsExist = generatedSceneAssetCount >= REQUIRED_SCENE_ASSET_COUNT;
  const sceneAssetDecodeSuccess = input.assets.length >= REQUIRED_SCENE_ASSET_COUNT &&
    input.assets.every((asset) => asset.decode_success);
  const minWidthPass = input.assets.length >= REQUIRED_SCENE_ASSET_COUNT &&
    input.assets.every((asset) => asset.width >= MIN_WIDTH);
  const minHeightPass = input.assets.length >= REQUIRED_SCENE_ASSET_COUNT &&
    input.assets.every((asset) => asset.height >= MIN_HEIGHT);
  const fileSizePass = input.assets.length >= REQUIRED_SCENE_ASSET_COUNT &&
    input.assets.every((asset) => asset.file_size_bytes > MIN_FILE_SIZE_BYTES);

  if (!allSceneAssetsExist) blockers.push("GENERATED_SCENE_ASSET_COUNT_TOO_LOW");
  if (!sceneAssetDecodeSuccess) blockers.push("SCENE_ASSET_DECODE_FAIL");
  if (!minWidthPass) blockers.push("SCENE_ASSET_WIDTH_TOO_SMALL");
  if (!minHeightPass) blockers.push("SCENE_ASSET_HEIGHT_TOO_SMALL");
  if (!fileSizePass) blockers.push("SCENE_ASSET_FILE_TOO_SMALL");

  const mosaicResults = input.assets.map((asset) => detectMosaicPlaceholder({
    width: asset.width,
    height: asset.height,
    color_cluster_count: asset.visual_stats.color_cluster_count,
    repeated_tile_ratio: asset.visual_stats.repeated_tile_ratio,
    edge_direction_uniformity: asset.visual_stats.edge_direction_uniformity,
    entropy_score: asset.visual_stats.entropy_score
  }));
  const pixelResults = input.assets.map((asset) => detectPixelPlaceholderPattern(asset.visual_stats));
  const mosaicPatternDetected = mosaicResults.some((result) => result.mosaic_pattern_detected);
  const checkerboardPatternDetected = pixelResults.some((result) => result.checkerboard_pattern_detected);
  const noiseTextureDetected = pixelResults.some((result) => result.noise_texture_detected);
  const solidOrGradientPlaceholderDetected = pixelResults.some((result) => result.solid_or_gradient_placeholder_detected);
  const abstractColorGridDetected = pixelResults.some((result) => result.abstract_color_grid_detected);

  for (const result of [...mosaicResults, ...pixelResults]) {
    blockers.push(...result.blockers);
  }

  const realPhotoLikenessScore = round3(average(input.assets.map((asset) => asset.real_photo_likeness_score)));
  const realPhotoLikenessPass = input.assets.length >= REQUIRED_SCENE_ASSET_COUNT &&
    input.assets.every((asset) => asset.real_photo_likeness_score >= MIN_REAL_PHOTO_LIKENESS_SCORE);
  if (!realPhotoLikenessPass) blockers.push("REAL_PHOTO_LIKENESS_FAIL");

  const objectRequirement = validateSceneObjectRequirements({
    channel_key: input.channel_key,
    detected_objects: [...new Set(input.assets.flatMap((asset) => asset.detected_objects))]
  });
  blockers.push(...objectRequirement.blockers);

  const humanReviewableContactSheet = input.human_reviewable_contact_sheet ?? !(
    mosaicPatternDetected ||
    checkerboardPatternDetected ||
    noiseTextureDetected ||
    solidOrGradientPlaceholderDetected ||
    abstractColorGridDetected
  );
  if (!humanReviewableContactSheet) blockers.push("HUMAN_REVIEW_CONTACT_SHEET_NOT_VALID");

  const uniqueBlockers = [...new Set(blockers)];

  return {
    channel_key: input.channel_key,
    pass: uniqueBlockers.length === 0,
    generated_scene_asset_count: generatedSceneAssetCount,
    all_scene_assets_exist: allSceneAssetsExist,
    scene_asset_decode_success: sceneAssetDecodeSuccess,
    scene_asset_min_width_pass: minWidthPass,
    scene_asset_min_height_pass: minHeightPass,
    scene_asset_file_size_pass: fileSizePass,
    mosaic_pattern_detected: mosaicPatternDetected,
    checkerboard_pattern_detected: checkerboardPatternDetected,
    noise_texture_detected: noiseTextureDetected,
    solid_or_gradient_placeholder_detected: solidOrGradientPlaceholderDetected,
    abstract_color_grid_detected: abstractColorGridDetected,
    real_photo_likeness_score: realPhotoLikenessScore,
    real_photo_likeness_pass: realPhotoLikenessPass,
    required_scene_objects_detected: objectRequirement.required_scene_objects_detected,
    scene_context_visible: objectRequirement.scene_context_visible,
    product_or_related_object_visible: objectRequirement.product_or_related_object_visible,
    human_reviewable_contact_sheet: humanReviewableContactSheet,
    blockers: uniqueBlockers
  };
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}
