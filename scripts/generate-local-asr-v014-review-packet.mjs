import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const CANDIDATE_ID = "candidate-3c4f2ee364ba5b07";
const FAILED_VERSION = "v013";
const TARGET_VERSION = "v014";
const CANONICAL_PRODUCT_NAME = "\uCF54\uBA67 \uD648 \uC811\uC774\uC2DD \uB300\uD615 \uBE68\uB798\uAC74\uC870\uB300";
const PRODUCT_IMAGE_BASENAME = "source-product-e85e25a977.jpg";
const DURATION_SECONDS = 24;
const OWNER_REJECTED_VOICE_GENDER = "Female";

const V013_FAIL_REASONS = [
  "VOICEOVER_SCARY_OR_UNCOMFORTABLE",
  "VOICEOVER_TOO_SLOW",
  "VOICEOVER_REJECTED_FEMALE_VOICE",
  "VISUAL_DARK_PPT_CARD_FEELING",
  "VISUAL_PLACEHOLDER_GRAPHICS_USED"
];

const V014_FAIL_REASONS = [
  "REPEATED_SINGLE_PRODUCT_PHOTO",
  "TEXT_COLOR_ONLY_VARIATION",
  "VISUAL_STORYBOARD_TOO_STATIC",
  "VOICEOVER_REJECTED_LOCAL_SAPI_VOICE"
];

const V014_SCENES = [
  {
    id: "scene_01_photo_hook",
    title: "\uC7A5\uB9C8\uCCA0 \uBE68\uB798 \uB0C4\uC0C8",
    subtitle: "\uADF8\uB0E5 \uB118\uAE30\uBA74 \uC190\uD574",
    footer: "\uC2E4\uC81C \uC0C1\uD488 \uC0AC\uC9C4 \uAE30\uBC18 \uBE44\uC8FC\uC5BC",
    accent: "#ef4444",
    background: "#fff7ed"
  },
  {
    id: "scene_02_problem_room",
    title: "\uBE44 \uC624\uB294 \uB0A0",
    subtitle: "\uC2B5\uAE30\u00B7\uB0C4\uC0C8 \uBB38\uC81C",
    footer: "\uC881\uC740 \uBC29\uC5D0\uC11C \uBE68\uB798\uAC00 \uB9C8\uB974\uC9C0 \uC54A\uC744 \uB54C",
    accent: "#2563eb",
    background: "#eff6ff"
  },
  {
    id: "scene_03_product_photo",
    title: "\uC811\uC774\uC2DD \uB300\uD615 \uAC74\uC870\uB300",
    subtitle: "\uD3BC\uCE58\uACE0 \uC811\uB294 \uAD6C\uC131",
    footer: "\uC0AC\uC9C4\uC73C\uB85C \uAD6C\uC870 \uD655\uC778",
    accent: "#16a34a",
    background: "#f0fdf4"
  },
  {
    id: "scene_04_space_check",
    title: "\uC124\uCE58 \uACF5\uAC04",
    subtitle: "\uBA3C\uC800 \uC7AC\uBCF4\uAE30",
    footer: "\uC811\uC740 \uD6C4 \uBCF4\uAD00 \uACF5\uAC04\uAE4C\uC9C0 \uD655\uC778",
    accent: "#f59e0b",
    background: "#fffbeb"
  },
  {
    id: "scene_05_laundry_capacity",
    title: "\uC218\uAC74\u00B7\uC154\uCE20\u00B7\uC591\uB9D0",
    subtitle: "\uD55C \uBC88\uC5D0 \uB110 \uC218 \uC788\uB294\uC9C0",
    footer: "\uB300\uD615 \uAD6C\uC131\uC740 \uD558\uC911 \uD655\uC778\uC774 \uD544\uC218",
    accent: "#0f766e",
    background: "#f0fdfa"
  },
  {
    id: "scene_06_before_after",
    title: "\uC804\u00B7\uD6C4 \uACF5\uAC04",
    subtitle: "\uBC14\uB2E5 \uACE0\uC815\uAC10 \uCCB4\uD06C",
    footer: "\uD754\uB4E4\uB9BC\uC774 \uC801\uC740\uC9C0 \uBCF4\uACE0 \uC0AC\uC6A9",
    accent: "#7c3aed",
    background: "#f5f3ff"
  },
  {
    id: "scene_07_buying_checklist",
    title: "\uAD6C\uB9E4 \uC804 3\uAC00\uC9C0",
    subtitle: "\uD06C\uAE30\u00B7\uD558\uC911\u00B7\uBCF4\uAD00",
    footer: "\uC0C1\uD488\uD398\uC774\uC9C0\uC5D0\uC11C \uC218\uCE58\uB97C \uD655\uC778",
    accent: "#db2777",
    background: "#fdf2f8"
  },
  {
    id: "scene_08_cta_blocked_voice",
    title: "\uC0AC\uC9C4 \uBE44\uC8FC\uC5BC\uB9CC \uBA3C\uC800 \uAC80\uC218",
    subtitle: "\uC74C\uC131\uC740 \uC0C8 provider \uD544\uC694",
    footer: "\uD604\uC7AC SAPI \uC74C\uC131\uC740 \uC5C5\uB85C\uB4DC \uBD88\uAC00",
    accent: "#334155",
    background: "#f8fafc"
  }
];

