import type { ChannelKey } from "../multi-channel/channelProfiles";
import type {
  V077AutopilotIntendedAction,
  V077AutopilotSchedulerBlocker,
  V077AutopilotSchedulerCandidate,
  V077AutopilotSchedulerPlan,
  V077SchedulerCandidateReadinessStatus
} from "./v077AutopilotScheduler";

export type V078DashboardControlMode = "scaffold_only";
export type V078DashboardCardKind =
  | "upload_readiness"
  | "comment_readiness"
  | "scheduler_readiness";
export type V078DashboardActionKind = "upload" | "comment" | "autopilot";
export type V078DashboardBlocker =
  | V077AutopilotSchedulerBlocker
  | "BLOCKED_V078_DASHBOARD_CONTROL_SCAFFOLD_ONLY"
  | "BLOCKED_V078_DASHBOARD_ACTION_SCAFFOLD_ONLY"
  | "BLOCKED_V078_DASHBOARD_MUTATION_ATTEMPT";

export type V078DashboardControlInput = {
  generatedAt: string;
  schedulerPlan: V077AutopilotSchedulerPlan;
};

export type V078DashboardCandidateView = {
  queueItemId: string;
  uploadPackageId: string;
  channelKey: ChannelKey;
  platform: "youtube";
  intendedAction: V077AutopilotIntendedAction;
  readinessStatus: V077SchedulerCandidateReadinessStatus;
  nextEligibleAt: string | null;
  blockers: V078DashboardBlocker[];
  evidencePresent: V077AutopilotSchedulerCandidate["evidencePresent"];
  hashPrefixes: V077AutopilotSchedulerCandidate["hashPrefixes"];
  sanitizedReason: string;
};

export type V078DashboardReadinessCard = {
  kind: V078DashboardCardKind;
  title: string;
  readinessStatus: "blocked";
  blockers: V078DashboardBlocker[];
  evidencePresent: Record<string, boolean>;
};

export type V078DashboardActionState = {
  action: V078DashboardActionKind;
  label: string;
  enabled: false;
  state: "blocked";
  scaffoldOnly: true;
  blocker: "BLOCKED_V078_DASHBOARD_ACTION_SCAFFOLD_ONLY";
};

export type V078DashboardControlPanel = {
  version: "v078";
  title: "Autopilot Scheduler: Scaffold Only";
  mode: V078DashboardControlMode;
  generatedAt: string;
  SAFE_TO_UPLOAD: false;
  safeToUpload: false;
  safeToComment: false;
  schedulerEnabled: false;
  uploadExecutionEnabled: false;
  commentExecutionEnabled: false;
  approvalRequired: true;
  statusLabels: string[];
  sections: ["차단 사유", "다음 후보"];
  summary: {
    candidateCount: number;
    blockedCount: number;
    nextEligibleAt: string | null;
  };
  blockers: V078DashboardBlocker[];
  cards: V078DashboardReadinessCard[];
  candidates: V078DashboardCandidateView[];
  actions: V078DashboardActionState[];
  uploadActionCalled: false;
  commentActionCalled: false;
  videos_insert_called: false;
  commentThreads_insert_called: false;
  comment_create_update_delete_called: false;
  visibility_changed: false;
  R2_upload: false;
  DB_write: false;
  product_assets_write: false;
  raw_urls_printed: false;
  raw_video_ids_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
  fake_success: false;
};

export type V078DashboardActionRequest = {
  action: V078DashboardActionKind;
  mutationAttempted?: boolean;
};

export type V078DashboardActionResponse = {
  version: "v078";
  action: V078DashboardActionKind;
  status: "BLOCKED";
  blocker:
    | "BLOCKED_V078_DASHBOARD_ACTION_SCAFFOLD_ONLY"
    | "BLOCKED_V078_DASHBOARD_MUTATION_ATTEMPT";
  safeToUpload: false;
  uploadActionCalled: false;
  commentActionCalled: false;
  videos_insert_called: false;
  commentThreads_insert_called: false;
  comment_create_update_delete_called: false;
  visibility_changed: false;
  R2_upload: false;
  DB_write: false;
  product_assets_write: false;
  raw_urls_printed: false;
  raw_video_ids_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
  fake_success: false;
};

export type V078DashboardControlReport = V078DashboardControlPanel & {
  FINAL_STATUS: "BLOCKED_V078_DASHBOARD_CONTROL_SCAFFOLD_ONLY";
};

