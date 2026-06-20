import type { ProductAsset, ProductCandidate } from "@/types/automation";
import {
  toPreparedVideoAssetApiSummary,
  validatePreparedVideoAssetRef
} from "@/lib/uploads/assets/preparedVideoAssetValidator";
import type {
  OneProductServerAssetRegistrationErrorCode,
  ServerVideoAssetRegistrar
} from "@/lib/uploads/videoAssets/oneProductServerAssetRegistration";
import { APPROVE_GENERATE_STORY_VOICEOVER_MP4_AND_UPLOAD_ONE_PRIVATE } from "@/lib/uploads/youtube/storyVoiceoverUploadApproval";
import { APPROVE_FIX_SHORTS_RENDERING_PACING_AND_UPLOAD_ONE_PRIVATE } from "@/lib/uploads/youtube/shortsRenderingPacingApproval";
import type { PreparedVideoAssetRef } from "@/lib/uploads/youtube/uploadAssetContract";

export {
  APPROVE_GENERATE_STORY_VOICEOVER_MP4_AND_UPLOAD_ONE_PRIVATE,
  APPROVE_FIX_SHORTS_RENDERING_PACING_AND_UPLOAD_ONE_PRIVATE
};

export const RUN_REAL_PRODUCT_VIDEO_ASSET_GENERATION = "RUN_REAL_PRODUCT_VIDEO_ASSET_GENERATION";
export const APPROVE_SINGLE_SERVER_ACCESSIBLE_VIDEO_ASSET_REGISTRATION =
  "APPROVE_SINGLE_SERVER_ACCESSIBLE_VIDEO_ASSET_REGISTRATION";

export type OneProductVideoAssetMode = "dry_run" | "generate_local_only" | "register_server_asset";

export type GeneratedProductVideoAsset = {
  candidate_id: string;
  local_video_path: string;
  mime_type: "video/mp4";
  size_bytes: number;
  duration_seconds?: number | null;
  checksum_sha256?: string | null;
  black_screen_detected?: boolean | null;
  story_video_generated?: boolean;
  voiceover_audio_present?: boolean;
  voiceover_audio_file_present?: boolean;
  audio_duration_seconds?: number | null;
  audio_mime_type?: string | null;
  audio_muxed_into_video?: boolean;
  video_has_audio_stream?: boolean;
  scene_count?: number | null;
  caption_count?: number | null;
  static_single_image_only?: boolean;
  product_image_present?: boolean;
  content_quality_score?: number | null;
  hook_title_present?: boolean;
  hook_title_visible_in_first_1_5_seconds?: boolean;
  hook_title_safe_area_pass?: boolean;
  caption_safe_area_pass?: boolean;
  all_text_inside_mobile_safe_area?: boolean;
  no_text_clipped?: boolean;
  max_caption_lines?: number | null;
  caption_font_size_readable?: boolean;
  caption_contrast_pass?: boolean;
  transition_count?: number | null;
  visual_motion_score?: number | null;
  distinct_frame_ratio_pass?: boolean;
  use_case_scene_present?: boolean;
  kitchen_context_scene_present?: boolean;
  utensil_usage_simulation_present?: boolean;
  before_after_or_problem_scene_present?: boolean;
  voiceover_speed_wpm?: number | null;
  voiceover_speed_multiplier?: number | null;
  max_silence_between_segments_ms?: number | null;
  audio_video_duration_gap_seconds?: number | null;
  generated_this_run: boolean;
  local_only: true;
};

export type SafeGeneratedProductVideoAsset = Omit<GeneratedProductVideoAsset, "local_video_path"> & {
  local_video_path_present: boolean;
  domain_ready: false;
};

export type OneProductVideoAssetSideEffects = {
  video_generated: boolean;
  local_file_written: boolean;
  r2_uploaded: boolean;
  db_written: boolean;
  product_assets_written: boolean;
  rows_inserted_or_upserted: number;
  queue_created: boolean;
  worker_job_created: boolean;
  upload_package_created: boolean;
  youtube_execute_called: boolean;
  youtube_upload_executed: boolean;
  videos_insert_called: boolean;
  public_upload_enabled: boolean;
};

export type OneProductVideoAssetCandidateSummary = {
  candidate_id: string;
  product_name: string;
  affiliate_url_present: boolean;
  affiliate_validation_status: "valid" | "missing" | "invalid";
  image_ready: boolean;
  image_url_present: boolean;
  smoke_or_test_candidate: boolean;
};