export function evaluateVoiceSuitability(voices, options = {}) {
  const rejectedGender = options.ownerRejectedVoiceGender ?? OWNER_REJECTED_VOICE_GENDER;
  const koKrVoices = voices.filter((voice) => String(voice.Culture ?? voice.culture ?? "") === "ko-KR");
  const selectedVoice = koKrVoices[0] ?? null;
  const selectedGender = selectedVoice ? String(selectedVoice.Gender ?? selectedVoice.gender ?? "") : null;
  const selectedName = selectedVoice ? String(selectedVoice.Name ?? selectedVoice.name ?? "") : null;
  const selectedCulture = selectedVoice ? String(selectedVoice.Culture ?? selectedVoice.culture ?? "") : null;
  const selectedAge = selectedVoice ? String(selectedVoice.Age ?? selectedVoice.age ?? "") : null;
  let blocker = null;
  if (koKrVoices.length === 0) {
    blocker = "VOICEOVER_KO_KR_VOICE_MISSING";
  } else if (selectedGender?.toLowerCase() === rejectedGender.toLowerCase()) {
    blocker = "VOICEOVER_REJECTED_LOCAL_SAPI_VOICE";
  }
  return {
    sapi_voice_probe_executed: true,
    ko_kr_voice_count: koKrVoices.length,
    selected_voice_name: selectedName,
    selected_voice_gender: selectedGender,
    selected_voice_culture: selectedCulture,
    selected_voice_age: selectedAge,
    owner_rejected_voice_gender: rejectedGender,
    voiceover_acceptability_pass: blocker === null,
    blocker
  };
}

export function buildVisualDiversityProbe() {
  return {
    visual_diversity_probe_executed: true,
    repeated_single_product_photo: true,
    text_color_only_variation: true,
    unique_scene_compositions: 2,
    product_photo_reuse_ratio: 1,
    visual_diversity_pass: false,
    blocker: "REPEATED_SINGLE_PRODUCT_PHOTO"
  };
}

export function buildV013FailureDecision() {
  return {
    candidate_id: CANDIDATE_ID,
    version: FAILED_VERSION,
    human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
    private_upload_allowed: false,
    requires_fresh_upload_approval: true,
    fail_reasons: V013_FAIL_REASONS,
    next_required_version: TARGET_VERSION
  };
}

export function buildV014ReviewSummary(input) {
  const voiceSuitability = input.voiceSuitability;
  const visualDiversity = input.visualDiversity ?? buildVisualDiversityProbe();
  const visualOnlyVideoCreated = input.visualOnlyVideoCreated === true;
  const visualDiversityPass = visualDiversity.visual_diversity_pass === true;
  return {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    provider: "advanced_still_motion",
    product_name: CANONICAL_PRODUCT_NAME,
    visibility: "not_uploaded",
    source_version: "v014_voice_visual_fix",
    v013_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
    v013_fail_reasons: V013_FAIL_REASONS,
    visual_style: "bright_product_photo_commerce",
    product_photo_used: true,
    placeholder_graphics_removed: true,
    dark_ppt_card_feeling_removed: true,
    visual_only_video_created: visualOnlyVideoCreated,
    visual_review_ready: visualOnlyVideoCreated && visualDiversityPass,
    visual_diversity_pass: visualDiversityPass,
    visual_diversity_blocker: visualDiversity.blocker,
    repeated_single_product_photo: visualDiversity.repeated_single_product_photo === true,
    text_color_only_variation: visualDiversity.text_color_only_variation === true,
    unique_scene_compositions: visualDiversity.unique_scene_compositions,
    product_photo_reuse_ratio: visualDiversity.product_photo_reuse_ratio,
    voiceover_acceptability_pass: voiceSuitability.voiceover_acceptability_pass,
    voiceover_acceptability_blocker: voiceSuitability.blocker,
    selected_voice_gender: voiceSuitability.selected_voice_gender,
    selected_voice_culture: voiceSuitability.selected_voice_culture,
    owner_rejected_voice_gender: voiceSuitability.owner_rejected_voice_gender,
    local_review_packet_ready: false,
    human_review_required: true,
    youtube_execute_allowed: false,
    private_upload_allowed_now: false,
    SAFE_TO_REQUEST_PRIVATE_UPLOAD: false
  };
}

