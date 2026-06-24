import { describe, expect, it, vi } from "vitest";

import {
  COUPANG_SCOUT_SIDE_EFFECTS,
  buildCoupangScoutCompatibilityDiagnostic,
  buildCoupangScoutRequestContract,
  classifyCoupangScoutApiResponse,
  normalizeCoupangScoutKeyword
} from "@/lib/coupang/scoutCompatibility";
import { buildRealProductAutoPilot } from "@/lib/uploads/youtube/realProductAutoPilotBuilder";
import type { ProductAsset, ProductCandidate, ProductQueueItem } from "@/types/automation";

type TestRepository = {
  getProductCandidates: () => Promise<ProductCandidate[]>;
  getQueue: () => Promise<ProductQueueItem[]>;
  getProductAssets: () => Promise<ProductAsset[]>;
};

let mockRepository: TestRepository;

vi.mock("@/lib/repositories/automationRepository", () => ({
  getAutomationRepository: () => mockRepository
}));

describe("Coupang scout compatibility diagnostics", () => {
  it("maps HTTP 200 with code=400 keyword is invalid to a scout keyword blocker", () => {
    const result = classifyCoupangScoutApiResponse({
      http_status: 200,
      body: { code: "400", message: "keyword is invalid" }
    });

    expect(result.ok).toBe(false);
    expect(result.classification).toBe("COUPANG_SCOUT_KEYWORD_INVALID");
    expect(result.blocked_reasons).toEqual(["coupang_scout_keyword_invalid"]);
    expect(result.side_effects).toEqual(COUPANG_SCOUT_SIDE_EFFECTS);
  });

  it("maps Coupang Partners rCode/rMessage keyword errors without exposing raw request data", () => {
    const result = classifyCoupangScoutApiResponse({
      http_status: 200,
      body: { rCode: "400", rMessage: "keyword is invalid" }
    });
    const serialized = JSON.stringify(result);

    expect(result.ok).toBe(false);
    expect(result.classification).toBe("COUPANG_SCOUT_KEYWORD_INVALID");
    expect(result.external_call_allowed).toBe(false);
    expect(result.side_effects).toEqual(COUPANG_SCOUT_SIDE_EFFECTS);
    expect(serialized).not.toMatch(/Authorization|Bearer|HmacSHA256|access-key|secret|signature/i);
  });

  it("accepts Coupang Partners data.productData success response shape", () => {
    const result = classifyCoupangScoutApiResponse({
      http_status: 200,
      body: {
        rCode: "0",
        rMessage: "",
        data: {
          productData: [
            {
              productName: "safe product name",
              productUrl: "https://link.example.test/masked",
              productImage: "https://image.example.test/masked.jpg"
            }
          ]
        }
      }
    });
    const serialized = JSON.stringify(result);

    expect(result.ok).toBe(true);
    expect(result.classification).toBe("COUPANG_SCOUT_READY");
    expect(result.external_call_allowed).toBe(true);
    expect(serialized).not.toContain("https://link.example.test");
    expect(serialized).not.toContain("https://image.example.test");
  });

  it("maps auth signature and expiry failures separately", () => {
    expect(classifyCoupangScoutApiResponse({
      http_status: 401,
      body: { message: "Invalid signature." }
    }).classification).toBe("COUPANG_SCOUT_AUTH_SIGNATURE_INVALID");
    expect(classifyCoupangScoutApiResponse({
      http_status: 401,
      body: { message: "Specified signature is expired." }
    }).classification).toBe("COUPANG_SCOUT_AUTH_SIGNATURE_EXPIRED");
  });

  it("maps a generic HTTP 401 to a fresh-approval auth blocker without side effects", () => {
    const diagnostic = classifyCoupangScoutApiResponse({
      http_status: 401,
      body: {}
    });

    expect(diagnostic.ok).toBe(false);
    expect(diagnostic.classification).toBe("COUPANG_PARTNERS_API_HTTP_401");
    expect(diagnostic.external_call_allowed).toBe(false);
    expect(diagnostic.next_auto_action).toBe("FIX_COUPANG_PARTNERS_AUTHORIZATION");
    expect(diagnostic.side_effects).toEqual(COUPANG_SCOUT_SIDE_EFFECTS);
  });

  it("blocks endpoint family mismatch before an external call", () => {
    const diagnostic = buildCoupangScoutCompatibilityDiagnostic({
      api_family: "seller_openapi",
      keywords: ["청소솔"]
    });

    expect(diagnostic.ok).toBe(false);
    expect(diagnostic.classification).toBe("COUPANG_SCOUT_ENDPOINT_FAMILY_MISMATCH");
    expect(diagnostic.external_call_allowed).toBe(false);
    expect(diagnostic.side_effects.db_written).toBe(false);
  });

  it("rejects empty keywords and normalizes Korean keywords deterministically", () => {
    expect(normalizeCoupangScoutKeyword("  ")).toEqual({
      ok: false,
      reason: "empty_keyword"
    });
    expect(normalizeCoupangScoutKeyword(" 청소솔 ")).toEqual({
      ok: true,
      normalized_keyword: "청소솔",
      encoded_keyword: "%EC%B2%AD%EC%86%8C%EC%86%94"
    });
  });

  it("builds a safe request contract without raw keyword, signature, header, or URL", () => {
    const contract = buildCoupangScoutRequestContract({
      keyword: "청소솔",
      api_family: "partners_affiliate"
    });
    const serialized = JSON.stringify(contract);

    expect(contract.ok).toBe(true);
    expect(contract.method).toBe("GET");
    expect(contract.endpoint_family).toBe("partners_affiliate");
    expect(contract.keyword_policy.raw_keyword_printed).toBe(false);
    expect(contract.keyword_policy.normalized_keyword_present).toBe(true);
    expect(contract.keyword_policy.encoded_keyword_present).toBe(true);
    expect(contract.signing_contract?.query_includes_question_mark).toBe(false);
    expect(serialized).not.toContain("청소솔");
    expect(serialized).not.toMatch(/Authorization|Bearer|signature|secret|access-key/i);
    expect(serialized).not.toContain("https://api-gateway.coupang.com");
  });

  it("bounds keyword attempts to three safe labels", () => {
    const diagnostic = buildCoupangScoutCompatibilityDiagnostic({
      api_family: "partners_affiliate",
      keywords: ["청소솔", "텀블러", "멀티탭", "물티슈"]
    });

    expect(diagnostic.ok).toBe(true);
    expect(diagnostic.keyword_attempts).toHaveLength(3);
    expect(diagnostic.keyword_attempts.map((item) => item.label)).toEqual(["keyword_1", "keyword_2", "keyword_3"]);
    expect(JSON.stringify(diagnostic)).not.toContain("청소솔");
  });

  it("separates scout request failures from missing candidate auto-pilot failures", () => {
    const scoutDiagnostic = classifyCoupangScoutApiResponse({
      http_status: 200,
      body: { code: "400", message: "keyword is invalid" }
    });
    const result = buildRealProductAutoPilot({
      candidates: [],
      queueItems: [],
      productAssets: [],
      scout_diagnostic: scoutDiagnostic
    });

    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("COUPANG_SCOUT_KEYWORD_INVALID");
    expect(result.blocked_reasons).toEqual(["coupang_scout_keyword_invalid"]);
    expect(result.next_auto_action).toBe("FIX_COUPANG_SCOUT_REQUEST_CONTRACT");
    expect(result.side_effects).toEqual({
      youtube_execute_called: false,
      youtube_upload_executed: false,
      videos_insert_called: false,
      db_written: false,
      r2_uploaded: false,
      queue_created: false,
      worker_job_created: false,
      upload_package_created: false
    });
  });

  it("returns scout compatibility errors through the real product auto-pilot API", async () => {
    mockRepository = {
      getProductCandidates: vi.fn(async () => []),
      getQueue: vi.fn(async () => []),
      getProductAssets: vi.fn(async () => [])
    };
    const scoutDiagnostic = classifyCoupangScoutApiResponse({
      http_status: 200,
      body: { code: "400", message: "keyword is invalid" }
    });
    const { POST } = await import("../app/api/uploads/youtube/real-product-pilot/auto-prepare/route");

    const response = await POST(new Request("http://localhost/api/uploads/youtube/real-product-pilot/auto-prepare", {
      method: "POST",
      body: JSON.stringify({ mode: "dry_run", scout_diagnostic: scoutDiagnostic })
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error_code).toBe("COUPANG_SCOUT_KEYWORD_INVALID");
    expect(body.blocked_reasons).toEqual(["coupang_scout_keyword_invalid"]);
    expect(body.next_auto_action).toBe("FIX_COUPANG_SCOUT_REQUEST_CONTRACT");
    expect(body.side_effects.db_written).toBe(false);
    expect(body.side_effects.youtube_execute_called).toBe(false);
  });

  it("ignores non-error or unknown scout diagnostic classifications in the API", async () => {
    mockRepository = {
      getProductCandidates: vi.fn(async () => []),
      getQueue: vi.fn(async () => []),
      getProductAssets: vi.fn(async () => [])
    };
    const { POST } = await import("../app/api/uploads/youtube/real-product-pilot/auto-prepare/route");

    const readyDiagnosticResponse = await POST(new Request("http://localhost/api/uploads/youtube/real-product-pilot/auto-prepare", {
      method: "POST",
      body: JSON.stringify({
        mode: "dry_run",
        scout_diagnostic: {
          ok: false,
          classification: "COUPANG_SCOUT_READY",
          blocked_reasons: ["should_not_pass"]
        }
      })
    }));
    const unknownDiagnosticResponse = await POST(new Request("http://localhost/api/uploads/youtube/real-product-pilot/auto-prepare", {
      method: "POST",
      body: JSON.stringify({
        mode: "dry_run",
        scout_diagnostic: {
          ok: false,
          classification: "COUPANG_SCOUT_UNRECOGNIZED",
          blocked_reasons: ["should_not_pass"]
        }
      })
    }));

    expect((await readyDiagnosticResponse.json()).error_code).toBe("AUTO_REAL_PRODUCT_REQUIRED");
    expect((await unknownDiagnosticResponse.json()).error_code).toBe("AUTO_REAL_PRODUCT_REQUIRED");
  });

  it("does not expose secrets, raw HMAC, Authorization, or URLs in diagnostics", () => {
    const diagnostic = buildCoupangScoutCompatibilityDiagnostic({
      api_family: "partners_affiliate",
      keywords: ["청소솔"]
    });
    const serialized = JSON.stringify(diagnostic);

    expect(serialized).not.toMatch(/Authorization|Bearer|HmacSHA256|access-key|secret|signature/i);
    expect(serialized).not.toContain("https://api-gateway.coupang.com");
    expect(diagnostic.side_effects.youtube_execute_called).toBe(false);
    expect(diagnostic.side_effects.db_written).toBe(false);
    expect(diagnostic.side_effects.r2_uploaded).toBe(false);
    expect(diagnostic.side_effects.queue_created).toBe(false);
  });
});
