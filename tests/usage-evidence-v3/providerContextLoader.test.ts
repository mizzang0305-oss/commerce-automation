import { describe, expect, test } from "vitest";
import {
  CAPACITY_PROOF_SAFETY_ENV,
  injectProcessOnlyCoupangProviderEnv,
  parseWhitelistedCoupangProviderEnv
} from "@/lib/usage-evidence/liveCapacityProof";

describe("V3 provider context loader", () => {
  test("loads only Coupang aliases and ignores unrelated credentials", () => {
    const parsed = parseWhitelistedCoupangProviderEnv([
      "COUPANG_ACCESS_KEY=access",
      "COUPANG_SECRET_KEY='secret'",
      "COUPANG_PARTNER_ID=partner",
      "GOOGLE_APPLICATION_CREDENTIALS=blocked",
      "SUPABASE_SERVICE_ROLE_KEY=blocked",
      "UNKNOWN_KEY=blocked"
    ].join("\n"));
    expect(parsed.values).toEqual({
      COUPANG_ACCESS_KEY: "access",
      COUPANG_SECRET_KEY: "secret",
      COUPANG_PARTNER_ID: "partner"
    });
    expect(parsed.ignoredKeyCount).toBe(3);
  });

  test("forces no-upload flags after process-only injection", () => {
    const env: NodeJS.ProcessEnv = {};
    injectProcessOnlyCoupangProviderEnv("COUPANG_PARTNERS_PROVIDER_ENABLED=true\nPUBLIC_UPLOAD=true", env);
    expect(env.COUPANG_PARTNERS_PROVIDER_ENABLED).toBe("true");
    expect(env.PUBLIC_UPLOAD).toBe("false");
    expect(env.QUEUE_SCHEDULER_ENABLED).toBe("false");
    expect(env.GOOGLE_SHEETS_WRITE).toBe("0");
    expect(CAPACITY_PROOF_SAFETY_ENV.PLATFORM_UPLOAD).toBe("0");
  });
});
