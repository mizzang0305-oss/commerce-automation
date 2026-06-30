import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CHANNEL_KEYS, type ChannelKey, getChannelProfile } from "../../src/uploads/multi-channel/channelProfiles";
import { buildChannelCommentPreview, MULTI_CHANNEL_COUPANG_DISCLOSURE } from "../../src/uploads/multi-channel/commentTemplateBuilder";
import { getRequiredSceneObjectGroups } from "../../src/uploads/multi-channel/sceneObjectRequirementGate";
import { validateRealImageSemanticGate, type RealImageSemanticAsset } from "../../src/uploads/multi-channel/realImageSemanticGate";
import { evaluateRealImageProviderAvailability } from "../../src/uploads/multi-channel/realImageProviderAvailabilityGate";

export const V039_FAILURE_RECORD = {
  version: "v039",
  human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
  safe_to_upload: false,
  fail_reasons: [
    "GENERATED_SCENE_ASSETS_ARE_MOSAIC_PLACEHOLDERS",
    "IMAGE_SKILL_PROVIDER_FALSE_POSITIVE",
    "ASSET_TO_FRAME_PROOF_ONLY_PROVED_PLACEHOLDER_PROPAGATION",
    "NO_REAL_LIFE_SCENE_VISIBLE",
    "CHECKERBOARD_NOISE_ASSET_RENDERED",
    "REAL_IMAGE_SEMANTIC_GATE_MISSING",
    "PR158_MERGE_BLOCKED"
  ],
  pr158_merge_allowed: false
} as const;

type V040ChannelPromptPackage = {
  channel_key: ChannelKey;
  display_name: string;
  required_object_groups: string[][];
  expected_image_dir: string;
  scenes: Array<{
    scene_key: string;
    filename: string;
    prompt: string;
    required_visuals: string[];
    forbidden_visuals: string[];
  }>;
};

export function buildV040ScenePromptPackage() {
  return {
    version: "v040",
    purpose: "Generate real photo-like commerce Shorts scene images only. Placeholder images must block video rendering.",
    affiliate_disclosure: MULTI_CHANNEL_COUPANG_DISCLOSURE,
    provider_priority: [
      "project-connected real image generation provider",
      "local ComfyUI or SD WebUI provider",
      "manual-drop real image assets",
      "external free stock provider only after relevance gate"
    ],
    forbidden_fallbacks: [
      "solid rectangle",
      "gradient panel",
      "color bar",
      "checkerboard",
      "mosaic noise",
      "CSS placeholder",
      "canvas placeholder",
      "sample fixture image"
    ],
    channels: CHANNEL_KEYS.map(buildChannelPromptPackage)
  };
}

