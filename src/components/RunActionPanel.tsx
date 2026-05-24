"use client";

import { useState } from "react";
import { Play, RefreshCw, SearchCheck } from "lucide-react";
import type { AutomationSettings } from "@/types/automation";
import type { N8nConfigStatus } from "@/lib/server/env";

type ActionKey = "nightly" | "batch" | "diagnostics";

export function RunActionPanel({ settings, diagnostics }: { settings: AutomationSettings; diagnostics: N8nConfigStatus }) {
  const [loading, setLoading] = useState<ActionKey | null>(null);
  const [message, setMessage] = useState<string>("");

  async function runAction(key: ActionKey, endpoint: string) {
    setLoading(key);
    setMessage("");
    try {
      const response = await fetch(endpoint, { method: key === "diagnostics" ? "GET" : "POST" });
      const payload = await response.json();
      setMessage(payload.message ?? payload.scheduler?.warning ?? "진단이 완료되었습니다.");
    } catch {
      setMessage("요청 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(null);
    }
  }

  const scoutDisabled = settings.is_paused || !diagnostics.nightlyScoutConfigured || !diagnostics.secretConfigured || loading !== null;
  const batchDisabled = settings.is_paused || !settings.python_worker_enabled || !settings.allowed_worker_job_types.includes("video_render") || loading !== null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-950">수동 실행</h2>
          <p className="mt-1 text-sm text-slate-500">다음 배치는 n8n webhook이 아니라 worker_jobs를 생성합니다.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={scoutDisabled} onClick={() => runAction("nightly", "/api/run/nightly-scout")} className="focus-ring inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-200 disabled:text-slate-500">
            <SearchCheck size={16} aria-hidden="true" />
            {loading === "nightly" ? "실행 중" : "오늘 상품 수집"}
          </button>
          <button type="button" disabled={batchDisabled} onClick={() => runAction("batch", "/api/run/next-batch")} className="focus-ring inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-200 disabled:text-slate-500">
            <Play size={16} aria-hidden="true" />
            {loading === "batch" ? "실행 중" : "다음 배치 실행"}
          </button>
          <button type="button" disabled={loading !== null} onClick={() => runAction("diagnostics", "/api/dev/diagnostics")} className="focus-ring inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <RefreshCw size={16} aria-hidden="true" />
            Webhook 설정 테스트
          </button>
        </div>
      </div>
      {settings.is_paused ? <p className="mt-4 rounded-lg bg-yellow-50 px-3 py-2 text-sm font-semibold text-yellow-800">자동화가 일시 정지 상태라 실행 버튼이 비활성화됩니다.</p> : null}
      {!settings.python_worker_enabled ? <p className="mt-4 rounded-lg bg-yellow-50 px-3 py-2 text-sm font-semibold text-yellow-800">Python Worker가 꺼져 있어 next-batch를 실행할 수 없습니다.</p> : null}
      {message ? <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">{message}</p> : null}
    </section>
  );
}
