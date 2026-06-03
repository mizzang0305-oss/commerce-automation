"use client";

import { useMemo, useState } from "react";
import type { AutomationSettings } from "@/types/automation";
import type { N8nConfigStatus } from "@/lib/server/env";
import type { RepositoryRuntimeInfo } from "@/lib/repositories/repositoryFactory";
import { getDailyCapacity, getDailyCapacityWarning, getNextRunAt } from "@/lib/scheduler";
import { WebhookStatusCard } from "@/components/WebhookStatusCard";

type SmokeStatus = {
  stage: string;
  next_step: string;
  blocking_reasons: string[];
  candidate_id: string;
  queue_id: string;
  worker_job_id: string;
  queue_status: string;
  video_url: string;
  product_assets_count: number;
  product_asset_types: string[];
  upload_package_id: string;
  upload_package_status: string;
  created_worker_jobs: number;
  worker_command: string;
  worker_execution_note: string;
};

type SmokePayload = {
  ok?: boolean;
  message?: string;
  candidate_id?: string;
  queue_id?: string;
  package?: { id?: string };
  status?: SmokeStatus;
  safe_error?: string;
  error_code?: string;
};

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
  const [smokePayload, setSmokePayload] = useState<SmokePayload | null>(null);

  const smokeStatus = smokePayload?.status;
  const candidateId = smokePayload?.candidate_id || smokeStatus?.candidate_id || "";
  const queueId = smokePayload?.queue_id || smokeStatus?.queue_id || "";
  const uploadPackageId = smokePayload?.package?.id || smokeStatus?.upload_package_id || "";

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
      setMessage(payload.message ?? "요청을 처리했습니다.");
      if (endpoint.includes("diagnostics")) {
        setDiagnosticPayload(JSON.stringify(payload.safeSamplePayload ?? payload.diagnostics, null, 2));
      }
    } catch {
      setMessage("개발용 요청 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading("");
    }
  }

  async function runSmokeStep(step: string) {
    setLoading(`smoke-${step}`);
    setMessage("");
    try {
      const { endpoint, method, body } = buildSmokeRequest(step, { candidateId, queueId });
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "GET" ? undefined : JSON.stringify(body ?? {})
      });
      const payload = await response.json() as SmokePayload;
      setSmokePayload(payload);
      setMessage(payload.message ?? payload.safe_error ?? `${step} 단계를 처리했습니다.`);
    } catch {
      setMessage("쿠팡 상품 영상 smoke 단계 실행 중 오류가 발생했습니다.");
    } finally {
      setLoading("");
    }
  }

  const capacityWarning = getDailyCapacityWarning(settings);
  const buttonClass = "focus-ring rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-300";
  const secondaryButtonClass = "focus-ring rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:bg-slate-100 disabled:text-slate-400";
  const smokeJson = useMemo(() => smokePayload ? JSON.stringify(smokePayload, null, 2) : "", [smokePayload]);

  return (
    <div className="space-y-6">
      {process.env.NODE_ENV === "production" ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          개발/테스트 페이지입니다. 운영 환경에서는 기본 차단되어야 합니다.
        </div>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-bold text-slate-950">스모크 테스트 랩</h1>
        <p className="mt-2 text-sm text-slate-500">
          저장소, 쿠팡 후보, R2 artifact, 수동 업로드 패키지 흐름을 단계별로 확인합니다.
        </p>
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
            후보 영상 스모크 후보 생성
          </button>
          <button type="button" disabled={Boolean(loading)} onClick={() => runDevAction("diagnostics", "/api/dev/diagnostics")} className={secondaryButtonClass}>
            Webhook dry-run
          </button>
        </div>
        {message ? <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</p> : null}
      </section>

      <section className="rounded-lg border border-emerald-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950">쿠팡 상품 → 쇼츠 영상 E2E Smoke</h2>
            <p className="mt-2 text-sm text-slate-600">
              쿠팡 후보 생성부터 R2 artifact와 수동 업로드 패키지까지 한 화면에서 확인합니다.
            </p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            public upload disabled
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={Boolean(loading)} onClick={() => runSmokeStep("start")} className={buttonClass}>
            샘플 쿠팡 후보 생성
          </button>
          <button type="button" disabled={Boolean(loading) || !candidateId} onClick={() => runSmokeStep("promote")} className={buttonClass}>
            후보를 큐로 승격
          </button>
          <button type="button" disabled={Boolean(loading) || !queueId} onClick={() => runSmokeStep("generate-content")} className={buttonClass}>
            콘텐츠 초안 생성
          </button>
          <button type="button" disabled={Boolean(loading) || !queueId} onClick={() => runSmokeStep("next-batch")} className={buttonClass}>
            다음 배치 실행
          </button>
          <button type="button" disabled={Boolean(loading) || !queueId} onClick={() => runSmokeStep("status")} className={secondaryButtonClass}>
            상태 새로고침
          </button>
          <button type="button" disabled={Boolean(loading) || !queueId} onClick={() => runSmokeStep("build-upload-package")} className={buttonClass}>
            채널 업로드 패키지 생성
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <SmokeField label="candidate_id" value={candidateId} />
          <SmokeField label="queue_id" value={queueId} />
          <SmokeField label="worker_job_id" value={smokeStatus?.worker_job_id ?? ""} />
          <SmokeField label="queue_status" value={smokeStatus?.queue_status ?? ""} />
          <SmokeField label="product_assets" value={smokeStatus ? `${smokeStatus.product_assets_count} (${smokeStatus.product_asset_types.join(", ")})` : ""} />
          <SmokeField label="upload_package_id" value={uploadPackageId} />
        </div>
        {smokeStatus?.blocking_reasons?.length ? (
          <p className="mt-3 rounded-lg bg-yellow-50 px-3 py-2 text-sm font-semibold text-yellow-800">
            현재 차단 사유: {smokeStatus.blocking_reasons.join(", ")} / 다음 단계: {smokeStatus.next_step}
          </p>
        ) : null}
        {smokeStatus?.video_url ? (
          <a href={smokeStatus.video_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-semibold text-blue-700 underline">
            R2 video URL 열기
          </a>
        ) : null}
        <div className="mt-4 rounded-lg bg-slate-950 p-4 text-sm text-slate-100">
          <p className="font-semibold">Python Worker 수동 실행</p>
          <p className="mt-2 text-slate-300">WebApp은 Python Worker를 직접 실행하지 않습니다.</p>
          <pre className="mt-3 whitespace-pre-wrap rounded bg-slate-900 p-3 text-xs">{smokeStatus?.worker_command ?? "cd C:\\Users\\LOVE\\MyProjects\\commerce-automation\\python-worker\n.\\.venv\\Scripts\\python worker.py"}</pre>
          <p className="mt-2 text-slate-300">YouTube/TikTok/Threads 업로드는 비활성화 상태입니다.</p>
        </div>
        {smokeJson ? <pre className="mt-4 max-h-96 overflow-auto rounded-lg bg-slate-50 p-4 text-xs text-slate-700">{smokeJson}</pre> : null}
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
          ffmpeg 또는 이미지 다운로드가 실패하면 video_render job은 retry_wait 또는 failed가 될 수 있습니다. 이때 video_ready가 되면 버그입니다.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">현재 저장소 어댑터</h2>
          <p className="mt-3 text-2xl font-bold text-slate-900">{repositoryInfo.adapter}</p>
          <p className="mt-2 break-all text-sm text-slate-500">{repositoryInfo.dataDir ?? "server-only"}</p>
          <p className="mt-2 text-sm text-slate-500">Supabase adapter는 서버 API route에서만 service role을 사용합니다.</p>
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

function buildSmokeRequest(step: string, ids: { candidateId: string; queueId: string }) {
  const base = "/api/dev/coupang-product-to-video-smoke";
  if (step === "status") {
    const params = new URLSearchParams();
    if (ids.candidateId) {
      params.set("candidate_id", ids.candidateId);
    }
    if (ids.queueId) {
      params.set("queue_id", ids.queueId);
    }
    return { endpoint: `${base}/status?${params.toString()}`, method: "GET" as const };
  }
  if (step === "promote") {
    return { endpoint: `${base}/promote`, method: "POST" as const, body: { candidate_id: ids.candidateId } };
  }
  if (step === "generate-content" || step === "next-batch" || step === "build-upload-package") {
    return { endpoint: `${base}/${step}`, method: "POST" as const, body: { queue_id: ids.queueId, channel_profile_id: "channel-event-gift" } };
  }
  return { endpoint: `${base}/start`, method: "POST" as const };
}

function SmokeField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 min-h-5 break-all text-sm font-semibold text-slate-900">{value || "-"}</p>
    </div>
  );
}
