import type { YouTubePublicPublisherChannelKey } from "@/lib/youtube-public-publisher/channelConfig";
import type { StudioCandidate, StudioPlan } from "@/lib/commerce-studio/bridge/contracts";

export const SIMPLE_PRODUCER_SCHEMA = "simple-producer/v1";

export type SimpleProducerConfig = {
  schema: typeof SIMPLE_PRODUCER_SCHEMA;
  enabled: boolean;
  dailyGenerateTarget: number;
  maxItemsPerRun: 1;
  generationSlots: string[];
  timeZone: "Asia/Seoul";
  evidenceRoot: string;
  studioSettingsRevision?: number;
};

export type SimpleProducerSlotStatus = "running" | "succeeded" | "failed";

export type SimpleProducerSlotRecord = {
  date: string;
  slot: string;
  status: SimpleProducerSlotStatus;
  createdAt: string;
  updatedAt: string;
  productId: string;
  uploadJobId: string;
  safeError: string;
};

export type SimpleProducerState = {
  schema: typeof SIMPLE_PRODUCER_SCHEMA;
  slots: SimpleProducerSlotRecord[];
  studioSettingsRevision?: number;
  studioPlans?: StudioPlan[];
  studioCandidates?: StudioCandidate[];
  studioCandidatesScoutedAt?: string;
  studioCommandReceipts?: Array<{ commandId: string; status: "applied" | "rejected" | "pending"; safeError: string; appliedVersion: number | null }>;
};

export type SimpleProducerPipelineInput = {
  runId: string;
  outputRoot: string;
  excludedProductIds: string[];
  lockedProductId?: string | null;
};

export type SimpleProducerPipelineItem = {
  productId: string;
  canonicalProductName: string;
  affiliateUrl: string;
  useCase: "vehicle_organization" | "laundry_drying";
  videoPath: string;
  machineQaPassed: boolean;
};

export type SimpleProducerPipelineResult = {
  ok: boolean;
  safeError: string;
  searchCalls: number;
  rawProductsFound: number;
  eligibleProductsFound: number;
  item: SimpleProducerPipelineItem | null;
};

export type SimpleProducerRunStatus =
  | "disabled"
  | "outside_slot"
  | "daily_target_reached"
  | "slot_already_recorded"
  | "plan_held"
  | "settings_reconcile_required"
  | "ready_job_created"
  | "failed";

export type SimpleProducerRunResult = {
  status: SimpleProducerRunStatus;
  safeError: string;
  date: string;
  slot: string | null;
  productId: string | null;
  uploadJobId: string | null;
  channelKey: YouTubePublicPublisherChannelKey | null;
  readyJobCreated: 0 | 1;
  videosInsertCalls: 0;
  searchCalls: number;
  rawProductsFound: number;
  eligibleProductsFound: number;
};
