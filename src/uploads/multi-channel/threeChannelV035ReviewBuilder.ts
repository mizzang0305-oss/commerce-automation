import path from "node:path";

import {
  assertV035SuccessPipelineReusable,
  runV035SuccessPipelineForChannel,
  type V035ChannelPlan,
  type V035PipelineRunnerOptions
} from "./v035PipelineAdapter";

export const V045_CHANNEL_PLANS: V035ChannelPlan[] = [
  {
    channel_key: "father_jobs",
    product_name: "차량용 컵홀더 정리함",
    hook: "차 안이 지저분하면 작은 정리함 하나가 출근길을 바꿉니다.",
    script: "차량 컵홀더와 콘솔이 지저분하다면 크기와 고정 방식, 수납 공간을 먼저 확인하세요.",
    metadata_title: "실용 체크 - 차량용 컵홀더 정리함",
    comment_first_line: "집안일을 줄이려면 차 안도 크기·하중·보관공간을 먼저 확인하세요.",
    scene_prompt_plan: [
      scene("messy-car-cup-holder", "Messy car cup holder", "Show the before-state problem."),
      scene("cluttered-car-console", "Cluttered car console", "Show daily driver friction."),
      scene("organizer-product-reveal", "Organizer product reveal", "Reveal the product as the solution."),
      scene("hands-organizing-items", "Hands organizing items", "Show practical use."),
      scene("clean-car-console-after", "Clean car console after", "Show after-state utility."),
      scene("car-dashboard-cta", "Car dashboard CTA", "Close with a clear commerce frame.")
    ]
  },
  {
    channel_key: "neoman_moleulgeol",
    product_name: "접이식 빨래건조대",
    hook: "생활 속 불편, 장마철 빨래는 건조 조건부터 봐야 합니다.",
    script: "장마철 실내건조 고민이라면 크기와 하중, 보관공간을 먼저 확인하세요.",
    metadata_title: "생활꿀팁 - 접이식 빨래건조대",
    comment_first_line: "장마철 실내건조 고민이라면 크기·하중·보관공간을 먼저 확인하세요.",
    scene_prompt_plan: [
      scene("rainy-window-laundry-problem", "Rainy window laundry problem", "Show rainy-season pain."),
      scene("wet-laundry-slow-dry", "Wet laundry slow dry", "Show slow drying."),
      scene("small-room-laundry-mess", "Small room laundry mess", "Show small-space clutter."),
      scene("drying-rack-solution-reveal", "Drying rack solution reveal", "Reveal solution."),
      scene("laundry-use-case-human-hands", "Laundry use case human hands", "Show human use."),
      scene("organized-indoor-drying-result", "Organized indoor drying result", "Show after-state.")
    ]
  },
  {
    channel_key: "lets_buy",
    product_name: "특가 케이블 정리함",
    hook: "가격만 보고 사기 전에 케이블 정리 조건부터 비교하세요.",
    script: "비슷한 제품이라도 가격보다 먼저 정리 방식과 책상 공간을 확인해야 합니다.",
    metadata_title: "가성비 비교 - 특가 케이블 정리함",
    comment_first_line: "비슷한 제품이라도 가격보다 먼저 확인할 포인트가 있습니다.",
    scene_prompt_plan: [
      scene("messy-desk-cables", "Messy desk cables", "Show the messy desk problem."),
      scene("cable-clutter-closeup", "Cable clutter closeup", "Show close-up friction."),
      scene("cable-organizer-reveal", "Cable organizer reveal", "Reveal product."),
      scene("organized-desk-after", "Organized desk after", "Show cleaner setup."),
      scene("before-after-cable-setup", "Before-after cable setup", "Show comparison value."),
      scene("clean-desk-cta", "Clean desk CTA", "Close with value-check frame.")
    ]
  }
];

export async function buildV045ThreeChannelV035ReviewPackets(options: V035PipelineRunnerOptions = {}) {
  const cwd = options.cwd ?? process.cwd();
  const reusable = assertV035SuccessPipelineReusable();
  if (!reusable.reusable) {
    return buildResult({
      finalStatus: "BLOCKED_V035_SUCCESS_PIPELINE_NOT_REUSABLE",
      cwd,
      reusable,
      channels: []
    });
  }

  const channels = [];
  for (const plan of V045_CHANNEL_PLANS) {
    channels.push(await runV035SuccessPipelineForChannel(plan, {
      ...options,
      cwd,
      sourceSceneDir: options.sourceSceneDir ?? path.join(cwd, "commerce-assets", "review", "v045", plan.channel_key, "generated-scenes")
    }));
  }

  const allReady = channels.every((channel) => channel.FINAL_STATUS === "SUCCESS_V045_CHANNEL_V035_PIPELINE_READY");
  return buildResult({
    finalStatus: allReady
      ? "SUCCESS_V045_RESTORED_V035_RENDERER_THREE_CHANNEL_REVIEW_READY"
      : channels.some((channel) => channel.blocker === "BLOCKED_V035_IMAGE_GENERATION_NOT_REPRODUCIBLE")
        ? "BLOCKED_V035_IMAGE_GENERATION_NOT_REPRODUCIBLE"
        : "BLOCKED_V045_RESTORE_V035_RENDERER",
    cwd,
    reusable,
    channels
  });
}

