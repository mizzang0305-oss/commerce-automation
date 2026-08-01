import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  consumeLoginAttempt, createCommerceControlSession, resetLoginAttemptsForTests, verifyCommerceControlPassword,
  verifyCommerceControlSession
} from "@/lib/commerce-control/auth";

describe("commerce control authentication", () => {
  beforeEach(() => {
    process.env.COMMERCE_CONTROL_PASSWORD = "owner-password-123";
    process.env.COMMERCE_CONTROL_SESSION_SECRET = "session-secret-at-least-thirty-two-characters";
    resetLoginAttemptsForTests();
  });
  afterEach(() => {
    delete process.env.COMMERCE_CONTROL_PASSWORD;
    delete process.env.COMMERCE_CONTROL_SESSION_SECRET;
  });

  test("uses a signed expiring owner session", () => {
    expect(verifyCommerceControlPassword("owner-password-123")).toBe(true);
    expect(verifyCommerceControlPassword("wrong-password")).toBe(false);
    const token = createCommerceControlSession(1_000);
    expect(verifyCommerceControlSession(token, 2_000)).toBe(true);
    expect(verifyCommerceControlSession(`${token}x`, 2_000)).toBe(false);
    expect(verifyCommerceControlSession(token, 9 * 60 * 60 * 1000)).toBe(false);
  });

  test("rate limits repeated login attempts", () => {
    for (let index = 0; index < 5; index += 1) expect(consumeLoginAttempt("same-client", 1_000).allowed).toBe(true);
    expect(consumeLoginAttempt("same-client", 1_000)).toMatchObject({ allowed: false });
  });
});