export async function writeV040RealImageSemanticReviewPackets(input: {
  cwd?: string;
  providerName?: string | null;
  sceneAssetsByChannel?: Partial<Record<ChannelKey, RealImageSemanticAsset[]>>;
} = {}) {
  const cwd = input.cwd ?? process.cwd();
  const outputRoot = path.join(cwd, "commerce-assets", "review", "v040");
  await fs.mkdir(outputRoot, { recursive: true });

  const promptPackage = buildV040ScenePromptPackage();
  const expectedImagePaths = buildExpectedImagePaths(outputRoot, promptPackage.channels);
  const providerAssets = CHANNEL_KEYS.flatMap((channelKey) => input.sceneAssetsByChannel?.[channelKey] ?? []);
  const providerStatus = evaluateRealImageProviderAvailability({
    provider_name: input.providerName ?? null,
    scene_assets: providerAssets
  });
  const channelResults = [];

  for (const channelKey of CHANNEL_KEYS) {
    const channelDir = path.join(outputRoot, channelKey);
    await fs.mkdir(channelDir, { recursive: true });
    const assets = input.sceneAssetsByChannel?.[channelKey] ?? [];
    const semanticReport = validateRealImageSemanticGate({ channel_key: channelKey, assets });
    const videoGenerated = providerStatus.provider_available && semanticReport.pass;
    const commentPreview = buildChannelCommentPreview({ channel_key: channelKey });
    const humanReviewDecision = {
      version: "v040",
      channel_key: channelKey,
      human_review_status: "PENDING_HUMAN_REVIEW",
      metadata_review_status: "PENDING_METADATA_REVIEW",
      private_upload_allowed: false,
      safe_to_request_private_upload: false,
      public_upload_blocked: true,
      semantic_gate_pass: semanticReport.pass,
      local_review_video_generated: videoGenerated
    };

    await writeJson(path.join(channelDir, "scene-semantic-report.json"), semanticReport);
    await writeJson(path.join(channelDir, "comment-preview.json"), commentPreview);
    await writeJson(path.join(channelDir, "human-review-decision.json"), humanReviewDecision);
    await fs.writeFile(path.join(channelDir, "review-console.html"), buildReviewConsoleHtml({
      channelKey,
      semanticReport,
      commentPreview,
      videoGenerated
    }), "utf8");

    channelResults.push({
      channel_key: channelKey,
      scene_semantic_pass: semanticReport.pass,
      video_generated: videoGenerated,
      review_console: path.join(channelDir, "review-console.html"),
      scene_semantic_report: path.join(channelDir, "scene-semantic-report.json"),
      semantic_gate_blockers: semanticReport.blockers
    });
  }

  const semanticSummary = {
    version: "v040",
    v039_failure_record: V039_FAILURE_RECORD,
    provider_status: providerStatus,
    channel_results: channelResults,
    youtube_execute_called: false,
    videos_insert_called: false,
    new_upload_attempted: false,
    comment_create_update_delete_called: false,
    visibility_changed: false,
    R2_upload: false,
    product_assets_write: false,
    DB_write: false,
    raw_urls_printed: false,
    secrets_printed: false,
    fake_success: false
  };
  const finalStatus = providerStatus.provider_available
    ? "SUCCESS_V040_REAL_IMAGE_SEMANTIC_REVIEW_READY"
    : "BLOCKED_REAL_IMAGE_PROVIDER_NOT_AVAILABLE";
  const artifactPaths = {
    real_image_provider_status: path.join(outputRoot, "real-image-provider-status.json"),
    real_image_semantic_summary: path.join(outputRoot, "real-image-semantic-gate-summary.json"),
    scene_prompt_package: path.join(outputRoot, "scene-prompt-package.json"),
    manual_image_drop_guide: path.join(outputRoot, "manual-image-drop-guide.md"),
    expected_image_paths: path.join(outputRoot, "expected-image-paths.json"),
    three_channel_routing_summary: path.join(outputRoot, "three-channel-routing-summary.html")
  };

  await writeJson(artifactPaths.real_image_provider_status, providerStatus);
  await writeJson(artifactPaths.real_image_semantic_summary, semanticSummary);
  await writeJson(artifactPaths.scene_prompt_package, promptPackage);
  await writeJson(artifactPaths.expected_image_paths, expectedImagePaths);
  await fs.writeFile(artifactPaths.manual_image_drop_guide, buildManualImageDropGuide(expectedImagePaths), "utf8");
  await fs.writeFile(artifactPaths.three_channel_routing_summary, buildThreeChannelSummaryHtml(channelResults, providerStatus), "utf8");

  return {
    FINAL_STATUS: finalStatus,
    V040_REVIEW_PACKETS_READY: providerStatus.provider_available,
    SAFE_TO_UPLOAD: false,
    v039_review_status: V039_FAILURE_RECORD.human_review_status,
    fail_reasons: V039_FAILURE_RECORD.fail_reasons,
    pr158_merge_allowed: V039_FAILURE_RECORD.pr158_merge_allowed,
    image_provider_available: providerStatus.provider_available,
    image_provider_name: providerStatus.provider_name,
    real_image_generation_success: providerStatus.real_image_generation_success,
    provider_blocker: providerStatus.provider_blocker,
    channel_results: channelResults,
    artifact_paths: artifactPaths,
    youtube_execute_called: false,
    videos_insert_called: false,
    new_upload_attempted: false,
    comment_create_update_delete_called: false,
    visibility_changed: false,
    R2_upload: false,
    product_assets_write: false,
    DB_write: false,
    raw_urls_printed: false,
    secrets_printed: false,
    fake_success: false
  };
}

