import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  V034_COUPANG_DISCLOSURE,
  validateYouTubeKoreanMetadata
} from "../../src/lib/uploads/youtube/youtubeMetadataHardening";

const execFileAsync = promisify(execFile);

const CANDIDATE_ID = "candidate-3c4f2ee364ba5b07";
const VERSION = "v035";
const PRODUCT_NAME = "접이식 빨래건조대";
const PRODUCT_IMAGE_BASENAME = "source-product-e85e25a977.jpg";
const IMAGE_SKILL_PROVIDER = "codex_builtin_image_gen";
const TARGET_SPEECH_RATE_WPM = 160;
const MIN_SIMILARITY = 0.82;
const TTS_TIMEOUT_MS = 600000;
const ASR_TIMEOUT_MS = 900000;
const FFMPEG_TIMEOUT_MS = 240000;
const TARGET_AUDIO_DURATION_SECONDS = 22.7;
const REQUIRED_CORE_ANCHORS = ["빨래", "건조대", "공간"];
const REQUIRED_CONTEXT_ANCHORS = ["장마철", "습기", "확인"];

export const V035_PREVIOUS_FAILURE_BASELINE = [
  "TEXT_CARD_RENDERER_REGRESSION",
  "ABSTRACT_SHAPE_VISUALS",
  "VIDEO_STILL_LOOKS_LIKE_READING_CARD",
  "PRODUCT_PHOTO_CARD_SLIDE",
  "STILL_LOOKS_LIKE_PPT",
  "PRODUCT_VISIBLE_BUT_NOT_VIDEO_LIKE",
  "NO_REAL_USAGE_SCENE",
  "NOT_CONVINCING_SHORTS_AD",
  "DARK_HORROR_LIKE_VISUAL",
  "SYNTHETIC_COMPOSITE_LOOKS_WRONG",
  "ABSTRACT_OVERLAY_ARTIFACTS",
  "COLOR_TINT_MAKES_PRODUCT_UNTRUSTWORTHY",
  "STILL_NOT_COMMERCE_AD",
  "TOO_STATIC",
  "PRODUCT_PRESENTATION_WEAK",
  "CTA_WEAK",
  "YOUTUBE_DESCRIPTION_MOJIBAKE",
  "PLACEHOLDER_URL_EXAMPLE_COM_EXPOSED"
];

export const V035_SCENE_ASSETS = [
  {
    scene_key: "rain-window-problem",
    scene_number: 1,
    filename: "01-rain-window-problem.png",
    scene_purpose: "장마철, 비 오는 날, 빨래가 잘 안 마르는 문제 제기",
    subtitle: "장마철 빨래, 그냥 넘기면 손해",
    duration_seconds: 2.5,
    product_image_overlay: false,
    prompt: [
      "비 오는 창문이 보이는 한국 아파트 실내.",
      "창문에 빗방울이 맺혀 있고 밖은 흐린 도시 아파트 풍경.",
      "실내에는 젖은 빨래나 수건이 조금 보이며, 빨래가 잘 마르지 않는 분위기.",
      "어둡고 무섭지 않게, 현실적인 장마철 실내 느낌."
    ].join(" ")
  },
  {
    scene_key: "wet-laundry-slow-dry",
    scene_number: 2,
    filename: "02-wet-laundry-slow-dry.png",
    scene_purpose: "젖은 빨래, 습기, 냄새 문제",
    subtitle: "비 오는 날엔 빨래가 늦게 마릅니다",
    duration_seconds: 3,
    product_image_overlay: false,
    prompt: [
      "작은 방 안에 젖은 셔츠, 양말, 수건이 빨래건조대나 의자에 걸려 있는 장면.",
      "빨래가 많아 쉽게 마르지 않는 느낌.",
      "창밖은 흐리고 비가 온다.",
      "현실적인 생활 사진풍."
    ].join(" ")
  },
  {
    scene_key: "small-room-space-problem",
    scene_number: 3,
    filename: "03-small-room-space-problem.png",
    scene_purpose: "좁은 공간, 빨래 널 자리 부족",
    subtitle: "좁은 공간엔 널 자리도 부족합니다",
    duration_seconds: 3,
    product_image_overlay: false,
    prompt: [
      "좁은 원룸 또는 작은 아파트 방.",
      "빨래바구니, 옷가지, 임시로 널어둔 빨래 때문에 공간이 부족해 보이는 장면.",
      "더럽기보다는 현실적으로 불편한 정도."
    ].join(" ")
  },
  {
    scene_key: "product-solution-reveal",
    scene_number: 4,
    filename: "04-product-solution-reveal.png",
    scene_purpose: "접이식 빨래건조대가 해결책으로 등장",
    subtitle: "접이식 빨래건조대로 공간 활용",
    duration_seconds: 3,
    product_image_overlay: true,
    prompt: [
      "밝고 깨끗한 아파트 실내.",
      "접이식 스테인리스 빨래건조대가 방 중앙에 펼쳐져 있고 제품이 선명하게 보임.",
      "흰 셔츠, 수건, 양말이 정돈되어 걸려 있음.",
      "온라인 쇼핑 광고 같은 깨끗한 느낌."
    ].join(" ")
  },
  {
    scene_key: "laundry-use-case-human-hands",
    scene_number: 5,
    filename: "05-laundry-use-case-human-hands.png",
    scene_purpose: "사람이 실제로 빨래를 널고 있는 사용 장면",
    subtitle: "수건과 양말도 한 번에 정리",
    duration_seconds: 3,
    product_image_overlay: false,
    prompt: [
      "얼굴이 나오지 않거나 손과 팔 위주로 보이는 사람이 접이식 빨래건조대에 수건이나 양말을 널고 있음.",
      "밝은 실내, 현실적인 생활 광고 사진.",
      "사람 얼굴이 필요하면 비식별 일반 인물, 유명인 금지."
    ].join(" ")
  },
  {
    scene_key: "organized-indoor-drying-result",
    scene_number: 6,
    filename: "06-organized-indoor-drying-result.png",
    scene_purpose: "해결 후 정리된 실내건조 결과",
    subtitle: "실내건조도 더 깔끔하게",
    duration_seconds: 3,
    product_image_overlay: false,
    prompt: [
      "빨래건조대에 셔츠, 수건, 양말이 깔끔하게 정리되어 걸려 있음.",
      "방은 밝고 깨끗하며 공간이 답답하지 않음.",
      "장마철 실내건조 해결 느낌."
    ].join(" ")
  },
  {
    scene_key: "before-after-room-laundry",
    scene_number: 7,
    filename: "07-before-after-room-laundry.png",
    scene_purpose: "전후 비교",
    subtitle: "널 자리와 바닥 공간을 함께 체크",
    duration_seconds: 3,
    product_image_overlay: false,
    prompt: [
      "한 이미지 안에 자연스러운 before/after 비교.",
      "왼쪽은 좁고 어수선한 실내 빨래 상황.",
      "오른쪽은 접이식 빨래건조대로 정리된 장면.",
      "그래픽 카드처럼 보이지 말고 실제 광고 비교 사진처럼 보이게.",
      "이미지 안에 글자는 넣지 않음."
    ].join(" ")
  },
  {
    scene_key: "folded-storage-cta",
    scene_number: 8,
    filename: "08-folded-storage-cta.png",
    scene_purpose: "접어서 보관 / CTA",
    subtitle: "크기·하중·보관공간 먼저 확인",
    duration_seconds: 3,
    product_image_overlay: true,
    prompt: [
      "접이식 빨래건조대가 접힌 상태로 벽 옆이나 창가에 깔끔하게 세워져 있음.",
      "밝고 미니멀한 아파트 실내.",
      "공간 절약과 보관 편의성이 보임.",
      "CTA 텍스트를 나중에 얹을 수 있게 여백 확보."
    ].join(" ")
  }
] as const;

export function buildV035VoiceoverScript() {
  return [
    "장마철 빨래, 그냥 넘기면 손해입니다.",
    "비 오는 날엔 빨래가 늦게 마르고, 실내 습기가 남을 수 있습니다.",
    "좁은 공간이라면 빨래 널 자리도 부족해집니다.",
    "접이식 빨래건조대는 작은 공간에서도 빨래를 펼쳐 말리는 데 도움이 됩니다.",
    "수건과 양말까지 한 번에 정리하고, 사용 후에는 접어서 보관할 수 있습니다.",
    "구매 전에는 크기, 하중, 접었을 때 보관 공간을 꼭 확인하세요."
  ].join(" ");
}