export function buildV078DashboardControlPanel(
  input: V078DashboardControlInput
): V078DashboardControlPanel {
  const blockers = dedupe<V078DashboardBlocker>([
    "BLOCKED_V078_DASHBOARD_CONTROL_SCAFFOLD_ONLY",
    ...input.schedulerPlan.blockers
  ]);

  return {
    version: "v078",
    title: "Autopilot Scheduler: Scaffold Only",
    mode: "scaffold_only",
    generatedAt: input.generatedAt,
    SAFE_TO_UPLOAD: false,
    safeToUpload: false,
    safeToComment: false,
    schedulerEnabled: false,
    uploadExecutionEnabled: false,
    commentExecutionEnabled: false,
    approvalRequired: true,
    statusLabels: [
      "Autopilot Scheduler: Scaffold Only",
      "SAFE_TO_UPLOAD=false",
      "실제 업로드/댓글 실행 비활성화",
      "승인 전 실행 불가"
    ],
    sections: ["차단 사유", "다음 후보"],
    summary: {
      candidateCount: input.schedulerPlan.candidateCount,
      blockedCount: input.schedulerPlan.blockedCount,
      nextEligibleAt: input.schedulerPlan.nextEligibleAt
    },
    blockers,
    cards: buildCards(input.schedulerPlan, blockers),
    candidates: input.schedulerPlan.candidates.map(toDashboardCandidate),
    actions: buildActions(),
    uploadActionCalled: false,
    commentActionCalled: false,
    videos_insert_called: false,
    commentThreads_insert_called: false,
    comment_create_update_delete_called: false,
    visibility_changed: false,
    R2_upload: false,
    DB_write: false,
    product_assets_write: false,
    raw_urls_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false
  };
}

export function buildV078DashboardControlReport(
  panel: V078DashboardControlPanel
): V078DashboardControlReport {
  return {
    ...panel,
    FINAL_STATUS: "BLOCKED_V078_DASHBOARD_CONTROL_SCAFFOLD_ONLY",
    SAFE_TO_UPLOAD: false,
    safeToUpload: false,
    safeToComment: false,
    schedulerEnabled: false,
    uploadExecutionEnabled: false,
    commentExecutionEnabled: false,
    uploadActionCalled: false,
    commentActionCalled: false,
    videos_insert_called: false,
    commentThreads_insert_called: false,
    comment_create_update_delete_called: false,
    visibility_changed: false,
    R2_upload: false,
    DB_write: false,
    product_assets_write: false,
    raw_urls_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false
  };
}

export function handleV078DashboardControlAction(
  input: V078DashboardActionRequest
): V078DashboardActionResponse {
  return {
    version: "v078",
    action: input.action,
    status: "BLOCKED",
    blocker: input.mutationAttempted
      ? "BLOCKED_V078_DASHBOARD_MUTATION_ATTEMPT"
      : "BLOCKED_V078_DASHBOARD_ACTION_SCAFFOLD_ONLY",
    safeToUpload: false,
    uploadActionCalled: false,
    commentActionCalled: false,
    videos_insert_called: false,
    commentThreads_insert_called: false,
    comment_create_update_delete_called: false,
    visibility_changed: false,
    R2_upload: false,
    DB_write: false,
    product_assets_write: false,
    raw_urls_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false
  };
}

