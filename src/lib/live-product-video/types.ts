import type { EventProductKeywordPlan } from "@/lib/coupang/eventProductKeywordPlanner";
import type { ProductVideoAutomationInput } from "@/lib/video-automation/types";
import type { UsageEvidenceUseCase } from "@/lib/usage-evidence";

export type LiveProductUseCase = UsageEvidenceUseCase;

export type LiveProductKeywordContext = {
  keyword: string;
  eventId: string;
  eventName: string;
  plan: EventProductKeywordPlan;
};

export type LiveCoupangProviderProduct = {
  rawProductId: string;
  rawProductName: string;
  category: string;
  categoryPath: string;
  priceText: string;
  rawProductUrl: string;
  selectedAffiliateUrl: string;
  productImageUrls: string[];
  sourceProvider: "coupang_partners_product_search";
  sourceRequestId: string;
  discoveredAt: string;
  sourceKeyword: string;
  eventContext: { eventId: string; eventName: string };
};

export type LiveProductCandidate = LiveCoupangProviderProduct & {
  candidateId: string;
  productKey: string;
  canonicalProductName: string;
  productAliases: string[];
  productAnchors: string[];
  useCase: LiveProductUseCase;
};

export type LiveProductScore = {
  productKey: string;
  eventRelevanceScore: number;
  motionSuitabilityScore: number;
  policySafetyScore: number;
  imageReadinessScore: number;
  affiliateReadinessScore: number;
  duplicatePenalty: number;
  usageEvidenceScore: number;
  finalProductScore: number;
  selectionRank: number;
  eligible: boolean;
  blockers: string[];
};

export type RankedLiveProduct = {
  candidate: LiveProductCandidate;
  score: LiveProductScore;
};

export type ResolvedExactProductReference = {
  sourceUrl: string;
  localPath: string;
  width: number;
  height: number;
  mimeType: string;
  sizeBytes: number;
  identityType: "product_reference";
};

export type LiveVideoInput = ProductVideoAutomationInput;

export const LIVE_PRODUCT_VIDEO_FLAGS = Object.freeze({
  SAFE_TO_UPLOAD: false,
  SAFE_TO_PUBLIC_UPLOAD: false,
  YOUTUBE_AUTO_UPLOAD: false,
  PUBLIC_UPLOAD: false,
  UNLISTED_UPLOAD: false,
  TIKTOK_AUTO_UPLOAD: false,
  THREADS_AUTO_POST: false,
  COMMENT_AUTOMATION: false,
  DB_WRITE: 0,
  QUEUE_WRITE: 0,
  SHEETS_WRITE: 0,
  DRIVE_WRITE: 0,
  R2_WRITE: 0,
  PRODUCTION_DEPLOY: 0,
  WORKER_CHANGE: 0,
  SCHEDULER_CHANGE: 0,
  PLATFORM_UPLOAD: 0
} as const);
