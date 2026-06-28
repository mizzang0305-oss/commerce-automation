export const DEFAULT_CANDIDATE_ID = "candidate-3c4f2ee364ba5b07";
export const DEFAULT_REVIEW_VERSION = "v019";
export const NEXT_REVIEW_VERSION = "v020";
export const REAL_SCENE_REVIEW_VERSION = "v021";
export const PRIVATE_UPLOAD_APPROVAL_PHRASE = "APPROVE_AUTOPILOT_PRIVATE_UPLOAD_ON_OWNER_PASS";
export const LOCK_TIMEOUT_MINUTES = 90;

export const DEFAULT_V019_FAIL_REASONS = [
  "VIDEO_LOOKS_LIKE_TEXT_READING_CARD",
  "NO_REAL_IN_SCENE_MOTION",
  "SLIDESHOW_CARD_FEELING",
  "STATIC_STORYBOARD_DESPITE_CONTACT_SHEET_PASS",
  "VOICE_ACCEPTABLE_BUT_SPEED_SLIGHTLY_SLOW"
] as const;

export const V020_REAL_SCENE_FAIL_REASONS = [
  "GEOMETRIC_PLACEHOLDER_VIDEO",
  "FAKE_REAL_MOTION_FROM_PRIMITIVE_SHAPES",
  "NO_REAL_SCENE_ASSETS",
  "NOT_AD_LIKE",
  "MOTION_PROOF_FALSE_POSITIVE",
  "VIDEO_LOOKS_LIKE_ANIMATED_PPT",
  "NO_REAL_LAUNDRY_USE_CASE_FOOTAGE",
  "NO_REAL_PROBLEM_SCENE_ASSET",
  "NO_REAL_BEFORE_AFTER_ASSET"
] as const;

export const V023_STOCK_SCENE_FAIL_REASONS = [
  "STOCK_SCENE_IRRELEVANT_TO_PRODUCT",
  "STOCK_ASSET_SEMANTIC_MISMATCH",
  "PRODUCT_NOT_USED_AS_MAIN_VISUAL",
  "SCRIPT_NOT_DRIVING_VIDEO",
  "DRYING_RACK_NOT_VISUALLY_CENTRAL",
  "STORY_FLOW_NOT_CLEAR"
] as const;

export const AUTOPILOT_PHASES = [
  "INIT",
  "CHECK_ENV",
  "CHECK_OPEN_PR",
  "MERGE_SAFE_PR",
  "GENERATE_REVIEW_PACKET",
  "RUN_QA",
  "WAITING_HUMAN_REVIEW",
  "HUMAN_REVIEW_FAILED",
  "READY_FOR_PRIVATE_UPLOAD",
  "PRIVATE_UPLOAD_DONE",
  "BLOCKED_PROVIDER",
  "BLOCKED_QA",
  "BLOCKED_SAFETY",
  "STOP"
] as const;

export type AutopilotPhase = typeof AUTOPILOT_PHASES[number];
export type HumanReviewStatus =
  | "PENDING_HUMAN_REVIEW"
  | "PASS_LOCAL_HUMAN_REVIEW"
  | "FAIL_LOCAL_HUMAN_REVIEW"
  | "VOICE_PROVIDER_BLOCKED"
  | "UNKNOWN";

export type AutopilotState = {
  version: 1;
  last_run_at: string | null;
  current_phase: AutopilotPhase;
  current_candidate_id: string;
  current_review_version: string;
  latest_human_review_status: HumanReviewStatus;
  latest_fail_reasons: string[];
  next_recommended_action: string | null;
  private_upload_allowed: boolean;
  fresh_upload_approval_present: boolean;
  last_youtube_video_id: string | null;
  youtube_insert_count_this_run: number;
  public_upload_blocked: boolean;
  unlisted_upload_blocked: boolean;
  safety_stop_reason: string | null;
};

export type HumanReviewDecision = {
  candidate_id?: string;
  version?: string;
  human_review_status?: HumanReviewStatus | string;
  private_upload_allowed?: boolean;
  requires_fresh_upload_approval?: boolean;
  fail_reasons?: string[];
  review_console_path?: string;
};

export type OwnerUploadApproval = {
  approval_phrase?: string;
  allowed_visibility?: string;
  max_uploads_per_run?: number;
  max_uploads_per_day?: number;
  expires_at?: string;
};

