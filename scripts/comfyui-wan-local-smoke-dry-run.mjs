#!/usr/bin/env node

const negativePrompt = [
  "no cartoon",
  "no anime",
  "no vector illustration",
  "no abstract shapes",
  "no geometric placeholder",
  "no fake logo",
  "no fake review text",
  "no distorted fingers",
  "no watermark"
].join(", ");

const scenes = [
  {
    scene_id: "scene-04-hand-pickup",
    kind: "hand_pickup",
    duration_seconds: 3,
    prompt: [
      "photorealistic vertical 9:16 commerce short",
      "real kitchen countertop",
      "cropped human hand picks up the product naturally",
      "visible hand interaction and utensil interaction",
      "subtle camera motion, no testimonial claim"
    ].join(", "),
    required_signals: ["handInteraction", "utensilInteraction", "kitchenContext"]
  },
  {
    scene_id: "scene-05-cooking-use",
    kind: "cooking_use",
    duration_seconds: 3,
    prompt: [
      "photorealistic vertical 9:16 commerce short",
      "warm kitchen context",
      "hand uses the product during simple cooking preparation",
      "visible practical motion, utensil moves through food or cookware",
      "no exaggerated product claim"
    ].join(", "),
    required_signals: ["handInteraction", "utensilInteraction", "kitchenContext"]
  },
  {
    scene_id: "scene-06-product-rotate",
    kind: "product_rotate",
    duration_seconds: 3,
    prompt: [
      "photorealistic vertical 9:16 commerce short",
      "product set rotates slowly on a kitchen counter",
      "subtle orbit camera move",
      "material texture remains consistent",
      "no text overlay baked into the generated clip"
    ].join(", "),
    required_signals: ["productRotate", "kitchenContext"]
  }
];

const report = {
  smoke_only: true,
  dry_run: true,
  target_candidate_id: "candidate-local-comfyui-wan-dry-run",
  requested_scene_count: scenes.length,
  scenes,
  negative_prompt: negativePrompt,
  expected_manifest_shape: {
    provider_name: "comfyui_wan_i2v",
    provider_mode: "image_to_video_generated",
    smoke_only: true,
    final_upload_allowed: false,
    public_upload_blocked: true,
    clips: scenes.map((scene) => ({
      scene_id: scene.scene_id,
      expected_clip_ref: `safe:motion:comfyui_wan_i2v:${scene.scene_id}`,
      duration_seconds: scene.duration_seconds,
      required_signals: scene.required_signals
    }))
  },
  expected_blockers: [
    "LOCAL_SMOKE_DRY_RUN_ONLY",
    "COMFYUI_WAN_I2V_PROVIDER_DISABLED"
  ],
  server_called: false,
  workflow_submit_attempted: false,
  workflow_result_poll_attempted: false,
  motion_clip_generation: false,
  mp4_generated: false,
  r2_upload_write: false,
  db_write: false,
  youtube_execute: false,
  videos_insert: false,
  safe_summary: {
    raw_values_masked: true,
    output_written: false,
    next_action: "Configure local ComfyUI/Wan readiness, then run an explicitly approved local smoke."
  }
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
