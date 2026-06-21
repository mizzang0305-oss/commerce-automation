import type { MotionProviderName, MotionQualityBlocker } from "./motionProviderTypes";

export interface MotionCostPolicy {
  autopilotPaidI2VEnabled: boolean;
  maxPaidI2VScenesPerShort: number;
  maxPaidI2VCostPerShortUsd: number;
  premiumManualOnly: boolean;
  freshApprovalRequired: boolean;
}

export type MotionRouteMode = "autopilot" | "premium_manual";

export type PaidMotionProviderPolicyInput = {
  providerName: MotionProviderName;
  routeMode: MotionRouteMode;
  requestedSceneCount: number;
  estimatedCostUsd: number;
  premiumManualApproval?: boolean;
  freshApproval?: boolean;
  policy?: MotionCostPolicy;
};

export type PaidMotionProviderPolicyReport = MotionCostPolicy & {
  providerName: MotionProviderName;
  paidProvider: boolean;
  routeMode: MotionRouteMode;
  requestedSceneCount: number;
  estimatedCostUsd: number;
  premiumManualApproval: boolean;
  freshApproval: boolean;
  allowed: boolean;
  blockers: MotionQualityBlocker[];
  safeSummary: string;
};

export const DEFAULT_MOTION_COST_POLICY: MotionCostPolicy = {
  autopilotPaidI2VEnabled: false,
  maxPaidI2VScenesPerShort: 0,
  maxPaidI2VCostPerShortUsd: 0,
  premiumManualOnly: true,
  freshApprovalRequired: true
};

const PAID_I2V_PROVIDERS = new Set<MotionProviderName>([
  "fal_kling_i2v",
  "cloud_image_to_video"
]);

export function isPaidI2VProvider(providerName: MotionProviderName) {
  return PAID_I2V_PROVIDERS.has(providerName);
}

export function evaluatePaidMotionProviderPolicy(
  input: PaidMotionProviderPolicyInput
): PaidMotionProviderPolicyReport {
  const policy = input.policy ?? DEFAULT_MOTION_COST_POLICY;
  const paidProvider = isPaidI2VProvider(input.providerName);
  const premiumManualApproval = input.premiumManualApproval === true;
  const freshApproval = input.freshApproval === true;
  const requestedSceneCount = Math.max(0, input.requestedSceneCount);
  const estimatedCostUsd = Math.max(0, input.estimatedCostUsd);
  const blockers: MotionQualityBlocker[] = [];

  if (paidProvider) {
    if (input.routeMode === "autopilot" && !policy.autopilotPaidI2VEnabled) {
      blockers.push("PAID_I2V_AUTOPILOT_BLOCKED");
    }
    if (policy.premiumManualOnly && !premiumManualApproval) {
      blockers.push("PAID_I2V_MANUAL_PREMIUM_APPROVAL_REQUIRED");
    }
    if (policy.freshApprovalRequired && !freshApproval) {
      blockers.push("PAID_I2V_MANUAL_PREMIUM_APPROVAL_REQUIRED");
    }
    if (requestedSceneCount > policy.maxPaidI2VScenesPerShort) {
      blockers.push("PAID_I2V_SCENE_CAP_EXCEEDED");
    }
    if (estimatedCostUsd > policy.maxPaidI2VCostPerShortUsd || policy.maxPaidI2VCostPerShortUsd <= 0) {
      blockers.push("PAID_I2V_COST_CAP_REQUIRED");
    }
  }

  const uniqueBlockers = [...new Set(blockers)];

  return {
    ...policy,
    providerName: input.providerName,
    paidProvider,
    routeMode: input.routeMode,
    requestedSceneCount,
    estimatedCostUsd,
    premiumManualApproval,
    freshApproval,
    allowed: !paidProvider || uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    safeSummary: paidProvider
      ? uniqueBlockers.length === 0
        ? `${input.providerName} is allowed only under premium/manual paid I2V policy.`
        : `${input.providerName} is blocked by paid I2V policy; no API call is allowed.`
      : `${input.providerName} is not a paid I2V provider.`
  };
}