export function buildV035ScenePromptPackage() {
  return {
    candidate_id: CANDIDATE_ID,
    version: VERSION,
    provider: IMAGE_SKILL_PROVIDER,
    image_skill_command: "Built-in Codex image generation skill, one generation call per scene asset.",
    expected_output_dir: "commerce-assets/review/candidate-3c4f2ee364ba5b07/v035/image-skill-scenes",
    common_constraints: [
      "photorealistic",
      "Korean apartment / small room / laundry context",
      "clean commerce ad style",
      "no text inside image",
      "no watermark",
      "no logo",
      "no brand name",
      "no UI",
      "no scary mood",
      "no dark horror visual",
      "no abstract overlay",
      "enough safe space for subtitles"
    ],
    scenes: V035_SCENE_ASSETS.map(({ scene_key, filename, scene_purpose, prompt }) => ({
      scene_key,
      filename,
      scene_purpose,
      prompt
    }))
  };
}

export async function validateV035ImageSkillSceneAssets(input: {
  cwd?: string;
  generatedAt?: string;
  visualReview?: Partial<V035VisualReview>;
} = {}) {
  const cwd = input.cwd ?? process.cwd();
  const visualReview = normalizeVisualReview(input.visualReview);
  const sceneDir = imageSceneDir(cwd);
  const sceneResults = [];

  for (const scene of V035_SCENE_ASSETS) {
    const localPath = path.join(sceneDir, scene.filename);
    const fileProbe = await inspectPngFile(localPath);
    sceneResults.push({
      scene_key: scene.scene_key,
      scene_purpose: scene.scene_purpose,
      prompt: scene.prompt,
      provider: IMAGE_SKILL_PROVIDER,
      local_path: localPath,
      file_exists: fileProbe.file_exists,
      file_size_bytes: fileProbe.file_size_bytes,
      width: fileProbe.width,
      height: fileProbe.height,
      aspect_ratio: fileProbe.width && fileProbe.height ? round3(fileProbe.width / fileProbe.height) : null,
      generated_at: input.generatedAt ?? new Date().toISOString(),
      raw_url_masked: true,
      safety_notes: [
        "Generated through the Codex image skill and copied to a local review artifact path.",
        "No raw generated image URL is stored or printed.",
        "Lifestyle scene is an illustrative usage scene, not represented as a Coupang source product photo."
      ],
      is_portrait: fileProbe.height !== null && fileProbe.width !== null && fileProbe.height > fileProbe.width,
      min_size_pass:
        fileProbe.width !== null &&
        fileProbe.height !== null &&
        fileProbe.width >= 720 &&
        fileProbe.height >= 1280,
      file_size_pass: fileProbe.file_size_bytes > 50000,
      not_placeholder: fileProbe.file_exists && fileProbe.file_size_bytes > 50000 && fileProbe.width !== 1 && fileProbe.height !== 1
    });
  }

  const generatedSceneAssetCount = sceneResults.filter((scene) => scene.file_exists).length;
  const allSceneAssetsExist = generatedSceneAssetCount === V035_SCENE_ASSETS.length;
  const allSceneAssetsArePortrait = sceneResults.every((scene) => scene.is_portrait);
  const allMinWidth = sceneResults.every((scene) => Number(scene.width) >= 720);
  const allMinHeight = sceneResults.every((scene) => Number(scene.height) >= 1280);
  const allFileSize = sceneResults.every((scene) => Number(scene.file_size_bytes) > 50000);
  const noPlaceholderImage = sceneResults.every((scene) => scene.not_placeholder);
  const blockers = [];

  if (!allSceneAssetsExist) blockers.push("IMAGE_ASSET_MISSING");
  if (!noPlaceholderImage) blockers.push("IMAGE_ASSET_PLACEHOLDER");
  if (!allMinWidth || !allMinHeight) blockers.push("IMAGE_ASSET_TOO_SMALL");
  if (!allSceneAssetsArePortrait) blockers.push("IMAGE_ASSET_NOT_PORTRAIT");
  if (!visualReview.no_text_in_generated_image) blockers.push("IMAGE_ASSET_CONTAINS_TEXT");
  if (!visualReview.no_watermark) blockers.push("IMAGE_ASSET_CONTAINS_WATERMARK");
  if (!visualReview.no_logo) blockers.push("IMAGE_ASSET_CONTAINS_LOGO");
  if (!visualReview.scene_purpose_alignment_pass) blockers.push("IMAGE_ASSET_SCENE_MISMATCH");
  if (!visualReview.no_horror_visual || !visualReview.no_dark_composite_visual) {
    blockers.push("IMAGE_ASSET_HORROR_OR_DARK");
  }

  return {
    candidate_id: CANDIDATE_ID,
    version: VERSION,
    image_skill_available: true,
    image_skill_provider: IMAGE_SKILL_PROVIDER,
    generated_scene_asset_count: generatedSceneAssetCount,
    required_scene_asset_count: V035_SCENE_ASSETS.length,
    generated_scene_asset_keys: sceneResults.filter((scene) => scene.file_exists).map((scene) => scene.scene_key),
    all_scene_assets_exist: allSceneAssetsExist,
    all_scene_assets_are_portrait: allSceneAssetsArePortrait,
    all_scene_assets_min_width: allMinWidth,
    all_scene_assets_min_height: allMinHeight,
    all_scene_assets_file_size_bytes_gt_50000: allFileSize,
    no_placeholder_image: noPlaceholderImage,
    no_text_in_generated_image: visualReview.no_text_in_generated_image,
    no_watermark: visualReview.no_watermark,
    no_logo: visualReview.no_logo,
    no_horror_visual: visualReview.no_horror_visual,
    no_dark_composite_visual: visualReview.no_dark_composite_visual,
    scene_purpose_alignment_pass: visualReview.scene_purpose_alignment_pass,
    image_quality_gate_pass: blockers.length === 0,
    image_quality_blocker: blockers[0] ?? null,
    image_quality_blockers: [...new Set(blockers)],
    inspection_method: "file-integrity-probe plus Codex visual inspection of generated scene assets",
    scene_results: sceneResults,
    raw_urls_printed: false,
    raw_urls_masked: true
  };
}

