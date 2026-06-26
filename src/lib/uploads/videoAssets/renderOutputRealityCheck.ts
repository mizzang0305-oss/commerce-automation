import path from "node:path";

export type RenderRealityCheckBlocker =
  | "FOREGROUND_PRODUCT_STATIC_TOO_LONG"
  | "BACKGROUND_ONLY_CHANGED"
  | "TRUE_SCENE_CHANGE_FALSE_POSITIVE"
  | "VISUAL_MOTION_SCORE_UNTRUSTED"
  | "ACTUAL_FRAME_HASH_DELTA_TOO_LOW"
  | "ACTUAL_CONTACT_SHEET_TOO_SIMILAR"
  | "CAPTION_OUT_OF_ACTUAL_FRAME"
  | "CAPTION_OVERLAPS_SHORTS_UI"
  | "CAPTION_CLIPPED_IN_RENDERED_FRAME"
  | "CAPTION_TOO_LONG_FOR_TWO_LINES"
  | "HOOK_TITLE_LOW_VISIBILITY_ACTUAL"
  | "VOICEOVER_SEGMENT_GAPS_TOO_LONG"
  | "VOICEOVER_HARD_CUTS_DETECTED"
  | "VOICEOVER_UNINTELLIGIBLE"
  | "VOICEOVER_LOUDNESS_UNNORMALIZED"
  | "VOICEOVER_TOO_ROBOTIC"
  | "SHORTS_UI_OVERLAY_TEXT_BLOCKED"
  | "TEXT_UNDER_TOP_CHIPS"
  | "CAPTION_OVERLAPS_RIGHT_BUTTONS"
  | "CAPTION_OVERLAPS_BOTTOM_META"
  | "CAPTION_OVERLAPS_BOTTOM_NAV"
  | "HOOK_HIDDEN_BY_SHORTS_UI"
  | "CAPTION_NEWLINE_ESCAPED_AS_LITERAL_N"
  | "CAPTION_LITERAL_BACKSLASH_N_VISIBLE"
  | "CAPTION_TOO_LONG_FOR_SAFE_AREA"
  | "YOUTUBE_TITLE_MOJIBAKE"
  | "YOUTUBE_DESCRIPTION_MOJIBAKE"
  | "KOREAN_TEXT_REPLACED_WITH_QUESTION_MARKS"
  | "KOREAN_DISCLOSURE_GARBLED"
  | "AUDIO_ASR_PROVIDER_NOT_CONFIGURED"
  | "VOICEOVER_UNINTELLIGIBLE_ASR_FAILED"
  | "RAW_ASR_SIMILARITY_TOO_LOW"
  | "VOICEOVER_PRODUCT_CORE_ANCHORS_MISSING"
  | "VOICEOVER_CONTEXT_ANCHORS_MISSING"
  | "VOICEOVER_KEYWORD_ANCHORS_MISSING"
  | "VOICEOVER_TOO_FAST"
  | "STATIC_PRODUCT_CARD_FEELING"
  | "PRODUCT_IMAGE_DOMINATES_TOO_MANY_SCENES"
  | "BACKGROUND_ONLY_MOTION"
  | "SCENE_LAYOUT_TOO_SIMILAR"
  | "NO_PROBLEM_VISUAL_BEFORE_PRODUCT"
  | "FIRST_FRAME_NOT_AD_LIKE"
  | "LOSS_AVERSION_NOT_VISIBLE"
  | "EMPTY_CANVAS_TOO_LARGE"
  | "PRIMARY_TEXT_TOO_SMALL"
  | "PRODUCT_OR_PROBLEM_VISUAL_MISSING_FIRST_SECOND"
  | "PPT_CARD_FEELING"
  | "HOOK_COPY_WEAK"
  | "VOICEOVER_REJECTED_LOCAL_SAPI_VOICE"
  | "VOICEOVER_TONE_REJECTED_BY_OWNER"
  | "VOICEOVER_PACE_REJECTED_BY_OWNER"
  | "REPEATED_SINGLE_PRODUCT_PHOTO"
  | "TEXT_COLOR_ONLY_VARIATION"
  | "VISUAL_STORYBOARD_TOO_STATIC"
  | "PRODUCT_PHOTO_DOMINATES_STORY"
  | "NO_REAL_PROBLEM_SCENE_SOURCE"
  | "NO_REAL_USE_CASE_SCENE_SOURCE"
  | "NO_BEFORE_AFTER_COMPARISON"
  | "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED"
  | "VOICE_PROVIDER_NOT_APPROVED"
  | "KOREAN_VOICE_PROVIDER_NOT_KOREAN_CAPABLE"
  | "VOICE_PROVIDER_GENERATION_FAILED"
  | "VOICE_PROVIDER_PAID_OR_CLOUD_REQUIRES_APPROVAL"
  | "OWNER_RECORDED_VOICE_FILE_NOT_FOUND"
  | "OWNER_RECORDED_VOICE_FILE_INVALID";

export type ActualFrameProbeInput = {
  actual_frame_sample_count?: unknown;
  actual_frame_hash_unique_ratio?: unknown;
  foreground_product_position_change_count?: unknown;
  foreground_product_scale_change_count?: unknown;
  layout_structure_change_count?: unknown;
  background_only_change_ratio?: unknown;
  same_composition_ratio?: unknown;
};

export type CaptionBboxProbeInput = {
  actual_caption_safe_area_pass?: unknown;
  actual_no_text_clipped?: unknown;
  actual_no_caption_overlaps_right_ui?: unknown;
  max_caption_lines?: unknown;
  hook_title_visible_actual?: unknown;
  hook_title_contrast_actual_pass?: unknown;
};

export type AudioContinuityProbeInput = {
  audio_stream_present?: unknown;
  max_silence_between_segments_ms?: unknown;
  hard_cut_count?: unknown;
  audio_loudness_normalized?: unknown;
  audio_peak_not_clipped?: unknown;
  speech_continuity_score?: unknown;
  voiceover_naturalness_score?: unknown;
};

export type ShortsUiOverlayProbeInput = {
  shorts_overlay_probe_executed?: unknown;
  no_text_in_top_ui_zone?: unknown;
  no_critical_text_in_right_ui_zone?: unknown;
  no_caption_in_bottom_meta_zone?: unknown;
  no_caption_in_bottom_nav_zone?: unknown;
  hook_visible_below_top_ui?: unknown;
  main_caption_inside_safe_window?: unknown;
};

export type CaptionTextIntegrityProbeInput = {
  caption_newline_probe_executed?: unknown;
  captions?: unknown;
};

export type TitleDescriptionIntegrityProbeInput = {
  mojibake_probe_executed?: unknown;
  title?: unknown;
  description?: unknown;
};

export type KoreanAsrProbeInput = {
  asr_provider?: unknown;
  asr_probe_executed?: unknown;
  real_asr_probe_executed?: unknown;
  korean_transcript_present?: unknown;
  raw_transcript_similarity_score?: unknown;
  transcript_similarity_score?: unknown;
  core_anchor_recognition_pass?: unknown;
  recognized_core_anchors?: unknown;
  recognized_context_anchors?: unknown;
  recognized_context_anchor_count?: unknown;
  recognized_keyword_anchor_count?: unknown;
  speech_rate_wpm?: unknown;
  max_silence_between_segments_ms?: unknown;
  hard_cut_count?: unknown;
  voiceover_naturalness_score?: unknown;
};

export type HumanVisualGateProbeInput = {
  human_visual_gate_executed?: unknown;
  first_frame_ad_like?: unknown;
  loss_aversion_hook_large_visible?: unknown;
  empty_canvas_ratio?: unknown;
  primary_text_area_ratio?: unknown;
  product_or_problem_visual_visible_in_first_1s?: unknown;
  hook_text_contains_loss_trigger?: unknown;
  problem_before_product_visible?: unknown;
  cta_not_present_too_early?: unknown;
  ppt_card_feeling?: unknown;
};

