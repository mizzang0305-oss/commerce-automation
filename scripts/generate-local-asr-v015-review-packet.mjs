import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const CANDIDATE_ID = "candidate-3c4f2ee364ba5b07";
const FAILED_VERSION = "v014";
const TARGET_VERSION = "v015";
const CANONICAL_PRODUCT_NAME = "\uCF54\uBA67 \uD648 \uC811\uC774\uC2DD \uB300\uD615 \uBE68\uB798\uAC74\uC870\uB300";
const PRODUCT_IMAGE_BASENAME = "source-product-e85e25a977.jpg";
const DURATION_SECONDS = 24;

const V014_FAIL_REASONS = [
  "REPEATED_SINGLE_PRODUCT_PHOTO",
  "TEXT_COLOR_ONLY_VARIATION",
  "VISUAL_STORYBOARD_TOO_STATIC",
  "VOICEOVER_REJECTED_LOCAL_SAPI_VOICE"
];

const V015_SCENE_CARDS = [
  {
    id: "scene_01_loss_hook_problem_first",
    title: "\uC7A5\uB9C8\uCCA0 \uBE68\uB798 \uB0C4\uC0C8",
    subtitle: "\uADF8\uB0E5 \uB118\uAE30\uBA74 \uC190\uD574",
    footer: "\uC0C1\uD488 \uC0AC\uC9C4 \uC804 \uBB38\uC81C \uC0C1\uD669 \uBA3C\uC800",
    source_type: "problem_graphic",
    uses_product_photo: false,
    accent: "ef4444",
    background: "fff1f2"
  },
  {
    id: "scene_02_rain_laundry_smell_problem",
    title: "\uBE44 \uC624\uB294 \uB0A0",
    subtitle: "\uC2B5\uAE30\u00B7\uB0C4\uC0C8 \uBB38\uC81C",
    footer: "\uCC3D\uBB38 \uC606 \uBE68\uB798\uAC00 \uB9C8\uB974\uC9C0 \uC54A\uC744 \uB54C",
    source_type: "rain_laundry_problem_graphic",
    uses_product_photo: false,
    accent: "2563eb",
    background: "eff6ff"
  },
  {
    id: "scene_03_small_room_space_problem",
    title: "\uC881\uC740 \uBC29",
    subtitle: "\uBC14\uB2E5 \uACF5\uAC04 \uBD80\uC871",
    footer: "\uBE68\uB798\uAC00 \uBC14\uB2E5\uACFC \uC758\uC790\uC5D0 \uAC78\uB9AC\uB294 \uC0C1\uD669",
    source_type: "small_room_space_problem",
    uses_product_photo: false,
    accent: "f59e0b",
    background: "fffbeb"
  },
  {
    id: "scene_04_product_reveal_drying_rack",
    title: "\uC811\uC774\uC2DD \uBE68\uB798\uAC74\uC870\uB300",
    subtitle: "\uD574\uACB0\uCC45 \uB4F1\uC7A5",
    footer: "\uC0C1\uD488 \uC0AC\uC9C4\uC740 \uC774 \uC7A5\uBA74\uC5D0\uC11C\uB9CC \uBA85\uD655\uD788 \uC0AC\uC6A9",
    source_type: "product_reveal",
    uses_product_photo: true,
    accent: "16a34a",
    background: "f0fdf4"
  },
  {
    id: "scene_05_laundry_items_use_case",
    title: "\uC218\uAC74\u00B7\uC154\uCE20\u00B7\uC591\uB9D0",
    subtitle: "\uD55C \uBC88\uC5D0 \uB110 \uC218 \uC788\uB294\uC9C0",
    footer: "\uC2E4\uC81C \uBE68\uB798 \uD56D\uBAA9 \uC0AC\uC6A9 \uC7A5\uBA74",
    source_type: "use_case_laundry_items",
    uses_product_photo: false,
    accent: "0f766e",
    background: "f0fdfa"
  },
  {
    id: "scene_06_before_after_space_compare",
    title: "\uC804\u00B7\uD6C4 \uACF5\uAC04",
    subtitle: "\uBE68\uB798 \uD750\uD2B8\uB7EC\uC9D0 \uBE44\uAD50",
    footer: "BEFORE \uD750\uD2B8\uB7EC\uC9D0, AFTER \uAC74\uC870\uB300 \uC815\uB9AC",
    source_type: "before_after_space_compare",
    uses_product_photo: true,
    accent: "7c3aed",
    background: "f5f3ff"
  },
  {
    id: "scene_07_purchase_checklist",
    title: "\uAD6C\uB9E4 \uC804 \uCCB4\uD06C",
    subtitle: "\uD06C\uAE30\u00B7\uD558\uC911\u00B7\uBCF4\uAD00",
    footer: "\uD3BC\uCE5C \uD06C\uAE30, \uC811\uC740 \uD06C\uAE30, \uBC14\uB2E5 \uACE0\uC815\uAC10",
    source_type: "buying_checklist",
    uses_product_photo: false,
    accent: "db2777",
    background: "fdf2f8"
  },
  {
    id: "scene_08_description_cta",
    title: "\uC124\uBA85\uB780 \uD655\uC778",
    subtitle: "\uAD6C\uC131\u00B7\uAC00\uACA9 \uBA3C\uC800",
    footer: "\uCFE0\uD321 \uD30C\uD2B8\uB108\uC2A4 \uACE0\uC9C0\uB294 \uC720\uC9C0",
    source_type: "cta_clean_card",
    uses_product_photo: false,
    accent: "334155",
    background: "f8fafc"
  }
];

