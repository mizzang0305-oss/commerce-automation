import type {
  MotionProvider,
  MotionProviderGenerateResult,
  MotionQualityBlocker
} from "../motionProviderTypes";

export type SourceVideoProviderReadinessBlocker =
  | "SOURCE_VIDEO_PROVIDER_DISABLED"
  | "SOURCE_VIDEO_RIGHTS_NOT_CONFIRMED"
  | "SOURCE_VIDEO_RAW_DOWNLOAD_BLOCKED";

export type SourceVideoProviderReadiness = {
  provider: "rights_confirmed_source_video";
  enabled: boolean;
  configured: boolean;
  rights_confirmed: boolean;
  raw_download_requested: boolean;
  raw_download_allowed: false;
  use_allowed: boolean;
  blocker: SourceVideoProviderReadinessBlocker | null;
  blockers: SourceVideoProviderReadinessBlocker[];
  safeSummary: string;
};

export function resolveSourceVideoProviderReadiness(input: {
  enabled?: boolean;
  rightsConfirmed?: boolean;
  rawDownloadRequested?: boolean;
} = {}): SourceVideoProviderReadiness {
  const enabled = input.enabled === true;
  const rightsConfirmed = input.rightsConfirmed === true;
  const rawDownloadRequested = input.rawDownloadRequested === true;

  if (!enabled) {
    return result({
      enabled,
      rightsConfirmed,
      rawDownloadRequested,
      blocker: "SOURCE_VIDEO_PROVIDER_DISABLED",
      blockers: ["SOURCE_VIDEO_PROVIDER_DISABLED"]
    });
  }
  if (rawDownloadRequested) {
    return result({
      enabled,
      rightsConfirmed,
      rawDownloadRequested,
      blocker: "SOURCE_VIDEO_RAW_DOWNLOAD_BLOCKED",
      blockers: ["SOURCE_VIDEO_RAW_DOWNLOAD_BLOCKED"]
    });
  }
  if (!rightsConfirmed) {
    return result({
      enabled,
      rightsConfirmed,
      rawDownloadRequested,
      blocker: "SOURCE_VIDEO_RIGHTS_NOT_CONFIRMED",
      blockers: ["SOURCE_VIDEO_RIGHTS_NOT_CONFIRMED"]
    });
  }

  return result({
    enabled,
    rightsConfirmed,
    rawDownloadRequested,
    blocker: null,
    blockers: []
  });
}

export function createSourceVideoProvider(input: {
  readiness?: SourceVideoProviderReadiness;
} = {}): MotionProvider {
  const readiness = input.readiness ?? resolveSourceVideoProviderReadiness();

  return {
    name: "rights_confirmed_source_video",
    mode: "source_video_generated",
    configured: readiness.configured,
    safeSummary: readiness.safeSummary,
    generate: async () => {
      if (!readiness.configured) {
        return blocked(readiness.blockers, readiness.safeSummary);
      }
      return blocked(
        ["SOURCE_VIDEO_RAW_DOWNLOAD_BLOCKED"],
        "Source video provider is rights-gated and raw download remains disabled in this PR."
      );
    }
  };
}

function result(input: {
  enabled: boolean;
  rightsConfirmed: boolean;
  rawDownloadRequested: boolean;
  blocker: SourceVideoProviderReadinessBlocker | null;
  blockers: SourceVideoProviderReadinessBlocker[];
}): SourceVideoProviderReadiness {
  return {
    provider: "rights_confirmed_source_video",
    enabled: input.enabled,
    configured: input.enabled && input.rightsConfirmed && input.blockers.length === 0,
    rights_confirmed: input.rightsConfirmed,
    raw_download_requested: input.rawDownloadRequested,
    raw_download_allowed: false,
    use_allowed: input.enabled && input.rightsConfirmed && input.blockers.length === 0,
    blocker: input.blocker,
    blockers: input.blockers,
    safeSummary: input.blocker
      ? `Source video provider is blocked by ${input.blocker}.`
      : "Source video provider has rights confirmation; raw download remains disabled by policy."
  };
}

function blocked(
  blockers: MotionQualityBlocker[],
  safeSummary: string
): MotionProviderGenerateResult {
  return {
    ok: false,
    providerName: "rights_confirmed_source_video",
    providerMode: "source_video_generated",
    blockers,
    safeSummary
  };
}
