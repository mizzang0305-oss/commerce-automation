import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  type AutopilotPhase,
  type AutopilotState,
  type HumanReviewDecision,
  type OwnerUploadApproval,
  type Visibility,
  createDefaultAutopilotState,
  evaluateAutopilotSafety,
  evaluatePrivateUploadGate,
  shouldBuildV025ProductAdVisualReviewFromFailReasons,
  shouldBuildScriptDrivenProductVideoFromFailReasons,
  shouldCheckRealSceneAssetProviderFromFailReasons,
  shouldBuildV020FromFailReasons
} from "./autopilot-safety-gates";
import {
  getGitStatusShort,
  packageHasScript,
  readAutopilotState,
  readHumanReviewDecision,
  readOwnerUploadApproval,
  readPackageJson,
  reviewConsoleExists
} from "./read-autopilot-state";
import {
  V022_AUTO_PROVIDER_BLOCKER,
  isAutoRealSceneAssetProviderConfigured
} from "../uploads/generate-v022-auto-real-scene-assets";
import {
  V023_BLOCKED_FREE_STOCK_PROVIDER_ACTION,
  V023_FREE_STOCK_PROVIDER_NOT_CONFIGURED,
  isFreeStockSceneProviderConfigured
} from "../uploads/fetch-v023-free-stock-scene-assets";

export type AutopilotDecision = {
  phase: AutopilotPhase;
  nextAction: string | null;
  shouldStop: boolean;
  privateUploadAttempted: boolean;
  videosInsertAllowed: boolean;
  blockedReasons: string[];
  safetyStopReason?: string | null;
  reviewCommand?: string | null;
  reviewCommandAvailable?: boolean;
};

export type DecideNextActionInput = {
  cwd?: string;
  state?: AutopilotState;
  gitStatusShort?: string;
  reviewDecision?: HumanReviewDecision | null;
  uploadApproval?: OwnerUploadApproval | null;
  packageJson?: Record<string, unknown>;
  requestedVisibility?: Visibility;
};