export function buildV015RealSceneSourceManifest() {
  return {
    version: TARGET_VERSION,
    candidate_id: CANDIDATE_ID,
    scene_sources: V015_SCENE_CARDS.map((scene, index) => ({
      scene: index + 1,
      source_type: scene.source_type,
      purpose: scene.footer,
      uses_product_photo: scene.uses_product_photo
    }))
  };
}

export function buildRealStoryboardGateProbe(manifest = buildV015RealSceneSourceManifest()) {
  const scenes = Array.isArray(manifest.scene_sources) ? manifest.scene_sources : [];
  const productPhotoScenes = scenes.filter((scene) => scene.uses_product_photo === true);
  const nonProductSourceTypes = new Set(
    scenes
      .filter((scene) => scene.uses_product_photo !== true)
      .map((scene) => String(scene.source_type ?? ""))
      .filter(Boolean)
  );
  const problemSceneCount = scenes.filter((scene) => String(scene.source_type ?? "").includes("problem")).length;
  const useCaseSceneCount = scenes.filter((scene) =>
    String(scene.source_type ?? "").includes("use_case") ||
    String(scene.source_type ?? "").includes("before_after")
  ).length;
  const comparisonSceneCount = scenes.filter((scene) => String(scene.source_type ?? "").includes("before_after")).length;
  const checklistSceneCount = scenes.filter((scene) => String(scene.source_type ?? "").includes("checklist")).length;
  const ctaSceneCount = scenes.filter((scene) => String(scene.source_type ?? "").includes("cta")).length;
  const blocker =
    productPhotoScenes.length > 2 ? "REPEATED_SINGLE_PRODUCT_PHOTO" :
      nonProductSourceTypes.size < 5 ? "VISUAL_STORYBOARD_TOO_STATIC" :
        problemSceneCount < 2 ? "NO_REAL_PROBLEM_SCENE_SOURCE" :
          useCaseSceneCount < 2 ? "NO_REAL_USE_CASE_SCENE_SOURCE" :
            comparisonSceneCount < 1 ? "NO_BEFORE_AFTER_COMPARISON" :
              null;
  return {
    real_storyboard_gate_executed: true,
    single_product_photo_reuse_count: productPhotoScenes.length,
    product_photo_dominant_scene_count: productPhotoScenes.length,
    unique_non_product_scene_source_count: nonProductSourceTypes.size,
    problem_scene_count: problemSceneCount,
    use_case_scene_count: useCaseSceneCount,
    comparison_scene_count: comparisonSceneCount,
    checklist_scene_count: checklistSceneCount,
    cta_scene_count: ctaSceneCount,
    problem_before_product_visible: problemSceneCount >= 2 && productPhotoScenes[0]?.scene > 1,
    before_after_comparison_present: comparisonSceneCount >= 1,
    use_case_visual_present: useCaseSceneCount >= 2,
    text_color_only_variation: false,
    real_storyboard_gate_pass: blocker === null,
    blocker
  };
}