export type VoiceoverReviewProbeInput = {
  voiceover_review_executed?: unknown;
  selected_voice_name?: unknown;
  selected_voice_gender?: unknown;
  selected_voice_culture?: unknown;
  owner_rejected_voice_gender?: unknown;
  voice_tone_owner_acceptable?: unknown;
  speech_pace_owner_acceptable?: unknown;
};

export type VisualDiversityProbeInput = {
  visual_diversity_probe_executed?: unknown;
  repeated_single_product_photo?: unknown;
  text_color_only_variation?: unknown;
  unique_scene_compositions?: unknown;
  product_photo_reuse_ratio?: unknown;
};

export type RealStoryboardProbeInput = {
  real_storyboard_gate_executed?: unknown;
  single_product_photo_reuse_count?: unknown;
  product_photo_dominant_scene_count?: unknown;
  unique_non_product_scene_source_count?: unknown;
  problem_scene_count?: unknown;
  use_case_scene_count?: unknown;
  comparison_scene_count?: unknown;
  checklist_scene_count?: unknown;
  cta_scene_count?: unknown;
  problem_before_product_visible?: unknown;
  before_after_comparison_present?: unknown;
  use_case_visual_present?: unknown;
  text_color_only_variation?: unknown;
};

export type VoiceProviderProbeInput = {
  voice_provider_review_executed?: unknown;
  voice_provider_name?: unknown;
  voice_provider_type?: unknown;
  voice_provider_configured?: unknown;
  voice_provider_approved?: unknown;
  korean_capable?: unknown;
  windows_sapi_used?: unknown;
  voiceover_rejected_local_sapi_voice?: unknown;
  paid_or_cloud_requires_approval?: unknown;
  can_generate?: unknown;
  voice_provider_blocker?: unknown;
};

export type SceneLayoutProbeInput = {
  static_product_card_feeling?: unknown;
  product_dominates_too_many_scenes?: unknown;
  background_only_motion?: unknown;
  scene_layout_too_similar?: unknown;
  problem_visual_before_product?: unknown;
  distinct_layout_templates?: unknown;
};

export type RenderRealityCheckInput = {
  candidate_id?: unknown;
  version?: unknown;
  rendered_frame_contact_sheet_generated?: unknown;
  actual_frame_probe?: unknown;
  caption_bbox_probe?: unknown;
  audio_continuity_probe?: unknown;
  shorts_ui_overlay_probe?: unknown;
  caption_text_integrity_probe?: unknown;
  title_description_integrity_probe?: unknown;
  korean_asr_probe?: unknown;
  scene_layout_probe?: unknown;
  human_visual_gate_probe?: unknown;
  voiceover_review_probe?: unknown;
  visual_diversity_probe?: unknown;
  real_storyboard_probe?: unknown;
  voice_provider_probe?: unknown;
};

export type RenderRealityCheckResult = {
  passed: boolean;
  blocked_reasons: RenderRealityCheckBlocker[];
  rendered_frame_contact_sheet_generated: boolean;
  actual_frame_sample_count: number;
  actual_frame_hash_unique_ratio: number | null;
  foreground_product_position_change_count: number;
  foreground_product_scale_change_count: number;
  layout_structure_change_count: number;
  background_only_change_ratio: number | null;
  same_composition_ratio: number | null;
  actual_true_scene_change_pass: boolean;
  actual_caption_safe_area_pass: boolean;
  actual_no_text_clipped: boolean;
  actual_no_caption_overlaps_right_ui: boolean;
  max_caption_lines: number | null;
  hook_title_visible_actual: boolean;
  hook_title_contrast_actual_pass: boolean;
  audio_stream_present: boolean;
  max_silence_between_segments_ms: number | null;
  hard_cut_count: number;
  audio_loudness_normalized: boolean;
  audio_peak_not_clipped: boolean;
  speech_continuity_score: number | null;
  voiceover_naturalness_score: number | null;
  audio_continuity_pass: boolean;
  shorts_overlay_probe_executed: boolean;
  shorts_overlay_pass: boolean;
  no_text_in_top_ui_zone: boolean;
  no_critical_text_in_right_ui_zone: boolean;
  no_caption_in_bottom_meta_zone: boolean;
  no_caption_in_bottom_nav_zone: boolean;
  hook_visible_below_top_ui: boolean;
  main_caption_inside_safe_window: boolean;
  caption_newline_probe_executed: boolean;
  caption_text_integrity_pass: boolean;
  mojibake_probe_executed: boolean;
  korean_text_integrity_pass: boolean;
  asr_provider: string | null;
  asr_probe_executed: boolean;
  real_asr_probe_executed: boolean;
  korean_transcript_present: boolean;
  raw_transcript_similarity_score: number | null;
  transcript_similarity_score: number | null;
  recognized_context_anchor_count: number;
  recognized_keyword_anchor_count: number;
  speech_rate_wpm: number | null;
  audio_intelligibility_pass: boolean;
  scene_layout_pass: boolean;
  problem_visual_before_product: boolean;
  distinct_layout_templates: number;
  human_visual_gate_executed: boolean;
  first_frame_ad_like: boolean;
  loss_aversion_hook_large_visible: boolean;
  empty_canvas_ratio: number | null;
  primary_text_area_ratio: number | null;
  product_or_problem_visual_visible_in_first_1s: boolean;
  hook_text_contains_loss_trigger: boolean;
  cta_not_present_too_early: boolean;
  ppt_card_feeling: boolean;
  human_visual_gate_pass: boolean;
  voiceover_review_executed: boolean;
  selected_voice_name: string | null;
  selected_voice_gender: string | null;
  selected_voice_culture: string | null;
  owner_rejected_voice_gender: string | null;
  voice_tone_owner_acceptable: boolean;
  speech_pace_owner_acceptable: boolean;
  voiceover_review_pass: boolean;
  visual_diversity_probe_executed: boolean;
  repeated_single_product_photo: boolean;
  text_color_only_variation: boolean;
  unique_scene_compositions: number;
  product_photo_reuse_ratio: number | null;
  visual_diversity_pass: boolean;
  real_storyboard_gate_executed: boolean;
  single_product_photo_reuse_count: number;
  product_photo_dominant_scene_count: number;
  unique_non_product_scene_source_count: number;
  problem_scene_count: number;
  use_case_scene_count: number;
  comparison_scene_count: number;
  checklist_scene_count: number;
  cta_scene_count: number;
  before_after_comparison_present: boolean;
  use_case_visual_present: boolean;
  real_storyboard_gate_pass: boolean;
  voice_provider_review_executed: boolean;
  voice_provider_name: string | null;
  voice_provider_approved: boolean;
  windows_sapi_used: boolean;
  voiceover_rejected_local_sapi_voice: boolean;
  voice_provider_gate_pass: boolean;
};

export type RenderRealityReviewArtifactPaths = {
  reviewRoot: string;
  actualFrameContactSheetPath: string;
  actualFrameProbePath: string;
  captionBboxProbePath: string;
  audioContinuityProbePath: string;
  shortsOverlayContactSheetPath: string;
  shortsOverlayProbePath: string;
  captionTextIntegrityProbePath: string;
  captionTextIntegrityReportPath: string;
  titleDescriptionIntegrityProbePath: string;
  audioAsrProbePath: string;
  audioIntelligibilityReportPath: string;
  asrTranscriptPath: string;
  sceneLayoutProbePath: string;
  humanVisualGatePath: string;
  humanReviewSummaryPath: string;
  humanReviewChecklistPath: string;
  localReviewVideoPath: string;
  reviewSummaryPath: string;
};

