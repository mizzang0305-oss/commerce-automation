"use client";

import { useState } from "react";
import Link from "next/link";
import type { N8nConfigStatus } from "@/lib/server/env";
import { WebhookStatusCard } from "@/components/WebhookStatusCard";

type WebhookTestLog = {
  id: string;
  label: string;
  message: string;
  requestId?: string;
  responseStatus?: number;
  safeSummary?: string;
};

export function WebhookTestPanel({ diagnostics, sampleItemId }: { diagnostics: N8nConfigStatus; sampleItemId: string }) {
  const [logs, setLogs] = useState<WebhookTestLog[]>([]);
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
        {
          id: `${Date.now()}-${label}`,
          label,
          message: payload.message ?? "응답 메시지 없음",
          requestId: payload.request_id,
          responseStatus: payload.response_status ?? response.status,
          safeSummary: payload.safe_summary
        },
        ...current
      ]);
    } catch {
      setLogs((current) => [
        {
          id: `${Date.now()}-${label}`,
          label,
          message: "호출 실패",
          responseStatus: 0
        },
        ...current
      ]);
    } finally {
      setLoading("");
    }
  }

  return (
    <div className="space-y-6">
      <WebhookStatusCard diagnostics={diagnostics} />
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-bold text-slate-950">n8n Webhook 연결 테스트</h1>
        <p className="mt-2 text-sm text-slate-500">
          실제 URL, secret, 인증 헤더 값은 표시하지 않습니다. 결과는 safe summary로만 기록됩니다.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <WebhookButton label="Test nightly scout" loading={loading} onClick={() => call("Test nightly scout", "/api/run/nightly-scout")} />
          <WebhookButton label="Test next batch" loading={loading} onClick={() => call("Test next batch", "/api/run/next-batch")} dark />
          <WebhookButton
            label="Test retry item"
            loading={loading}
            onClick={() => call("Test retry item", "/api/run/retry-item", { id: sampleItemId })}
            subtle
          />
          {diagnostics.holdItemConfigured ? (
            <WebhookButton
              label="Test hold item"
              loading={loading}
              onClick={() => call("Test hold item", "/api/queue/hold", { id: sampleItemId })}
              subtle
            />
          ) : null}
          {diagnostics.skipItemConfigured ? (
            <WebhookButton
              label="Test skip item"
              loading={loading}
              onClick={() => call("Test skip item", "/api/queue/skip", { id: sampleItemId })}
              subtle
            />
          ) : null}
        </div>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-950">결과 로그</h2>
          <Link href="/runs" className="text-sm font-semibold text-teal-700">
            automation_runs 보기
          </Link>
        </div>
        <div className="mt-4 space-y-3">
          {logs.length === 0 ? (
            <p className="text-sm text-slate-500">아직 테스트 로그가 없습니다.</p>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-700">
                <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                  <span>{log.label}</span>
                  <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-600">
                    status {log.responseStatus ?? "-"}
                  </span>
                </div>
                <p className="mt-2">{log.message}</p>
                <p className="mt-1 text-xs text-slate-500">request_id: {log.requestId ?? "-"}</p>
                {log.safeSummary ? (
                  <p className="mt-1 break-words text-xs text-slate-500">safe summary: {log.safeSummary}</p>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function WebhookButton({
  label,
  loading,
  onClick,
  dark = false,
  subtle = false
}: {
  label: string;
  loading: string;
  onClick: () => void;
  dark?: boolean;
  subtle?: boolean;
}) {
  const className = subtle
    ? "focus-ring rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:bg-slate-100"
    : dark
      ? "focus-ring rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
      : "focus-ring rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-300";

  return (
    <button type="button" disabled={Boolean(loading)} onClick={onClick} className={className}>
      {loading === label ? "호출 중" : label}
    </button>
  );
}