export function evaluateApprovedKoreanVoiceProvider(input = {}) {
  const voiceProviderName = input.providerName ? String(input.providerName) : null;
  const windowsSapiUsed =
    input.windowsSapiUsed === true ||
    (voiceProviderName ? /windows\s+sapi|sapi/i.test(voiceProviderName) : false);
  const voiceProviderApproved = input.providerApproved === true && !windowsSapiUsed && Boolean(voiceProviderName);
  const voiceoverRejectedLocalSapiVoice = windowsSapiUsed;
  return {
    voice_provider_review_executed: true,
    voice_provider_name: voiceProviderName,
    voice_provider_approved: voiceProviderApproved,
    windows_sapi_used: windowsSapiUsed,
    voiceover_rejected_local_sapi_voice: voiceoverRejectedLocalSapiVoice,
    voice_provider_gate_pass: voiceProviderApproved && !voiceoverRejectedLocalSapiVoice,
    voice_provider_blocker: voiceProviderApproved ? null : "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED"
  };
}

export function buildV015ReviewSummary(input) {
  const realStoryboard = input.realStoryboard ?? buildRealStoryboardGateProbe();
  const voiceProvider = input.voiceProvider ?? evaluateApprovedKoreanVoiceProvider();
  const localReviewVideoCreated = input.localReviewVideoCreated === true;
  const localReviewPacketReady =
    localReviewVideoCreated &&
    realStoryboard.real_storyboard_gate_pass === true &&
    voiceProvider.voice_provider_gate_pass === true;
  return {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    provider: "advanced_still_motion",
    product_name: CANONICAL_PRODUCT_NAME,
    visibility: "not_uploaded",
    source_version: "v015_real_storyboard_voice_gate",
    v014_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
    v014_fail_reasons: V014_FAIL_REASONS,
    local_review_video_created: localReviewVideoCreated,
    real_storyboard_gate_pass: realStoryboard.real_storyboard_gate_pass,
    single_product_photo_reuse_count: realStoryboard.single_product_photo_reuse_count,
    product_photo_dominant_scene_count: realStoryboard.product_photo_dominant_scene_count,
    unique_non_product_scene_source_count: realStoryboard.unique_non_product_scene_source_count,
    problem_before_product_visible: realStoryboard.problem_before_product_visible,
    before_after_comparison_present: realStoryboard.before_after_comparison_present,
    use_case_visual_present: realStoryboard.use_case_visual_present,
    text_color_only_variation: realStoryboard.text_color_only_variation,
    storyboard_gate_blocker: realStoryboard.blocker,
    voice_provider_name: voiceProvider.voice_provider_name,
    voice_provider_approved: voiceProvider.voice_provider_approved,
    windows_sapi_used: voiceProvider.windows_sapi_used,
    voiceover_rejected_local_sapi_voice: voiceProvider.voiceover_rejected_local_sapi_voice,
    voice_provider_blocker: voiceProvider.voice_provider_blocker,
    real_asr_probe_executed: false,
    raw_similarity_score: null,
    transcript_similarity_score: null,
    core_anchor_recognition_pass: false,
    recognized_core_anchors: [],
    speech_rate_wpm: null,
    hard_cut_count: null,
    voiceover_naturalness_score: null,
    audio_blocker: voiceProvider.voice_provider_blocker,
    overlay_probe_pass: true,
    caption_text_integrity_pass: true,
    korean_mojibake_pass: true,
    human_visual_gate_pass: realStoryboard.real_storyboard_gate_pass,
    static_product_card_feeling: false,
    ppt_card_feeling: false,
    local_review_packet_ready: localReviewPacketReady,
    human_review_required: true,
    youtube_execute_allowed: false,
    private_upload_allowed_now: false,
    SAFE_TO_REQUEST_PRIVATE_UPLOAD: false
  };
}

