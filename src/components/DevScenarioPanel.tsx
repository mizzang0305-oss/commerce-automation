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
  const buttonClass = "focus-ring rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-300";

  return (
    <div className="space-y-6">
      {process.env.NODE_ENV === "production" ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          개발/테스트 페이지입니다. 운영 환경에서는 접근을 제한해야 합니다.
        </div>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-bold text-slate-950">스모크 테스트 실험실</h1>
        <p className="mt-2 text-sm text-slate-500">로컬 JSON 저장소와 worker smoke flow를 안전하게 확인합니다.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={Boolean(loading)} onClick={() => runDevAction("reset-storage", "/api/dev/reset-storage")} className={buttonClass}>
            Local JSON 저장소 초기화
          </button>
          <button type="button" disabled={Boolean(loading)} onClick={() => runDevAction("seed", "/api/dev/seed", { mode: "default" })} className={buttonClass}>
            Mock 큐 69개 생성
          </button>
          <button type="button" disabled={Boolean(loading)} onClick={() => runDevAction("reset", "/api/dev/reset-settings")} className={buttonClass}>
            설정 기본값 복구
          </button>
          <button type="button" disabled={Boolean(loading)} onClick={() => runDevAction("error", "/api/dev/seed", { mode: "error-sample" })} className={buttonClass}>
            오류 샘플 생성
          </button>
          <button type="button" disabled={Boolean(loading)} onClick={() => runDevAction("transition", "/api/dev/seed", { mode: "simulate-transition" })} className={buttonClass}>
            상태 전환 시뮬레이션
          </button>
          <button type="button" disabled={Boolean(loading)} onClick={() => runDevAction("worker-smoke", "/api/dev/seed", { mode: "worker-smoke" })} className={buttonClass}>
            워커 스모크용 상품 생성
          </button>
          <button type="button" disabled={Boolean(loading)} onClick={() => runDevAction("candidate-video-smoke", "/api/dev/seed", { mode: "candidate-video-smoke" })} className={buttonClass}>
            후보→영상 스모크 후보 생성
          </button>
          <button type="button" disabled={Boolean(loading)} onClick={() => runDevAction("diagnostics", "/api/dev/diagnostics")} className="focus-ring rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            Webhook dry-run
          </button>
        </div>
        {message ? <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</p> : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-950">워커 스모크 검증 순서</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600">
          <li>워커 스모크용 상품 생성</li>
          <li>대시보드나 API에서 다음 배치 실행</li>
          <li>Python 3.12 venv에서 Python Worker 실행</li>
          <li>/jobs에서 pending/claimed/processing/completed 또는 retry_wait 확인</li>
          <li>/workers에서 heartbeat 확인</li>
          <li>/queue/queue-worker-smoke-001에서 결과 URL 확인</li>
        </ol>
        <p className="mt-3 rounded-lg bg-yellow-50 px-3 py-2 text-sm font-semibold text-yellow-800">
          ffmpeg가 없으면 video_render job은 retry_wait 또는 failed가 될 수 있습니다. 이때 video_ready가 되면 버그입니다.
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-950">후보→영상 E2E 스모크 순서</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600">
          <li>후보→영상 스모크 후보 생성</li>
          <li>/candidates에서 후보를 상품 큐로 승격</li>
          <li>/queue 상세에서 콘텐츠 초안 생성</li>
          <li>다음 배치 실행으로 worker job 생성 확인</li>
          <li>Python Worker 실행 후 R2 artifact와 video_ready 확인</li>
        </ol>
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          후보 생성, 승격, 콘텐츠 초안 생성 단계는 worker job을 만들지 않습니다. worker job은 next-batch에서만 생성됩니다.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">현재 저장소 어댑터</h2>
          <p className="mt-3 text-2xl font-bold text-slate-900">{repositoryInfo.adapter}</p>
          <p className="mt-2 break-all text-sm text-slate-500">{repositoryInfo.dataDir ?? "메모리 어댑터"}</p>
          <p className="mt-2 text-sm text-slate-500">서버 재시작 후 유지되는 local JSON 저장소입니다.</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">다음 실행 시간</h2>
          <p className="mt-3 text-2xl font-bold text-slate-900">{getNextRunAt(settings).toLocaleString("ko-KR")}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">하루 처리 가능량</h2>
          <p className="mt-3 text-2xl font-bold text-slate-900">{getDailyCapacity(settings)}개</p>
          {capacityWarning ? <p className="mt-2 text-sm font-semibold text-yellow-800">{capacityWarning}</p> : null}
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">업로드 안전 상태</h2>
          <p className="mt-3 text-sm text-slate-700">
            YouTube 자동 업로드: {settings.youtube_upload_enabled ? "활성화(위험)" : "비활성화"} / 공개 업로드 구현 없음
          </p>
        </div>
      </section>

      <WebhookStatusCard diagnostics={diagnostics} />
      {diagnosticPayload ? <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{diagnosticPayload}</pre> : null}
    </div>
  );
}
