import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { DashboardView } from "@/components/DashboardView";
import { buildProductionReadinessSummary } from "@/lib/ops/productionReadiness";
import { createDefaultSettings } from "@/lib/repositories/mockAutomationRepository";
import { getQueueSummary } from "@/lib/status";
import { createQueueItemFixture } from "@/test/fixtures";

describe("dashboard ops panels", () => {
  test("renders production readiness, collector, and artifact QA summaries", () => {
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
        productionReadiness={buildProductionReadinessSummary({
          repositoryAdapter: "supabase",
          supabaseUrlConfigured: true,
          supabaseServiceRoleConfigured: true,
          storageBackend: "r2",
          publicStorageBaseUrlConfigured: true,
          workerApiSecretConfigured: true,
          publicAppBaseUrlConfigured: true,
          devToolsEnabled: false,
          contentAiProvider: "template",
          openAiConfigured: false,
          geminiConfigured: false,
          youtubeUploadEnabled: false,
          publicUploadEnabled: false,
          workerJobCount: 0,
          queueReadyCount: 0,
          artifactQaPendingCount: 1,
          artifactQaNeedsFixCount: 0,
          candidateManualReviewCount: 0,
          secretsExposedToClient: false
        })}
        candidateSummary={{
          total: 3,
          collected: 2,
          promoted: 1,
          duplicate: 0,
          manual_review: 0
        }}
        artifactQaSummary={{
          total: 4,
          pending: 1,
          passed: 2,
          needs_fix: 1,
          rejected: 0,
          missing_video: 0,
          missing_thumbnail: 0,
          missing_subtitle: 0,
          missing_upload_package: 0
        }}
      />
    );

    expect(screen.getByText("Production Readiness")).toBeInTheDocument();
    expect(screen.getByText("Candidate Collector")).toBeInTheDocument();
    expect(screen.getByText("Worker Artifact QA")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Duplicates")).toBeInTheDocument();
  });
});