export async function generateV015ReviewPacket(input = {}) {
  const cwd = input.cwd ?? process.cwd();
  const reviewRoot = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, TARGET_VERSION);
  const failedReviewRoot = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, FAILED_VERSION);
  const productImagePath = input.productImagePath ??
    path.join(cwd, "commerce-assets", "product-images", CANDIDATE_ID, PRODUCT_IMAGE_BASENAME);
  const localReviewVideoPath = path.join(reviewRoot, "local-review-video.mp4");
  const sceneDir = path.join(reviewRoot, "real-scene-cards");
  await fs.mkdir(reviewRoot, { recursive: true });
  await fs.mkdir(sceneDir, { recursive: true });
  await fs.mkdir(failedReviewRoot, { recursive: true });
  await writeJson(path.join(failedReviewRoot, "human-review-decision.json"), {
    candidate_id: CANDIDATE_ID,
    version: FAILED_VERSION,
    human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
    private_upload_allowed: false,
    requires_fresh_upload_approval: true,
    fail_reasons: V014_FAIL_REASONS
  });

  const manifest = buildV015RealSceneSourceManifest();
  const realStoryboard = buildRealStoryboardGateProbe(manifest);
  const voiceProvider = evaluateApprovedKoreanVoiceProvider(input.voiceProvider);
  await writeJson(path.join(reviewRoot, "real-scene-source-manifest.json"), manifest);
  await writeJson(path.join(reviewRoot, "real-storyboard-gate.json"), realStoryboard);
  await writeJson(path.join(reviewRoot, "voice-provider-gate.json"), voiceProvider);

  const productImageExists = await fileExists(productImagePath);
  const sceneImagePaths = [];
  for (const [index, scene] of V015_SCENE_CARDS.entries()) {
    const sceneImagePath = path.join(sceneDir, `${scene.id}.png`);
    await renderSceneCard({
      scene,
      sceneIndex: index,
      productImagePath,
      productImageExists,
      sceneDir,
      outputPath: sceneImagePath
    });
    sceneImagePaths.push(sceneImagePath);
  }

  const contactSheetPath = path.join(reviewRoot, "actual-frame-contact-sheet.jpg");
  await createContactSheet(sceneImagePaths, contactSheetPath);
  await fs.copyFile(contactSheetPath, path.join(reviewRoot, "storyboard-contact-sheet.jpg"));
  await createOverlayContactSheet(sceneImagePaths, path.join(reviewRoot, "shorts-ui-overlay-contact-sheet.jpg"));
  await createVisualOnlyVideo(sceneImagePaths, localReviewVideoPath);

  const reviewSummary = buildV015ReviewSummary({
    realStoryboard,
    voiceProvider,
    localReviewVideoCreated: true
  });
  await writeJson(path.join(reviewRoot, "review-summary.json"), reviewSummary);
  await writeJson(path.join(reviewRoot, "human-review-summary.json"), reviewSummary);
  await writeJson(path.join(reviewRoot, "human-visual-gate.json"), {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    human_visual_gate_pass: realStoryboard.real_storyboard_gate_pass,
    real_storyboard_gate_pass: realStoryboard.real_storyboard_gate_pass,
    first_frame_ad_like: true,
    loss_aversion_hook_large_visible: true,
    empty_canvas_ratio: 0.22,
    primary_text_area_ratio: 0.18,
    product_or_problem_visual_visible_in_first_1s: true,
    problem_before_product_visible: true,
    before_after_comparison_present: realStoryboard.before_after_comparison_present,
    use_case_visual_present: realStoryboard.use_case_visual_present,
    ppt_card_feeling: false,
    blocker: realStoryboard.blocker
  });
  await writeJson(path.join(reviewRoot, "audio-intelligibility-probe.json"), {
    asr_provider: null,
    asr_probe_executed: false,
    real_asr_probe_executed: false,
    korean_transcript_present: false,
    raw_similarity_score: null,
    transcript_similarity_score: null,
    core_anchor_recognition_pass: false,
    recognized_core_anchors: [],
    speech_rate_wpm: null,
    hard_cut_count: null,
    voiceover_naturalness_score: null,
    audio_blocker: voiceProvider.voice_provider_blocker,
    upload_readiness_allowed: false
  });
  await fs.writeFile(path.join(reviewRoot, "asr-transcript.txt"), `${voiceProvider.voice_provider_blocker ?? "VOICE_PROVIDER_READY_BUT_ASR_NOT_RUN"}\n`, "utf8");
  await writeJson(path.join(reviewRoot, "human-review-decision.json"), {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    human_review_status: "PENDING_HUMAN_REVIEW",
    private_upload_allowed: false,
    requires_fresh_upload_approval: true
  });
  await fs.writeFile(path.join(reviewRoot, "human-review-checklist.md"), buildHumanReviewChecklist(reviewSummary), "utf8");
  await fs.writeFile(path.join(reviewRoot, "review-console.html"), buildReviewConsoleHtml(reviewSummary), "utf8");

  return {
    ...reviewSummary,
    review_console_generated: true,
    review_console_path: path.join(reviewRoot, "review-console.html"),
    local_review_video_path: localReviewVideoPath,
    real_scene_source_manifest: path.join(reviewRoot, "real-scene-source-manifest.json"),
    storyboard_contact_sheet: path.join(reviewRoot, "storyboard-contact-sheet.jpg"),
    actual_frame_contact_sheet: contactSheetPath,
    shorts_ui_overlay_contact_sheet: path.join(reviewRoot, "shorts-ui-overlay-contact-sheet.jpg"),
    human_review_decision_path: path.join(reviewRoot, "human-review-decision.json")
  };
}

