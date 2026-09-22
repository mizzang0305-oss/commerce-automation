export type StudioOwner = { ownerId: string; email: string };

export function studioAuthConfig(env: NodeJS.ProcessEnv = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || "";
  const origin = env.STUDIO_PUBLIC_ORIGIN?.trim() || "";
  const subjects = new Set((env.STUDIO_GOOGLE_SUB_ALLOWLIST || "").split(",").map((value) => value.trim()).filter(Boolean));
  let validOrigin = false;
  try {
    const parsed = new URL(origin);
    validOrigin = parsed.origin === origin && (parsed.protocol === "https:" || parsed.hostname === "localhost");
  } catch { /* absent or invalid */ }
  return { url, key, origin, subjects, ready: Boolean(url && key && validOrigin && subjects.size) };
}

export function allowedStudioOwner(user: {
  email?: string | null;
  identities?: Array<{ provider?: string; identity_data?: Record<string, unknown> | null }> | null;
} | null, subjects: ReadonlySet<string>): StudioOwner | null {
  if (!user || !subjects.size || !user.email) return null;
  const identity = user.identities?.find((entry) => entry.provider === "google" &&
    typeof entry.identity_data?.sub === "string" && subjects.has(entry.identity_data.sub));
  if (!identity || identity.identity_data?.email_verified !== true ||
      String(identity.identity_data.email || "").toLowerCase() !== user.email.toLowerCase()) return null;
  return { ownerId: String(identity.identity_data.sub), email: user.email };
}

export function sameStudioOrigin(request: Request, expectedOrigin: string) {
  return Boolean(expectedOrigin && request.headers.get("origin") === expectedOrigin &&
    new URL(request.url).origin === expectedOrigin);
}