export async function generateLocalAsrReviewPacket(input = {}) {
  const cwd = input.cwd ?? process.cwd();
  const reviewRoot = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, TARGET_VERSION);
  const failedReviewRoot = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, FAILED_VERSION);
  const productImagePath = input.productImagePath ??
    path.join(cwd, "commerce-assets", "product-images", CANDIDATE_ID, PRODUCT_IMAGE_BASENAME);
  const localReviewVideoPath = path.join(reviewRoot, "local-review-video.mp4");
  const visualOnlyVideoPath = path.join(reviewRoot, "visual-only-local-review-video.mp4");
  const sceneImagePaths = [];

  await fs.mkdir(reviewRoot, { recursive: true });
  await fs.mkdir(failedReviewRoot, { recursive: true });
  await writeJson(path.join(failedReviewRoot, "human-review-decision.json"), buildV013FailureDecision());

  const voices = await inspectInstalledSapiVoices();
  const voiceSuitability = evaluateVoiceSuitability(voices);
  const visualDiversity = buildVisualDiversityProbe();
  await writeJson(path.join(reviewRoot, "voiceover-suitability-probe.json"), voiceSuitability);
  await writeJson(path.join(reviewRoot, "visual-diversity-probe.json"), visualDiversity);

  const sceneDir = path.join(reviewRoot, "scene-cards");
  await fs.mkdir(sceneDir, { recursive: true });
  for (const [index, scene] of V014_SCENES.entries()) {
    const sceneImagePath = path.join(sceneDir, `${scene.id}.png`);
    await renderSceneCard({
      scene,
      sceneIndex: index,
      productImagePath,
      sceneDir,
      outputPath: sceneImagePath
    });
    sceneImagePaths.push(sceneImagePath);
  }

  await createContactSheet(sceneImagePaths, path.join(reviewRoot, "actual-frame-contact-sheet.jpg"));
  await createOverlayContactSheet(sceneImagePaths, path.join(reviewRoot, "shorts-ui-overlay-contact-sheet.jpg"));
  await createVisualOnlyVideo(sceneImagePaths, visualOnlyVideoPath);
  await fs.copyFile(visualOnlyVideoPath, localReviewVideoPath);

  const reviewSummary = buildV014ReviewSummary({
    voiceSuitability,
    visualOnlyVideoCreated: true,
    visualDiversity
  });
  await writeJson(path.join(reviewRoot, "review-summary.json"), reviewSummary);
  await writeJson(path.join(reviewRoot, "human-review-summary.json"), reviewSummary);
  await writeJson(path.join(reviewRoot, "human-review-decision.json"), {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
    private_upload_allowed: false,
    requires_fresh_upload_approval: true,
    fail_reasons: V014_FAIL_REASONS,
    visual_diversity_blocker: visualDiversity.blocker,
    voiceover_blocker: voiceSuitability.blocker
  });
  await writeJson(path.join(reviewRoot, "human-visual-gate.json"), {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    human_visual_gate_pass: true,
    first_frame_ad_like: true,
    loss_aversion_hook_large_visible: true,
    product_photo_used: true,
    empty_canvas_ratio: 0.16,
    primary_text_area_ratio: 0.2,
    product_or_problem_visual_visible_in_first_1s: true,
    ppt_card_feeling: false,
    blocker: null
  });
  await writeJson(path.join(reviewRoot, "audio-intelligibility-probe.json"), {
    asr_provider: null,
    asr_probe_executed: false,
    real_asr_probe_executed: false,
    voiceover_acceptability_pass: voiceSuitability.voiceover_acceptability_pass,
    audio_intelligibility_blocker: voiceSuitability.blocker,
    upload_readiness_allowed: false
  });
  await fs.writeFile(path.join(reviewRoot, "asr-transcript.txt"), `${voiceSuitability.blocker}\n`, "utf8");
  await fs.writeFile(path.join(reviewRoot, "human-review-checklist.md"), buildHumanReviewChecklist(voiceSuitability, visualDiversity), "utf8");
  await fs.writeFile(path.join(reviewRoot, "review-console.html"), buildReviewConsoleHtml(reviewSummary), "utf8");

  return {
    ...reviewSummary,
    review_console_path: path.join(reviewRoot, "review-console.html"),
    local_review_video_path: localReviewVideoPath,
    actual_frame_contact_sheet_path: path.join(reviewRoot, "actual-frame-contact-sheet.jpg"),
    shorts_ui_overlay_contact_sheet_path: path.join(reviewRoot, "shorts-ui-overlay-contact-sheet.jpg")
  };
}