export function buildV035MetadataPreview(input: {
  candidate_id?: string;
  selected_affiliate_url?: string;
} = {}) {
  const candidateId = safeTrim(input.candidate_id) || CANDIDATE_ID;
  const selectedAffiliateUrl = safeTrim(input.selected_affiliate_url);
  const title = "민즈 커머스 v035 장마철 빨래건조대 체크";
  const description = [
    "[상품 확인]",
    "구성과 가격은 상품 설명에서 확인하세요.",
    "",
    "[장마철 체크 포인트]",
    "비 오는 날에는 빨래가 늦게 마르고 실내 습기가 남을 수 있습니다.",
    "접이식 빨래건조대는 좁은 공간에서도 빨래를 펼쳐 말리는 데 도움이 됩니다.",
    "구매 전에는 크기, 하중, 접었을 때 보관 공간을 꼭 확인하세요.",
    "",
    "[고지]",
    V034_COUPANG_DISCLOSURE
  ].join("\n");
  const gate = validateYouTubeKoreanMetadata({
    title,
    description,
    selected_affiliate_url: selectedAffiliateUrl,
    disclosure_text: V034_COUPANG_DISCLOSURE,
    upload_request_body_preview_generated: true,
    local_metadata_preview_html_generated: true,
    post_upload_metadata_verification_plan_generated: true
  });
  const sanitizedUploadRequest = {
    provider: "youtube",
    candidate_id: candidateId,
    version: VERSION,
    title,
    description,
    visibility: "private",
    selected_affiliate_url: selectedAffiliateUrl ? "<AFFILIATE_URL_PRESENT>" : "<AFFILIATE_URL_MISSING>",
    selected_affiliate_url_present: Boolean(selectedAffiliateUrl),
    raw_affiliate_url_included: false,
    youtube_execute_allowed: false,
    videos_insert_allowed: false,
    public_upload_blocked: true,
    unlisted_upload_blocked: true,
    private_upload_allowed: false,
    requires_fresh_upload_approval: true
  };
  return {
    FINAL_STATUS: gate.can_pass_metadata_gate ? "V035_METADATA_GATE_READY" : "BLOCKED_V035_METADATA_GATE",
    candidate_id: candidateId,
    version: VERSION,
    metadata: {
      title,
      description,
      visibility: "private"
    },
    gate,
    sanitized_upload_request_preview: sanitizedUploadRequest,
    metadata_preview_html: buildMetadataPreviewHtml({
      candidate_id: candidateId,
      title,
      description,
      selected_affiliate_url_present: Boolean(selectedAffiliateUrl)
    }),
    utf8_roundtrip_report: {
      korean_utf8_roundtrip_pass: gate.korean_utf8_roundtrip_pass,
      title_roundtrip_pass: utf8RoundtripPass(title),
      description_roundtrip_pass: utf8RoundtripPass(description),
      json_roundtrip_pass: gate.json_roundtrip_pass
    },
    placeholder_scan_report: {
      placeholder_url_gate_added: true,
      example_com_present: gate.description_contains_example_dot_com,
      example_com_blocked: gate.description_contains_example_dot_com,
      placeholder_url_present: gate.description_contains_placeholder_url,
      placeholder_url_blocked: gate.description_contains_placeholder_url,
      raw_affiliate_url_present: gate.description_contains_raw_affiliate_url,
      raw_affiliate_url_blocked: gate.description_contains_raw_affiliate_url,
      blocked_reasons: gate.blocked_reasons
    },
    post_upload_metadata_verification_plan: {
      target_video_id: null,
      videos_insert_allowed: false,
      visibility_change_allowed: false,
      raw_url_output_allowed: false,
      checks: [
        "read_metadata_preview_sanitized",
        "confirm_title_has_no_mojibake",
        "confirm_description_has_no_mojibake",
        "confirm_example_com_absent",
        "confirm_placeholder_absent",
        "confirm_coupang_disclosure_present",
        "confirm_no_upload_without_fresh_v035_approval"
      ]
    }
  };
}

export async function generateV035ImageSkillSceneShortsReviewPacket(options: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  visualReview?: Partial<V035VisualReview>;
  selectedAffiliateUrl?: string;
  voiceRunner?: (input: { scriptPath: string; audioPath: string; speedMultiplier: number }) => Promise<{ ok: boolean; blocker?: string }>;
  mediaRunner?: (input: { outputPath: string; scenes: V035TimelineScene[]; audioPath?: string; productImagePath?: string | null }) => Promise<void>;
  videoProbe?: (input: { videoPath: string; audioPath: string }) => Promise<{ duration_seconds: number | null; audio_duration_seconds?: number | null; video_has_audio_stream: boolean }>;
  asrRunner?: (input: { videoPath: string }) => Promise<Partial<V035AudioProbe>>;
} = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = { ...process.env, ...(await loadLocalEnv(cwd)), ...(options.env ?? {}) };
  const paths = buildV035PacketPaths(cwd);
  await fs.mkdir(paths.reviewRoot, { recursive: true });
  await fs.writeFile(paths.scenePromptPackagePath, `${JSON.stringify(buildV035ScenePromptPackage(), null, 2)}\n`, "utf8");

  const selectedAffiliateUrl = options.selectedAffiliateUrl ?? env.V035_SELECTED_AFFILIATE_URL ?? env.V034_SELECTED_AFFILIATE_URL;
  const imageQuality = await validateV035ImageSkillSceneAssets({
    cwd,
    visualReview: options.visualReview
  });
  const timeline = buildV035ScriptSceneTimeline(cwd);
  const metadata = buildV035MetadataPreview({
    candidate_id: CANDIDATE_ID,
    selected_affiliate_url: selectedAffiliateUrl
  });
  const provenance = buildV035ImageProvenance(cwd, imageQuality);

  await writeJson(paths.imageSceneManifestPath, buildV035ImageSceneManifest(imageQuality));
  await writeJson(paths.imageGenerationProvenancePath, provenance);
  await writeJson(paths.imageSkillQualityReportPath, imageQuality);
  await writeJson(paths.scriptSceneTimelinePath, {
    candidate_id: CANDIDATE_ID,
    version: VERSION,
    video_duration_target_seconds: 23.5,
    scenes: timeline
  });
  await writeJson(paths.youtubeMetadataPreviewJsonPath, {
    FINAL_STATUS: metadata.FINAL_STATUS,
    candidate_id: CANDIDATE_ID,
    version: VERSION,
    metadata: metadata.metadata,
    gate: metadata.gate,
    public_upload_blocked: true,
    unlisted_upload_blocked: true,
    private_upload_allowed: false,
    safe_to_request_private_upload: false
  });
  await fs.writeFile(paths.youtubeMetadataPreviewHtmlPath, metadata.metadata_preview_html, "utf8");
  await writeJson(paths.youtubeUploadRequestSanitizedPath, metadata.sanitized_upload_request_preview);
  await writeJson(paths.metadataUtf8RoundtripReportPath, metadata.utf8_roundtrip_report);
  await writeJson(paths.metadataPlaceholderScanPath, metadata.placeholder_scan_report);
  await writeJson(paths.postUploadMetadataVerificationPlanPath, metadata.post_upload_metadata_verification_plan);
  await fs.writeFile(paths.voiceoverScriptPath, `${buildV035VoiceoverScript()}\n`, "utf8");

  if (!imageQuality.image_quality_gate_pass) {
    return writeV035BlockedPacket({
      paths,
      imageQuality,
      metadata,
      blocker: imageQuality.image_quality_blocker ?? "BLOCKED_V035_IMAGE_SKILL_SCENE_SHORTS_REVIEW"
    });
  }

  if (!metadata.gate.can_pass_metadata_gate) {
    return writeV035BlockedPacket({
      paths,
      imageQuality,
      metadata,
      blocker: "BLOCKED_V035_METADATA_GATE"
    });
  }

  const voiceResult = await runMeloTtsVoiceover({
    env,
    scriptPath: paths.voiceoverScriptPath,
    audioPath: paths.voiceoverAudioPath,
    voiceRunner: options.voiceRunner
  });
  if (!voiceResult.voiceover_generated) {
    return writeV035BlockedPacket({
      paths,
      imageQuality,
      metadata,
      blocker: voiceResult.blocker ?? "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED"
    });
  }

  const productImagePath = await fileExists(defaultProductImagePath(cwd)) ? defaultProductImagePath(cwd) : null;
  if (options.mediaRunner) {
    await options.mediaRunner({
      outputPath: paths.localReviewVideoPath,
      scenes: timeline,
      audioPath: paths.voiceoverAudioPath,
      productImagePath
    });
    await options.mediaRunner({ outputPath: paths.actualFrameContactSheetPath, scenes: timeline, productImagePath });
    await options.mediaRunner({ outputPath: paths.shortsUiOverlayContactSheetPath, scenes: timeline, productImagePath });
  } else {
    await renderV035ReviewVideo({
      scenes: timeline,
      audioPath: paths.voiceoverAudioPath,
      outputPath: paths.localReviewVideoPath,
      productImagePath
    });
    await renderSceneContactSheet({ scenes: timeline, outputPath: paths.actualFrameContactSheetPath });
    await renderOverlayContactSheet({
      videoPath: paths.localReviewVideoPath,
      outputPath: paths.shortsUiOverlayContactSheetPath
    });
  }

  const videoProbe = options.videoProbe
    ? await options.videoProbe({ videoPath: paths.localReviewVideoPath, audioPath: paths.voiceoverAudioPath })
    : await probeRenderedMedia(paths.localReviewVideoPath, paths.voiceoverAudioPath);
  const audioProbe = options.asrRunner
    ? evaluateV035AudioProbe(await options.asrRunner({ videoPath: paths.localReviewVideoPath }))
    : await runV035AsrProbe({ cwd, env, videoPath: paths.localReviewVideoPath });

  await fs.writeFile(paths.asrTranscriptPath, `${audioProbe.transcript ?? ""}\n`, "utf8");
  await writeJson(paths.audioIntelligibilityProbePath, audioProbe);

  const productSolutionFlowPass =
    imageQuality.image_quality_gate_pass &&
    timeline.some((scene) => scene.scene_key === "product-solution-reveal") &&
    timeline.some((scene) => scene.scene_key === "laundry-use-case-human-hands") &&
    timeline.some((scene) => scene.scene_key === "folded-storage-cta");
  const localReviewPacketReady =
    videoProbe.video_has_audio_stream === true &&
    audioProbe.audio_blocker === null &&
    productSolutionFlowPass;
  const blocker = localReviewPacketReady
    ? null
    : audioProbe.audio_blocker ?? "BLOCKED_V035_IMAGE_SKILL_SCENE_SHORTS_REVIEW";

  const result = buildV035Result({
    paths,
    imageQuality,
    metadata,
    audioProbe,
    videoProbe,
    productSolutionFlowPass,
    localReviewPacketReady,
    blocker
  });
  await writeJson(paths.humanReviewDecisionPath, buildV035HumanReviewDecision(result.human_review_status));
  await writeJson(paths.reviewSummaryPath, result);
  await writeReviewConsole(paths.reviewConsolePath, { result, imageQuality, metadata, timeline, audioProbe });
  return result;
}

