"use client";

import { useState } from "react";
import type { N8nConfigStatus } from "@/lib/server/env";
import { WebhookStatusCard } from "@/components/WebhookStatusCard";

export function WebhookTestPanel({ diagnostics, sampleItemId }: { diagnostics: N8nConfigStatus; sampleItemId: string }) {
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState("");

  async function call(label: string, endpoint: string, body?: Record<string, string>) {
    setLoading(label);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
      });
      const payload = await response.json();
      setLogs((current) => [
        `${new Date().toLocaleTimeString("ko-KR")} ${label}: ${payload.message ?? "응답 메시지 없음"}`,
        ...current
      ]);
    } catch {
      setLogs((current) => [`${new Date().toLocaleTimeString("ko-KR")} ${label}: 호출 실패`, ...current]);
    } finally {
      setLoading("");
    }
  }

  return (
    <div className="space-y-6">
      <WebhookStatusCard diagnostics={diagnostics} />
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-bold text-slate-950">n8n Webhook 연결 테스트</h1>
        <p className="mt-2 text-sm text-slate-500">실제 env 값은 표시하지 않습니다. 실패 시 safe Korean error만 보여줍니다.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={Boolean(loading)}
            onClick={() => call("Test nightly scout", "/api/run/nightly-scout")}
            className="focus-ring rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
          >
            {loading === "Test nightly scout" ? "호출 중" : "Test nightly scout"}
          </button>
          <button
            type="button"
            disabled={Boolean(loading)}
            onClick={() => call("Test next batch", "/api/run/next-batch")}
            className="focus-ring rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
          >
            {loading === "Test next batch" ? "호출 중" : "Test next batch"}
          </button>
          <button
            type="button"
            disabled={Boolean(loading)}
            onClick={() => call("Test retry item", "/api/run/retry-item", { id: sampleItemId })}
            className="focus-ring rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:bg-slate-100"
          >
            {loading === "Test retry item" ? "호출 중" : "Test retry item"}
          </button>
          {diagnostics.holdItemConfigured ? (
            <button
              type="button"
              disabled={Boolean(loading)}
              onClick={() => call("Test hold item", "/api/queue/hold", { id: sampleItemId })}
              className="focus-ring rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:bg-slate-100"
            >
              {loading === "Test hold item" ? "호출 중" : "Test hold item"}
            </button>
          ) : null}
          {diagnostics.skipItemConfigured ? (
            <button
              type="button"
              disabled={Boolean(loading)}
              onClick={() => call("Test skip item", "/api/queue/skip", { id: sampleItemId })}
              className="focus-ring rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:bg-slate-100"
            >
              {loading === "Test skip item" ? "호출 중" : "Test skip item"}
            </button>
          ) : null}
        </div>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-950">결과 로그</h2>
        <div className="mt-4 space-y-2">
          {logs.length === 0 ? (
            <p className="text-sm text-slate-500">아직 테스트 로그가 없습니다.</p>
          ) : (
            logs.map((log, index) => (
              <p key={`${log}-${index}`} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {log}
              </p>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
