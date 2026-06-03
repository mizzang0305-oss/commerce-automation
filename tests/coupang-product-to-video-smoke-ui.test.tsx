import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { DevScenarioPanel } from "@/components/DevScenarioPanel";
import { createDefaultSettings } from "@/lib/repositories/mockAutomationRepository";

const diagnostics = {
  nightlyScoutConfigured: false,
  nextBatchConfigured: false,
  retryItemConfigured: false,
  secretConfigured: false,
  callbackBaseUrlConfigured: false,
  callbackSecretConfigured: false,
  holdItemConfigured: false,
  skipItemConfigured: false
};

describe("Coupang product-to-video smoke UI", () => {
  test("renders stepwise smoke controls and external worker instruction", () => {
    render(
      <DevScenarioPanel
        settings={createDefaultSettings()}
        repositoryInfo={{ adapter: "supabase", dataDir: "server-only" }}
        diagnostics={diagnostics}
      />
    );

    expect(screen.getByText("쿠팡 상품 → 쇼츠 영상 E2E Smoke")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "샘플 쿠팡 후보 생성" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "후보를 큐로 승격" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "콘텐츠 초안 생성" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다음 배치 실행" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "상태 새로고침" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "채널 업로드 패키지 생성" })).toBeInTheDocument();
    expect(screen.getByText("WebApp은 Python Worker를 직접 실행하지 않습니다.")).toBeInTheDocument();
    expect(screen.getByText(/\.\\\.venv\\Scripts\\python worker\.py/)).toBeInTheDocument();
    expect(screen.getByText("YouTube/TikTok/Threads 업로드는 비활성화 상태입니다.")).toBeInTheDocument();
  });
});