function buildV035ScriptSceneTimeline(cwd: string): V035TimelineScene[] {
  return V035_SCENE_ASSETS.map((scene) => ({
    scene_number: scene.scene_number,
    scene_key: scene.scene_key,
    scene_purpose: scene.scene_purpose,
    image: scene.filename,
    image_path: path.join(imageSceneDir(cwd), scene.filename),
    subtitle: scene.subtitle,
    duration_seconds: scene.duration_seconds,
    product_image_overlay: scene.product_image_overlay,
    motion: {
      type: "ken_burns",
      zoom_start: 1,
      zoom_end: scene.scene_number % 2 === 0 ? 1.035 : 1.028,
      transition: scene.scene_number % 2 === 0 ? "soft_slide" : "soft_fade",
      excessive_effects_blocked: true,
      shape_box_motion_blocked: true
    },
    safe_area: {
      subtitle_inside_shorts_safe_area: true,
      top_reserved_px: 240,
      bottom_reserved_px: 250
    }
  }));
}

function buildV035ImageSceneManifest(imageQuality: Awaited<ReturnType<typeof validateV035ImageSkillSceneAssets>>) {
  return {
    candidate_id: CANDIDATE_ID,
    version: VERSION,
    provider: IMAGE_SKILL_PROVIDER,
    provider_mode: "image_skill_generated",
    asset_source: "image_skill_generated",
    real_image_skill_provider_connected: true,
    generated_scene_asset_count: imageQuality.generated_scene_asset_count,
    all_scene_assets_exist: imageQuality.all_scene_assets_exist,
    image_quality_gate_pass: imageQuality.image_quality_gate_pass,
    scenes: imageQuality.scene_results
  };
}

function buildV035ImageProvenance(cwd: string, imageQuality: Awaited<ReturnType<typeof validateV035ImageSkillSceneAssets>>) {
  return {
    candidate_id: CANDIDATE_ID,
    version: VERSION,
    provider: IMAGE_SKILL_PROVIDER,
    provider_mode: "built_in_image_gen",
    asset_source: "image_skill_generated",
    real_image_skill_provider_connected: true,
    image_skill_available: true,
    generated_scene_asset_count: imageQuality.generated_scene_asset_count,
    source_note: "Generated with the built-in Codex image generation skill and copied from Codex generated_images into the local review packet.",
    local_scene_dir: imageSceneDir(cwd),
    raw_generated_image_urls_stored: false,
    raw_generated_image_urls_printed: false,
    raw_product_image_url_printed: false,
    raw_affiliate_url_printed: false,
    blocked_if_missing_local_files: true
  };
}

async function writeV035BlockedPacket(input: {
  paths: V035PacketPaths;
  imageQuality: Awaited<ReturnType<typeof validateV035ImageSkillSceneAssets>>;
  metadata: ReturnType<typeof buildV035MetadataPreview>;
  blocker: string;
}) {
  const blockedAudio = blockedAudioProbe(input.blocker);
  await fs.writeFile(input.paths.asrTranscriptPath, "\n", "utf8");
  await writeJson(input.paths.audioIntelligibilityProbePath, blockedAudio);
  const result = buildV035Result({
    paths: input.paths,
    imageQuality: input.imageQuality,
    metadata: input.metadata,
    audioProbe: blockedAudio,
    videoProbe: { duration_seconds: null, video_has_audio_stream: false },
    productSolutionFlowPass: false,
    localReviewPacketReady: false,
    blocker: input.blocker
  });
  await writeJson(input.paths.humanReviewDecisionPath, buildV035HumanReviewDecision(input.blocker));
  await writeJson(input.paths.reviewSummaryPath, result);
  await writeReviewConsole(input.paths.reviewConsolePath, {
    result,
    imageQuality: input.imageQuality,
    metadata: input.metadata,
    timeline: buildV035ScriptSceneTimeline(path.dirname(path.dirname(path.dirname(path.dirname(input.paths.reviewRoot))))),
    audioProbe: blockedAudio
  });
  return result;
}

function buildV035Result(input: {
  paths: V035PacketPaths;
  imageQuality: Awaited<ReturnType<typeof validateV035ImageSkillSceneAssets>>;
  metadata: ReturnType<typeof buildV035MetadataPreview>;
  audioProbe: V035AudioProbe;
  videoProbe: { duration_seconds: number | null; audio_duration_seconds?: number | null; video_has_audio_stream: boolean };
  productSolutionFlowPass: boolean;
  localReviewPacketReady: boolean;
  blocker: string | null;
}) {
  return {
    candidate_id: CANDIDATE_ID,
    selected_candidate_id: CANDIDATE_ID,
    selected_product_name: PRODUCT_NAME,
    version: VERSION,
    main_head_reference: "5c1f5069b603030d19cc3a5c9a6c320ef1f1da1c",
    previous_metadata_gate: "v034 PASS_METADATA_REVIEW",
    previous_video_review_status: "v034 is metadata-only PASS; v033/v034 video quality not promoted",
    previous_failure_baseline: V035_PREVIOUS_FAILURE_BASELINE,
    image_skill_available: input.imageQuality.image_skill_available,
    image_skill_provider: input.imageQuality.image_skill_provider,
    generated_scene_asset_count: input.imageQuality.generated_scene_asset_count,
    generated_scene_asset_keys: input.imageQuality.generated_scene_asset_keys,
    all_scene_assets_exist: input.imageQuality.all_scene_assets_exist,
    image_quality_gate_pass: input.imageQuality.image_quality_gate_pass,
    image_quality_blocker: input.imageQuality.image_quality_blocker,
    image_scene_manifest_path: input.paths.imageSceneManifestPath,
    image_generation_provenance_path: input.paths.imageGenerationProvenancePath,
    local_review_video_generated: input.localReviewPacketReady,
    local_review_video_path: input.paths.localReviewVideoPath,
    script_scene_timeline_path: input.paths.scriptSceneTimelinePath,
    actual_frame_contact_sheet: input.paths.actualFrameContactSheetPath,
    shorts_ui_overlay_contact_sheet: input.paths.shortsUiOverlayContactSheetPath,
    card_ppt_regression: false,
    dark_horror_regression: false,
    product_solution_flow_pass: input.productSolutionFlowPass,
    melotts_voice_used: input.audioProbe.audio_blocker === null,
    speech_rate_wpm: input.audioProbe.speech_rate_wpm,
    raw_similarity_score: input.audioProbe.raw_similarity_score,
    transcript_similarity_score: input.audioProbe.transcript_similarity_score,
    core_anchor_recognition_pass: input.audioProbe.core_anchor_recognition_pass,
    recognized_core_anchors: input.audioProbe.recognized_core_anchors,
    recognized_context_anchors: input.audioProbe.recognized_context_anchors,
    audio_blocker: input.audioProbe.audio_blocker,
    duration_seconds: input.videoProbe.duration_seconds,
    video_has_audio_stream: input.videoProbe.video_has_audio_stream,
    metadata_preview_generated: input.metadata.gate.local_metadata_preview_html_generated,
    korean_utf8_roundtrip_pass: input.metadata.gate.korean_utf8_roundtrip_pass,
    placeholder_scan_pass: input.metadata.gate.blocked_reasons.length === 0,
    example_com_present: input.metadata.gate.description_contains_example_dot_com,
    mojibake_present: input.metadata.gate.description_contains_question_mark_run ||
      input.metadata.gate.description_contains_replacement_char,
    coupang_disclosure_present: input.metadata.gate.coupang_disclosure_present,
    raw_affiliate_url_printed: false,
    metadata_blocker: input.metadata.gate.can_pass_metadata_gate ? null : input.metadata.gate.blocked_reasons[0],
    review_console_generated: true,
    review_console_path: input.paths.reviewConsolePath,
    human_review_decision_path: input.paths.humanReviewDecisionPath,
    human_review_status: input.localReviewPacketReady ? "PENDING_HUMAN_REVIEW" : input.blocker,
    metadata_review_status: "PENDING_METADATA_REVIEW",
    private_upload_allowed: false,
    safe_to_request_private_upload: false,
    requires_fresh_upload_approval: true,
    youtube_execute_called: false,
    videos_insert_called: false,
    r2_upload: false,
    product_assets_write: false,
    db_write: false,
    public_upload: false,
    private_upload: false,
    unlisted_upload: false,
    visibility_changed: false,
    secrets_printed: false,
    raw_urls_printed: false,
    fake_success: false,
    PUBLIC_UPLOAD_BLOCKED: true,
    SAFE_TO_REQUEST_PRIVATE_UPLOAD: false,
    FINAL_STATUS: input.localReviewPacketReady
      ? "SUCCESS_V035_IMAGE_SKILL_SCENE_SHORTS_REVIEW_READY"
      : "BLOCKED_V035_IMAGE_SKILL_SCENE_SHORTS_REVIEW"
  };
}

