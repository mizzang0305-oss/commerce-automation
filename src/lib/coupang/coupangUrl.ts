export type AffiliateValidationStatus = "valid" | "missing" | "invalid";

export type AffiliateValidationResult = {
  ok: boolean;
  status: AffiliateValidationStatus;
  normalized_url: string;
  reason: string;
};

export type CoupangProductKeyInput = {
  raw_coupang_url?: string;
  product_id?: string;
  item_id?: string;
  vendor_item_id?: string;
};

const KEEP_QUERY_PARAMS = ["itemId", "vendorItemId"];

export function normalizeCoupangUrl(value: string): string {
  return removeTrackingParams(value).replace(/\/+$/, "");
}

export function removeTrackingParams(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    const kept = new URLSearchParams();
    for (const key of KEEP_QUERY_PARAMS) {
      const paramValue = url.searchParams.get(key);
      if (paramValue) {
        kept.set(key, paramValue);
      }
    }
    url.search = kept.toString();
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\?$/, "");
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

export function isLikelyCoupangProductUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    return (host === "coupang.com" || host.endsWith(".coupang.com")) && Boolean(extractCoupangProductId(value));
  } catch {
    return false;
  }
}

export function extractCoupangProductId(value: string): string {
  return value.match(/\/(?:vp\/)?products\/(\d+)/i)?.[1] ?? "";
}

export function extractCoupangUrlIds(value: string): { item_id: string; vendor_item_id: string } {
  try {
    const url = new URL(value.trim());
    return {
      item_id: url.searchParams.get("itemId") ?? url.searchParams.get("item_id") ?? "",
      vendor_item_id: url.searchParams.get("vendorItemId") ?? url.searchParams.get("vendor_item_id") ?? ""
    };
  } catch {
    return { item_id: "", vendor_item_id: "" };
  }
}

export function buildCoupangProductKey(input: CoupangProductKeyInput): string {
  const productId = normalizeKeyPart(input.product_id || extractCoupangProductId(input.raw_coupang_url ?? ""));
  const itemId = normalizeKeyPart(input.item_id ?? "");
  const vendorItemId = normalizeKeyPart(input.vendor_item_id ?? "");
  const parts = ["coupang", "product", productId || "unknown"];
  if (itemId) {
    parts.push("item", itemId);
  }
  if (vendorItemId) {
    parts.push("vendor", vendorItemId);
  }
  return parts.join(":");
}

export function validateAffiliateUrl(value: string): AffiliateValidationResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return {
      ok: false,
      status: "missing",
      normalized_url: "",
      reason: "affiliate link missing"
    };
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    const isValid =
      url.protocol === "https:" &&
      host === "link.coupang.com" &&
      /^\/a\/[A-Za-z0-9_-]+/.test(url.pathname);

    return {
      ok: isValid,
      status: isValid ? "valid" : "invalid",
      normalized_url: isValid ? url.toString().replace(/\/+$/, "") : trimmed,
      reason: isValid ? "affiliate link validated" : "affiliate link must use link.coupang.com/a"
    };
  } catch {
    return {
      ok: false,
      status: "invalid",
      normalized_url: trimmed,
      reason: "affiliate link is not a valid URL"
    };
  }
}

function normalizeKeyPart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}