function buildChannelPromptPackage(channelKey: ChannelKey): V040ChannelPromptPackage {
  const profile = getChannelProfile(channelKey);
  const requiredObjectGroups = getRequiredSceneObjectGroups(channelKey);
  const basePrompt = `Photorealistic vertical commerce Shorts scene for ${profile.display_name}. Real-life room, object, lighting, and camera perspective.`;
  return {
    channel_key: channelKey,
    display_name: profile.display_name,
    required_object_groups: requiredObjectGroups,
    expected_image_dir: `commerce-assets/review/v040/${channelKey}/generated-scenes`,
    scenes: Array.from({ length: 6 }, (_, index) => ({
      scene_key: `scene_${index + 1}`,
      filename: `scene-${String(index + 1).padStart(2, "0")}.jpg`,
      prompt: [
        basePrompt,
        `Required visible objects: ${requiredObjectGroups.map((group) => group.join(" or ")).join("; ")}.`,
        "Must look like a real photographed lifestyle advertising scene, not a graphic, mosaic, pattern, color grid, or test render."
      ].join(" "),
      required_visuals: [
        "real photo-like lifestyle scene",
        "visible product or related object",
        "visible channel-specific real context",
        "portrait 9:16 frame",
        "natural lighting"
      ],
      forbidden_visuals: [
        "mosaic",
        "checkerboard",
        "random noise",
        "abstract color grid",
        "solid or gradient placeholder",
        "text inside image",
        "raw URL",
        "watermark"
      ]
    }))
  };
}

function buildExpectedImagePaths(outputRoot: string, channels: V040ChannelPromptPackage[]) {
  return channels.map((channel) => ({
    channel_key: channel.channel_key,
    expected_dir: path.join(outputRoot, channel.channel_key, "generated-scenes"),
    files: channel.scenes.map((scene) => path.join(outputRoot, channel.channel_key, "generated-scenes", scene.filename))
  }));
}

