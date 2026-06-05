import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { DashboardView } from "@/components/DashboardView";
import { buildProductionReadinessSummary } from "@/lib/ops/productionReadiness";
import { createDefaultSettings } from "@/lib/repositories/mockAutomationRepository";
import { getQueueSummary } from "@/lib/status";
import { createQueueItemFixture } from "@/test/fixtures";

describe("dashboard analytics summary", () => {
  test("renders candidate analytics and artifact QA productivity summaries without deploy or upload controls", () => {
    const settings = createDefaultSettings();
    const items = [createQueueItemFixture()];

    render(
      <DashboardView
        settings={settings}
        items={items}
        summary={getQueueSummary(items)}
        runs={[]}
        diagnostics={{
          nightlyScoutConfigured: false,
          nextBatchConfigured: false,
          retryItemConfigured: false,
          secretConfigured: false,
          callbackBaseUrlConfigured: false,
          callbackSecretConfigured: false,
          holdItemConfigured: false,
          skipItemConfigured: false
        }}
        productionReadiness={buildProductionReadinessSummary()}
        candidateSummary={{
          total: 4,
          collected: 3,
          promoted: 1,
          duplicate: 1,
          manual_review: 0
        }}
        candidateAnalyticsSummary={{
          top_keyword: "storage",
          avg_final_score: 74,
          duplicate_rate: 0.25,
          risk_heavy_keywords: ["fragile"]
        }}
        artifactQaSummary={{
          total: 4,
          pending: 2,
          passed: 1,
          needs_fix: 1,
          rejected: 0,
          missing_video: 0,
          missing_thumbnail: 0,
          missing_subtitle: 0,
          missing_upload_package: 1
        }}
        artifactQaProductivitySummary={{
          pending_queue_count: 2,
          needs_fix_count: 1,
          missing_assets_count: 1,
          today_reviewed_count: 1
        }}
      />
    );

    expect(screen.getByText("Candidate Analytics Summary")).toBeInTheDocument();
    expect(screen.getByText("Artifact QA Productivity Summary")).toBeInTheDocument();
    expect(screen.getByText("Top keyword")).toBeInTheDocument();
    expect(screen.getByText("storage")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /deploy/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upload/i })).not.toBeInTheDocument();
  });
});
