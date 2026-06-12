import "server-only";

import type { YouTubeUploadBlockedReason, YouTubeUploadReadiness } from "@/lib/uploads/youtube/types";
import { buildYouTubeUploadReadiness } from "@/lib/uploads/youtube/youtubeReadiness";
import {
  RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE,
  hasExactYouTubeLiveSmokeApproval,
  hasExactYouTubeUploadConfirmation
} from "@/lib/uploads/youtube/youtubeUploadGuards";
import { youtubeUploadSafeSideEffects } from "@/lib/uploads/youtube/youtubeUploadErrors";

export type YouTubeExecuteReadinessGate = {
  key: string;
  status: "pass" | "blocked";
  label_ko: string;
  safe_error: string;
  fix_hint_ko: string;
  secret_safe: true;
};

export type YouTubeExecuteReadiness = {
  ok: true;
  can_execute: boolean;
  blocked_reasons: string[];
  gates: YouTubeExecuteReadinessGate[];
  readiness: YouTubeUploadReadiness;
  side_effects: typeof youtubeUploadSafeSideEffects;
};

export function buildYouTubeExecuteReadiness(input: {
  confirmation?: unknown;
  smokeApproval?: unknown;
  env?: NodeJS.ProcessEnv;
} = {}): YouTubeExecuteReadiness {
  const env = input.env ?? process.env;
  const readiness = buildYouTubeUploadReadiness();
  const gates: YouTubeExecuteReadinessGate[] = [];
  const blockedReasons = new Set<string>();

  for (const reason of readiness.blocked_reasons) {
    blockedReasons.add(reason);
  }

  gates.push({
    key: "youtube_upload_readiness",
    status: readiness.can_upload ? "pass" : "blocked",
    label_ko: "YouTube 업로드 readiness",
    safe_error: readiness.can_upload
      ? "YouTube 서버 readiness가 통과했습니다."
      : "YouTube 서버 readiness가 아직 통과하지 않았습니다.",
    fix_hint_ko: readiness.can_upload
      ? "다음 실행 게이트를 확인하세요."
      : "readiness.blocked_reasons를 해결한 뒤 다시 확인하세요.",
    secret_safe: true
  });

  const confirmationOk = hasExactYouTubeUploadConfirmation(input.confirmation);
  if (!confirmationOk) {
    blockedReasons.add("upload_confirmation_missing" satisfies YouTubeUploadBlockedReason);
  }
  gates.push({
    key: "execute_confirmation",
    status: confirmationOk ? "pass" : "blocked",
    label_ko: "업로드 승인 문구",
    safe_error: confirmationOk
      ? "업로드 승인 문구가 일치합니다."
      : "APPROVE_YOUTUBE_PRIVATE_UPLOAD 승인 문구가 필요합니다.",
    fix_hint_ko: "대시보드에 APPROVE_YOUTUBE_PRIVATE_UPLOAD를 정확히 입력하세요.",
    secret_safe: true
  });

  const liveSmokeApprovalOk =
    hasExactYouTubeLiveSmokeApproval(input.smokeApproval) ||
    hasExactYouTubeLiveSmokeApproval(env.RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE);
  if (!liveSmokeApprovalOk) {
    blockedReasons.add("live_smoke_approval_missing" satisfies YouTubeUploadBlockedReason);
  }
  gates.push({
    key: "execute_live_smoke_approval",
    status: liveSmokeApprovalOk ? "pass" : "blocked",
    label_ko: "비공개 스모크 실행 승인",
    safe_error: liveSmokeApprovalOk
      ? "비공개 스모크 실행 승인 문구가 확인되었습니다."
      : `Live YouTube upload smoke is blocked until ${RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE} is explicitly configured or submitted.`,
    fix_hint_ko: "대시보드에 RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE를 정확히 입력하거나 승인된 로컬 smoke env를 설정하세요.",
    secret_safe: true
  });

  return {
    ok: true,
    can_execute: blockedReasons.size === 0,
    blocked_reasons: Array.from(blockedReasons),
    gates,
    readiness,
    side_effects: youtubeUploadSafeSideEffects
  };
}
