/** Send the existing Vercel automation bypass only to the exact approved Preview origin. */
export function studioPreviewProtectionHeaders(input: {
  endpoint: string;
  allowedOrigin: string | undefined;
  bypassSecret: string | undefined;
}): Record<string, string> {
  const secret = input.bypassSecret?.trim();
  if (!secret) return {};

  let url: URL;
  try { url = new URL(input.endpoint); }
  catch { throw new Error("STUDIO_PREVIEW_BYPASS_ORIGIN_INVALID"); }
  if (url.protocol !== "https:" || url.origin !== input.endpoint ||
      !url.hostname.startsWith("commerce-automation-") || !url.hostname.endsWith(".vercel.app") ||
      input.allowedOrigin !== input.endpoint) {
    throw new Error("STUDIO_PREVIEW_BYPASS_ORIGIN_INVALID");
  }

  return { "x-vercel-protection-bypass": secret };
}
