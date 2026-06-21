export type CloudVideoProviderVendor =
  | "runway"
  | "kling"
  | "luma"
  | "pika"
  | "replicate"
  | "fal";

export type CloudVideoProviderExecutionMode = "blocked" | "mock";

export type CloudVideoProviderReadinessBlocker =
  | "CLOUD_VIDEO_PROVIDER_NOT_CONFIGURED"
  | "CLOUD_VIDEO_PROVIDER_COST_APPROVAL_REQUIRED"
  | "CLOUD_VIDEO_PROVIDER_LIVE_API_NOT_IMPLEMENTED";

export type CloudVideoProviderSafeSummary = {
  enabled: boolean;
  providerName: CloudVideoProviderVendor | null;
  apiKeyPresent: boolean;
  costApproved: boolean;
  mockOnly: boolean;
};

export type CloudVideoProviderReadiness = {
  provider: "cloud_image_to_video";
  enabled: boolean;
  configured: boolean;
  canGenerateMotion: boolean;
  providerName: CloudVideoProviderVendor | null;
  blocker: CloudVideoProviderReadinessBlocker | null;
  blockers: CloudVideoProviderReadinessBlocker[];
  safeSummary: CloudVideoProviderSafeSummary;
};