export type OneProductVideoAssetRegistrationPlan = {
  product_candidate_id: string;
  product_assets_rows_planned: 1;
  asset_type: "video";
  max_rows: 1;
  persistence_required: true;
  write_executed: boolean;
};

export type SanitizedPreparedVideoAssetRef = Omit<PreparedVideoAssetRef, "signed_url" | "prepared_video_asset_url"> & {
  signed_url_present: boolean;
  prepared_video_asset_url_present: boolean;
};

export type OneProductVideoAssetResult = {
  ok: boolean;
  error_code:
    | null
    | "REAL_PRODUCT_CANDIDATE_NOT_READY"
    | "REAL_PRODUCT_AFFILIATE_URL_NOT_READY"
    | "REAL_PRODUCT_IMAGE_NOT_READY"
    | "SMOKE_OR_TEST_CANDIDATE_BLOCKED"
    | "VIDEO_ASSET_GENERATION_APPROVAL_REQUIRED"
    | "LOCAL_VIDEO_GENERATION_ADAPTER_NOT_CONFIGURED"
    | "LOCAL_VIDEO_GENERATION_FAILED"
    | "VIDEO_ASSET_REGISTRATION_APPROVAL_REQUIRED"
    | "VIDEO_ASSET_REGISTRATION_NOT_READY"
    | OneProductServerAssetRegistrationErrorCode;
  message: string;
  mode: OneProductVideoAssetMode;
  candidate: OneProductVideoAssetCandidateSummary | null;
  generated_video_asset: SafeGeneratedProductVideoAsset | null;
  prepared_video_asset_ref: SanitizedPreparedVideoAssetRef | null;
  prepared_video_asset_summary: ReturnType<typeof toPreparedVideoAssetApiSummary> | null;
  registration_plan: OneProductVideoAssetRegistrationPlan | null;
  existing_server_asset_ready: boolean;
  blocked_reasons: string[];
  next_action: string | null;
  side_effects: OneProductVideoAssetSideEffects;
};

export type LocalVideoGenerator = (candidate: ProductCandidate) => Promise<GeneratedProductVideoAsset>;

export type OneProductVideoAssetInput = {
  mode?: OneProductVideoAssetMode;
  candidate_id: string;
  approval?: string;
  candidates: ProductCandidate[];
  productAssets?: ProductAsset[];
  prepared_video_asset?: unknown;
  localVideoGenerator?: LocalVideoGenerator;
  serverAssetRegistrar?: ServerVideoAssetRegistrar;
};

export const ONE_PRODUCT_VIDEO_ASSET_SAFE_SIDE_EFFECTS: OneProductVideoAssetSideEffects = {
  video_generated: false,
  local_file_written: false,
  r2_uploaded: false,
  db_written: false,
  product_assets_written: false,
  rows_inserted_or_upserted: 0,
  queue_created: false,
  worker_job_created: false,
  upload_package_created: false,
  youtube_execute_called: false,
  youtube_upload_executed: false,
  videos_insert_called: false,
  public_upload_enabled: false
};