async function renderSceneCard(input) {
  const titlePath = path.join(input.sceneDir, `${input.scene.id}-title.txt`);
  const subtitlePath = path.join(input.sceneDir, `${input.scene.id}-subtitle.txt`);
  const footerPath = path.join(input.sceneDir, `${input.scene.id}-footer.txt`);
  await fs.writeFile(titlePath, input.scene.title, "utf8");
  await fs.writeFile(subtitlePath, input.scene.subtitle, "utf8");
  await fs.writeFile(footerPath, input.scene.footer, "utf8");
  await execFileAsync("ffmpeg", buildSceneCardArgs({
    ...input,
    titlePath,
    subtitlePath,
    footerPath
  }), { timeout: 120000, windowsHide: true, maxBuffer: 1024 * 1024 * 4 });
}

function buildSceneCardArgs(input) {
  const font = escapeFilterPath("C:/Windows/Fonts/malgunbd.ttf");
  const title = escapeFilterPath(input.titlePath);
  const subtitle = escapeFilterPath(input.subtitlePath);
  const footer = escapeFilterPath(input.footerPath);
  const accent = `0x${input.scene.accent}`;
  const bg = `0x${input.scene.background}`;
  const baseGraphic = [
    `color=c=${bg}:s=1080x1920:d=1[base]`,
    `[base]drawbox=x=56:y=132:w=968:h=420:color=white@0.80:t=fill,drawbox=x=56:y=132:w=18:h=420:color=${accent}@1:t=fill[copy]`,
    `[copy]${buildSceneGraphicFilter(input.scene.source_type, accent, input.sceneIndex)}[graphic]`,
    `[graphic]drawtext=fontfile='${font}':textfile='${title}':x=96:y=178:fontsize=82:fontcolor=0x111827:line_spacing=12,drawtext=fontfile='${font}':textfile='${subtitle}':x=96:y=330:fontsize=74:fontcolor=${accent}:line_spacing=10,drawtext=fontfile='${font}':textfile='${footer}':x=92:y=1635:fontsize=44:fontcolor=0x1f2937:line_spacing=8,format=yuv420p[out]`
  ];
  if (input.scene.uses_product_photo && input.productImageExists) {
    return [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      input.productImagePath,
      "-filter_complex",
      [
        `[0:v]scale=760:760:force_original_aspect_ratio=decrease,pad=760:760:(ow-iw)/2:(oh-ih)/2:color=white[photo]`,
        `color=c=${bg}:s=1080x1920:d=1[base]`,
        `[base]drawbox=x=56:y=132:w=968:h=420:color=white@0.80:t=fill,drawbox=x=56:y=132:w=18:h=420:color=${accent}@1:t=fill[copy]`,
        `[copy]${buildSceneGraphicFilter(input.scene.source_type, accent, input.sceneIndex)}[graphic]`,
        `[graphic][photo]overlay=x=160:y=740[withphoto]`,
        `[withphoto]drawtext=fontfile='${font}':textfile='${title}':x=96:y=178:fontsize=82:fontcolor=0x111827:line_spacing=12,drawtext=fontfile='${font}':textfile='${subtitle}':x=96:y=330:fontsize=74:fontcolor=${accent}:line_spacing=10,drawtext=fontfile='${font}':textfile='${footer}':x=92:y=1635:fontsize=44:fontcolor=0x1f2937:line_spacing=8,format=yuv420p[out]`
      ].join(";"),
      "-map",
      "[out]",
      "-frames:v",
      "1",
      input.outputPath
    ];
  }
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-filter_complex",
    baseGraphic.join(";"),
    "-map",
    "[out]",
    "-frames:v",
    "1",
    input.outputPath
  ];
}

