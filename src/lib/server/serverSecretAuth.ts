import "server-only";

import { timingSafeEqual } from "node:crypto";

export function isServerBearerAuthorized(request: Request, configuredSecret: string | undefined) {
  const expected = configuredSecret?.trim() ?? "";
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (expected.length < 32 || provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}