const MIN_ACTUAL_FRAME_SAMPLE_COUNT = 10;
const MIN_ACTUAL_FRAME_HASH_UNIQUE_RATIO = 0.65;
const MIN_FOREGROUND_POSITION_CHANGE_COUNT = 5;
const MIN_FOREGROUND_SCALE_CHANGE_COUNT = 5;
const MIN_LAYOUT_STRUCTURE_CHANGE_COUNT = 6;
const MAX_BACKGROUND_ONLY_CHANGE_RATIO = 0.3;
const MAX_SAME_COMPOSITION_RATIO = 0.35;
const MAX_CAPTION_LINES = 2;
const MAX_SILENCE_BETWEEN_SEGMENTS_MS = 250;
const MAX_HARD_CUT_COUNT = 1;
const MIN_SPEECH_CONTINUITY_SCORE = 80;
const MIN_VOICEOVER_NATURALNESS_SCORE = 82;
const MIN_ASR_TRANSCRIPT_SIMILARITY_SCORE = 0.82;
const MIN_RECOGNIZED_KEYWORD_ANCHOR_COUNT = 5;
const MIN_RECOGNIZED_CONTEXT_ANCHOR_COUNT = 3;
const MIN_SPEECH_RATE_WPM = 130;
const MAX_SPEECH_RATE_WPM = 170;
const MAX_ASR_SILENCE_BETWEEN_SEGMENTS_MS = 180;
const MIN_ASR_VOICEOVER_NATURALNESS_SCORE = 85;
const MIN_DISTINCT_LAYOUT_TEMPLATE_COUNT = 8;
const MAX_CAPTION_CHARS_PER_LINE = 14;
const MAX_EMPTY_CANVAS_RATIO = 0.35;
const MIN_PRIMARY_TEXT_AREA_RATIO = 0.12;
const MIN_VISUAL_DIVERSITY_SCENE_COMPOSITIONS = 5;
const MAX_PRODUCT_PHOTO_REUSE_RATIO = 0.85;
const MAX_SINGLE_PRODUCT_PHOTO_REUSE_COUNT = 2;
const MAX_PRODUCT_PHOTO_DOMINANT_SCENE_COUNT = 2;
const MIN_UNIQUE_NON_PRODUCT_SCENE_SOURCE_COUNT = 5;
const MIN_REAL_PROBLEM_SCENE_COUNT = 2;
const MIN_REAL_USE_CASE_SCENE_COUNT = 2;
const MOJIBAKE_PATTERNS = [/\?{3,}/, /\u5360/, /\uCC59|\uCC57|\uCC58|\uCC60/];
const SCRIPT_ALIGNMENT_ASR_PROVIDERS = new Set([
  "local_script_alignment_probe",
  "script_alignment_probe"
]);

