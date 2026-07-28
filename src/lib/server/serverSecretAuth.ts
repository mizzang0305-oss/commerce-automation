import "server-only";

import { timingSafeEqual } from "node:crypto";

export function isServerBearerAuthorized(request: Request, configuredSecret: string | undefined) {
  const expected = configuredSecret?.trim() ?? "";
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (expected.length < 32 || provided.length !== expected.length) return false;
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}