export async function buildOneProductVideoAssetEntryPoint(
  input: OneProductVideoAssetInput
): Promise<OneProductVideoAssetResult> {
  const mode = input.mode ?? "dry_run";
  const candidate = input.candidates.find((item) => item.id === input.candidate_id) ?? null;
  const validation = validateRealProductCandidate(candidate);

  if (!validation.ok) {
    return blockedResult({
      mode,
      error_code: validation.error_code,
      message: validation.message,
      candidate: validation.candidate,
      blocked_reasons: validation.blocked_reasons,
      next_action: validation.next_action
    });
  }

  const existingAsset = findCandidateLinkedServerAsset(candidate!.id, input.productAssets ?? []);

  if (mode === "dry_run") {
    return {
      ok: true,
      error_code: null,
      message: existingAsset
        ? "Candidate already has a server-accessible video asset contract."
        : "Candidate is ready for one-product video asset planning.",
      mode,
      candidate: validation.candidate,
      generated_video_asset: null,
      prepared_video_asset_ref: existingAsset ? sanitizeAssetRef(existingAsset.asset_ref) : null,
      prepared_video_asset_summary: existingAsset?.summary ?? null,
      registration_plan: null,
      existing_server_asset_ready: Boolean(existingAsset),
      blocked_reasons: [],
      next_action: existingAsset ? "RUN_REAL_PRODUCT_AUTO_PILOT_DRY_RUN" : "GENERATE_LOCAL_ONLY_VIDEO_ASSET",
      side_effects: { ...ONE_PRODUCT_VIDEO_ASSET_SAFE_SIDE_EFFECTS }
    };
  }

  if (mode === "generate_local_only") {
    if (!hasGenerationApproval(input.approval)) {
      return blockedResult({
        mode,
        error_code: "VIDEO_ASSET_GENERATION_APPROVAL_REQUIRED",
        message: "Exact approval is required before local-only product video generation.",
        candidate: validation.candidate,
        blocked_reasons: ["missing_video_asset_generation_approval"],
        next_action: "ENTER_RUN_REAL_PRODUCT_VIDEO_ASSET_GENERATION"
      });
    }

    if (!input.localVideoGenerator) {
      return blockedResult({
        mode,
        error_code: "LOCAL_VIDEO_GENERATION_ADAPTER_NOT_CONFIGURED",
        message: "Local video generation adapter is not configured in this safe entrypoint.",
        candidate: validation.candidate,
        blocked_reasons: ["local_video_generation_adapter_not_configured"],
        next_action: "CONFIGURE_APPROVED_LOCAL_VIDEO_GENERATOR"
      });
    }

    try {
      const generated = await input.localVideoGenerator(candidate!);
      if (generated.mime_type !== "video/mp4" || generated.size_bytes <= 0 || generated.candidate_id !== candidate!.id) {
        return blockedResult({
          mode,
          error_code: "LOCAL_VIDEO_GENERATION_FAILED",
          message: "Local video generator returned an invalid video/mp4 contract.",
          candidate: validation.candidate,
          blocked_reasons: ["invalid_local_video_contract"],
          next_action: "FIX_LOCAL_VIDEO_GENERATOR_CONTRACT"
        });
      }

      return {
        ok: true,
        error_code: null,
        message: "Local-only product video contract was generated. It is not domain-ready until server registration.",
        mode,
        candidate: validation.candidate,
        generated_video_asset: sanitizeGeneratedAsset(generated),
        prepared_video_asset_ref: null,
        prepared_video_asset_summary: null,
        registration_plan: null,
        existing_server_asset_ready: false,
        blocked_reasons: [],
        next_action: "REGISTER_SERVER_ACCESSIBLE_VIDEO_ASSET",
        side_effects: {
          ...ONE_PRODUCT_VIDEO_ASSET_SAFE_SIDE_EFFECTS,
          video_generated: true,
          local_file_written: true
        }
      };
    } catch {
      return blockedResult({
        mode,
        error_code: "LOCAL_VIDEO_GENERATION_FAILED",
        message: "Local video generation failed with a safe server error.",
        candidate: validation.candidate,
        blocked_reasons: ["local_video_generation_failed"],
        next_action: "CHECK_LOCAL_RENDER_LOGS_WITHOUT_PRINTING_SECRETS"
      });
    }
  }

  if (!hasRegistrationApproval(input.approval)) {
    return blockedResult({
      mode,
      error_code: "VIDEO_ASSET_REGISTRATION_APPROVAL_REQUIRED",
      message: "Exact approval is required before preparing server asset registration.",
      candidate: validation.candidate,
      blocked_reasons: ["missing_video_asset_registration_approval"],
      next_action: "ENTER_APPROVE_SINGLE_SERVER_ACCESSIBLE_VIDEO_ASSET_REGISTRATION"
    });
  }

  if (input.serverAssetRegistrar) {
    try {
      const registered = await input.serverAssetRegistrar({
        candidate: candidate!,
        prepared_video_asset: input.prepared_video_asset
      });
      if (!registered.ok) {
        return blockedResult({
          mode,
          error_code: registered.error_code,
          message: registered.message,
          candidate: validation.candidate,
          blocked_reasons: registered.blocked_reasons,
          next_action: nextActionForRegistrationError(registered.error_code),
          side_effects: {
            r2_uploaded: registered.r2_uploaded,
            db_written: false,
            product_assets_written: false,
            rows_inserted_or_upserted: 0
          }
        });
      }

      const registeredValidation = validatePreparedVideoAssetRef(registered.asset_ref);
      return {
        ok: true,
        error_code: null,
        message: registered.registration_source === "r2_upload"
          ? "Server-accessible product video asset was uploaded and registered."
          : "Server-accessible product video asset was registered.",
        mode,
        candidate: validation.candidate,
        generated_video_asset: null,
        prepared_video_asset_ref: sanitizeAssetRef(registered.asset_ref),
        prepared_video_asset_summary: sanitizePreparedVideoAssetSummary(
          registered.asset_ref,
          registeredValidation.safe_display
        ),
        registration_plan: {
          product_candidate_id: candidate!.id,
          product_assets_rows_planned: 1,
          asset_type: "video",
          max_rows: 1,
          persistence_required: true,
          write_executed: true
        },
        existing_server_asset_ready: true,
        blocked_reasons: [],
        next_action: "RUN_REAL_PRODUCT_AUTO_PILOT_DRY_RUN",
        side_effects: {
          ...ONE_PRODUCT_VIDEO_ASSET_SAFE_SIDE_EFFECTS,
          r2_uploaded: registered.r2_uploaded,
          db_written: registered.db_written,
          product_assets_written: true,
          rows_inserted_or_upserted: registered.rows_inserted_or_upserted
        }
      };
    } catch {
      return blockedResult({
        mode,
        error_code: "PRODUCT_ASSET_PERSISTENCE_FAILED",
        message: "Server-accessible video asset registration failed with a safe server error.",
        candidate: validation.candidate,
        blocked_reasons: ["server_asset_registration_failed"],
        next_action: "CHECK_SERVER_ASSET_REGISTRATION_LOGS"
      });
    }
  }

  const validated = validatePreparedVideoAssetRef(input.prepared_video_asset);
  if (!validated.ok) {
    return blockedResult({
      mode,
      error_code: "VIDEO_ASSET_REGISTRATION_NOT_READY",
      message: "Server-accessible video asset registration contract is not ready.",
      candidate: validation.candidate,
      blocked_reasons: validated.blocked_reasons,
      next_action: "PROVIDE_SERVER_ACCESSIBLE_VIDEO_MP4_ASSET_REF"
    });
  }

  return {
    ok: true,
    error_code: null,
    message: "Server-accessible product video asset registration contract is ready. No persistence was executed.",
    mode,
    candidate: validation.candidate,
    generated_video_asset: null,
    prepared_video_asset_ref: sanitizeAssetRef(validated.asset_ref),
    prepared_video_asset_summary: sanitizePreparedVideoAssetSummary(validated.asset_ref, validated.safe_display),
    registration_plan: {
      product_candidate_id: candidate!.id,
      product_assets_rows_planned: 1,
      asset_type: "video",
      max_rows: 1,
      persistence_required: true,
      write_executed: false
    },
    existing_server_asset_ready: true,
    blocked_reasons: [],
    next_action: "RUN_REAL_PRODUCT_AUTO_PILOT_DRY_RUN_AFTER_APPROVED_PERSISTENCE",
    side_effects: { ...ONE_PRODUCT_VIDEO_ASSET_SAFE_SIDE_EFFECTS }
  };
}

