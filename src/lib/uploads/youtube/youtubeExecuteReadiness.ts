import "server-only";

import type {
  YouTubeExecutionIntent,
  YouTubeUploadBlockedReason,
  YouTubeUploadReadiness
} from "@/lib/uploads/youtube/types";
import { buildYouTubeExecuteTokenProviderReadiness } from "@/lib/uploads/youtube/youtubeTokenProviderContract";
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
  token_provider: ReturnType<typeof buildYouTubeExecuteTokenProviderReadiness>;
  side_effects: typeof youtubeUploadSafeSideEffects;
};

export function buildYouTubeExecuteReadiness(input: {
  confirmation?: unknown;
  smokeApproval?: unknown;
  executionIntent?: unknown;
  visibility?: unknown;
  env?: NodeJS.ProcessEnv;
} = {}): YouTubeExecuteReadiness {
  const env = input.env ?? process.env;
  const executionIntent = normalizeExecutionIntent(input.executionIntent);
  const visibility = normalizeExecuteVisibility(input.visibility);
  const readiness = buildYouTubeUploadReadiness(env);
  const tokenProvider = buildYouTubeExecuteTokenProviderReadiness(env);
  const gates: YouTubeExecuteReadinessGate[] = [];
  const blockedReasons = new Set<string>();

  for (const reason of readiness.blocked_reasons) {
    blockedReasons.add(reason);
  }

  gates.push({
    key: "youtube_upload_readiness",
    status: readiness.can_upload ? "pass" : "blocked",
    label_ko: "YouTube upload readiness",
    safe_error: readiness.can_upload
      ? "YouTube server readiness passed."
      : "YouTube server readiness is still blocked.",
    fix_hint_ko: "Resolve readiness.blocked_reasons without exposing secret values.",
    secret_safe: true
  });

  for (const reason of tokenProvider.blockers) {
    blockedReasons.add(reason);
  }
  gates.push({
    key: "execute_token_provider",
    status: tokenProvider.can_provide_upload_token ? "pass" : "blocked",
    label_ko: "YouTube server-only token provider",
    safe_error: tokenProvider.can_provide_upload_token
      ? "Server-only token provider can supply an upload token without exposing it to the client."
      : tokenProvider.safe_message,
    fix_hint_ko: tokenProvider.provider_mode === "contract_only"
      ? "Set YOUTUBE_TOKEN_PROVIDER_MODE=local_file for approved localhost execution or implement server_secret provider before domain execute."
      : "Check token provider mode, token file location, upload scope, and server-only configuration.",
    secret_safe: true
  });

  const confirmationOk = hasExactYouTubeUploadConfirmation(input.confirmation);
  if (!confirmationOk) {
    blockedReasons.add("upload_confirmation_missing" satisfies YouTubeUploadBlockedReason);
    blockedReasons.add("private_execute_approval_missing" satisfies YouTubeUploadBlockedReason);
  }
  gates.push({
    key: "execute_private_approval",
    status: confirmationOk ? "pass" : "blocked",
    label_ko: "YouTube private execute approval",
    safe_error: confirmationOk
      ? "APPROVE_YOUTUBE_PRIVATE_UPLOAD approval phrase matched."
      : "APPROVE_YOUTUBE_PRIVATE_UPLOAD approval phrase is required.",
    fix_hint_ko: "Enter APPROVE_YOUTUBE_PRIVATE_UPLOAD exactly before private execute.",
    secret_safe: true
  });

  const visibilityBlocker = getExecuteVisibilityBlocker(visibility);
  if (visibilityBlocker) {
    blockedReasons.add(visibilityBlocker);
  }
  gates.push({
    key: "execute_private_visibility",
    status: visibilityBlocker ? "blocked" : "pass",
    label_ko: "YouTube private visibility",
    safe_error: visibilityBlocker
      ? "This execute path allows private visibility only."
      : "Private visibility is selected for this execute path.",
    fix_hint_ko: "Set visibility=private. Public and unlisted visibility are blocked for this final private execute path.",
    secret_safe: true
  });

  if (executionIntent === "live_smoke") {
    const liveSmokeApprovalOk =
      hasExactYouTubeLiveSmokeApproval(input.smokeApproval) ||
      hasExactYouTubeLiveSmokeApproval(env.RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE);
    if (!liveSmokeApprovalOk) {
      blockedReasons.add("live_smoke_approval_missing" satisfies YouTubeUploadBlockedReason);
    }
    gates.push({
      key: "execute_live_smoke_approval",
      status: liveSmokeApprovalOk ? "pass" : "blocked",
      label_ko: "YouTube live smoke approval",
      safe_error: liveSmokeApprovalOk
        ? "RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE approval phrase matched."
        : `Live YouTube upload smoke is blocked until ${RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE} is explicitly configured or submitted.`,
      fix_hint_ko: "Use RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE only for the smoke path, not for real private execute.",
      secret_safe: true
    });
  }

  return {
    ok: true,
    can_execute: blockedReasons.size === 0,
    blocked_reasons: Array.from(blockedReasons),
    gates,
    readiness,
    token_provider: tokenProvider,
    side_effects: youtubeUploadSafeSideEffects
  };
}

function normalizeExecutionIntent(value: unknown): YouTubeExecutionIntent {
  return value === "live_smoke" ? "live_smoke" : "private_execute";
}

function normalizeExecuteVisibility(value: unknown) {
  if (value === "public" || value === "unlisted" || value === "private") {
    return value;
  }
  return "private";
}

function getExecuteVisibilityBlocker(
  visibility: "private" | "unlisted" | "public"
): YouTubeUploadBlockedReason | null {
  if (visibility === "public") {
    return "visibility_public_blocked";
  }
  if (visibility === "unlisted") {
    return "visibility_unlisted_blocked";
  }
  return null;
}