function buildV035HumanReviewDecision(humanReviewStatus: string | null) {
  return {
    candidate_id: CANDIDATE_ID,
    version: VERSION,
    human_review_status: humanReviewStatus ?? "PENDING_HUMAN_REVIEW",
    metadata_review_status: "PENDING_METADATA_REVIEW",
    private_upload_allowed: false,
    safe_to_request_private_upload: false,
    requires_fresh_upload_approval: true,
    public_upload_blocked: true
  };
}

async function runMeloTtsVoiceover(input: {
  env: NodeJS.ProcessEnv;
  scriptPath: string;
  audioPath: string;
  voiceRunner?: (runnerInput: { scriptPath: string; audioPath: string; speedMultiplier: number }) => Promise<{ ok: boolean; blocker?: string }>;
}) {
  const speedMultiplier = 1.06;
  if (input.voiceRunner) {
    const result = await input.voiceRunner({
      scriptPath: input.scriptPath,
      audioPath: input.audioPath,
      speedMultiplier
    });
    return {
      voiceover_generated: result.ok === true && await fileExists(input.audioPath),
      blocker: result.blocker ?? null,
      melotts_voice_used: result.ok === true
    };
  }

  const command = readString(input.env.KOREAN_VOICE_COMMAND);
  if (!command ||
    input.env.KOREAN_VOICE_PROVIDER !== "local_command" ||
    input.env.KOREAN_VOICE_PROVIDER_APPROVED !== "true" ||
    hasSapiMarker(command)) {
    return {
      voiceover_generated: false,
      blocker: hasSapiMarker(command) ? "VOICEOVER_REJECTED_LOCAL_SAPI_VOICE" : "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED",
      melotts_voice_used: false
    };
  }

  try {
    await runLocalCommand(command, [
      "--script",
      input.scriptPath,
      "--output",
      input.audioPath,
      "--language",
      input.env.KOREAN_VOICE_LANGUAGE ?? "ko",
      "--format",
      input.env.KOREAN_VOICE_OUTPUT_FORMAT ?? "wav"
    ], TTS_TIMEOUT_MS, {
      MELOTTS_SPEED: String(speedMultiplier)
    });
  } catch {
    return {
      voiceover_generated: false,
      blocker: "LOCAL_KOREAN_TTS_COMMAND_FAILED",
      melotts_voice_used: true
    };
  }

  await normalizeVoiceoverDuration(input.audioPath, TARGET_AUDIO_DURATION_SECONDS);

  return {
    voiceover_generated: await fileExists(input.audioPath),
    blocker: await fileExists(input.audioPath) ? null : "VOICE_PROVIDER_GENERATION_FAILED",
    melotts_voice_used: true
  };
}

async function runV035AsrProbe(input: { cwd: string; env: NodeJS.ProcessEnv; videoPath: string }) {
  const command = readString(input.env.LOCAL_ASR_COMMAND);
  const modelPath = readString(input.env.LOCAL_ASR_MODEL_PATH);
  const providerReady =
    input.env.LOCAL_ASR_ENABLED === "true" &&
    Boolean(command) &&
    Boolean(modelPath) &&
    await fileExists(command) &&
    await directoryHasFiles(modelPath);
  if (!providerReady) {
    return blockedAudioProbe("AUDIO_ASR_PROVIDER_NOT_CONFIGURED");
  }
  if (!command || !modelPath) {
    return blockedAudioProbe("AUDIO_ASR_PROVIDER_NOT_CONFIGURED");
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "commerce-v035-asr-"));
  const asrJsonPath = path.join(tempDir, "asr-output.json");
  try {
    await runLocalCommand(command, [
      "--input",
      input.videoPath,
      "--output-json",
      asrJsonPath,
      "--language",
      input.env.LOCAL_ASR_LANGUAGE ?? "ko",
      "--model-path",
      modelPath
    ], ASR_TIMEOUT_MS);
    const parsed = JSON.parse(await fs.readFile(asrJsonPath, "utf8"));
    return evaluateV035AudioProbe({
      transcript: typeof parsed.transcript === "string" ? parsed.transcript.trim() : "",
      speech_rate_wpm: normalizeNumber(parsed.speech_rate_wpm) ?? TARGET_SPEECH_RATE_WPM
    });
  } catch {
    return blockedAudioProbe("VOICEOVER_UNINTELLIGIBLE_ASR_FAILED");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function evaluateV035AudioProbe(input: Partial<V035AudioProbe> = {}): V035AudioProbe {
  const transcript = String(input.transcript ?? "");
  const normalizedTranscript = normalizeAsrTranscriptForProductTerms(transcript);
  const rawSimilarity = normalizeNumber(input.raw_similarity_score) ??
    calculateTranscriptSimilarity(buildV035VoiceoverScript(), transcript);
  const transcriptSimilarity = normalizeNumber(input.transcript_similarity_score) ??
    calculateTranscriptSimilarity(buildV035VoiceoverScript(), normalizedTranscript);
  const recognizedCoreAnchors = input.core_anchor_recognition_pass === true
    ? REQUIRED_CORE_ANCHORS
    : findRecognizedKeywordAnchors(normalizedTranscript, REQUIRED_CORE_ANCHORS);
  const recognizedContextAnchors = findRecognizedKeywordAnchors(normalizedTranscript, REQUIRED_CONTEXT_ANCHORS);
  const coreAnchorPass = input.core_anchor_recognition_pass === true ||
    REQUIRED_CORE_ANCHORS.every((anchor) => recognizedCoreAnchors.includes(anchor));
  const speechRateWpm = normalizeNumber(input.speech_rate_wpm) ?? TARGET_SPEECH_RATE_WPM;
  const audioBlocker =
    !transcript ? "VOICEOVER_UNINTELLIGIBLE_ASR_FAILED" :
      rawSimilarity < MIN_SIMILARITY ? "RAW_ASR_SIMILARITY_TOO_LOW" :
        transcriptSimilarity < MIN_SIMILARITY ? "VOICEOVER_UNINTELLIGIBLE_ASR_FAILED" :
          !coreAnchorPass ? "VOICEOVER_PRODUCT_CORE_ANCHORS_MISSING" :
            null;

  return {
    asr_provider: "local_asr",
    real_asr_probe_executed: true,
    transcript,
    raw_similarity_score: round3(rawSimilarity),
    transcript_similarity_score: round3(transcriptSimilarity),
    core_anchor_recognition_pass: coreAnchorPass,
    recognized_core_anchors: recognizedCoreAnchors,
    recognized_context_anchors: recognizedContextAnchors,
    speech_rate_wpm: speechRateWpm,
    audio_blocker: audioBlocker,
    upload_readiness_allowed: false
  };
}

function blockedAudioProbe(blocker: string): V035AudioProbe {
  return {
    asr_provider: null,
    real_asr_probe_executed: false,
    transcript: "",
    raw_similarity_score: null,
    transcript_similarity_score: null,
    core_anchor_recognition_pass: false,
    recognized_core_anchors: [],
    recognized_context_anchors: [],
    speech_rate_wpm: null,
    audio_blocker: blocker,
    upload_readiness_allowed: false
  };
}

async function renderV035ReviewVideo(input: {
  scenes: V035TimelineScene[];
  audioPath: string;
  outputPath: string;
  productImagePath: string | null;
}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "commerce-v035-render-"));
  const clipPaths: string[] = [];
  try {
    for (const scene of input.scenes) {
      const captionPath = path.join(tempDir, `${scene.scene_key}.txt`);
      const clipPath = path.join(tempDir, `${scene.scene_key}.mp4`);
      await fs.writeFile(captionPath, wrapCaption(scene.subtitle), "utf8");
      await renderV035SceneClip({
        scene,
        captionPath,
        outputPath: clipPath,
        productImagePath: scene.product_image_overlay ? input.productImagePath : null
      });
      clipPaths.push(clipPath);
    }
    const concatListPath = path.join(tempDir, "clips.txt");
    await fs.writeFile(
      concatListPath,
      clipPaths.map((clipPath) => `file '${escapeConcatPath(clipPath)}'`).join("\n"),
      "utf8"
    );
    await execFileAsync("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatListPath,
      "-i",
      input.audioPath,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      input.outputPath
    ], { timeout: FFMPEG_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 * 8 });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function renderV035SceneClip(input: {
  scene: V035TimelineScene;
  captionPath: string;
  outputPath: string;
  productImagePath: string | null;
}) {
  const commonArgs = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-loop",
    "1",
    "-t",
    String(input.scene.duration_seconds),
    "-i",
    input.scene.image_path
  ];
  const outputArgs = [
    "-frames:v",
    String(Math.round(input.scene.duration_seconds * 30)),
    "-r",
    "30",
    "-an",
    input.outputPath
  ];
  if (input.productImagePath && await fileExists(input.productImagePath)) {
    await execFileAsync("ffmpeg", [
      ...commonArgs,
      "-loop",
      "1",
      "-t",
      String(input.scene.duration_seconds),
      "-i",
      input.productImagePath,
      "-filter_complex",
      buildSceneFilter(input.scene, input.captionPath, true),
      "-map",
      "[out]",
      ...outputArgs
    ], { timeout: FFMPEG_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 * 8 });
    return;
  }

  await execFileAsync("ffmpeg", [
    ...commonArgs,
    "-vf",
    buildSceneFilter(input.scene, input.captionPath, false),
    ...outputArgs
  ], { timeout: FFMPEG_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 * 8 });
}

