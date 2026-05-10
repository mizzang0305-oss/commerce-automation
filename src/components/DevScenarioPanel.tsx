"use client";

import { useState } from "react";
import type { AutomationSettings } from "@/types/automation";
import type { N8nConfigStatus } from "@/lib/server/env";
import type { RepositoryRuntimeInfo } from "@/lib/repositories/repositoryFactory";
import { getDailyCapacity, getDailyCapacityWarning, getNextRunAt } from "@/lib/scheduler";
import { WebhookStatusCard } from "@/components/WebhookStatusCard";

export function DevScenarioPanel({
  settings,
  repositoryInfo,
  diagnostics
}: {
  settings: AutomationSettings;
  repositoryInfo: RepositoryRuntimeInfo;
  diagnostics: N8nConfigStatus;
}) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState("");
  const [diagnosticPayload, setDiagnosticPayload] = useState<string>("");

  async function runDevAction(label: string, endpoint: string, body?: Record<string, string>) {
    setLoading(label);
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: endpoint.includes("diagnostics") ? "GET" : "POST",
        headers: { "Content-Type": "application/json" },
        body: endpoint.includes("diagnostics") ? undefined : JSON.stringify(body ?? {})
      });
      const payload = await response.json();
      setMessage(payload.message ?? "요청이 처리되었습니다.");
      if (endpoint.includes("diagnostics")) {
        setDiagnosticPayload(JSON.stringify(payload.safeSamplePayload ?? payload.diagnostics, null, 2));
      }
    } catch {
      setMessage("개발용 요청 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading("");
    }
  }

  const capacityWarning = getDailyCapacityWarning(settings);
  const buttonClass =
    "focus-ring rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-300";

  return (
    <div className="space-y-6">
      {process.env.NODE_ENV === "production" ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          개발/테스트 페이지입니다. 운영 환경에서는 제한해야 합니다.
        </div>
      ) : null}
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-bold text-slate-950">개발 테스트 랩</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={Boolean(loading)}
            onClick={() => runDevAction("reset-storage", "/api/dev/reset-storage")}
            className={buttonClass}
          >
            Local JSON 저장소 초기화
          </button>
          <button
            type="button"
            disabled={Boolean(loading)}
            onClick={() => runDevAction("seed", "/api/dev/seed", { mode: "default" })}
            className={buttonClass}
          >
            Mock 큐 69개 생성
          </button>
          <button
            type="button"
            disabled={Boolean(loading)}
            onClick={() => runDevAction("reset", "/api/dev/reset-settings")}
            className={buttonClass}
          >
            설정 기본값 복구
          </button>
          <button
            type="button"
            disabled={Boolean(loading)}
            onClick={() => runDevAction("error", "/api/dev/seed", { mode: "error-sample" })}
            className={buttonClass}
          >
            오류 샘플 생성
          </button>
          <button
            type="button"
            disabled={Boolean(loading)}
            onClick={() => runDevAction("transition", "/api/dev/seed", { mode: "simulate-transition" })}
            className={buttonClass}
          >
            상태 전환 시뮬레이션
          </button>
          <button
            type="button"
            disabled={Boolean(loading)}
            onClick={() => runDevAction("status-sample", "/api/dev/seed", { mode: "default" })}
            className={buttonClass}
          >
            상태별 샘플 생성
          </button>
          <button
            type="button"
            disabled={Boolean(loading)}
            onClick={() => runDevAction("diagnostics", "/api/dev/diagnostics")}
            className="focus-ring rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
          >
            Webhook dry-run
          </button>
        </div>
        {message ? <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</p> : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">현재 저장소 어댑터</h2>
          <p className="mt-3 text-2xl font-bold text-slate-900">{repositoryInfo.adapter}</p>
          <p className="mt-2 break-all text-sm text-slate-500">
            {repositoryInfo.dataDir ?? "memory adapter는 파일 저장소를 사용하지 않습니다."}
          </p>
          <p className="mt-2 text-sm font-semibold text-teal-700">
            local-json은 서버 재시작 후 유지 확인이 가능합니다.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">다음 실행 시간 계산</h2>
          <p className="mt-3 text-2xl font-bold text-slate-900">{getNextRunAt(settings).toLocaleString("ko-KR")}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">하루 처리 가능량 계산</h2>
          <p className="mt-3 text-2xl font-bold text-slate-900">{getDailyCapacity(settings)}개</p>
          {capacityWarning ? <p className="mt-2 text-sm font-semibold text-yellow-800">{capacityWarning}</p> : null}
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">Upload Guard 테스트</h2>
          <p className="mt-3 text-sm text-slate-700">
            YouTube 자동 업로드: {settings.youtube_upload_enabled ? "활성" : "비활성"} / 공개 제한{" "}
            {settings.max_daily_uploads}개
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">ready_for_manual_upload 조건 테스트</h2>
          <p className="mt-3 text-sm text-slate-700">
            영상 URL, 블로그 초안 URL, 제휴 링크, 제휴 고지 문구가 모두 있어야 업로드 준비 상태로 전환됩니다.
          </p>
        </div>
      </section>

      <WebhookStatusCard diagnostics={diagnostics} />
      {diagnosticPayload ? (
        <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{diagnosticPayload}</pre>
      ) : null}
    </div>
  );
}
