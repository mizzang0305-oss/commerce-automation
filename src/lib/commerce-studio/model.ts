export type StudioSourceStatus = "connected" | "unavailable";

export type StudioSlot = {
  date: string;
  time: string;
  status: "scheduled" | "disabled" | "unknown" | "running" | "succeeded" | "failed";
  productName: string | null;
  channelKey: "neoman_moleulgeol" | "father_jobs" | null;
  publishStatus: "ready" | "uploading" | "uploaded" | "error" | "manual_review" | null;
  youtubeUrl: string | null;
  safeError: string | null;
  productId?: string | null;
  planVersion?: number | null;
  planStatus?: string | null;
};

export type StudioContent = {
  id: string;
  evidenceSource: "job" | "ledger";
  productName: string;
  channelKey: "neoman_moleulgeol" | "father_jobs";
  status: "ready" | "uploading" | "uploaded" | "error" | "manual_review";
  createdAt: string;
  publishedAt: string | null;
  youtubeUrl: string | null;
  title: string;
};

export type StudioModel = {
  observedAt: string;
  queriedAt: string;
  producerObservedAt: string | null;
  publisherObservedAt: string | null;
  receivedAt: string | null;
  sourceStale?: boolean;
  commandsAvailable?: boolean;
  timeZone: "Asia/Seoul";
  calendarDates: string[];
  producerSource: StudioSourceStatus;
  publisherSource: StudioSourceStatus;
  producerSafeError: string | null;
  publisherSafeError: string | null;
  settings: {
    enabled: boolean;
    dailyGenerateTarget: number;
    generationSlots: string[];
    maxItemsPerRun: 1;
    revision?: number;
  } | null;
  slots: StudioSlot[];
  contents: StudioContent[];
  candidates: Array<{ snapshotId: string; slotId: string; productId: string; productName: string; channelKey: "neoman_moleulgeol" | "father_jobs"; eligible: boolean; safeBlockers: string[] }>;
  youtubeChannels: {
    key: "neoman_moleulgeol" | "father_jobs";
    title: string;
    expectedChannelId: string;
    credentialConfigured: boolean;
    historicalPublicationObserved: boolean;
  }[];
};

export function emptyStudioModel(now = new Date()): StudioModel {
  return {
    observedAt: now.toISOString(), queriedAt: now.toISOString(), producerObservedAt: null, publisherObservedAt: null, receivedAt: null, sourceStale: false, commandsAvailable: false, timeZone: "Asia/Seoul", calendarDates: [],
    producerSource: "unavailable", publisherSource: "unavailable",
    producerSafeError: "OWNER_AUTH_NOT_CONFIGURED", publisherSafeError: "OWNER_AUTH_NOT_CONFIGURED",
    settings: null, slots: [], contents: [], candidates: [], youtubeChannels: []
  };
}