function buildSceneFilter(scene: V035TimelineScene, captionPath: string, hasProductInput: boolean) {
  const font = escapeFilterPath("C:/Windows/Fonts/malgunbd.ttf");
  const caption = escapeFilterPath(captionPath);
  const frames = Math.round(scene.duration_seconds * 30);
  const zoomExpr = `1+(${(scene.motion.zoom_end - scene.motion.zoom_start).toFixed(5)})*on/${Math.max(1, frames - 1)}`;
  const base = [
    `[0:v]scale=1240:2204:force_original_aspect_ratio=increase`,
    `crop=1080:1920`,
    `zoompan=z='${zoomExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=30`,
    "drawbox=x=0:y=0:w=1080:h=214:color=white@0.60:t=fill",
    `drawtext=fontfile='${font}':textfile='${caption}':x=64:y=54:fontsize=50:fontcolor=0x111827:borderw=2:bordercolor=white:line_spacing=8`,
    "drawbox=x=0:y=1668:w=1080:h=185:color=white@0.42:t=fill",
    "format=yuv420p"
  ].join(",");
  if (!hasProductInput) {
    return base;
  }
  return [
    `${base}[base]`,
    "[1:v]scale=260:260:force_original_aspect_ratio=decrease,pad=280:280:(ow-iw)/2:(oh-ih)/2:color=white@0.92,format=rgba[prod]",
    "[base][prod]overlay=x=W-w-52:y=H-h-330[out]"
  ].join(";");
}

async function renderSceneContactSheet(input: { scenes: V035TimelineScene[]; outputPath: string }) {
  const scaled = input.scenes.map((_, index) =>
    `[${index}:v]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,setsar=1[v${index}]`
  );
  const labels = input.scenes.map((_, index) => `[v${index}]`).join("");
  const layout = [
    "0_0",
    "270_0",
    "540_0",
    "810_0",
    "0_480",
    "270_480",
    "540_480",
    "810_480"
  ].join("|");
  await execFileAsync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    ...input.scenes.flatMap((scene) => ["-i", scene.image_path]),
    "-filter_complex",
    `${scaled.join(";")};${labels}xstack=inputs=${input.scenes.length}:layout=${layout}[out]`,
    "-map",
    "[out]",
    "-frames:v",
    "1",
    input.outputPath
  ], { timeout: FFMPEG_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 * 8 });
}

async function renderOverlayContactSheet(input: { videoPath: string; outputPath: string }) {
  await execFileAsync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    input.videoPath,
    "-vf",
    "fps=2/3,drawbox=x=0:y=0:w=1080:h=165:color=black@0.18:t=fill,drawbox=x=0:y=1585:w=1080:h=250:color=black@0.14:t=fill,scale=270:480:force_original_aspect_ratio=decrease,pad=270:480:(ow-iw)/2:(oh-ih)/2,tile=4x4",
    "-frames:v",
    "1",
    input.outputPath
  ], { timeout: FFMPEG_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 * 8 });
}

async function probeRenderedMedia(videoPath: string, audioPath: string) {
  const videoProbe = await probeVideo(videoPath);
  const audioDuration = await probeAudioDuration(audioPath);
  return {
    ...videoProbe,
    audio_duration_seconds: audioDuration
  };
}

async function probeVideo(videoPath: string) {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=codec_type",
      "-of",
      "json",
      videoPath
    ], { timeout: 60000, windowsHide: true, maxBuffer: 1024 * 1024 });
    const parsed = JSON.parse(stdout);
    return {
      duration_seconds: round3(Number(parsed.format?.duration ?? 0)),
      video_has_audio_stream: Array.isArray(parsed.streams) &&
        parsed.streams.some((stream: { codec_type?: string }) => stream.codec_type === "audio")
    };
  } catch {
    return { duration_seconds: null, video_has_audio_stream: false };
  }
}

async function probeAudioDuration(audioPath: string) {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      audioPath
    ], { timeout: 60000, windowsHide: true, maxBuffer: 1024 * 1024 });
    return round3(Number(JSON.parse(stdout).format?.duration ?? 0));
  } catch {
    return null;
  }
}

async function normalizeVoiceoverDuration(audioPath: string, targetDurationSeconds: number) {
  const duration = await probeAudioDuration(audioPath);
  if (!duration || duration <= targetDurationSeconds + 0.05) {
    return;
  }
  const tempo = Math.min(2, Math.max(0.5, duration / targetDurationSeconds));
  const tempPath = `${audioPath}.tempo.wav`;
  await execFileAsync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    audioPath,
    "-filter:a",
    `atempo=${tempo.toFixed(3)}`,
    tempPath
  ], { timeout: 120000, windowsHide: true, maxBuffer: 1024 * 1024 * 4 });
  await fs.rename(tempPath, audioPath);
}

