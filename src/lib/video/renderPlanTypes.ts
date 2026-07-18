export type RenderPlanVersion = "1";

export type RenderShotLayout =
  | "title_card"
  | "product_focus"
  | "detail_check"
  | "manual_upload_cta";

export type RenderShotImageRole = "product";

export type RenderShotSafeArea = "top_title" | "center_focus" | "bottom_caption";

export type RenderPlanMissingReason =
  | "product_name"
  | "selected_affiliate_url"
  | "thumbnail_url"
  | "video_script"
  | "disclosure_text";

export type RenderPlanShot = {
  shot_id: string;
  duration_sec: number;
  layout: RenderShotLayout;
  image_role: RenderShotImageRole;
  image_url: string;
  caption: string;
  voice_text: string;
  safe_area: RenderShotSafeArea;
  metadata: {
    source: "template";
    sequence: number;
  };
};

export type RenderPlan = {
  version: RenderPlanVersion;
  queue_id: string;
  product_name: string;
  source: "storyboard_template";
  shots: RenderPlanShot[];
  disclosure_text: string;
  creative_policy: {
    real_usage_scene_present: boolean;
    usage_source_role: "exact_product_use" | "generic_usage_example" | "product_reference_still";
    usage_label_present: boolean;
    exact_product_identity_claim: boolean;
    exact_product_identity_verified: boolean;
    actor_nationality_claim: string | null;
    actor_nationality_verified: boolean;
  };
  render_target: {
    width: 1080;
    height: 1920;
    fps: 30;
    aspect_ratio: "9:16";
  };
  safety: {
    external_api_call: false;
    platform_upload: false;
    vimax_dependency: false;
    worker_jobs_created: false;
  };
};

export type RenderPlanReadiness = {
  ready: boolean;
  missing_reasons: RenderPlanMissingReason[];
};

export type BuildRenderPlanResult =
  | {
      ok: true;
      render_plan: RenderPlan;
      missing_reasons: [];
    }
  | {
      ok: false;
      error_code: "RENDER_PLAN_NOT_READY";
      message: string;
      missing_reasons: RenderPlanMissingReason[];
    };