function buildReviewConsoleHtml(input: {
  channelKey: ChannelKey;
  semanticReport: ReturnType<typeof validateRealImageSemanticGate>;
  commentPreview: ReturnType<typeof buildChannelCommentPreview>;
  videoGenerated: boolean;
}) {
  const status = input.semanticReport.pass ? "SEMANTIC PASS" : "SEMANTIC BLOCKED";
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>v040 Real Image Semantic Review - ${escapeHtml(input.channelKey)}</title>
  <style>
    body{font-family:Arial,"Malgun Gothic",sans-serif;margin:24px;color:#111827;background:#f8fafc}
    section{background:white;border:1px solid #d1d5db;padding:16px;margin-bottom:16px}
    pre{white-space:pre-wrap;background:#f3f4f6;border:1px solid #e5e7eb;padding:12px}
    .blocked{color:#991b1b;font-weight:700}.ok{color:#166534;font-weight:700}
  </style>
</head>
<body>
  <h1>v040 Real Image Semantic Review - ${escapeHtml(input.channelKey)}</h1>
  <p class="${input.semanticReport.pass ? "ok" : "blocked"}">${status}</p>
  <section>
    <h2>Generated Scene Assets Contact Sheet</h2>
    <p>Only available after real image semantic gate passes. Placeholder fallback is forbidden.</p>
  </section>
  <section>
    <h2>Scene Semantic Report</h2>
    <pre>${escapeHtml(JSON.stringify(input.semanticReport, null, 2))}</pre>
  </section>
  <section>
    <h2>Local Review Video</h2>
    <p>video_generated: ${input.videoGenerated}</p>
    <p>Video rendering is blocked unless all scene images pass the real image semantic gate.</p>
  </section>
  <section>
    <h2>Metadata / Comment Preview</h2>
    <pre>${escapeHtml(input.commentPreview.comment_text_sanitized)}</pre>
  </section>
  <section>
    <h2>Safety</h2>
    <pre>${escapeHtml(JSON.stringify({
      youtube_execute_called: false,
      videos_insert_called: false,
      upload_attempted: false,
      visibility_changed: false,
      raw_urls_printed: false
    }, null, 2))}</pre>
  </section>
</body>
</html>
`;
}

function buildManualImageDropGuide(expectedImagePaths: ReturnType<typeof buildExpectedImagePaths>) {
  const lines = [
    "# v040 Manual Real Image Drop Guide",
    "",
    "실제 사진형 이미지 provider가 준비되지 않으면 영상 렌더링을 진행하지 않습니다.",
    "아래 경로에 채널별 6장 이상의 실제 사진형 이미지를 넣고, semantic evidence를 준비한 뒤 다시 실행하세요.",
    "",
    "금지: solid rectangle, gradient panel, color bar, checkerboard, mosaic noise, CSS/canvas placeholder, sample fixture image.",
    ""
  ];
  for (const channel of expectedImagePaths) {
    lines.push(`## ${channel.channel_key}`);
    lines.push(`- expected_dir: ${channel.expected_dir}`);
    for (const file of channel.files) {
      lines.push(`- ${file}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function buildThreeChannelSummaryHtml(
  channelResults: Array<{ channel_key: ChannelKey; scene_semantic_pass: boolean; video_generated: boolean; semantic_gate_blockers: string[] }>,
  providerStatus: ReturnType<typeof evaluateRealImageProviderAvailability>
) {
  const rows = channelResults.map((result) =>
    `<tr><td>${escapeHtml(result.channel_key)}</td><td>${result.scene_semantic_pass}</td><td>${result.video_generated}</td><td>${escapeHtml(result.semantic_gate_blockers.join(", ") || "none")}</td></tr>`
  ).join("\n");
  return `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8" /><title>v040 Real Image Semantic Summary</title></head>
<body>
  <h1>v040 Real Image Semantic Summary</h1>
  <p>provider_available: ${providerStatus.provider_available}</p>
  <p>provider_blocker: ${escapeHtml(providerStatus.provider_blocker ?? "none")}</p>
  <table border="1" cellpadding="6" cellspacing="0">
    <thead><tr><th>channel</th><th>semantic pass</th><th>video generated</th><th>blockers</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>
`;
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function escapeHtml(value: unknown) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  writeV040RealImageSemanticReviewPackets()
    .then((result) => {
      console.log(JSON.stringify({
        FINAL_STATUS: result.FINAL_STATUS,
        V040_REVIEW_PACKETS_READY: result.V040_REVIEW_PACKETS_READY,
        SAFE_TO_UPLOAD: result.SAFE_TO_UPLOAD,
        image_provider_available: result.image_provider_available,
        image_provider_name: result.image_provider_name,
        real_image_generation_success: result.real_image_generation_success,
        provider_blocker: result.provider_blocker,
        channel_results: result.channel_results.map((channel) => ({
          channel_key: channel.channel_key,
          scene_semantic_pass: channel.scene_semantic_pass,
          video_generated: channel.video_generated,
          semantic_gate_blockers: channel.semantic_gate_blockers
        })),
        artifact_paths: result.artifact_paths,
        youtube_execute_called: result.youtube_execute_called,
        videos_insert_called: result.videos_insert_called,
        raw_urls_printed: result.raw_urls_printed,
        secrets_printed: result.secrets_printed
      }, null, 2));
    })
    .catch((error) => {
      console.error(JSON.stringify({
        FINAL_STATUS: "BLOCKED_V040_REAL_IMAGE_SEMANTIC_GATE",
        message: error instanceof Error ? error.message : String(error),
        youtube_execute_called: false,
        videos_insert_called: false,
        raw_urls_printed: false,
        secrets_printed: false
      }, null, 2));
      process.exitCode = 1;
    });
}
