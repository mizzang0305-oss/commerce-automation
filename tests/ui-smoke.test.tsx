import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { DashboardView } from "@/components/DashboardView";
import { DevScenarioPanel } from "@/components/DevScenarioPanel";
import { QueueTable } from "@/components/QueueTable";
import { SettingsForm } from "@/components/SettingsForm";
import { WebhookTestPanel } from "@/components/WebhookTestPanel";
import { createDefaultSettings } from "@/lib/repositories/mockAutomationRepository";
import { getQueueSummary } from "@/lib/status";
import { createQueueItemFixture } from "@/test/fixtures";

describe("ui smoke", () => {
  test("renders dashboard", () => {
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
      />
    );

    expect(screen.getByText("자동화 관제실")).toBeInTheDocument();
  });

  test("renders settings form", () => {
    render(<SettingsForm initialSettings={createDefaultSettings()} />);

    expect(screen.getByLabelText("하루 생성 상품 수")).toBeInTheDocument();
  });

  test("renders queue table", () => {
    render(<QueueTable items={[createQueueItemFixture({ product_name: "테스트 상품" })]} />);

    expect(screen.getByText("테스트 상품")).toBeInTheDocument();
  });

  test("renders dev test lab", () => {
    render(
      <DevScenarioPanel
        settings={createDefaultSettings()}
        repositoryInfo={{ adapter: "local-json", dataDir: "C:/tmp/commerce-data" }}
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
      />
    );

    expect(screen.getByText("Mock 큐 69개 생성")).toBeInTheDocument();
    expect(screen.getByText("현재 저장소 어댑터")).toBeInTheDocument();
    expect(screen.getByText("local-json")).toBeInTheDocument();
    expect(screen.getByText(/서버 재시작 후 유지/)).toBeInTheDocument();
  });

  test("shows disabled public upload UI when YouTube upload is disabled", () => {
    render(<SettingsForm initialSettings={createDefaultSettings()} />);

    expect(screen.getByRole("button", { name: "자동 공개 업로드 비활성화" })).toBeDisabled();
  });

  test("renders capacity warning on settings when interval is too sparse", () => {
    render(<SettingsForm initialSettings={createDefaultSettings({ interval_hours: 3 })} />);

    expect(screen.getByText("현재 설정으로는 하루 69개를 모두 처리할 수 없습니다. 처리 가능량: 24개")).toBeInTheDocument();
  });

  test("renders webhook diagnostics and optional hold/skip tests", () => {
    render(
      <WebhookTestPanel
        sampleItemId="queue-001"
        diagnostics={{
          nightlyScoutConfigured: false,
          nextBatchConfigured: false,
          retryItemConfigured: false,
          secretConfigured: false,
          callbackBaseUrlConfigured: false,
          callbackSecretConfigured: false,
          holdItemConfigured: true,
          skipItemConfigured: true
        }}
      />
    );

    expect(screen.getByText("Nightly scout webhook")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test hold item" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test skip item" })).toBeInTheDocument();
  });
});
