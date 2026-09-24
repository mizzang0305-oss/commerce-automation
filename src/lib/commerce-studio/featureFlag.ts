export function isCommerceStudioEnabled(env: Readonly<Record<string, string | undefined>> = process.env) {
  if (env.COMMERCE_STUDIO_ENABLED === "false") return false;
  return env.COMMERCE_STUDIO_ENABLED === "true" || env.VERCEL_ENV === "preview";
}