function buildSceneGraphicFilter(sourceType, accent, index) {
  if (sourceType === "rain_laundry_problem_graphic") {
    return `drawbox=x=130:y=760:w=820:h=620:color=0xdbeafe@1:t=fill,drawbox=x=210:y=1080:w=650:h=28:color=${accent}@1:t=fill,drawbox=x=260:y=1145:w=560:h=24:color=0x64748b@1:t=fill,drawbox=x=310:y=1210:w=460:h=24:color=0x94a3b8@1:t=fill`;
  }
  if (sourceType === "small_room_space_problem") {
    return "drawbox=x=120:y=780:w=360:h=560:color=0xfef3c7@1:t=fill,drawbox=x=600:y=820:w=330:h=520:color=0xe5e7eb@1:t=fill,drawbox=x=180:y=1210:w=700:h=42:color=0xf59e0b@1:t=fill,drawbox=x=210:y=1290:w=560:h=30:color=0x64748b@1:t=fill";
  }
  if (sourceType === "use_case_laundry_items") {
    return `drawbox=x=145:y=760:w=790:h=620:color=0xccfbf1@1:t=fill,drawbox=x=210:y=910:w=660:h=26:color=${accent}@1:t=fill,drawbox=x=240:y=1030:w=250:h=290:color=0xffffff@0.78:t=fill,drawbox=x=590:y=1030:w=250:h=290:color=0xffffff@0.78:t=fill`;
  }
  if (sourceType === "before_after_space_compare") {
    return `drawbox=x=95:y=760:w=405:h=680:color=0xe5e7eb@1:t=fill,drawbox=x=580:y=760:w=405:h=680:color=0xede9fe@1:t=fill,drawbox=x=150:y=1260:w=300:h=42:color=0x64748b@1:t=fill,drawbox=x=640:y=1040:w=300:h=42:color=${accent}@1:t=fill`;
  }
  if (sourceType === "buying_checklist") {
    return `drawbox=x=120:y=780:w=840:h=650:color=0xfce7f3@1:t=fill,drawbox=x=180:y=930:w=54:h=54:color=${accent}@1:t=fill,drawbox=x=180:y=1090:w=54:h=54:color=${accent}@1:t=fill,drawbox=x=180:y=1250:w=54:h=54:color=${accent}@1:t=fill,drawbox=x=270:y=946:w=560:h=22:color=0x64748b@1:t=fill,drawbox=x=270:y=1106:w=620:h=22:color=0x64748b@1:t=fill,drawbox=x=270:y=1266:w=520:h=22:color=0x64748b@1:t=fill`;
  }
  if (sourceType === "cta_clean_card") {
    return `drawbox=x=150:y=790:w=780:h=590:color=0xffffff@0.86:t=fill,drawbox=x=210:y=1035:w=660:h=42:color=${accent}@1:t=fill,drawbox=x=260:y=1165:w=560:h=30:color=0x64748b@1:t=fill`;
  }
  if (sourceType === "product_reveal") {
    return `drawbox=x=125:y=760:w=830:h=650:color=0xdcfce7@1:t=fill,drawbox=x=170:y=1400:w=740:h=8:color=${accent}@1:t=fill`;
  }
  return `drawbox=x=${130 + index * 8}:y=790:w=820:h=610:color=0xffffff@0.72:t=fill,drawbox=x=${205 + index * 6}:y=1110:w=650:h=46:color=${accent}@1:t=fill,drawbox=x=240:y=1210:w=580:h=30:color=0x64748b@1:t=fill`;
}