export function evaluateRenderRealityCheck(input: RenderRealityCheckInput): RenderRealityCheckResult {
  const frameProbe = isRecord(input.actual_frame_probe) ? input.actual_frame_probe : {};
  const captionProbe = isRecord(input.caption_bbox_probe) ? input.caption_bbox_probe : {};
  const audioProbe = isRecord(input.audio_continuity_probe) ? input.audio_continuity_probe : {};
  const shortsOverlayProbe = isRecord(input.shorts_ui_overlay_probe) ? input.shorts_ui_overlay_probe : {};
  const captionTextProbe = isRecord(input.caption_text_integrity_probe)
    ? input.caption_text_integrity_probe
    : {};
  const titleDescriptionProbe = isRecord(input.title_description_integrity_probe)
    ? input.title_description_integrity_probe
    : {};
  const koreanAsrProbe = isRecord(input.korean_asr_probe) ? input.korean_asr_probe : {};
  const sceneLayoutProbe = isRecord(input.scene_layout_probe) ? input.scene_layout_probe : {};
  const humanVisualGateProbe = isRecord(input.human_visual_gate_probe)
    ? input.human_visual_gate_probe
    : {};
  const voiceoverReviewProbe = isRecord(input.voiceover_review_probe)
    ? input.voiceover_review_probe
    : {};
  const visualDiversityProbe = isRecord(input.visual_diversity_probe)
    ? input.visual_diversity_probe
    : {};
  const realStoryboardProbe = isRecord(input.real_storyboard_probe)
    ? input.real_storyboard_probe
    : {};
  const voiceProviderProbe = isRecord(input.voice_provider_probe)
    ? input.voice_provider_probe
    : {};
  const renderedFrameContactSheetGenerated = input.rendered_frame_contact_sheet_generated === true;
  const actualFrameSampleCount = normalizeNonNegativeNumber(frameProbe.actual_frame_sample_count) ?? 0;
  const actualFrameHashUniqueRatio = normalizeRatio(frameProbe.actual_frame_hash_unique_ratio);
  const foregroundProductPositionChangeCount =
    normalizeNonNegativeNumber(frameProbe.foreground_product_position_change_count) ?? 0;
  const foregroundProductScaleChangeCount =
    normalizeNonNegativeNumber(frameProbe.foreground_product_scale_change_count) ?? 0;
  const layoutStructureChangeCount = normalizeNonNegativeNumber(frameProbe.layout_structure_change_count) ?? 0;
  const backgroundOnlyChangeRatio = normalizeRatio(frameProbe.background_only_change_ratio);
  const sameCompositionRatio = normalizeRatio(frameProbe.same_composition_ratio);
  const actualCaptionSafeAreaPass = captionProbe.actual_caption_safe_area_pass === true;
  const actualNoTextClipped = captionProbe.actual_no_text_clipped === true;
  const actualNoCaptionOverlapsRightUi = captionProbe.actual_no_caption_overlaps_right_ui === true;
  const maxCaptionLines = normalizePositiveNumber(captionProbe.max_caption_lines);
  const hookTitleVisibleActual = captionProbe.hook_title_visible_actual === true;
  const hookTitleContrastActualPass = captionProbe.hook_title_contrast_actual_pass === true;
  const audioStreamPresent = audioProbe.audio_stream_present === true;
  const maxSilenceBetweenSegmentsMs =
    normalizeNonNegativeNumber(audioProbe.max_silence_between_segments_ms);
  const hardCutCount = normalizeNonNegativeNumber(audioProbe.hard_cut_count) ?? 0;
  const audioLoudnessNormalized = audioProbe.audio_loudness_normalized === true;
  const audioPeakNotClipped = audioProbe.audio_peak_not_clipped === true;
  const speechContinuityScore = normalizeNonNegativeNumber(audioProbe.speech_continuity_score);
  const voiceoverNaturalnessScore = normalizeNonNegativeNumber(audioProbe.voiceover_naturalness_score);
  const shortsOverlayProbeExecuted = shortsOverlayProbe.shorts_overlay_probe_executed === true;
  const noTextInTopUiZone = shortsOverlayProbe.no_text_in_top_ui_zone === true;
  const noCriticalTextInRightUiZone = shortsOverlayProbe.no_critical_text_in_right_ui_zone === true;
  const noCaptionInBottomMetaZone = shortsOverlayProbe.no_caption_in_bottom_meta_zone === true;
  const noCaptionInBottomNavZone = shortsOverlayProbe.no_caption_in_bottom_nav_zone === true;
  const hookVisibleBelowTopUi = shortsOverlayProbe.hook_visible_below_top_ui === true;
  const mainCaptionInsideSafeWindow = shortsOverlayProbe.main_caption_inside_safe_window === true;
  const captionNewlineProbeExecuted = captionTextProbe.caption_newline_probe_executed === true;
  const captions = normalizeStringArray(captionTextProbe.captions);
  const mojibakeProbeExecuted = titleDescriptionProbe.mojibake_probe_executed === true;
  const title = safeTrim(titleDescriptionProbe.title);
  const description = safeTrim(titleDescriptionProbe.description);
  const asrProvider = safeTrim(koreanAsrProbe.asr_provider);
  const asrProbeExecuted = koreanAsrProbe.asr_probe_executed === true;
  const realAsrProbeExecuted =
    koreanAsrProbe.real_asr_probe_executed === true &&
    !isScriptAlignmentAsrProvider(asrProvider);
  const koreanTranscriptPresent = koreanAsrProbe.korean_transcript_present === true;
  const rawTranscriptSimilarityScore =
    normalizeRatio(koreanAsrProbe.raw_transcript_similarity_score);
  const transcriptSimilarityScore = normalizeRatio(koreanAsrProbe.transcript_similarity_score);
  const coreAnchorRecognitionPass = koreanAsrProbe.core_anchor_recognition_pass === true;
  const recognizedContextAnchorCount =
    normalizeNonNegativeNumber(koreanAsrProbe.recognized_context_anchor_count) ??
    normalizeStringArray(koreanAsrProbe.recognized_context_anchors).length;
  const recognizedKeywordAnchorCount =
    normalizeNonNegativeNumber(koreanAsrProbe.recognized_keyword_anchor_count) ?? 0;
  const speechRateWpm = normalizeNonNegativeNumber(koreanAsrProbe.speech_rate_wpm);
  const asrMaxSilenceBetweenSegmentsMs =
    normalizeNonNegativeNumber(koreanAsrProbe.max_silence_between_segments_ms);
  const asrHardCutCount = normalizeNonNegativeNumber(koreanAsrProbe.hard_cut_count) ?? 0;
  const asrVoiceoverNaturalnessScore =
    normalizeNonNegativeNumber(koreanAsrProbe.voiceover_naturalness_score);
  const staticProductCardFeeling = sceneLayoutProbe.static_product_card_feeling === true;
  const productDominatesTooManyScenes = sceneLayoutProbe.product_dominates_too_many_scenes === true;
  const backgroundOnlyMotion = sceneLayoutProbe.background_only_motion === true;
  const sceneLayoutTooSimilar = sceneLayoutProbe.scene_layout_too_similar === true;
  const problemVisualBeforeProduct = sceneLayoutProbe.problem_visual_before_product === true;
  const distinctLayoutTemplates = normalizeNonNegativeNumber(sceneLayoutProbe.distinct_layout_templates) ?? 0;
  const humanVisualGateExecuted = humanVisualGateProbe.human_visual_gate_executed === true;
  const firstFrameAdLike = humanVisualGateProbe.first_frame_ad_like === true;
  const lossAversionHookLargeVisible = humanVisualGateProbe.loss_aversion_hook_large_visible === true;
  const emptyCanvasRatio = normalizeRatio(humanVisualGateProbe.empty_canvas_ratio);
  const primaryTextAreaRatio = normalizeRatio(humanVisualGateProbe.primary_text_area_ratio);
  const productOrProblemVisualVisibleInFirst1s =
    humanVisualGateProbe.product_or_problem_visual_visible_in_first_1s === true;
  const hookTextContainsLossTrigger = humanVisualGateProbe.hook_text_contains_loss_trigger === true;
  const humanProblemBeforeProduct = humanVisualGateProbe.problem_before_product_visible === true;
  const ctaNotPresentTooEarly = humanVisualGateProbe.cta_not_present_too_early === true;
  const pptCardFeeling = humanVisualGateProbe.ppt_card_feeling === true;
  const voiceoverReviewExecuted = voiceoverReviewProbe.voiceover_review_executed === true;
  const selectedVoiceName = safeTrim(voiceoverReviewProbe.selected_voice_name);
  const selectedVoiceGender = safeTrim(voiceoverReviewProbe.selected_voice_gender);
  const selectedVoiceCulture = safeTrim(voiceoverReviewProbe.selected_voice_culture);
  const ownerRejectedVoiceGender = safeTrim(voiceoverReviewProbe.owner_rejected_voice_gender);
  const voiceToneOwnerAcceptable = voiceoverReviewProbe.voice_tone_owner_acceptable === true;
  const speechPaceOwnerAcceptable = voiceoverReviewProbe.speech_pace_owner_acceptable === true;
  const visualDiversityProbeExecuted =
    visualDiversityProbe.visual_diversity_probe_executed === true;
  const repeatedSingleProductPhoto = visualDiversityProbe.repeated_single_product_photo === true;
  const textColorOnlyVariation = visualDiversityProbe.text_color_only_variation === true;
  const uniqueSceneCompositions =
    normalizeNonNegativeNumber(visualDiversityProbe.unique_scene_compositions) ?? 0;
  const productPhotoReuseRatio = normalizeRatio(visualDiversityProbe.product_photo_reuse_ratio);
  const realStoryboardGateExecuted = realStoryboardProbe.real_storyboard_gate_executed === true;
  const singleProductPhotoReuseCount =
    normalizeNonNegativeNumber(realStoryboardProbe.single_product_photo_reuse_count) ?? 0;
  const productPhotoDominantSceneCount =
    normalizeNonNegativeNumber(realStoryboardProbe.product_photo_dominant_scene_count) ?? 0;
  const uniqueNonProductSceneSourceCount =
    normalizeNonNegativeNumber(realStoryboardProbe.unique_non_product_scene_source_count) ?? 0;
  const problemSceneCount = normalizeNonNegativeNumber(realStoryboardProbe.problem_scene_count) ?? 0;
  const useCaseSceneCount = normalizeNonNegativeNumber(realStoryboardProbe.use_case_scene_count) ?? 0;
  const comparisonSceneCount = normalizeNonNegativeNumber(realStoryboardProbe.comparison_scene_count) ?? 0;
  const checklistSceneCount = normalizeNonNegativeNumber(realStoryboardProbe.checklist_scene_count) ?? 0;
  const ctaSceneCount = normalizeNonNegativeNumber(realStoryboardProbe.cta_scene_count) ?? 0;
  const realStoryboardProblemBeforeProduct =
    realStoryboardProbe.problem_before_product_visible === true;
  const beforeAfterComparisonPresent =
    realStoryboardProbe.before_after_comparison_present === true;
  const useCaseVisualPresent = realStoryboardProbe.use_case_visual_present === true;
  const realStoryboardTextColorOnlyVariation =
    realStoryboardProbe.text_color_only_variation === true;
  const voiceProviderReviewExecuted = voiceProviderProbe.voice_provider_review_executed === true;
  const voiceProviderName = safeTrim(voiceProviderProbe.voice_provider_name);
  const voiceProviderConfigured = voiceProviderProbe.voice_provider_configured === true;
  const voiceProviderApproved = voiceProviderProbe.voice_provider_approved === true;
  const koreanVoiceCapable = voiceProviderProbe.korean_capable === true;
  const windowsSapiUsed = voiceProviderProbe.windows_sapi_used === true;
  const voiceoverRejectedLocalSapiVoice =
    voiceProviderProbe.voiceover_rejected_local_sapi_voice === true;
  const paidOrCloudRequiresApproval = voiceProviderProbe.paid_or_cloud_requires_approval === true;
  const voiceProviderCanGenerate = voiceProviderProbe.can_generate === true;
  const voiceProviderBlocker = normalizeVoiceProviderBlocker(voiceProviderProbe.voice_provider_blocker);
  const blockedReasons: RenderRealityCheckBlocker[] = [];

  if (!renderedFrameContactSheetGenerated) {
    blockedReasons.push("ACTUAL_CONTACT_SHEET_TOO_SIMILAR");
  }
  if (actualFrameSampleCount < MIN_ACTUAL_FRAME_SAMPLE_COUNT ||
    actualFrameHashUniqueRatio === null ||
    actualFrameHashUniqueRatio < MIN_ACTUAL_FRAME_HASH_UNIQUE_RATIO) {
    blockedReasons.push("ACTUAL_FRAME_HASH_DELTA_TOO_LOW");
  }
  if (foregroundProductPositionChangeCount < MIN_FOREGROUND_POSITION_CHANGE_COUNT ||
    foregroundProductScaleChangeCount < MIN_FOREGROUND_SCALE_CHANGE_COUNT) {
    blockedReasons.push("FOREGROUND_PRODUCT_STATIC_TOO_LONG");
  }
  if (layoutStructureChangeCount < MIN_LAYOUT_STRUCTURE_CHANGE_COUNT) {
    blockedReasons.push("VISUAL_MOTION_SCORE_UNTRUSTED");
  }
  if (backgroundOnlyChangeRatio === null ||
    backgroundOnlyChangeRatio > MAX_BACKGROUND_ONLY_CHANGE_RATIO) {
    blockedReasons.push("BACKGROUND_ONLY_CHANGED");
  }
  if (sameCompositionRatio === null || sameCompositionRatio > MAX_SAME_COMPOSITION_RATIO) {
    blockedReasons.push("ACTUAL_CONTACT_SHEET_TOO_SIMILAR");
  }

  const actualTrueSceneChangePass =
    actualFrameSampleCount >= MIN_ACTUAL_FRAME_SAMPLE_COUNT &&
    actualFrameHashUniqueRatio !== null &&
    actualFrameHashUniqueRatio >= MIN_ACTUAL_FRAME_HASH_UNIQUE_RATIO &&
    foregroundProductPositionChangeCount >= MIN_FOREGROUND_POSITION_CHANGE_COUNT &&
    foregroundProductScaleChangeCount >= MIN_FOREGROUND_SCALE_CHANGE_COUNT &&
    layoutStructureChangeCount >= MIN_LAYOUT_STRUCTURE_CHANGE_COUNT &&
    backgroundOnlyChangeRatio !== null &&
    backgroundOnlyChangeRatio <= MAX_BACKGROUND_ONLY_CHANGE_RATIO &&
    sameCompositionRatio !== null &&
    sameCompositionRatio <= MAX_SAME_COMPOSITION_RATIO &&
    renderedFrameContactSheetGenerated;

  if (!actualTrueSceneChangePass) {
    blockedReasons.push("TRUE_SCENE_CHANGE_FALSE_POSITIVE");
  }
  if (!actualCaptionSafeAreaPass) {
    blockedReasons.push("CAPTION_OUT_OF_ACTUAL_FRAME");
  }
  if (!actualNoCaptionOverlapsRightUi) {
    blockedReasons.push("CAPTION_OVERLAPS_SHORTS_UI");
  }
  if (!actualNoTextClipped) {
    blockedReasons.push("CAPTION_CLIPPED_IN_RENDERED_FRAME");
  }
  if (maxCaptionLines === null || maxCaptionLines > MAX_CAPTION_LINES) {
    blockedReasons.push("CAPTION_TOO_LONG_FOR_TWO_LINES");
  }
  if (!hookTitleVisibleActual || !hookTitleContrastActualPass) {
    blockedReasons.push("HOOK_TITLE_LOW_VISIBILITY_ACTUAL");
  }
  if (!audioStreamPresent || maxSilenceBetweenSegmentsMs === null ||
    maxSilenceBetweenSegmentsMs > MAX_SILENCE_BETWEEN_SEGMENTS_MS) {
    blockedReasons.push("VOICEOVER_SEGMENT_GAPS_TOO_LONG");
  }
  if (hardCutCount > MAX_HARD_CUT_COUNT) {
    blockedReasons.push("VOICEOVER_HARD_CUTS_DETECTED");
  }
  if (speechContinuityScore === null || speechContinuityScore < MIN_SPEECH_CONTINUITY_SCORE) {
    blockedReasons.push("VOICEOVER_UNINTELLIGIBLE");
  }
  if (!audioLoudnessNormalized || !audioPeakNotClipped) {
    blockedReasons.push("VOICEOVER_LOUDNESS_UNNORMALIZED");
  }
  if (voiceoverNaturalnessScore === null || voiceoverNaturalnessScore < MIN_VOICEOVER_NATURALNESS_SCORE) {
    blockedReasons.push("VOICEOVER_TOO_ROBOTIC");
  }

  if (shortsOverlayProbeExecuted) {
    if (!noTextInTopUiZone) {
      blockedReasons.push("TEXT_UNDER_TOP_CHIPS");
      blockedReasons.push("SHORTS_UI_OVERLAY_TEXT_BLOCKED");
    }
    if (!noCriticalTextInRightUiZone) {
      blockedReasons.push("CAPTION_OVERLAPS_RIGHT_BUTTONS");
      blockedReasons.push("SHORTS_UI_OVERLAY_TEXT_BLOCKED");
    }
    if (!noCaptionInBottomMetaZone) {
      blockedReasons.push("CAPTION_OVERLAPS_BOTTOM_META");
      blockedReasons.push("SHORTS_UI_OVERLAY_TEXT_BLOCKED");
    }
    if (!noCaptionInBottomNavZone) {
      blockedReasons.push("CAPTION_OVERLAPS_BOTTOM_NAV");
      blockedReasons.push("SHORTS_UI_OVERLAY_TEXT_BLOCKED");
    }
    if (!hookVisibleBelowTopUi) {
      blockedReasons.push("HOOK_HIDDEN_BY_SHORTS_UI");
      blockedReasons.push("SHORTS_UI_OVERLAY_TEXT_BLOCKED");
    }
    if (!mainCaptionInsideSafeWindow) {
      blockedReasons.push("SHORTS_UI_OVERLAY_TEXT_BLOCKED");
    }
  }

  if (captionNewlineProbeExecuted) {
    for (const caption of captions) {
      if (caption.includes("\\n")) {
        blockedReasons.push("CAPTION_LITERAL_BACKSLASH_N_VISIBLE");
      }
      if (hasLiteralNLineJoin(caption)) {
        blockedReasons.push("CAPTION_NEWLINE_ESCAPED_AS_LITERAL_N");
      }
      const lines = caption.split(/\r?\n/);
      if (lines.length > MAX_CAPTION_LINES ||
        lines.some((line) => countVisibleChars(line) > MAX_CAPTION_CHARS_PER_LINE)) {
        blockedReasons.push("CAPTION_TOO_LONG_FOR_SAFE_AREA");
      }
    }
  }

  if (mojibakeProbeExecuted) {
    if (hasMojibake(title)) {
      blockedReasons.push("YOUTUBE_TITLE_MOJIBAKE");
    }
    if (hasMojibake(description)) {
      blockedReasons.push("YOUTUBE_DESCRIPTION_MOJIBAKE");
    }
    if (hasQuestionMarkReplacement(title) || hasQuestionMarkReplacement(description)) {
      blockedReasons.push("KOREAN_TEXT_REPLACED_WITH_QUESTION_MARKS");
    }
    if (description?.includes("쿠팡") && hasMojibake(description)) {
      blockedReasons.push("KOREAN_DISCLOSURE_GARBLED");
    }
  }

  if (!asrProvider || !asrProbeExecuted || !realAsrProbeExecuted) {
    blockedReasons.push("AUDIO_ASR_PROVIDER_NOT_CONFIGURED");
  } else {
    if (rawTranscriptSimilarityScore === null ||
      rawTranscriptSimilarityScore < MIN_ASR_TRANSCRIPT_SIMILARITY_SCORE) {
      blockedReasons.push("RAW_ASR_SIMILARITY_TOO_LOW");
    }
    if (!koreanTranscriptPresent ||
      transcriptSimilarityScore === null ||
      transcriptSimilarityScore < MIN_ASR_TRANSCRIPT_SIMILARITY_SCORE) {
      blockedReasons.push("VOICEOVER_UNINTELLIGIBLE_ASR_FAILED");
    }
    if (recognizedContextAnchorCount < MIN_RECOGNIZED_CONTEXT_ANCHOR_COUNT) {
      blockedReasons.push("VOICEOVER_CONTEXT_ANCHORS_MISSING");
    }
    if (recognizedKeywordAnchorCount < MIN_RECOGNIZED_KEYWORD_ANCHOR_COUNT) {
      blockedReasons.push("VOICEOVER_KEYWORD_ANCHORS_MISSING");
    }
    if (!coreAnchorRecognitionPass) {
      blockedReasons.push("VOICEOVER_PRODUCT_CORE_ANCHORS_MISSING");
    }
    if (speechRateWpm === null ||
      speechRateWpm < MIN_SPEECH_RATE_WPM ||
      speechRateWpm > MAX_SPEECH_RATE_WPM) {
      blockedReasons.push("VOICEOVER_TOO_FAST");
    }
    if (asrMaxSilenceBetweenSegmentsMs === null ||
      asrMaxSilenceBetweenSegmentsMs > MAX_ASR_SILENCE_BETWEEN_SEGMENTS_MS) {
      blockedReasons.push("VOICEOVER_SEGMENT_GAPS_TOO_LONG");
    }
    if (asrHardCutCount > 0) {
      blockedReasons.push("VOICEOVER_HARD_CUTS_DETECTED");
    }
    if (asrVoiceoverNaturalnessScore === null ||
      asrVoiceoverNaturalnessScore < MIN_ASR_VOICEOVER_NATURALNESS_SCORE) {
      blockedReasons.push("VOICEOVER_TOO_ROBOTIC");
    }
  }

  if (humanVisualGateExecuted) {
    if (!firstFrameAdLike) {
      blockedReasons.push("FIRST_FRAME_NOT_AD_LIKE");
    }
    if (!lossAversionHookLargeVisible) {
      blockedReasons.push("LOSS_AVERSION_NOT_VISIBLE");
    }
    if (emptyCanvasRatio === null || emptyCanvasRatio > MAX_EMPTY_CANVAS_RATIO) {
      blockedReasons.push("EMPTY_CANVAS_TOO_LARGE");
    }
    if (primaryTextAreaRatio === null || primaryTextAreaRatio < MIN_PRIMARY_TEXT_AREA_RATIO) {
      blockedReasons.push("PRIMARY_TEXT_TOO_SMALL");
    }
    if (!productOrProblemVisualVisibleInFirst1s) {
      blockedReasons.push("PRODUCT_OR_PROBLEM_VISUAL_MISSING_FIRST_SECOND");
    }
    if (!hookTextContainsLossTrigger || !humanProblemBeforeProduct || !ctaNotPresentTooEarly) {
      blockedReasons.push("HOOK_COPY_WEAK");
    }
    if (pptCardFeeling) {
      blockedReasons.push("PPT_CARD_FEELING");
    }
  }

  if (voiceoverReviewExecuted) {
    if (selectedVoiceGender &&
      ownerRejectedVoiceGender &&
      selectedVoiceGender.toLowerCase() === ownerRejectedVoiceGender.toLowerCase()) {
      blockedReasons.push("VOICEOVER_REJECTED_LOCAL_SAPI_VOICE");
    }
    if (!voiceToneOwnerAcceptable) {
      blockedReasons.push("VOICEOVER_TONE_REJECTED_BY_OWNER");
    }
    if (!speechPaceOwnerAcceptable) {
      blockedReasons.push("VOICEOVER_PACE_REJECTED_BY_OWNER");
    }
  }

  if (visualDiversityProbeExecuted) {
    if (repeatedSingleProductPhoto ||
      (productPhotoReuseRatio !== null && productPhotoReuseRatio > MAX_PRODUCT_PHOTO_REUSE_RATIO)) {
      blockedReasons.push("REPEATED_SINGLE_PRODUCT_PHOTO");
    }
    if (textColorOnlyVariation) {
      blockedReasons.push("TEXT_COLOR_ONLY_VARIATION");
    }
    if (uniqueSceneCompositions < MIN_VISUAL_DIVERSITY_SCENE_COMPOSITIONS) {
      blockedReasons.push("VISUAL_STORYBOARD_TOO_STATIC");
    }
  }

  if (realStoryboardGateExecuted) {
    if (singleProductPhotoReuseCount > MAX_SINGLE_PRODUCT_PHOTO_REUSE_COUNT) {
      blockedReasons.push("REPEATED_SINGLE_PRODUCT_PHOTO");
    }
    if (productPhotoDominantSceneCount > MAX_PRODUCT_PHOTO_DOMINANT_SCENE_COUNT) {
      blockedReasons.push("PRODUCT_PHOTO_DOMINATES_STORY");
    }
    if (uniqueNonProductSceneSourceCount < MIN_UNIQUE_NON_PRODUCT_SCENE_SOURCE_COUNT ||
      checklistSceneCount < 1 ||
      ctaSceneCount < 1) {
      blockedReasons.push("VISUAL_STORYBOARD_TOO_STATIC");
    }
    if (problemSceneCount < MIN_REAL_PROBLEM_SCENE_COUNT || !realStoryboardProblemBeforeProduct) {
      blockedReasons.push("NO_REAL_PROBLEM_SCENE_SOURCE");
    }
    if (useCaseSceneCount < MIN_REAL_USE_CASE_SCENE_COUNT || !useCaseVisualPresent) {
      blockedReasons.push("NO_REAL_USE_CASE_SCENE_SOURCE");
    }
    if (comparisonSceneCount < 1 || !beforeAfterComparisonPresent) {
      blockedReasons.push("NO_BEFORE_AFTER_COMPARISON");
    }
    if (realStoryboardTextColorOnlyVariation) {
      blockedReasons.push("TEXT_COLOR_ONLY_VARIATION");
    }
  }

  if (voiceProviderReviewExecuted) {
    if (windowsSapiUsed || voiceoverRejectedLocalSapiVoice) {
      blockedReasons.push("VOICEOVER_REJECTED_LOCAL_SAPI_VOICE");
    }
    if (voiceProviderBlocker) {
      blockedReasons.push(voiceProviderBlocker);
    } else {
      if (!voiceProviderName || !voiceProviderConfigured || !voiceProviderCanGenerate) {
        blockedReasons.push("BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED");
      }
      if (!voiceProviderApproved) {
        blockedReasons.push("VOICE_PROVIDER_NOT_APPROVED");
      }
      if (!koreanVoiceCapable) {
        blockedReasons.push("KOREAN_VOICE_PROVIDER_NOT_KOREAN_CAPABLE");
      }
      if (paidOrCloudRequiresApproval) {
        blockedReasons.push("VOICE_PROVIDER_PAID_OR_CLOUD_REQUIRES_APPROVAL");
      }
    }
  }

  if (staticProductCardFeeling) {
    blockedReasons.push("STATIC_PRODUCT_CARD_FEELING");
  }
  if (productDominatesTooManyScenes) {
    blockedReasons.push("PRODUCT_IMAGE_DOMINATES_TOO_MANY_SCENES");
  }
  if (backgroundOnlyMotion) {
    blockedReasons.push("BACKGROUND_ONLY_MOTION");
  }
  if (sceneLayoutTooSimilar || distinctLayoutTemplates < MIN_DISTINCT_LAYOUT_TEMPLATE_COUNT) {
    blockedReasons.push("SCENE_LAYOUT_TOO_SIMILAR");
  }
  if (!problemVisualBeforeProduct) {
    blockedReasons.push("NO_PROBLEM_VISUAL_BEFORE_PRODUCT");
  }

  const uniqueBlockedReasons = [...new Set(blockedReasons)];
  const audioContinuityPass =
    audioStreamPresent &&
    maxSilenceBetweenSegmentsMs !== null &&
    maxSilenceBetweenSegmentsMs <= MAX_SILENCE_BETWEEN_SEGMENTS_MS &&
    hardCutCount <= MAX_HARD_CUT_COUNT &&
    audioLoudnessNormalized &&
    audioPeakNotClipped &&
    speechContinuityScore !== null &&
    speechContinuityScore >= MIN_SPEECH_CONTINUITY_SCORE &&
    voiceoverNaturalnessScore !== null &&
    voiceoverNaturalnessScore >= MIN_VOICEOVER_NATURALNESS_SCORE;
  const shortsOverlayPass =
    !shortsOverlayProbeExecuted ||
    (noTextInTopUiZone &&
      noCriticalTextInRightUiZone &&
      noCaptionInBottomMetaZone &&
      noCaptionInBottomNavZone &&
      hookVisibleBelowTopUi &&
      mainCaptionInsideSafeWindow);
  const captionTextIntegrityPass =
    !captionNewlineProbeExecuted ||
    !uniqueBlockedReasons.some((reason) =>
      reason === "CAPTION_NEWLINE_ESCAPED_AS_LITERAL_N" ||
      reason === "CAPTION_LITERAL_BACKSLASH_N_VISIBLE" ||
      reason === "CAPTION_TOO_LONG_FOR_SAFE_AREA");
  const koreanTextIntegrityPass =
    !mojibakeProbeExecuted ||
    !uniqueBlockedReasons.some((reason) =>
      reason === "YOUTUBE_TITLE_MOJIBAKE" ||
      reason === "YOUTUBE_DESCRIPTION_MOJIBAKE" ||
      reason === "KOREAN_TEXT_REPLACED_WITH_QUESTION_MARKS" ||
      reason === "KOREAN_DISCLOSURE_GARBLED");
  const audioIntelligibilityPass =
    Boolean(asrProvider) &&
    asrProbeExecuted &&
    realAsrProbeExecuted &&
    koreanTranscriptPresent &&
    rawTranscriptSimilarityScore !== null &&
    rawTranscriptSimilarityScore >= MIN_ASR_TRANSCRIPT_SIMILARITY_SCORE &&
    transcriptSimilarityScore !== null &&
    transcriptSimilarityScore >= MIN_ASR_TRANSCRIPT_SIMILARITY_SCORE &&
    recognizedContextAnchorCount >= MIN_RECOGNIZED_CONTEXT_ANCHOR_COUNT &&
    recognizedKeywordAnchorCount >= MIN_RECOGNIZED_KEYWORD_ANCHOR_COUNT &&
    coreAnchorRecognitionPass &&
    speechRateWpm !== null &&
    speechRateWpm >= MIN_SPEECH_RATE_WPM &&
    speechRateWpm <= MAX_SPEECH_RATE_WPM &&
    asrMaxSilenceBetweenSegmentsMs !== null &&
    asrMaxSilenceBetweenSegmentsMs <= MAX_ASR_SILENCE_BETWEEN_SEGMENTS_MS &&
    asrHardCutCount === 0 &&
    asrVoiceoverNaturalnessScore !== null &&
    asrVoiceoverNaturalnessScore >= MIN_ASR_VOICEOVER_NATURALNESS_SCORE;
  const sceneLayoutPass =
    !staticProductCardFeeling &&
    !productDominatesTooManyScenes &&
    !backgroundOnlyMotion &&
    !sceneLayoutTooSimilar &&
    problemVisualBeforeProduct &&
    distinctLayoutTemplates >= MIN_DISTINCT_LAYOUT_TEMPLATE_COUNT;
  const humanVisualGatePass =
    !humanVisualGateExecuted ||
    (firstFrameAdLike &&
      lossAversionHookLargeVisible &&
      emptyCanvasRatio !== null &&
      emptyCanvasRatio <= MAX_EMPTY_CANVAS_RATIO &&
      primaryTextAreaRatio !== null &&
      primaryTextAreaRatio >= MIN_PRIMARY_TEXT_AREA_RATIO &&
      productOrProblemVisualVisibleInFirst1s &&
      hookTextContainsLossTrigger &&
      humanProblemBeforeProduct &&
      ctaNotPresentTooEarly &&
      !pptCardFeeling);
  const voiceoverReviewPass =
    !voiceoverReviewExecuted ||
    (voiceToneOwnerAcceptable &&
      speechPaceOwnerAcceptable &&
      (!selectedVoiceGender ||
        !ownerRejectedVoiceGender ||
        selectedVoiceGender.toLowerCase() !== ownerRejectedVoiceGender.toLowerCase()));
  const visualDiversityPass =
    !visualDiversityProbeExecuted ||
    (!repeatedSingleProductPhoto &&
      !textColorOnlyVariation &&
      uniqueSceneCompositions >= MIN_VISUAL_DIVERSITY_SCENE_COMPOSITIONS &&
      (productPhotoReuseRatio === null || productPhotoReuseRatio <= MAX_PRODUCT_PHOTO_REUSE_RATIO));
  const realStoryboardGatePass =
    !realStoryboardGateExecuted ||
    (singleProductPhotoReuseCount <= MAX_SINGLE_PRODUCT_PHOTO_REUSE_COUNT &&
      productPhotoDominantSceneCount <= MAX_PRODUCT_PHOTO_DOMINANT_SCENE_COUNT &&
      uniqueNonProductSceneSourceCount >= MIN_UNIQUE_NON_PRODUCT_SCENE_SOURCE_COUNT &&
      problemSceneCount >= MIN_REAL_PROBLEM_SCENE_COUNT &&
      useCaseSceneCount >= MIN_REAL_USE_CASE_SCENE_COUNT &&
      comparisonSceneCount >= 1 &&
      checklistSceneCount >= 1 &&
      ctaSceneCount >= 1 &&
      realStoryboardProblemBeforeProduct &&
      beforeAfterComparisonPresent &&
      useCaseVisualPresent &&
      !realStoryboardTextColorOnlyVariation);
  const voiceProviderGatePass =
    !voiceProviderReviewExecuted ||
    (Boolean(voiceProviderName) &&
      voiceProviderConfigured &&
      voiceProviderApproved &&
      koreanVoiceCapable &&
      voiceProviderCanGenerate &&
      !paidOrCloudRequiresApproval &&
      !windowsSapiUsed &&
      !voiceoverRejectedLocalSapiVoice &&
      !voiceProviderBlocker);

  return {
    passed: uniqueBlockedReasons.length === 0,
    blocked_reasons: uniqueBlockedReasons,
    rendered_frame_contact_sheet_generated: renderedFrameContactSheetGenerated,
    actual_frame_sample_count: actualFrameSampleCount,
    actual_frame_hash_unique_ratio: actualFrameHashUniqueRatio,
    foreground_product_position_change_count: foregroundProductPositionChangeCount,
    foreground_product_scale_change_count: foregroundProductScaleChangeCount,
    layout_structure_change_count: layoutStructureChangeCount,
    background_only_change_ratio: backgroundOnlyChangeRatio,
    same_composition_ratio: sameCompositionRatio,
    actual_true_scene_change_pass: actualTrueSceneChangePass,
    actual_caption_safe_area_pass: actualCaptionSafeAreaPass,
    actual_no_text_clipped: actualNoTextClipped,
    actual_no_caption_overlaps_right_ui: actualNoCaptionOverlapsRightUi,
    max_caption_lines: maxCaptionLines,
    hook_title_visible_actual: hookTitleVisibleActual,
    hook_title_contrast_actual_pass: hookTitleContrastActualPass,
    audio_stream_present: audioStreamPresent,
    max_silence_between_segments_ms: maxSilenceBetweenSegmentsMs,
    hard_cut_count: hardCutCount,
    audio_loudness_normalized: audioLoudnessNormalized,
    audio_peak_not_clipped: audioPeakNotClipped,
    speech_continuity_score: speechContinuityScore,
    voiceover_naturalness_score: voiceoverNaturalnessScore,
    audio_continuity_pass: audioContinuityPass,
    shorts_overlay_probe_executed: shortsOverlayProbeExecuted,
    shorts_overlay_pass: shortsOverlayPass,
    no_text_in_top_ui_zone: noTextInTopUiZone,
    no_critical_text_in_right_ui_zone: noCriticalTextInRightUiZone,
    no_caption_in_bottom_meta_zone: noCaptionInBottomMetaZone,
    no_caption_in_bottom_nav_zone: noCaptionInBottomNavZone,
    hook_visible_below_top_ui: hookVisibleBelowTopUi,
    main_caption_inside_safe_window: mainCaptionInsideSafeWindow,
    caption_newline_probe_executed: captionNewlineProbeExecuted,
    caption_text_integrity_pass: captionTextIntegrityPass,
    mojibake_probe_executed: mojibakeProbeExecuted,
    korean_text_integrity_pass: koreanTextIntegrityPass,
    asr_provider: asrProvider,
    asr_probe_executed: asrProbeExecuted,
    real_asr_probe_executed: realAsrProbeExecuted,
    korean_transcript_present: koreanTranscriptPresent,
    raw_transcript_similarity_score: rawTranscriptSimilarityScore,
    transcript_similarity_score: transcriptSimilarityScore,
    recognized_context_anchor_count: recognizedContextAnchorCount,
    recognized_keyword_anchor_count: recognizedKeywordAnchorCount,
    speech_rate_wpm: speechRateWpm,
    audio_intelligibility_pass: audioIntelligibilityPass,
    scene_layout_pass: sceneLayoutPass,
    problem_visual_before_product: problemVisualBeforeProduct,
    distinct_layout_templates: distinctLayoutTemplates,
    human_visual_gate_executed: humanVisualGateExecuted,
    first_frame_ad_like: firstFrameAdLike,
    loss_aversion_hook_large_visible: lossAversionHookLargeVisible,
    empty_canvas_ratio: emptyCanvasRatio,
    primary_text_area_ratio: primaryTextAreaRatio,
    product_or_problem_visual_visible_in_first_1s: productOrProblemVisualVisibleInFirst1s,
    hook_text_contains_loss_trigger: hookTextContainsLossTrigger,
    cta_not_present_too_early: ctaNotPresentTooEarly,
    ppt_card_feeling: pptCardFeeling,
    human_visual_gate_pass: humanVisualGatePass,
    voiceover_review_executed: voiceoverReviewExecuted,
    selected_voice_name: selectedVoiceName,
    selected_voice_gender: selectedVoiceGender,
    selected_voice_culture: selectedVoiceCulture,
    owner_rejected_voice_gender: ownerRejectedVoiceGender,
    voice_tone_owner_acceptable: voiceToneOwnerAcceptable,
    speech_pace_owner_acceptable: speechPaceOwnerAcceptable,
    voiceover_review_pass: voiceoverReviewPass,
    visual_diversity_probe_executed: visualDiversityProbeExecuted,
    repeated_single_product_photo: repeatedSingleProductPhoto,
    text_color_only_variation: textColorOnlyVariation,
    unique_scene_compositions: uniqueSceneCompositions,
    product_photo_reuse_ratio: productPhotoReuseRatio,
    visual_diversity_pass: visualDiversityPass,
    real_storyboard_gate_executed: realStoryboardGateExecuted,
    single_product_photo_reuse_count: singleProductPhotoReuseCount,
    product_photo_dominant_scene_count: productPhotoDominantSceneCount,
    unique_non_product_scene_source_count: uniqueNonProductSceneSourceCount,
    problem_scene_count: problemSceneCount,
    use_case_scene_count: useCaseSceneCount,
    comparison_scene_count: comparisonSceneCount,
    checklist_scene_count: checklistSceneCount,
    cta_scene_count: ctaSceneCount,
    before_after_comparison_present: beforeAfterComparisonPresent,
    use_case_visual_present: useCaseVisualPresent,
    real_storyboard_gate_pass: realStoryboardGatePass,
    voice_provider_review_executed: voiceProviderReviewExecuted,
    voice_provider_name: voiceProviderName,
    voice_provider_approved: voiceProviderApproved,
    windows_sapi_used: windowsSapiUsed,
    voiceover_rejected_local_sapi_voice: voiceoverRejectedLocalSapiVoice,
    voice_provider_gate_pass: voiceProviderGatePass
  };
}