export type Visibility = "private" | "public" | "unlisted";

export function createDefaultAutopilotState(overrides: Partial<AutopilotState> = {}): AutopilotState {
  const latestFailReasons = overrides.latest_fail_reasons ?? [...DEFAULT_V019_FAIL_REASONS];
  const nextAction = overrides.next_recommended_action ??
    (shouldBuildV020FromFailReasons(latestFailReasons) ? "BUILD_V020_REAL_MOTION_REVIEW" : null);

  return {
    version: 1,
    last_run_at: null,
    current_phase: "INIT",
    current_candidate_id: DEFAULT_CANDIDATE_ID,
    current_review_version: DEFAULT_REVIEW_VERSION,
    latest_human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
    latest_fail_reasons: latestFailReasons,
    next_recommended_action: nextAction,
    private_upload_allowed: false,
    fresh_upload_approval_present: false,
    last_youtube_video_id: null,
    youtube_insert_count_this_run: 0,
    public_upload_blocked: true,
    unlisted_upload_blocked: true,
    safety_stop_reason: null,
    ...overrides
  };
}

export function shouldBuildV020FromFailReasons(failReasons: string[]): boolean {
  return failReasons.some((reason) => [
    "VIDEO_LOOKS_LIKE_TEXT_READING_CARD",
    "NO_REAL_IN_SCENE_MOTION",
    "SLIDESHOW_CARD_FEELING"
  ].includes(reason));
}

export function shouldCheckRealSceneAssetProviderFromFailReasons(failReasons: string[]): boolean {
  return failReasons.some((reason) => (V020_REAL_SCENE_FAIL_REASONS as readonly string[]).includes(reason));
}

export function shouldBuildScriptDrivenProductVideoFromFailReasons(failReasons: string[]): boolean {
  return failReasons.some((reason) => [
    "STOCK_SCENE_IRRELEVANT_TO_PRODUCT",
    "PRODUCT_NOT_USED_AS_MAIN_VISUAL",
    "SCRIPT_NOT_DRIVING_VIDEO"
  ].includes(reason));
}

export type AutopilotSafetyResult = {
  safe: boolean;
  blockedReasons: string[];
  protectedStagedPaths: string[];
  publicUploadBlocked: boolean;
  unlistedUploadBlocked: boolean;
};

export function evaluateAutopilotSafety(input: {
  gitStatusShort?: string;
  requestedVisibility?: Visibility;
} = {}): AutopilotSafetyResult {
  const blockedReasons: string[] = [];
  const protectedStagedPaths: string[] = [];
  const stagedPaths = parseStagedPaths(input.gitStatusShort ?? "");

  for (const stagedPath of stagedPaths) {
    const reason = getProtectedStagedReason(stagedPath);
    if (reason) {
      protectedStagedPaths.push(stagedPath);
      if (!blockedReasons.includes(reason)) {
        blockedReasons.push(reason);
      }
    }
  }

  if (input.requestedVisibility === "public") {
    blockedReasons.push("PUBLIC_UPLOAD_BLOCKED");
  }
  if (input.requestedVisibility === "unlisted") {
    blockedReasons.push("UNLISTED_UPLOAD_BLOCKED");
  }

  return {
    safe: blockedReasons.length === 0,
    blockedReasons,
    protectedStagedPaths,
    publicUploadBlocked: true,
    unlistedUploadBlocked: true
  };
}

export type PrivateUploadGateResult = {
  allowed: boolean;
  blockedReasons: string[];
  visibility: "private";
  maxVideosInsertThisRun: 0 | 1;
};