function hasGenerationApproval(value: unknown) {
  return value === RUN_REAL_PRODUCT_VIDEO_ASSET_GENERATION ||
    value === APPROVE_GENERATE_STORY_VOICEOVER_MP4_AND_UPLOAD_ONE_PRIVATE ||
    value === APPROVE_FIX_SHORTS_RENDERING_PACING_AND_UPLOAD_ONE_PRIVATE;
}

function hasRegistrationApproval(value: unknown) {
  return value === APPROVE_SINGLE_SERVER_ACCESSIBLE_VIDEO_ASSET_REGISTRATION ||
    value === APPROVE_GENERATE_STORY_VOICEOVER_MP4_AND_UPLOAD_ONE_PRIVATE ||
    value === APPROVE_FIX_SHORTS_RENDERING_PACING_AND_UPLOAD_ONE_PRIVATE;
}

function nextActionForRegistrationError(errorCode: OneProductServerAssetRegistrationErrorCode) {
  if (errorCode === "LOCAL_VIDEO_ARTIFACT_MISSING") {
    return "GENERATE_LOCAL_ONLY_VIDEO_ASSET";
  }
  if (errorCode === "R2_OR_STORAGE_PROVIDER_NOT_CONFIGURED") {
    return "CONFIGURE_SERVER_ACCESSIBLE_VIDEO_ASSET_PROVIDER_OR_PROVIDE_ASSET_REF";
  }
  if (errorCode === "PRODUCT_ASSET_PERSISTENCE_FAILED") {
    return "CHECK_PRODUCT_ASSETS_SCHEMA_AND_REGISTRATION_GATE";
  }
  if (errorCode === "PRODUCT_ASSETS_SCHEMA_REQUIRES_QUEUE_ID") {
    return "APPLY_APPROVED_PRODUCT_ASSETS_CANDIDATE_LINK_MIGRATION";
  }
  if (errorCode === "PRODUCT_ASSET_PERSISTENCE_PRECHECK_FAILED") {
    return "CHECK_PRODUCT_ASSETS_SCHEMA_WITHOUT_RETRYING_UPLOAD";
  }
  if (errorCode === "SERVER_VIDEO_ASSET_UPLOAD_FAILED") {
    return "CHECK_R2_UPLOAD_PROVIDER_WITHOUT_PRINTING_SECRETS";
  }
  return "PROVIDE_SERVER_ACCESSIBLE_VIDEO_MP4_ASSET_REF";
}