function buildCards(
  schedulerPlan: V077AutopilotSchedulerPlan,
  blockers: V078DashboardBlocker[]
): V078DashboardReadinessCard[] {
  return [
    {
      kind: "upload_readiness",
      title: "Upload readiness",
      readinessStatus: "blocked",
      blockers: filterBlockers(blockers, [
        "BLOCKED_V077_SAFE_TO_UPLOAD_FALSE",
        "BLOCKED_V077_UPLOAD_FEATURE_DISABLED",
        "BLOCKED_V077_APPROVAL_MISSING",
        "BLOCKED_V077_AFFILIATE_URL_MISSING",
        "BLOCKED_V077_COUPANG_DISCLOSURE_MISSING",
        "BLOCKED_V077_TARGET_CHANNEL_EVIDENCE_MISSING",
        "BLOCKED_V077_PUBLIC_VISIBILITY_NOT_APPROVED",
        "BLOCKED_V077_DUPLICATE_GUARD_NOT_SATISFIED",
        "BLOCKED_V077_REAL_ADAPTER_DISABLED",
        "BLOCKED_V078_DASHBOARD_CONTROL_SCAFFOLD_ONLY"
      ]),
      evidencePresent: summarizeEvidence(schedulerPlan.candidates)
    },
    {
      kind: "comment_readiness",
      title: "Comment readiness",
      readinessStatus: "blocked",
      blockers: filterBlockers(blockers, [
        "BLOCKED_V077_SAFE_TO_UPLOAD_FALSE",
        "BLOCKED_V077_COMMENT_FEATURE_DISABLED",
        "BLOCKED_V077_APPROVAL_MISSING",
        "BLOCKED_V077_UPLOAD_RESULT_EVIDENCE_MISSING",
        "BLOCKED_V077_AFFILIATE_URL_MISSING",
        "BLOCKED_V077_COUPANG_DISCLOSURE_MISSING",
        "BLOCKED_V077_REAL_ADAPTER_DISABLED",
        "BLOCKED_V078_DASHBOARD_CONTROL_SCAFFOLD_ONLY"
      ]),
      evidencePresent: summarizeEvidence(schedulerPlan.candidates)
    },
    {
      kind: "scheduler_readiness",
      title: "Scheduler readiness",
      readinessStatus: "blocked",
      blockers: filterBlockers(blockers, [
        "BLOCKED_V077_SCHEDULER_DISABLED",
        "BLOCKED_V077_SAFE_TO_UPLOAD_FALSE",
        "BLOCKED_V077_APPROVAL_MISSING",
        "BLOCKED_V077_MUTATION_ATTEMPT_BLOCKED",
        "BLOCKED_V078_DASHBOARD_CONTROL_SCAFFOLD_ONLY"
      ]),
      evidencePresent: {
        schedulerPlan: true,
        schedulerEnabled: false,
        approvalRequired: true,
        safeToUpload: false
      }
    }
  ];
}

function toDashboardCandidate(
  candidate: V077AutopilotSchedulerCandidate
): V078DashboardCandidateView {
  return {
    queueItemId: candidate.queueItemId,
    uploadPackageId: candidate.uploadPackageId,
    channelKey: candidate.channelKey,
    platform: candidate.platform,
    intendedAction: candidate.intendedAction,
    readinessStatus: candidate.readinessStatus,
    nextEligibleAt: candidate.nextEligibleAt,
    blockers: candidate.blockers,
    evidencePresent: candidate.evidencePresent,
    hashPrefixes: candidate.hashPrefixes,
    sanitizedReason: candidate.sanitizedReason
  };
}

function buildActions(): V078DashboardActionState[] {
  return [
    {
      action: "upload",
      label: "Upload",
      enabled: false,
      state: "blocked",
      scaffoldOnly: true,
      blocker: "BLOCKED_V078_DASHBOARD_ACTION_SCAFFOLD_ONLY"
    },
    {
      action: "comment",
      label: "Comment",
      enabled: false,
      state: "blocked",
      scaffoldOnly: true,
      blocker: "BLOCKED_V078_DASHBOARD_ACTION_SCAFFOLD_ONLY"
    },
    {
      action: "autopilot",
      label: "Autopilot",
      enabled: false,
      state: "blocked",
      scaffoldOnly: true,
      blocker: "BLOCKED_V078_DASHBOARD_ACTION_SCAFFOLD_ONLY"
    }
  ];
}

function summarizeEvidence(
  candidates: V077AutopilotSchedulerCandidate[]
): Record<string, boolean> {
  return {
    candidate: candidates.length > 0,
    uploadPackage: candidates.some((candidate) => candidate.evidencePresent.uploadPackage),
    uploadResultEvidence: candidates.some((candidate) => candidate.evidencePresent.uploadResultEvidence),
    affiliateUrl: candidates.some((candidate) => candidate.evidencePresent.affiliateUrl),
    coupangDisclosure: candidates.some((candidate) => candidate.evidencePresent.coupangDisclosure),
    targetChannel: candidates.some((candidate) => candidate.evidencePresent.targetChannel),
    duplicateGuard: candidates.some((candidate) => candidate.evidencePresent.duplicateGuard),
    commentPackage: candidates.some((candidate) => candidate.evidencePresent.commentPackage)
  };
}

function filterBlockers(
  blockers: V078DashboardBlocker[],
  allowed: V078DashboardBlocker[]
) {
  return blockers.filter((blocker) => allowed.includes(blocker));
}

function dedupe<T>(values: T[]) {
  return [...new Set(values)];
}
