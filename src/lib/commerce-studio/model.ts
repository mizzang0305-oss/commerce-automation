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
  timeZone: "Asia/Seoul";
  producerSource: StudioSourceStatus;
  publisherSource: StudioSourceStatus;
  producerSafeError: string | null;
  publisherSafeError: string | null;
  settings: {
    enabled: boolean;
    dailyGenerateTarget: number;
    generationSlots: string[];
    maxItemsPerRun: 1;
  } | null;
  slots: StudioSlot[];
  contents: StudioContent[];
  youtubeChannels: {
    key: "neoman_moleulgeol" | "father_jobs";
    title: string;
    expectedChannelId: string;
    credentialConfigured: boolean;
    historicalPublicationObserved: boolean;
  }[];
};