function validateRealProductCandidate(candidate: ProductCandidate | null):
  | {
      ok: true;
      candidate: OneProductVideoAssetCandidateSummary;
    }
  | {
      ok: false;
      error_code: Exclude<OneProductVideoAssetResult["error_code"], null>;
      message: string;
      candidate: OneProductVideoAssetCandidateSummary | null;
      blocked_reasons: string[];
      next_action: string;
    } {
  if (!candidate) {
    return {
      ok: false,
      error_code: "REAL_PRODUCT_CANDIDATE_NOT_READY",
      message: "Real product candidate was not found.",
      candidate: null,
      blocked_reasons: ["candidate_not_found"],
      next_action: "IMPORT_ONE_REAL_PRODUCT_CANDIDATE"
    };
  }

  const summary = summarizeCandidate(candidate);
  if (summary.smoke_or_test_candidate) {
    return {
      ok: false,
      error_code: "SMOKE_OR_TEST_CANDIDATE_BLOCKED",
      message: "Smoke or test candidates cannot enter the real product video asset flow.",
      candidate: summary,
      blocked_reasons: ["smoke_or_test_candidate_blocked"],
      next_action: "SELECT_NON_SMOKE_REAL_PRODUCT_CANDIDATE"
    };
  }
  if (!summary.affiliate_url_present || summary.affiliate_validation_status !== "valid") {
    return {
      ok: false,
      error_code: "REAL_PRODUCT_AFFILIATE_URL_NOT_READY",
      message: "A valid Coupang affiliate URL is required before video asset generation.",
      candidate: summary,
      blocked_reasons: ["selected_affiliate_url_not_ready"],
      next_action: "REPAIR_CANDIDATE_AFFILIATE_URL"
    };
  }
  if (!summary.image_ready) {
    return {
      ok: false,
      error_code: "REAL_PRODUCT_IMAGE_NOT_READY",
      message: "A ready product image is required before video asset generation.",
      candidate: summary,
      blocked_reasons: ["product_image_not_ready"],
      next_action: "REPAIR_CANDIDATE_IMAGE_URL"
    };
  }

  return { ok: true, candidate: summary };
}

function summarizeCandidate(candidate: ProductCandidate): OneProductVideoAssetCandidateSummary {
  const payload = isRecord(candidate.payload) ? candidate.payload : {};
  const imageStatus = safeTrim(payload.image_readiness_status);
  const affiliateStatus = normalizeAffiliateStatus(payload.affiliate_validation_status);
  return {
    candidate_id: candidate.id,
    product_name: safeTrim(candidate.product_name),
    affiliate_url_present: Boolean(safeTrim(candidate.selected_affiliate_url)),
    affiliate_validation_status: affiliateStatus,
    image_ready: imageStatus ? imageStatus === "ready" : hasCandidateImage(candidate),
    image_url_present: hasCandidateImage(candidate),
    smoke_or_test_candidate: looksLikeSmokeOrTest(candidate)
  };
}