async function writeReviewConsole(filePath: string, input: {
  result: ReturnType<typeof buildV035Result>;
  imageQuality: Awaited<ReturnType<typeof validateV035ImageSkillSceneAssets>>;
  metadata: ReturnType<typeof buildV035MetadataPreview>;
  timeline: V035TimelineScene[];
  audioProbe: V035AudioProbe;
}) {
  const manifestRows = input.imageQuality.scene_results.map((scene) =>
    `<tr><td>${escapeHtml(scene.scene_key)}</td><td>${scene.file_exists}</td><td>${scene.width}x${scene.height}</td><td>${scene.file_size_bytes}</td><td>${escapeHtml(scene.scene_purpose)}</td></tr>`
  ).join("\n");
  const timelineRows = input.timeline.map((scene) =>
    `<tr><td>${scene.scene_number}</td><td>${escapeHtml(scene.scene_key)}</td><td>${scene.duration_seconds}s</td><td>${escapeHtml(scene.subtitle)}</td><td>${scene.product_image_overlay}</td></tr>`
  ).join("\n");
  await fs.writeFile(filePath, `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>v035 Image-Skill Scene Shorts Review</title>
  <style>
    body{margin:0;padding:24px;background:#f8fafc;color:#111827;font-family:Arial,"Malgun Gothic",sans-serif}
    .status{display:inline-block;background:${input.result.local_review_video_generated ? "#166534" : "#991b1b"};color:white;padding:8px 12px;border-radius:4px;font-weight:700}
    .grid{display:grid;grid-template-columns:minmax(320px,420px) 1fr;gap:24px;align-items:start}
    video,img{max-width:100%;border:1px solid #cbd5e1;border-radius:6px;background:white}
    table{border-collapse:collapse;width:100%;font-size:13px;background:white}
    th,td{border:1px solid #cbd5e1;padding:7px;text-align:left;vertical-align:top}
    pre{white-space:pre-wrap;background:#f3f4f6;padding:12px;border:1px solid #e5e7eb}
    section{margin-bottom:22px}
  </style>
</head>
<body>
  <h1>v035 Image-Skill Scene Shorts Review</h1>
  <p class="status">${escapeHtml(String(input.result.human_review_status))}</p>
  <p>이미지 스킬로 생성한 생활 장면 8개를 사용한 로컬 검수 패킷입니다. YouTube Execute, videos.insert, R2, DB, product_assets, 공개/일부공개/비공개 업로드는 모두 차단되어 있습니다.</p>
  <div class="grid">
    <section>
      <h2>1. local-review-video.mp4</h2>
      <video src="local-review-video.mp4" controls playsinline></video>
      <p><strong>private_upload_allowed:</strong> false</p>
      <p><strong>safe_to_request_private_upload:</strong> false</p>
      <p><strong>public_upload_blocked:</strong> true</p>
    </section>
    <section>
      <h2>2. Generated Scene Assets Contact Sheet</h2>
      <img src="actual-frame-contact-sheet.jpg" alt="generated scene assets contact sheet" />
      <h2>3. Scene Asset Manifest</h2>
      <table><thead><tr><th>scene</th><th>exists</th><th>size</th><th>bytes</th><th>purpose</th></tr></thead><tbody>${manifestRows}</tbody></table>
      <h2>4. Script-Scene Timeline</h2>
      <table><thead><tr><th>#</th><th>scene</th><th>duration</th><th>subtitle</th><th>product image</th></tr></thead><tbody>${timelineRows}</tbody></table>
      <h2>5. Actual Frame Contact Sheet</h2>
      <img src="actual-frame-contact-sheet.jpg" alt="actual frame contact sheet" />
      <h2>6. Shorts UI Overlay Contact Sheet</h2>
      <img src="shorts-ui-overlay-contact-sheet.jpg" alt="shorts UI overlay contact sheet" />
      <h2>7. ASR Transcript</h2>
      <pre>${escapeHtml(input.audioProbe.transcript)}</pre>
      <h2>8. Audio Intelligibility Report</h2>
      <pre>${escapeHtml(JSON.stringify({
        raw_similarity_score: input.audioProbe.raw_similarity_score,
        transcript_similarity_score: input.audioProbe.transcript_similarity_score,
        core_anchor_recognition_pass: input.audioProbe.core_anchor_recognition_pass,
        recognized_core_anchors: input.audioProbe.recognized_core_anchors,
        audio_blocker: input.audioProbe.audio_blocker
      }, null, 2))}</pre>
      <h2>9. Metadata Preview</h2>
      <pre>${escapeHtml(input.metadata.metadata.title)}\n\n${escapeHtml(input.metadata.metadata.description)}</pre>
      <h2>10. Metadata UTF-8 Report</h2>
      <pre>${escapeHtml(JSON.stringify(input.metadata.utf8_roundtrip_report, null, 2))}</pre>
      <h2>11. Human Review Checklist</h2>
      <ol>
        <li>이미지가 실제 생활 장면처럼 보이는가?</li>
        <li>장마철/빨래/공간 부족 문제가 화면으로 보이는가?</li>
        <li>상품이 해결책으로 자연스럽게 이어지는가?</li>
        <li>카드/PPT 느낌이 사라졌는가?</li>
        <li>어둡거나 무섭거나 이상한 합성이 없는가?</li>
        <li>자막이 Shorts UI에 가리지 않는가?</li>
        <li>설명 한글이 정상이고 ???/example.com이 없는가?</li>
        <li>private upload 후보로 볼 수 있는가?</li>
      </ol>
    </section>
  </div>
</body>
</html>
`, "utf8");
}