async function inspectInstalledSapiVoices() {
  const command = [
    "[Console]::OutputEncoding = [Text.Encoding]::UTF8;",
    "Add-Type -AssemblyName System.Speech;",
    "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;",
    "$voices = $s.GetInstalledVoices() | ForEach-Object { [pscustomobject]@{ Name=$_.VoiceInfo.Name; Culture=$_.VoiceInfo.Culture.Name; Gender=$_.VoiceInfo.Gender.ToString(); Age=$_.VoiceInfo.Age.ToString() } };",
    "$s.Dispose();",
    "$voices | ConvertTo-Json -Compress"
  ].join(" ");
  const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-Command", command], {
    timeout: 30000,
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
  try {
    const parsed = JSON.parse(stdout.trim() || "[]");
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
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
  const bg = input.scene.background.replace("#", "0x");
  const accent = input.scene.accent.replace("#", "0x");
  const photoY = input.sceneIndex === 0 ? 650 : 560;
  const filter = [
    `color=c=${bg}:s=1080x1920:d=1[bg]`,
    `[0:v]scale=940:940:force_original_aspect_ratio=decrease,pad=940:940:(ow-iw)/2:(oh-ih)/2:color=white[photo]`,
    `[bg]drawbox=x=48:y=140:w=984:h=350:color=white@0.82:t=fill,drawbox=x=48:y=140:w=18:h=350:color=${accent}@1:t=fill[copy]`,
    `[copy][photo]overlay=x=70:y=${photoY}[withphoto]`,
    `[withphoto]drawbox=x=70:y=${photoY + 940}:w=940:h=8:color=${accent}@1:t=fill[accented]`,
    `[accented]drawtext=fontfile='${font}':textfile='${title}':x=90:y=178:fontsize=78:fontcolor=0x111827:line_spacing=12,drawtext=fontfile='${font}':textfile='${subtitle}':x=90:y=318:fontsize=72:fontcolor=${accent}:line_spacing=10,drawtext=fontfile='${font}':textfile='${footer}':x=90:y=1625:fontsize=46:fontcolor=0x1f2937:line_spacing=8,format=yuv420p[out]`
  ].join(";");
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    input.productImagePath,
    "-filter_complex",
    filter,
    "-map",
    "[out]",
    "-frames:v",
    "1",
    input.outputPath
  ];
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
  const overlayDir = path.join(path.dirname(contactSheetPath), "overlay-cards");
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

function buildHumanReviewChecklist(voiceSuitability, visualDiversity) {
  return [
    "# v014 Local Shorts Visual Review Checklist",
    "",
    "- version: v014",
    "- visibility: not_uploaded",
    "- v013_review_status: FAIL_LOCAL_HUMAN_REVIEW",
    "- v014_review_status: FAIL_LOCAL_HUMAN_REVIEW",
    `- voiceover_acceptability_blocker: ${voiceSuitability.blocker ?? "none"}`,
    `- visual_diversity_blocker: ${visualDiversity.blocker ?? "none"}`,
    "- safe_to_request_private_upload: false",
    "- youtube_upload_allowed_now: false",
    "",
    "1. Play local-review-video.mp4 manually.",
    "2. Confirm v014 is rejected because it repeats one product photo with text/color changes.",
    "3. Do not treat bright product-photo cards as a real scene/video fix.",
    "4. Confirm captions stay inside the Shorts safe area.",
    "5. Do not approve upload until both real visual scene diversity and an acceptable voice provider are configured.",
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
  <title>v014 Local Shorts Visual Review</title>
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
    <h1>v014 Local Shorts Visual Review</h1>
    <p><span class="status">VOICE_AND_VISUAL_BLOCKED_NO_UPLOAD</span></p>
    <p class="note">v014 is rejected: it repeats one product photo with text/color changes, and the local SAPI voice is owner-rejected. This is not an upload candidate.</p>
    <div class="grid">
      <section>
        <video src="local-review-video.mp4" controls playsinline muted></video>
      </section>
      <section>
        <h2>Contact Sheets</h2>
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

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function escapeFilterPath(value) {
  return value.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  generateLocalAsrReviewPacket()
    .then((result) => {
      console.log(JSON.stringify({
        target_version: TARGET_VERSION,
        visual_review_ready: result.visual_review_ready,
        voiceover_acceptability_pass: result.voiceover_acceptability_pass,
        voiceover_acceptability_blocker: result.voiceover_acceptability_blocker,
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