export async function decideNextAutopilotAction(input: DecideNextActionInput = {}): Promise<AutopilotDecision> {
  const cwd = input.cwd ?? process.cwd();
  const state = input.state ?? await readAutopilotState(cwd);
  const gitStatusShort = input.gitStatusShort ?? await getGitStatusShort(cwd);
  const requestedVisibility = input.requestedVisibility ?? "private";
  const safety = evaluateAutopilotSafety({ gitStatusShort, requestedVisibility });

  if (!safety.safe) {
    return {
      phase: "BLOCKED_SAFETY",
      nextAction: "FIX_STAGED_PROTECTED_FILES",
      shouldStop: true,
      privateUploadAttempted: false,
      videosInsertAllowed: false,
      blockedReasons: safety.blockedReasons,
      safetyStopReason: safety.blockedReasons[0] ?? "BLOCKED_SAFETY"
    };
  }

  const reviewDecision = input.reviewDecision ?? await readHumanReviewDecision({
    cwd,
    candidateId: state.current_candidate_id,
    version: state.current_review_version
  });
  const hasReviewConsole = await reviewConsoleExists({
    cwd,
    candidateId: state.current_candidate_id,
    version: state.current_review_version
  });
  const status = normalizeReviewStatus(reviewDecision?.human_review_status ?? state.latest_human_review_status);

  if (status === "PENDING_HUMAN_REVIEW" || (hasReviewConsole && status !== "PASS_LOCAL_HUMAN_REVIEW" && status !== "FAIL_LOCAL_HUMAN_REVIEW")) {
    return {
      phase: "WAITING_HUMAN_REVIEW",
      nextAction: "WAIT_FOR_OWNER_REVIEW",
      shouldStop: true,
      privateUploadAttempted: false,
      videosInsertAllowed: false,
      blockedReasons: []
    };
  }

  const failReasons = reviewDecision?.fail_reasons?.length ? reviewDecision.fail_reasons : state.latest_fail_reasons;
  if (isV022AutoRealSceneProviderBlocked(state, reviewDecision)) {
    const packageJson = input.packageJson ?? await readPackageJson(cwd);
    const freeStockProviderReady = await isFreeStockSceneProviderConfigured(cwd);
    if (!freeStockProviderReady) {
      return {
        phase: "BLOCKED_PROVIDER",
        nextAction: V023_BLOCKED_FREE_STOCK_PROVIDER_ACTION,
        shouldStop: true,
        privateUploadAttempted: false,
        videosInsertAllowed: false,
        blockedReasons: [V023_FREE_STOCK_PROVIDER_NOT_CONFIGURED],
        safetyStopReason: V023_FREE_STOCK_PROVIDER_NOT_CONFIGURED
      };
    }
    const reviewCommand = getReviewCommandForAction("FETCH_FREE_STOCK_SCENE_ASSETS");
    return {
      phase: "GENERATE_REVIEW_PACKET",
      nextAction: "FETCH_FREE_STOCK_SCENE_ASSETS",
      shouldStop: false,
      privateUploadAttempted: false,
      videosInsertAllowed: false,
      blockedReasons: [],
      reviewCommand,
      reviewCommandAvailable: reviewCommand ? packageHasScript(packageJson, reviewCommand) : false
    };
  }

  if (status === "FAIL_LOCAL_HUMAN_REVIEW") {
    const packageJson = input.packageJson ?? await readPackageJson(cwd);
    if (state.current_review_version === "v020" && shouldCheckRealSceneAssetProviderFromFailReasons(failReasons)) {
      const providerReady = await autoRealSceneAssetProviderReady(cwd);
      if (!providerReady) {
        return {
          phase: "BLOCKED_PROVIDER",
          nextAction: V022_AUTO_PROVIDER_BLOCKER,
          shouldStop: true,
          privateUploadAttempted: false,
          videosInsertAllowed: false,
          blockedReasons: [V022_AUTO_PROVIDER_BLOCKER],
          safetyStopReason: V022_AUTO_PROVIDER_BLOCKER
        };
      }
      const reviewCommand = getReviewCommandForAction("GENERATE_AUTO_REAL_SCENE_ASSETS");
      return {
        phase: "GENERATE_REVIEW_PACKET",
        nextAction: "GENERATE_AUTO_REAL_SCENE_ASSETS",
        shouldStop: false,
        privateUploadAttempted: false,
        videosInsertAllowed: false,
        blockedReasons: [],
        reviewCommand,
        reviewCommandAvailable: reviewCommand ? packageHasScript(packageJson, reviewCommand) : false
      };
    }
    if (state.current_review_version === "v023" && shouldBuildScriptDrivenProductVideoFromFailReasons(failReasons)) {
      const nextAction = "BUILD_SCRIPT_DRIVEN_PRODUCT_VIDEO";
      const reviewCommand = getReviewCommandForAction(nextAction);
      return {
        phase: "HUMAN_REVIEW_FAILED",
        nextAction,
        shouldStop: false,
        privateUploadAttempted: false,
        videosInsertAllowed: false,
        blockedReasons: [],
        reviewCommand,
        reviewCommandAvailable: reviewCommand ? packageHasScript(packageJson, reviewCommand) : false
      };
    }
    if (state.current_review_version === "v024" && shouldBuildV025ProductAdVisualReviewFromFailReasons(failReasons)) {
      const nextAction = "BUILD_V025_PRODUCT_AD_VISUAL_REVIEW";
      const reviewCommand = getReviewCommandForAction(nextAction);
      return {
        phase: "HUMAN_REVIEW_FAILED",
        nextAction,
        shouldStop: false,
        privateUploadAttempted: false,
        videosInsertAllowed: false,
        blockedReasons: [],
        reviewCommand,
        reviewCommandAvailable: reviewCommand ? packageHasScript(packageJson, reviewCommand) : false
      };
    }
    const nextAction = state.current_review_version === "v019"
      ? resolveV019FailureNextAction(failReasons)
      : "BUILD_NEXT_REVIEW_PACKET";
    const reviewCommand = getReviewCommandForAction(nextAction);
    return {
      phase: "HUMAN_REVIEW_FAILED",
      nextAction,
      shouldStop: false,
      privateUploadAttempted: false,
      videosInsertAllowed: false,
      blockedReasons: [],
      reviewCommand,
      reviewCommandAvailable: reviewCommand ? packageHasScript(packageJson, reviewCommand) : false
    };
  }

  if (status === "PASS_LOCAL_HUMAN_REVIEW") {
    const uploadApproval = input.uploadApproval ?? await readOwnerUploadApproval(cwd);
    const uploadGate = evaluatePrivateUploadGate({
      state,
      reviewDecision,
      uploadApproval,
      requestedVisibility
    });
    if (!uploadGate.allowed) {
      return {
        phase: "READY_FOR_PRIVATE_UPLOAD",
        nextAction: "WAIT_FOR_FRESH_PRIVATE_UPLOAD_APPROVAL",
        shouldStop: true,
        privateUploadAttempted: false,
        videosInsertAllowed: false,
        blockedReasons: uploadGate.blockedReasons,
        safetyStopReason: uploadGate.blockedReasons[0] ?? "FRESH_UPLOAD_APPROVAL_REQUIRED"
      };
    }
    return {
      phase: "READY_FOR_PRIVATE_UPLOAD",
      nextAction: "PRIVATE_UPLOAD_PREFLIGHT_READY",
      shouldStop: false,
      privateUploadAttempted: false,
      videosInsertAllowed: true,
      blockedReasons: []
    };
  }

  if (state.next_recommended_action) {
    return {
      phase: state.current_phase,
      nextAction: state.next_recommended_action,
      shouldStop: false,
      privateUploadAttempted: false,
      videosInsertAllowed: false,
      blockedReasons: [],
      reviewCommand: getReviewCommandForAction(state.next_recommended_action)
    };
  }

  return {
    phase: "STOP",
    nextAction: "NO_SAFE_AUTOPILOT_ACTION",
    shouldStop: true,
    privateUploadAttempted: false,
    videosInsertAllowed: false,
    blockedReasons: ["NO_SAFE_AUTOPILOT_ACTION"],
    safetyStopReason: "NO_SAFE_AUTOPILOT_ACTION"
  };
}

