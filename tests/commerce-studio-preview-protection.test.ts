import { describe, expect, it } from "vitest";
import { studioPreviewProtectionHeaders } from "@/lib/commerce-studio/bridge/previewProtection";

const origin = "https://commerce-automation-git-studio-example.vercel.app";

describe("Commerce Studio protected Preview transport", () => {
  it("keeps the bypass header absent unless a secret is configured", () => {
    expect(studioPreviewProtectionHeaders({ endpoint: origin, allowedOrigin: undefined, bypassSecret: undefined })).toEqual({});
  });

  it("uses a header only for the exact allowed HTTPS Vercel origin", () => {
    expect(studioPreviewProtectionHeaders({ endpoint: origin, allowedOrigin: origin, bypassSecret: "test-only-secret" }))
      .toEqual({ "x-vercel-protection-bypass": "test-only-secret" });
  });

  it.each([
    ["another Preview", "https://another-preview.vercel.app", origin],
    ["another Vercel project", "https://different-project-preview.vercel.app", "https://different-project-preview.vercel.app"],
    ["external origin", "https://example.com", "https://example.com"],
    ["lookalike hostname", "https://preview.vercel.app.evil.test", "https://preview.vercel.app.evil.test"],
    ["insecure transport", "http://preview.vercel.app", "http://preview.vercel.app"],
    ["URL path", `${origin}/nested`, `${origin}/nested`],
    ["missing allowlist", origin, ""],
  ])("rejects %s without exposing the bypass secret", (_case, endpoint, allowedOrigin) => {
    expect(() => studioPreviewProtectionHeaders({ endpoint, allowedOrigin, bypassSecret: "test-only-secret" }))
      .toThrow("STUDIO_PREVIEW_BYPASS_ORIGIN_INVALID");
  });
});