export function buildRenderRealityReviewArtifactPaths(input: {
  cwd: string;
  candidateId: string;
  version: string;
}): RenderRealityReviewArtifactPaths {
  const safeCandidateId = toSafeSlug(input.candidateId);
  const safeVersion = toSafeSlug(input.version);
  const reviewRoot = path.join(input.cwd, "commerce-assets", "review", safeCandidateId, safeVersion);
  return {
    reviewRoot,
    actualFrameContactSheetPath: path.join(reviewRoot, "actual-frame-contact-sheet.jpg"),
    actualFrameProbePath: path.join(reviewRoot, "actual-frame-probe.json"),
    captionBboxProbePath: path.join(reviewRoot, "caption-bbox-probe.json"),
    audioContinuityProbePath: path.join(reviewRoot, "audio-continuity-probe.json"),
    shortsOverlayContactSheetPath: path.join(reviewRoot, "shorts-ui-overlay-contact-sheet.jpg"),
    shortsOverlayProbePath: path.join(reviewRoot, "shorts-ui-overlay-probe.json"),
    captionTextIntegrityProbePath: path.join(reviewRoot, "caption-text-integrity-probe.json"),
    captionTextIntegrityReportPath: path.join(reviewRoot, "caption-text-integrity.json"),
    titleDescriptionIntegrityProbePath: path.join(reviewRoot, "title-description-integrity-probe.json"),
    audioAsrProbePath: path.join(reviewRoot, "audio-asr-probe.json"),
    audioIntelligibilityReportPath: path.join(reviewRoot, "audio-intelligibility-probe.json"),
    asrTranscriptPath: path.join(reviewRoot, "asr-transcript.txt"),
    sceneLayoutProbePath: path.join(reviewRoot, "scene-layout-probe.json"),
    humanVisualGatePath: path.join(reviewRoot, "human-visual-gate.json"),
    humanReviewSummaryPath: path.join(reviewRoot, "human-review-summary.json"),
    humanReviewChecklistPath: path.join(reviewRoot, "human-review-checklist.md"),
    localReviewVideoPath: path.join(reviewRoot, "local-review-video.mp4"),
    reviewSummaryPath: path.join(reviewRoot, "review-summary.json")
  };
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function normalizePositiveNumber(value: unknown) {
  const normalized = normalizeNonNegativeNumber(value);
  return normalized !== null && normalized > 0 ? normalized : null;
}

function normalizeNonNegativeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

function normalizeRatio(value: unknown) {
  const normalized = normalizeNonNegativeNumber(value);
  if (normalized === null || normalized > 1) {
    return null;
  }
  return normalized;
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : null;
}

function isScriptAlignmentAsrProvider(value: string | null) {
  return Boolean(value && SCRIPT_ALIGNMENT_ASR_PROVIDERS.has(value));
}

function normalizeVoiceProviderBlocker(value: unknown): RenderRealityCheckBlocker | null {
  if (typeof value !== "string") {
    return null;
  }
  const allowed: RenderRealityCheckBlocker[] = [
    "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED",
    "VOICEOVER_REJECTED_LOCAL_SAPI_VOICE",
    "VOICE_PROVIDER_NOT_APPROVED",
    "KOREAN_VOICE_PROVIDER_NOT_KOREAN_CAPABLE",
    "VOICE_PROVIDER_GENERATION_FAILED",
    "VOICE_PROVIDER_PAID_OR_CLOUD_REQUIRES_APPROVAL",
    "OWNER_RECORDED_VOICE_FILE_NOT_FOUND",
    "OWNER_RECORDED_VOICE_FILE_INVALID"
  ];
  return allowed.includes(value as RenderRealityCheckBlocker)
    ? value as RenderRealityCheckBlocker
    : null;
}

function hasMojibake(value: string | null) {
  return Boolean(value && MOJIBAKE_PATTERNS.some((pattern) => pattern.test(value)));
}

function hasQuestionMarkReplacement(value: string | null) {
  return Boolean(value && /\?{2,}/.test(value));
}

function hasLiteralNLineJoin(value: string) {
  return /[가-힣]n[가-힣]/.test(value);
}

function countVisibleChars(value: string) {
  return Array.from(value.replace(/\s+/g, "")).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toSafeSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "unknown";
}