export function resolveV019FailureNextAction(failReasons: string[]): string {
  return shouldBuildV020FromFailReasons(failReasons)
    ? "BUILD_V020_REAL_MOTION_REVIEW"
    : "REVIEW_FAIL_REASONS_MANUALLY";
}

export function resolveV020FailureNextAction(failReasons: string[]): string {
  return shouldCheckRealSceneAssetProviderFromFailReasons(failReasons)
    ? "GENERATE_AUTO_REAL_SCENE_ASSETS"
    : "BUILD_NEXT_REVIEW_PACKET";
}

export function getReviewCommandForAction(action: string | null): string | null {
  if (action === "BUILD_V020_REAL_MOTION_REVIEW") {
    return "review:v020";
  }
  if (action === "BUILD_V021_REAL_SCENE_REVIEW") {
    return "review:v021";
  }
  if (action === "GENERATE_AUTO_REAL_SCENE_ASSETS") {
    return "assets:generate-v022-real-scene";
  }
  if (action === "BUILD_V022_AUTO_REAL_SCENE_REVIEW") {
    return "review:v022";
  }
  if (action === "FETCH_FREE_STOCK_SCENE_ASSETS") {
    return "assets:fetch-v023-free-stock";
  }
  if (action === "BUILD_V023_FREE_STOCK_SCENE_REVIEW") {
    return "review:v023";
  }
  if (action === "BUILD_SCRIPT_DRIVEN_PRODUCT_VIDEO") {
    return "review:v024";
  }
  if (action === "BUILD_V025_PRODUCT_AD_VISUAL_REVIEW") {
    return "review:v025";
  }
  return null;
}

export function applyDecisionToState(input: {
  state?: AutopilotState;
  decision: AutopilotDecision;
  now?: Date;
}): AutopilotState {
  const base = createDefaultAutopilotState(input.state ?? {});
  return {
    ...base,
    last_run_at: (input.now ?? new Date()).toISOString(),
    current_phase: input.decision.phase,
    next_recommended_action: input.decision.nextAction,
    safety_stop_reason: input.decision.safetyStopReason ?? null,
    fresh_upload_approval_present: input.decision.videosInsertAllowed
  };
}

function normalizeReviewStatus(status: unknown): AutopilotState["latest_human_review_status"] {
  if (
    status === "PENDING_HUMAN_REVIEW" ||
    status === "PASS_LOCAL_HUMAN_REVIEW" ||
    status === "FAIL_LOCAL_HUMAN_REVIEW" ||
    status === "VOICE_PROVIDER_BLOCKED"
  ) {
    return status;
  }
  return "UNKNOWN";
}

async function autoRealSceneAssetProviderReady(cwd: string): Promise<boolean> {
  if (await isAutoRealSceneAssetProviderConfigured(cwd)) {
    return true;
  }
  return realSceneAssetProviderReady(cwd);
}

function isV022AutoRealSceneProviderBlocked(
  state: AutopilotState,
  reviewDecision: HumanReviewDecision | null
): boolean {
  return state.current_review_version === "v022" && (
    String(reviewDecision?.human_review_status ?? "") === V022_AUTO_PROVIDER_BLOCKER ||
    String(state.latest_human_review_status ?? "") === V022_AUTO_PROVIDER_BLOCKER ||
    state.next_recommended_action === V022_AUTO_PROVIDER_BLOCKER ||
    state.safety_stop_reason === V022_AUTO_PROVIDER_BLOCKER
  );
}

async function realSceneAssetProviderReady(cwd: string): Promise<boolean> {
  const requiredAssets = [
    "rain-window",
    "wet-laundry-problem",
    "small-room-laundry-mess",
    "drying-rack-reveal",
    "laundry-items-use-case",
    "before-after-room-laundry",
    "buying-checklist-background",
    "cta-background"
  ];
  const roots = [
    "commerce-assets/source-library/laundry",
    "commerce-assets/source-library/rainy-season",
    "commerce-assets/source-library/small-room",
    "commerce-assets/source-library/drying-rack"
  ].map((root) => path.join(cwd, root));
  for (const assetId of requiredAssets) {
    let found = false;
    for (const root of roots) {
      for (const extension of [".mp4", ".jpg", ".jpeg", ".png"]) {
        try {
          const stat = await fs.stat(path.join(root, `${assetId}${extension}`));
          if (stat.isFile()) {
            found = true;
            break;
          }
        } catch {
          // Missing local scene assets are expected until owner supplies them.
        }
      }
      if (found) break;
    }
    if (!found) return false;
  }
  return true;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  decideNextAutopilotAction()
    .then((decision) => {
      console.log(JSON.stringify(decision, null, 2));
      if (decision.phase === "BLOCKED_SAFETY") {
        process.exitCode = 2;
      }
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
