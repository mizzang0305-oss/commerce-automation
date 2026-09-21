import { createHash } from "node:crypto";

export const APPROVED_COUPANG_AFFILIATE_HOSTS = Object.freeze(["link.coupang.com"] as const);

export type AffiliateReadinessStatus =
  | "ready"
  | "missing"
  | "invalid_url"
  | "invalid_scheme"
  | "invalid_host"
  | "invalid_path"
  | "credentials_present"
  | "provider_not_configured"
  | "resolution_failed";

export type AffiliateReadinessResult = {
  affiliateReady: boolean;
  affiliateReadinessCode: AffiliateReadinessStatus;
  approvedHost: boolean;
  rawUrlPrinted: false;
  secretsPrinted: false;
};

export type AffiliateReadyQueueItem = {
  productKey: string;
  candidate: { selectedAffiliateUrl: string };
};

export type AffiliateReadinessReport = {
  total: number;
  affiliateReady: number;
  affiliateMissing: number;
  affiliateInvalid: number;
  readyForArm: boolean;
  items: Array<{
    itemId: string;
    affiliateReady: boolean;
    affiliateReadinessCode: AffiliateReadinessStatus;
  }>;
  rawUrlsPrinted: false;
  secretsPrinted: false;
};

export type AffiliateResolutionResult =
  | { status: "resolved"; selectedAffiliateUrl: string }
  | { status: "provider_not_configured" | "resolution_failed" };

export type AffiliateLinkResolver<T extends AffiliateReadyQueueItem = AffiliateReadyQueueItem> =
  (item: T) => Promise<AffiliateResolutionResult>;

export function validateCoupangAffiliateUrl(value: unknown): AffiliateReadinessResult {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) return result("missing");

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return result("invalid_url");
  }

  if (parsed.username || parsed.password) return result("credentials_present");
  if (parsed.protocol !== "https:") return result("invalid_scheme");
  if (!APPROVED_COUPANG_AFFILIATE_HOSTS.includes(parsed.hostname as "link.coupang.com")) {
    return result("invalid_host");
  }
  if (!parsed.pathname || parsed.pathname === "/") return result("invalid_path", true);
  return result("ready", true);
}

export function validateResolvedAffiliateLink(value: unknown) {
  return validateCoupangAffiliateUrl(value);
}

export function buildAffiliateReadinessReport<T extends AffiliateReadyQueueItem>(items: readonly T[]): AffiliateReadinessReport {
  const inspected = items.map((item) => ({
    itemId: opaqueId(item.productKey),
    ...validateCoupangAffiliateUrl(item.candidate.selectedAffiliateUrl)
  }));
  const affiliateReady = inspected.filter((item) => item.affiliateReady).length;
  const affiliateMissing = inspected.filter((item) => item.affiliateReadinessCode === "missing").length;
  return {
    total: items.length,
    affiliateReady,
    affiliateMissing,
    affiliateInvalid: items.length - affiliateReady - affiliateMissing,
    readyForArm: items.length === 69 && affiliateReady === 69,
    items: inspected.map(({ itemId, affiliateReady: ready, affiliateReadinessCode }) => ({
      itemId,
      affiliateReady: ready,
      affiliateReadinessCode
    })),
    rawUrlsPrinted: false,
    secretsPrinted: false
  };
}

export async function resolveMissingAffiliateLink<T extends AffiliateReadyQueueItem>(
  item: T,
  resolver?: AffiliateLinkResolver<T>
): Promise<AffiliateResolutionResult> {
  if (!resolver) return { status: "provider_not_configured" };
  try {
    return await resolver(item);
  } catch {
    return { status: "resolution_failed" };
  }
}

export async function prepareAffiliateReadyQueue<T extends AffiliateReadyQueueItem>(input: {
  items: readonly T[];
  resolver?: AffiliateLinkResolver<T>;
}) {
  let providerCalls = 0;
  const preparationCodes: Array<{ itemId: string; code: AffiliateReadinessStatus }> = [];
  const items: T[] = [];

  for (const item of input.items) {
    const current = validateCoupangAffiliateUrl(item.candidate.selectedAffiliateUrl);
    if (current.affiliateReady) {
      items.push(item);
      preparationCodes.push({ itemId: opaqueId(item.productKey), code: "ready" });
      continue;
    }

    if (input.resolver) providerCalls += 1;
    const resolution = await resolveMissingAffiliateLink(item, input.resolver);
    if (resolution.status !== "resolved") {
      items.push(item);
      preparationCodes.push({ itemId: opaqueId(item.productKey), code: resolution.status });
      continue;
    }

    const resolved = validateResolvedAffiliateLink(resolution.selectedAffiliateUrl);
    if (!resolved.affiliateReady) {
      items.push(item);
      preparationCodes.push({ itemId: opaqueId(item.productKey), code: resolved.affiliateReadinessCode });
      continue;
    }

    items.push({
      ...item,
      candidate: { ...item.candidate, selectedAffiliateUrl: resolution.selectedAffiliateUrl.trim() }
    });
    preparationCodes.push({ itemId: opaqueId(item.productKey), code: "ready" });
  }

  return {
    items,
    report: buildAffiliateReadinessReport(items),
    providerCalls,
    preparationCodes,
    queueMutations: 0 as const,
    schedulerMutations: 0 as const,
    sheetsMutations: 0 as const,
    SAFE_TO_UPLOAD: false as const,
    PLATFORM_UPLOAD: 0 as const
  };
}

function result(code: AffiliateReadinessStatus, approvedHost = false): AffiliateReadinessResult {
  return {
    affiliateReady: code === "ready",
    affiliateReadinessCode: code,
    approvedHost,
    rawUrlPrinted: false,
    secretsPrinted: false
  };
}

function opaqueId(productKey: string) {
  return `affiliate-item-${createHash("sha256").update(productKey).digest("hex").slice(0, 12)}`;
}
