import type {
  PlatformUploadJobPlan,
  PlatformUploadPlanInput,
  PlatformUploadProvider,
  PlatformUploadReadiness,
  PlatformUploadSettings,
  PlatformUploadSideEffects,
  PlatformUploadVisibility
} from "@/lib/uploads/platformUploadTypes";

export const platformUploadProviders: PlatformUploadProvider[] = ["youtube", "tiktok", "threads"];

export const platformUploadSafeSideEffects: PlatformUploadSideEffects = {
  uploaded: false,
  platform_api_called: false,
  token_exchanged: false,
  token_stored: false,
  db_written: false,
  queue_created: false,
  worker_job_created: false,
  upload_package_created: false
};

export function createDefaultPlatformUploadSettings(): PlatformUploadSettings {
  return {
    youtube_upload_enabled: false,
    tiktok_upload_enabled: false,
    threads_upload_enabled: false,
    public_upload_enabled: false,
    manual_upload_only: true,
    approval_required: true,
    default_visibility: "private",
    max_daily_uploads: 6
  };
}

export function buildPlatformUploadReadiness(
  settings: PlatformUploadSettings = createDefaultPlatformUploadSettings()
): PlatformUploadReadiness[] {
  return platformUploadProviders.map((provider) => {
    const upload_enabled = getProviderUploadEnabled(settings, provider);
    const readiness: PlatformUploadReadiness = {
      provider,
      configured: false,
      token_ready: false,
      scopes_ready: false,
      quota_ready: false,
      account_ready: false,
      policy_ready: false,
      upload_enabled,
      can_upload: false,
      blocked_reasons: [
        "provider_not_configured",
        "token_not_ready",
        "scopes_not_ready",
        "quota_not_ready",
        "account_not_ready",
        "policy_not_ready",
        "upload_disabled",
        "manual_upload_only"
      ]
    };
    return readiness;
  });
}

export function buildPlatformUploadJobPlan(input: PlatformUploadPlanInput):
  | { ok: true; plan: PlatformUploadJobPlan }
  | { ok: false; missing_reasons: string[] } {
  const settings = createDefaultPlatformUploadSettings();
  const candidate = input.candidate;
  const videoPathOrUrl = safeTrim(input.video_path_or_url);
  const titleInput = safeTrim(input.title);
  const descriptionInput = safeTrim(input.description);
  const captionInput = safeTrim(input.caption);
  const disclosureText = safeTrim(input.disclosure_text);
  const selectedAffiliateUrl = candidate.selected_affiliate_url.trim();
  const productName = candidate.product_name.trim();
  const providerTargets = normalizeProviderTargets(input.provider_targets);
  const visibility = normalizeVisibility(input.visibility);
  const missingReasons = [];

  if (!productName) {
    missingReasons.push("product_name");
  }
  if (!selectedAffiliateUrl) {
    missingReasons.push("selected_affiliate_url");
  }
  if (!videoPathOrUrl) {
    missingReasons.push("video_path_or_url");
  }
  if (!titleInput) {
    missingReasons.push("title");
  }
  if (!descriptionInput && !captionInput) {
    missingReasons.push("description_or_caption");
  }
  if (!disclosureText) {
    missingReasons.push("disclosure_text");
  }
  if (providerTargets.length === 0) {
    missingReasons.push("provider_targets");
  }
  if (!visibility) {
    missingReasons.push("visibility");
  }

  if (missingReasons.length > 0) {
    return { ok: false, missing_reasons: missingReasons };
  }
  const safeVisibility: PlatformUploadVisibility = visibility || settings.default_visibility;

  const now = input.now ?? new Date().toISOString();
  const title = titleInput;
  const description = descriptionInput || captionInput;
  const caption = captionInput || descriptionInput;

  return {
    ok: true,
    plan: {
      id: `${candidate.id}-platform-upload-plan`,
      candidate_id: candidate.id,
      product_name: productName,
      video_path_or_url: videoPathOrUrl,
      title,
      description,
      caption,
      disclosure_text: disclosureText,
      selected_affiliate_url: selectedAffiliateUrl,
      provider_targets: providerTargets,
      visibility: safeVisibility,
      manual_upload_only: true,
      public_upload_enabled: false,
      approval_required: true,
      readiness: buildPlatformUploadReadiness(settings).filter((item) => providerTargets.includes(item.provider)),
      side_effects: platformUploadSafeSideEffects,
      created_at: now
    }
  };
}

function getProviderUploadEnabled(settings: PlatformUploadSettings, provider: PlatformUploadProvider) {
  if (provider === "youtube") {
    return settings.youtube_upload_enabled;
  }
  if (provider === "tiktok") {
    return settings.tiktok_upload_enabled;
  }
  return settings.threads_upload_enabled;
}

function normalizeProviderTargets(input: unknown): PlatformUploadProvider[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const selected = input.filter((value): value is PlatformUploadProvider =>
    platformUploadProviders.includes(value as PlatformUploadProvider)
  );
  return [...new Set(selected)];
}

function normalizeVisibility(input: unknown): PlatformUploadVisibility | "" {
  if (input === "unlisted") {
    return "unlisted";
  }
  if (input === "private") {
    return "private";
  }
  return "";
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
