const SECRET_KEYS = new Set([
  "access_token",
  "refresh_token",
  "id_token",
  "token",
  "client_secret",
  "authorization"
]);

export function redactYouTubeTokenPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactYouTubeTokenPayload(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SECRET_KEYS.has(key.toLowerCase()) ? "[REDACTED]" : redactYouTubeTokenPayload(item)
      ])
    );
  }

  return value;
}