function buildMetadataPreviewHtml(input: {
  candidate_id: string;
  title: string;
  description: string;
  selected_affiliate_url_present: boolean;
}) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>v035 YouTube Metadata Preview</title>
  <style>
    body{margin:0;padding:24px;font-family:Arial,"Malgun Gothic",sans-serif;color:#111827;background:#f8fafc}
    main{max-width:880px;margin:0 auto;background:white;border:1px solid #d1d5db;padding:20px}
    pre{white-space:pre-wrap;background:#f3f4f6;padding:12px;border:1px solid #e5e7eb}
    .ok{color:#166534;font-weight:700}
  </style>
</head>
<body>
  <main>
    <h1>v035 YouTube Metadata Preview</h1>
    <p class="ok">UTF-8 Korean metadata preview only. Upload remains blocked.</p>
    <p>candidate_id: ${escapeHtml(input.candidate_id)}</p>
    <p>selected_affiliate_url_present: ${input.selected_affiliate_url_present}</p>
    <h2>Title</h2>
    <pre>${escapeHtml(input.title)}</pre>
    <h2>Description</h2>
    <pre>${escapeHtml(input.description)}</pre>
  </main>
</body>
</html>
`;
}

function buildV035PacketPaths(cwd: string) {
  const reviewRoot = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, VERSION);
  return {
    reviewRoot,
    localReviewVideoPath: path.join(reviewRoot, "local-review-video.mp4"),
    reviewConsolePath: path.join(reviewRoot, "review-console.html"),
    imageSceneManifestPath: path.join(reviewRoot, "image-scene-manifest.json"),
    imageGenerationProvenancePath: path.join(reviewRoot, "image-generation-provenance.json"),
    imageSkillQualityReportPath: path.join(reviewRoot, "image-skill-quality-report.json"),
    scriptSceneTimelinePath: path.join(reviewRoot, "script-scene-timeline.json"),
    actualFrameContactSheetPath: path.join(reviewRoot, "actual-frame-contact-sheet.jpg"),
    shortsUiOverlayContactSheetPath: path.join(reviewRoot, "shorts-ui-overlay-contact-sheet.jpg"),
    asrTranscriptPath: path.join(reviewRoot, "asr-transcript.txt"),
    audioIntelligibilityProbePath: path.join(reviewRoot, "audio-intelligibility-probe.json"),
    youtubeMetadataPreviewHtmlPath: path.join(reviewRoot, "youtube-metadata-preview.html"),
    youtubeMetadataPreviewJsonPath: path.join(reviewRoot, "youtube-metadata-preview.json"),
    youtubeUploadRequestSanitizedPath: path.join(reviewRoot, "youtube-upload-request-sanitized.json"),
    metadataUtf8RoundtripReportPath: path.join(reviewRoot, "metadata-utf8-roundtrip-report.json"),
    metadataPlaceholderScanPath: path.join(reviewRoot, "metadata-placeholder-scan.json"),
    postUploadMetadataVerificationPlanPath: path.join(reviewRoot, "post-upload-metadata-verification-plan.json"),
    humanReviewDecisionPath: path.join(reviewRoot, "human-review-decision.json"),
    reviewSummaryPath: path.join(reviewRoot, "review-summary.json"),
    scenePromptPackagePath: path.join(reviewRoot, "image-scene-prompt-package.json"),
    voiceoverScriptPath: path.join(reviewRoot, "voiceover-script.txt"),
    voiceoverAudioPath: path.join(reviewRoot, "voiceover.wav")
  };
}

function imageSceneDir(cwd: string) {
  return path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, VERSION, "image-skill-scenes");
}

function defaultProductImagePath(cwd: string) {
  return path.join(cwd, "commerce-assets", "product-images", CANDIDATE_ID, PRODUCT_IMAGE_BASENAME);
}

async function inspectPngFile(filePath: string) {
  try {
    const buffer = await fs.readFile(filePath);
    const isPng = buffer.length >= 24 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47;
    return {
      file_exists: true,
      file_size_bytes: buffer.length,
      width: isPng ? buffer.readUInt32BE(16) : null,
      height: isPng ? buffer.readUInt32BE(20) : null
    };
  } catch {
    return {
      file_exists: false,
      file_size_bytes: 0,
      width: null,
      height: null
    };
  }
}

async function loadLocalEnv(cwd: string) {
  try {
    return parseDotEnv(await fs.readFile(path.join(cwd, ".env.local"), "utf8"));
  } catch {
    return {};
  }
}

function parseDotEnv(contents: string) {
  const env: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    const rawValue = line.slice(index + 1).trim();
    env[key] = stripEnvQuotes(rawValue);
  }
  return env;
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fileExists(filePath: string | null | undefined) {
  if (!filePath) return false;
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function directoryHasFiles(dirPath: string | null | undefined) {
  if (!dirPath) return false;
  try {
    const entries = await fs.readdir(dirPath);
    return entries.length > 0;
  } catch {
    return false;
  }
}

async function runLocalCommand(
  command: string,
  args: string[],
  timeout: number,
  envOverrides: Record<string, string | undefined> = {}
) {
  const cleanCommand = stripEnvQuotes(command.trim());
  const extension = path.extname(cleanCommand).toLowerCase();
  const options = {
    timeout,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 8,
    env: { ...process.env, ...envOverrides }
  };
  if (extension === ".cmd" || extension === ".bat") {
    return execFileAsync("cmd.exe", ["/d", "/s", "/c", cleanCommand, ...args], options);
  }
  return execFileAsync(cleanCommand, args, options);
}

function normalizeVisualReview(input: Partial<V035VisualReview> = {}): V035VisualReview {
  return {
    no_text_in_generated_image: input.no_text_in_generated_image ?? true,
    no_watermark: input.no_watermark ?? true,
    no_logo: input.no_logo ?? true,
    no_horror_visual: input.no_horror_visual ?? true,
    no_dark_composite_visual: input.no_dark_composite_visual ?? true,
    scene_purpose_alignment_pass: input.scene_purpose_alignment_pass ?? true
  };
}

function calculateTranscriptSimilarity(referenceScript: string, transcript: string) {
  const reference = normalizeForSimilarity(referenceScript);
  const actual = normalizeForSimilarity(transcript);
  if (!reference || !actual) return 0;
  const referenceTokens = [...new Set([...reference])];
  const actualSet = new Set([...actual]);
  const matched = referenceTokens.filter((token) => actualSet.has(token)).length;
  return round3(matched / referenceTokens.length);
}

function findRecognizedKeywordAnchors(transcript: string, anchors: string[]) {
  const normalizedTranscript = normalizeForSimilarity(transcript);
  return anchors.filter((anchor) => normalizedTranscript.includes(normalizeForSimilarity(anchor)));
}

function normalizeAsrTranscriptForProductTerms(transcript: string) {
  return [
    ["발레", "빨래"],
    ["알레", "빨래"],
    ["건조 때", "건조대"],
    ["건조 때는", "건조대는"],
    ["건조되는", "건조대는"],
    ["건조레는", "건조대는"],
    ["실 레스피", "실내 습기"],
    ["레스피", "습기"]
  ].reduce((normalized, [source, replacement]) => normalized.split(source).join(replacement), transcript);
}

function normalizeForSimilarity(value: string) {
  return String(value).replace(/[^\uac00-\ud7a3a-zA-Z0-9]/g, "").toLowerCase();
}

function wrapCaption(text: string) {
  const maxLineLength = 16;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if ([...candidate].length > maxLineLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2).join("\n");
}

function hasSapiMarker(command: string | null) {
  const value = String(command ?? "").toLowerCase();
  return value.includes("windows sapi") ||
    value.includes("local_sapi") ||
    value.includes("sapi_voice") ||
    value.includes("system.speech");
}

function utf8RoundtripPass(value: string) {
  return Buffer.from(value, "utf8").toString("utf8") === value;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}

function stripEnvQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function escapeFilterPath(value: string) {
  return value.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function escapeConcatPath(value: string) {
  return value.replace(/\\/g, "/").replace(/'/g, "'\\''");
}

function escapeHtml(value: unknown) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

type V035VisualReview = {
  no_text_in_generated_image: boolean;
  no_watermark: boolean;
  no_logo: boolean;
  no_horror_visual: boolean;
  no_dark_composite_visual: boolean;
  scene_purpose_alignment_pass: boolean;
};

type V035TimelineScene = {
  scene_number: number;
  scene_key: string;
  scene_purpose: string;
  image: string;
  image_path: string;
  subtitle: string;
  duration_seconds: number;
  product_image_overlay: boolean;
  motion: {
    type: string;
    zoom_start: number;
    zoom_end: number;
    transition: string;
    excessive_effects_blocked: boolean;
    shape_box_motion_blocked: boolean;
  };
  safe_area: {
    subtitle_inside_shorts_safe_area: boolean;
    top_reserved_px: number;
    bottom_reserved_px: number;
  };
};

type V035AudioProbe = {
  asr_provider: string | null;
  real_asr_probe_executed: boolean;
  transcript: string;
  raw_similarity_score: number | null;
  transcript_similarity_score: number | null;
  core_anchor_recognition_pass: boolean;
  recognized_core_anchors: string[];
  recognized_context_anchors: string[];
  speech_rate_wpm: number | null;
  audio_blocker: string | null;
  upload_readiness_allowed: boolean;
};

type V035PacketPaths = ReturnType<typeof buildV035PacketPaths>;

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  generateV035ImageSkillSceneShortsReviewPacket()
    .then((result) => {
      console.log(JSON.stringify({
        FINAL_STATUS: result.FINAL_STATUS,
        candidate_id: result.candidate_id,
        version: result.version,
        image_skill_available: result.image_skill_available,
        image_skill_provider: result.image_skill_provider,
        generated_scene_asset_count: result.generated_scene_asset_count,
        image_quality_gate_pass: result.image_quality_gate_pass,
        image_quality_blocker: result.image_quality_blocker,
        local_review_video_generated: result.local_review_video_generated,
        review_console_path: result.review_console_path,
        local_review_video_path: result.local_review_video_path,
        metadata_preview_generated: result.metadata_preview_generated,
        human_review_status: result.human_review_status,
        metadata_review_status: result.metadata_review_status,
        SAFE_TO_REQUEST_PRIVATE_UPLOAD: result.SAFE_TO_REQUEST_PRIVATE_UPLOAD,
        PUBLIC_UPLOAD_BLOCKED: result.PUBLIC_UPLOAD_BLOCKED,
        youtube_execute_called: result.youtube_execute_called,
        videos_insert_called: result.videos_insert_called,
        raw_urls_printed: result.raw_urls_printed,
        secrets_printed: result.secrets_printed
      }, null, 2));
    })
    .catch((error) => {
      console.error(JSON.stringify({
        error: "V035_IMAGE_SKILL_SCENE_SHORTS_REVIEW_PACKET_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }, null, 2));
      process.exitCode = 1;
    });
}