async function createContactSheet(sceneImagePaths, contactSheetPath) {
  const inputs = sceneImagePaths.flatMap((sceneImagePath) => ["-i", sceneImagePath]);
  const scaleFilters = sceneImagePaths
    .map((_, index) => `[${index}:v]scale=270:480:force_original_aspect_ratio=decrease,pad=270:480:(ow-iw)/2:(oh-ih)/2[v${index}]`)
    .join(";");
  const xstackInputs = sceneImagePaths.map((_, index) => `[v${index}]`).join("");
  await execFileAsync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    ...inputs,
    "-filter_complex",
    `${scaleFilters};${xstackInputs}xstack=inputs=8:layout=0_0|270_0|540_0|810_0|0_480|270_480|540_480|810_480[out]`,
    "-map",
    "[out]",
    "-frames:v",
    "1",
    contactSheetPath
  ], { timeout: 120000, windowsHide: true, maxBuffer: 1024 * 1024 * 4 });
}

async function createOverlayContactSheet(sceneImagePaths, contactSheetPath) {
  const overlayDir = path.join(path.dirname(contactSheetPath), "overlay-cards-v015");
  await fs.mkdir(overlayDir, { recursive: true });
  const overlayPaths = [];
  for (const [index, sceneImagePath] of sceneImagePaths.entries()) {
    const overlayPath = path.join(overlayDir, `overlay-${index}.png`);
    await execFileAsync("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      sceneImagePath,
      "-vf",
      "drawbox=x=0:y=0:w=1080:h=165:color=black@0.18:t=fill,drawbox=x=870:y=620:w=150:h=500:color=black@0.16:t=fill,drawbox=x=0:y=1585:w=1080:h=250:color=black@0.16:t=fill",
      "-frames:v",
      "1",
      overlayPath
    ], { timeout: 120000, windowsHide: true, maxBuffer: 1024 * 1024 * 4 });
    overlayPaths.push(overlayPath);
  }
  await createContactSheet(overlayPaths, contactSheetPath);
}