export function evaluatePrivateUploadGate(input: {
  state: AutopilotState;
  reviewDecision?: HumanReviewDecision | null;
  uploadApproval?: OwnerUploadApproval | null;
  requestedVisibility?: Visibility;
  now?: Date;
}): PrivateUploadGateResult {
  const blockedReasons: string[] = [];
  const reviewDecision = input.reviewDecision ?? null;
  const uploadApproval = input.uploadApproval ?? null;
  const requestedVisibility = input.requestedVisibility ?? "private";

  if (requestedVisibility === "public") {
    blockedReasons.push("PUBLIC_UPLOAD_BLOCKED");
  }
  if (requestedVisibility === "unlisted") {
    blockedReasons.push("UNLISTED_UPLOAD_BLOCKED");
  }
  if (requestedVisibility !== "private") {
    blockedReasons.push("PRIVATE_VISIBILITY_REQUIRED");
  }
  if (reviewDecision?.human_review_status !== "PASS_LOCAL_HUMAN_REVIEW") {
    blockedReasons.push("OWNER_REVIEW_PASS_REQUIRED");
  }
  if (reviewDecision?.private_upload_allowed !== true || input.state.private_upload_allowed !== true) {
    blockedReasons.push("PRIVATE_UPLOAD_NOT_ALLOWED_BY_REVIEW");
  }
  if (!uploadApproval || uploadApproval.approval_phrase !== PRIVATE_UPLOAD_APPROVAL_PHRASE) {
    blockedReasons.push("FRESH_UPLOAD_APPROVAL_REQUIRED");
  }
  if (uploadApproval && uploadApproval.allowed_visibility !== "private") {
    blockedReasons.push("PRIVATE_VISIBILITY_APPROVAL_REQUIRED");
  }
  if (uploadApproval?.expires_at && Number.isNaN(Date.parse(uploadApproval.expires_at))) {
    blockedReasons.push("UPLOAD_APPROVAL_EXPIRY_INVALID");
  }
  if (uploadApproval?.expires_at && !Number.isNaN(Date.parse(uploadApproval.expires_at))) {
    const now = input.now ?? new Date();
    if (new Date(uploadApproval.expires_at).getTime() <= now.getTime()) {
      blockedReasons.push("UPLOAD_APPROVAL_EXPIRED");
    }
  }
  if (input.state.last_youtube_video_id) {
    blockedReasons.push("DUPLICATE_UPLOAD_RISK");
  }
  if (input.state.youtube_insert_count_this_run >= 1) {
    blockedReasons.push("YOUTUBE_RETRY_AFTER_EXTERNAL_CALL_BLOCKED");
  }
  if ((uploadApproval?.max_uploads_per_run ?? 0) !== 1) {
    blockedReasons.push("MAX_ONE_PRIVATE_UPLOAD_PER_RUN_REQUIRED");
  }

  const uniqueReasons = [...new Set(blockedReasons)];
  return {
    allowed: uniqueReasons.length === 0,
    blockedReasons: uniqueReasons,
    visibility: "private",
    maxVideosInsertThisRun: uniqueReasons.length === 0 ? 1 : 0
  };
}

export function parseStagedPaths(gitStatusShort: string): string[] {
  return gitStatusShort
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .filter((line) => line.length >= 3 && line[0] !== "?" && line[0] !== " ")
    .flatMap((line) => {
      const pathText = line.slice(3).trim();
      if (pathText.includes(" -> ")) {
        return pathText.split(" -> ").map((part) => normalizeGitPath(part));
      }
      return [normalizeGitPath(pathText)];
    })
    .filter(Boolean);
}

export function getProtectedStagedReason(filePath: string): string | null {
  const normalized = normalizeGitPath(filePath).toLowerCase();
  if (normalized === ".env.local" || normalized.endsWith("/.env.local")) {
    return "ENV_LOCAL_STAGED";
  }
  if (normalized === "agents.md" || normalized.endsWith("/agents.md")) {
    return "AGENTS_STAGED";
  }
  if (normalized === "commerce-assets" || normalized.startsWith("commerce-assets/")) {
    return "COMMERCE_ASSETS_STAGED";
  }
  if (/\.(mp4|mov|webm|wav|mp3|m4a|aac|flac|jpg|jpeg|png|webp)$/i.test(normalized)) {
    return "MEDIA_ARTIFACT_STAGED";
  }
  if (/\.(onnx|pt|pth|safetensors|ckpt|bin)$/i.test(normalized)) {
    return "MODEL_ARTIFACT_STAGED";
  }
  if (normalized.includes("melotts") && (normalized.includes("venv") || normalized.includes("model"))) {
    return "MODEL_ARTIFACT_STAGED";
  }
  return null;
}

function normalizeGitPath(filePath: string): string {
  return filePath.trim().replace(/^"|"$/g, "").replace(/\\/g, "/");
}