function findCandidateLinkedServerAsset(candidateId: string, productAssets: ProductAsset[]) {
  for (const asset of productAssets) {
    if (asset.asset_type !== "video") {
      continue;
    }
    const metadata = isRecord(asset.render_qa_metadata) ? asset.render_qa_metadata : {};
    if (safeTrim(metadata.product_candidate_id) !== candidateId) {
      continue;
    }
    const validation = validatePreparedVideoAssetRef(normalizeProductAssetToPreparedVideoAsset(asset));
    if (validation.ok) {
      return {
        asset_ref: validation.asset_ref,
        summary: sanitizePreparedVideoAssetSummary(validation.asset_ref, validation.safe_display)
      };
    }
  }
  return null;
}

function normalizeProductAssetToPreparedVideoAsset(asset: ProductAsset) {
  const metadata = isRecord(asset.render_qa_metadata) ? asset.render_qa_metadata : {};
  const assetUrl = safeTrim(asset.url);
  return {
    asset_id: asset.id,
    provider: inferAssetProvider(asset, assetUrl),
    storage_key: safeTrim(metadata.storage_key) || null,
    prepared_video_asset_url: safeTrim(metadata.prepared_video_asset_url) || (isHttpsUrl(assetUrl) ? assetUrl : null),
    signed_url: safeTrim(metadata.signed_url) || null,
    mime_type: safeTrim(metadata.mime_type) || inferMimeType(assetUrl),
    size_bytes: normalizePositiveNumber(metadata.size_bytes ?? (asset as unknown as { size_bytes?: unknown }).size_bytes),
    checksum_sha256: safeTrim(metadata.checksum_sha256 ?? metadata.sha256) || null,
    expires_at: safeTrim(metadata.expires_at) || null,
    server_accessible: true
  };
}

function sanitizeGeneratedAsset(asset: GeneratedProductVideoAsset): SafeGeneratedProductVideoAsset {
  return {
    candidate_id: asset.candidate_id,
    local_video_path_present: Boolean(safeTrim(asset.local_video_path)),
    mime_type: asset.mime_type,
    size_bytes: asset.size_bytes,
    duration_seconds: asset.duration_seconds ?? null,
    checksum_sha256: asset.checksum_sha256 ?? null,
    black_screen_detected: asset.black_screen_detected ?? null,
    story_video_generated: asset.story_video_generated === true,
    voiceover_audio_present: asset.voiceover_audio_present === true,
    voiceover_audio_file_present: asset.voiceover_audio_file_present === true,
    audio_duration_seconds: asset.audio_duration_seconds ?? null,
    audio_mime_type: asset.audio_mime_type ?? null,
    audio_muxed_into_video: asset.audio_muxed_into_video === true,
    video_has_audio_stream: asset.video_has_audio_stream === true,
    scene_count: asset.scene_count ?? null,
    caption_count: asset.caption_count ?? null,
    static_single_image_only: asset.static_single_image_only === true,
    product_image_present: asset.product_image_present === true,
    content_quality_score: asset.content_quality_score ?? null,
    hook_title_present: asset.hook_title_present === true,
    hook_title_visible_in_first_1_5_seconds: asset.hook_title_visible_in_first_1_5_seconds === true,
    hook_title_safe_area_pass: asset.hook_title_safe_area_pass === true,
    caption_safe_area_pass: asset.caption_safe_area_pass === true,
    all_text_inside_mobile_safe_area: asset.all_text_inside_mobile_safe_area === true,
    no_text_clipped: asset.no_text_clipped === true,
    max_caption_lines: asset.max_caption_lines ?? null,
    caption_font_size_readable: asset.caption_font_size_readable === true,
    caption_contrast_pass: asset.caption_contrast_pass === true,
    transition_count: asset.transition_count ?? null,
    visual_motion_score: asset.visual_motion_score ?? null,
    distinct_frame_ratio_pass: asset.distinct_frame_ratio_pass === true,
    use_case_scene_present: asset.use_case_scene_present === true,
    kitchen_context_scene_present: asset.kitchen_context_scene_present === true,
    utensil_usage_simulation_present: asset.utensil_usage_simulation_present === true,
    before_after_or_problem_scene_present: asset.before_after_or_problem_scene_present === true,
    voiceover_speed_wpm: asset.voiceover_speed_wpm ?? null,
    voiceover_speed_multiplier: asset.voiceover_speed_multiplier ?? null,
    max_silence_between_segments_ms: asset.max_silence_between_segments_ms ?? null,
    audio_video_duration_gap_seconds: asset.audio_video_duration_gap_seconds ?? null,
    generated_this_run: asset.generated_this_run,
    local_only: true,
    domain_ready: false
  };
}