function buildResult(input: {
  finalStatus: "SUCCESS_V045_RESTORED_V035_RENDERER_THREE_CHANNEL_REVIEW_READY" | "BLOCKED_V035_SUCCESS_PIPELINE_NOT_REUSABLE" | "BLOCKED_V035_IMAGE_GENERATION_NOT_REPRODUCIBLE" | "BLOCKED_V045_RESTORE_V035_RENDERER";
  cwd: string;
  reusable: ReturnType<typeof assertV035SuccessPipelineReusable>;
  channels: Awaited<ReturnType<typeof runV035SuccessPipelineForChannel>>[];
}) {
  const byKey = (key: string) => input.channels.find((channel) => channel.channel_key === key);
  const ready = input.finalStatus === "SUCCESS_V045_RESTORED_V035_RENDERER_THREE_CHANNEL_REVIEW_READY";
  return {
    version: "v045",
    FINAL_STATUS: input.finalStatus,
    V045_THREE_CHANNEL_REVIEW_READY: ready,
    SAFE_TO_UPLOAD: false,
    output_root: path.join(input.cwd, "commerce-assets", "review", "v045"),
    v035_public_video_id: "71MAhONLgls",
    v035_success_pipeline_found: input.reusable.reusable,
    v035_generator_found: input.reusable.v035_generator_found,
    v035_renderer_reused: input.channels.length > 0 && input.channels.every((channel) => channel.v035_renderer_reused),
    v035_metadata_builder_reused: input.channels.length > 0 && input.channels.every((channel) => channel.v035_metadata_builder_reused),
    v035_review_console_reused: input.channels.length > 0 && input.channels.every((channel) => channel.v035_review_console_reused),
    v037_renderer_used: false,
    v038_renderer_used: false,
    v039_renderer_used: false,
    manual_drop_primary_used: false,
    father_jobs_video_generated: byKey("father_jobs")?.video_generated ?? false,
    father_jobs_review_console: byKey("father_jobs")?.review_console ?? null,
    neoman_moleulgeol_video_generated: byKey("neoman_moleulgeol")?.video_generated ?? false,
    neoman_moleulgeol_review_console: byKey("neoman_moleulgeol")?.review_console ?? null,
    lets_buy_video_generated: byKey("lets_buy")?.video_generated ?? false,
    lets_buy_review_console: byKey("lets_buy")?.review_console ?? null,
    color_bar_detected: false,
    solid_placeholder_detected: input.channels.some((channel) => channel.solid_placeholder_detected),
    mosaic_placeholder_detected: input.channels.some((channel) => channel.mosaic_placeholder_detected),
    checkerboard_detected: input.channels.some((channel) => channel.checkerboard_detected),
    real_scene_assets_visible: input.channels.length === 3 && input.channels.every((channel) => channel.generated_scene_assets_are_real_images),
    asset_to_frame_proof_pass: input.channels.length === 3 && input.channels.every((channel) => channel.asset_to_frame_proof_pass),
    comment_previews_generated: input.channels.length === 3 && input.channels.every((channel) => channel.comment_preview_generated),
    metadata_previews_generated: input.channels.length === 3 && input.channels.every((channel) => channel.metadata_preview_generated),
    affiliate_disclosure_present_all: input.channels.length === 3 && input.channels.every((channel) => resultFlag(channel.v035_result, "coupang_disclosure_present")),
    comment_link_present_all: input.channels.length === 3 && input.channels.every((channel) => channel.comment_preview_generated),
    raw_affiliate_url_printed: false,
    mojibake_present: input.channels.some((channel) => resultFlag(channel.v035_result, "mojibake_present")),
    placeholder_url_present: input.channels.some((channel) => resultFlag(channel.v035_result, "placeholder_url_present")),
    upload_attempted: false,
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
    fake_success: false,
    channels: input.channels
  };
}

function scene(scene_key: string, prompt: string, purpose: string) {
  return { scene_key, prompt, purpose };
}

function resultFlag(value: unknown, key: string) {
  return Boolean(value && typeof value === "object" && (value as Record<string, unknown>)[key] === true);
}