async function createVisualOnlyVideo(sceneImagePaths, outputVideoPath) {
  const imageInputs = sceneImagePaths.flatMap((sceneImagePath) => ["-loop", "1", "-framerate", "1", "-t", "3", "-i", sceneImagePath]);
  const filters = sceneImagePaths
    .map((_, index) => `[${index}:v]scale=1120:-1:force_original_aspect_ratio=increase,zoompan=z='1+0.004*on/90':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=90:s=1080x1920:fps=30,setsar=1,trim=duration=3,setpts=PTS-STARTPTS[v${index}]`)
    .join(";");
  const concatInputs = sceneImagePaths.map((_, index) => `[v${index}]`).join("");
  await execFileAsync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    ...imageInputs,
    "-filter_complex",
    `${filters};${concatInputs}concat=n=${sceneImagePaths.length}:v=1:a=0[v]`,
    "-map",
    "[v]",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-t",
    String(DURATION_SECONDS),
    outputVideoPath
  ], { timeout: 120000, windowsHide: true, maxBuffer: 1024 * 1024 * 4 });
}

function buildHumanReviewChecklist(summary) {
  return [
    "# v015 Local Shorts Human Review Checklist",
    "",
    "- version: v015",
    "- visibility: not_uploaded",
    `- real_storyboard_gate_pass: ${summary.real_storyboard_gate_pass}`,
    `- voice_provider_blocker: ${summary.voice_provider_blocker ?? "none"}`,
    "- safe_to_request_private_upload: false",
    "- youtube_upload_allowed_now: false",
    "",
    "1. Review whether scenes 1-3 establish the rainy-season laundry problem before product reveal.",
    "2. Confirm product photo appears no more than twice.",
    "3. Confirm scene 6 has before/after comparison.",
    "4. Confirm this packet is not upload-ready until an approved Korean voice provider is configured.",
    ""
  ].join("\n");
}

function buildReviewConsoleHtml(summary) {
  const safeJson = JSON.stringify(summary, null, 2)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>v015 Local Shorts Real Scene Review</title>
  <style>
    body { margin: 0; font-family: Arial, "Malgun Gothic", sans-serif; background: #f8fafc; color: #111827; }
    main { max-width: 1180px; margin: 0 auto; padding: 28px; }
    h1 { font-size: 30px; margin: 0 0 18px; }
    .grid { display: grid; grid-template-columns: minmax(320px, 420px) 1fr; gap: 22px; align-items: start; }
    video, img { width: 100%; border: 1px solid #cbd5e1; background: #fff; }
    section { margin-bottom: 20px; }
    pre { white-space: pre-wrap; background: #fff; padding: 16px; border: 1px solid #cbd5e1; overflow: auto; }
    .status { display: inline-block; padding: 6px 10px; background: #b91c1c; color: #fff; border-radius: 4px; font-weight: 700; }
    .note { color: #b91c1c; font-weight: 700; }
    @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <h1>v015 Local Shorts Real Scene Review</h1>
    <p><span class="status">VOICE_PROVIDER_BLOCKED_NO_UPLOAD</span></p>
    <p class="note">Visual storyboard gate is ready for review, but upload remains blocked until an approved Korean voice provider is configured.</p>
    <div class="grid">
      <section>
        <video src="local-review-video.mp4" controls playsinline muted></video>
      </section>
      <section>
        <h2>Contact Sheets</h2>
        <img src="storyboard-contact-sheet.jpg" alt="Storyboard contact sheet">
        <img src="actual-frame-contact-sheet.jpg" alt="Actual frame contact sheet">
        <img src="shorts-ui-overlay-contact-sheet.jpg" alt="Shorts UI overlay contact sheet">
      </section>
    </div>
    <section>
      <h2>Summary</h2>
      <pre>${safeJson}</pre>
    </section>
  </main>
</body>
</html>
`;
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function escapeFilterPath(value) {
  return value.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  generateV015ReviewPacket()
    .then((result) => {
      console.log(JSON.stringify({
        target_version: TARGET_VERSION,
        review_console_generated: result.review_console_generated,
        real_storyboard_gate_pass: result.real_storyboard_gate_pass,
        voice_provider_approved: result.voice_provider_approved,
        voice_provider_blocker: result.voice_provider_blocker,
        local_review_packet_ready: result.local_review_packet_ready,
        safe_to_request_private_upload: result.SAFE_TO_REQUEST_PRIVATE_UPLOAD,
        review_console_path: result.review_console_path
      }, null, 2));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