function sanitizeAssetRef(assetRef: PreparedVideoAssetRef): SanitizedPreparedVideoAssetRef {
  return {
    asset_id: assetRef.asset_id,
    storage_key: assetRef.storage_key ?? null,
    mime_type: assetRef.mime_type,
    size_bytes: assetRef.size_bytes ?? null,
    checksum_sha256: assetRef.checksum_sha256 ?? null,
    expires_at: assetRef.expires_at ?? null,
    provider: assetRef.provider,
    server_accessible: assetRef.server_accessible,
    signed_url_present: Boolean(assetRef.signed_url),
    prepared_video_asset_url_present: Boolean(assetRef.prepared_video_asset_url)
  };
}

function sanitizePreparedVideoAssetSummary(
  assetRef: PreparedVideoAssetRef,
  safeDisplay: Parameters<typeof toPreparedVideoAssetApiSummary>[1]
) {
  const summary = toPreparedVideoAssetApiSummary(assetRef, safeDisplay);
  return {
    ...summary,
    safe_display: {
      ...summary.safe_display,
      signed_url: summary.safe_display.signed_url ? "[redacted-url-present]" : null,
      prepared_video_asset_url: summary.safe_display.prepared_video_asset_url ? "[redacted-url-present]" : null
    }
  };
}

function blockedResult(input: {
  mode: OneProductVideoAssetMode;
  error_code: Exclude<OneProductVideoAssetResult["error_code"], null>;
  message: string;
  candidate: OneProductVideoAssetCandidateSummary | null;
  blocked_reasons: string[];
  next_action: string;
  side_effects?: Partial<OneProductVideoAssetSideEffects>;
}): OneProductVideoAssetResult {
  return {
    ok: false,
    error_code: input.error_code,
    message: input.message,
    mode: input.mode,
    candidate: input.candidate,
    generated_video_asset: null,
    prepared_video_asset_ref: null,
    prepared_video_asset_summary: null,
    registration_plan: null,
    existing_server_asset_ready: false,
    blocked_reasons: input.blocked_reasons,
    next_action: input.next_action,
    side_effects: { ...ONE_PRODUCT_VIDEO_ASSET_SAFE_SIDE_EFFECTS, ...(input.side_effects ?? {}) }
  };
}

function normalizeAffiliateStatus(value: unknown): "valid" | "missing" | "invalid" {
  const text = safeTrim(value);
  if (text === "valid") {
    return "valid";
  }
  if (!text) {
    return "missing";
  }
  return "invalid";
}

function hasCandidateImage(candidate: ProductCandidate) {
  const payload = isRecord(candidate.payload) ? candidate.payload : {};
  return Boolean(
    safeTrim(payload.thumbnail_url) ||
    safeTrim(payload.image_url) ||
    safeTrim(payload.product_image_url)
  );
}

function looksLikeSmokeOrTest(candidate: ProductCandidate) {
  const text = [
    candidate.id,
    candidate.product_name,
    candidate.raw_coupang_url,
    candidate.source_name,
    candidate.source_type,
    JSON.stringify(candidate.payload ?? {})
  ].join(" ").toLowerCase();
  return ["smoke", "test", "dummy", "placeholder", "youtube-private-smoke", "candidate-video-smoke"]
    .some((needle) => text.includes(needle));
}

function inferAssetProvider(asset: ProductAsset, url: string) {
  const bucket = safeTrim(asset.bucket).toLowerCase();
  if (bucket.includes("r2") || url.includes(".r2.") || url.includes("r2.dev")) {
    return "r2";
  }
  if (bucket.includes("supabase")) {
    return "supabase_storage";
  }
  if (isHttpsUrl(url)) {
    return "external_https";
  }
  return "local_dev";
}

function inferMimeType(value: string) {
  return /\.mp4(\?|#|$)/i.test(value) ? "video/mp4" : "";
}

function normalizePositiveNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
  }
  return null;
}

function isHttpsUrl(value: unknown) {
  return /^https:\/\//i.test(safeTrim(value));
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
