"use client";

import { useEffect, useMemo, useState } from "react";
import {
  APPROVE_YOUTUBE_PRIVATE_UPLOAD,
  RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE
} from "@/lib/uploads/youtube/youtubeUploadGuards";
import {
  YOUTUBE_PRIVATE_SMOKE_CANDIDATE_ID,
  YOUTUBE_PRIVATE_SMOKE_DISCLOSURE_TEXT
} from "@/lib/uploads/youtube/youtubePrivateSmokeContract";
import { validateYouTubeDisclosureText } from "@/lib/uploads/youtube/youtubeDisclosureTextGuard";

type Visibility = "private" | "unlisted";

type YouTubeSmokeFlowProps = {
  defaultVideoPath: string;
  readinessCanUpload: boolean;
  readinessBlockedReasons: string[];
};

type ApiState = {
  status: "idle" | "loading" | "success" | "blocked";
  summary: string;
  details?: SafeApiDetails;
};

type SafeApiDetails = {
  ok?: boolean;
  error_code?: string;
  missing_reasons?: string[];
  blocked_reasons?: string[];
  youtube_video_id?: string;
  youtube_url?: string;
  visibility?: string;
  side_effects?: Record<string, unknown>;
  reauth_required?: boolean;
  can_execute?: boolean;
  safe_error?: string;
};

const DEFAULT_TITLE = "Commerce Automation Private Upload Smoke UTF8 Dashboard";
const DEFAULT_DESCRIPTION = [
  "Commerce Automation private upload smoke UTF-8 dashboard test.",
  YOUTUBE_PRIVATE_SMOKE_DISCLOSURE_TEXT,
  "Affiliate link: https://link.coupang.com/a/test-smoke"
].join("\n\n");
const DEFAULT_AFFILIATE_URL = "https://link.coupang.com/a/test-smoke";

export function YouTubeDashboardSmokeFlow({
  defaultVideoPath,
  readinessCanUpload,
  readinessBlockedReasons
}: YouTubeSmokeFlowProps) {
  const [candidateId, setCandidateId] = useState(YOUTUBE_PRIVATE_SMOKE_CANDIDATE_ID);
  const [videoPath, setVideoPath] = useState(defaultVideoPath);
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [description, setDescription] = useState(DEFAULT_DESCRIPTION);
  const [disclosureText, setDisclosureText] = useState(YOUTUBE_PRIVATE_SMOKE_DISCLOSURE_TEXT);
  const [affiliateUrl, setAffiliateUrl] = useState(DEFAULT_AFFILIATE_URL);
  const [confirmation, setConfirmation] = useState("");
  const [smokeApproval, setSmokeApproval] = useState("");
  const [prepareState, setPrepareState] = useState<ApiState>({ status: "idle", summary: "아직 prepare를 실행하지 않았습니다." });
  const [executeState, setExecuteState] = useState<ApiState>({ status: "idle", summary: "아직 execute를 실행하지 않았습니다." });
  const [executeReadinessState, setExecuteReadinessState] = useState<ApiState>({
    status: "idle",
    summary: "Execute readiness dry-run is waiting for prepare and approval phrases."
  });
  const [studioVisibility, setStudioVisibility] = useState(false);
  const [studioTitle, setStudioTitle] = useState(false);
  const [studioDisclosure, setStudioDisclosure] = useState(false);
  const [publicBlocked, setPublicBlocked] = useState(true);

  const disclosureReasons = useMemo(
    () => validateYouTubeDisclosureText({ description, disclosure_text: disclosureText }),
    [description, disclosureText]
  );
  const disclosureCompact = disclosureText.replace(/\s+/g, "");
  const disclosureHasCoupang = disclosureCompact.includes("쿠팡파트너스");
  const disclosureHasFee = disclosureCompact.includes("수수료");
  const disclosureLooksGarbled = disclosureReasons.includes("disclosure_text_garbled");
  const disclosureReady = disclosureReasons.length === 0;
  const basePayloadReady = Boolean(candidateId.trim() && videoPath.trim() && title.trim() && description.trim() && affiliateUrl.trim());
  const canPrepare = basePayloadReady && disclosureReady;
  const prepareOk = prepareState.status === "success" && prepareState.details?.ok !== false;
  const confirmationOk = confirmation.trim() === APPROVE_YOUTUBE_PRIVATE_UPLOAD;
  const smokeApprovalOk = smokeApproval.trim() === RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE;
  const executeReadinessOk = executeReadinessState.status === "success" && executeReadinessState.details?.can_execute === true;
  const canExecute = prepareOk && readinessCanUpload && confirmationOk && smokeApprovalOk && executeReadinessOk;
  const executeDisabledReasons = buildExecuteDisabledReasons({
    prepareOk,
    readinessCanUpload,
    readinessBlockedReasons,
    confirmationOk,
    smokeApprovalOk,
    executeReadinessOk,
    executeReadinessBlockedReasons: executeReadinessState.details?.blocked_reasons ?? [],
    candidateId,
    videoPath,
    disclosureReady
  });
  const finalVerified = Boolean(
    executeState.details?.youtube_video_id && studioVisibility && studioTitle && studioDisclosure && publicBlocked
  );

  const payload = useMemo(() => ({
    candidate_id: candidateId,
    confirmation,
    video_path_or_url: videoPath,
    title,
    description,
    disclosure_text: disclosureText,
    selected_affiliate_url: affiliateUrl,
    tags: ["commerce automation", "private smoke"],
    visibility,
    made_for_kids: false
  }), [affiliateUrl, candidateId, confirmation, description, disclosureText, title, videoPath, visibility]);

  useEffect(() => {
    const shouldCheckExecuteReadiness = prepareOk && readinessCanUpload && confirmationOk && smokeApprovalOk;
    if (!shouldCheckExecuteReadiness) {
      return;
    }

    let cancelled = false;
    fetch("/api/uploads/youtube/execute-readiness", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ ...payload, smoke_approval: smokeApproval })
    })
      .then(async (response) => {
        const body = sanitizeApiBody(await response.json());
        if (cancelled) {
          return;
        }
        const canExecuteNow = response.ok && body.ok !== false && body.can_execute === true;
        setExecuteReadinessState({
          status: canExecuteNow ? "success" : "blocked",
          summary: canExecuteNow
            ? "Execute readiness dry-run passed. No upload was executed."
            : "Execute readiness dry-run blocked the upload request.",
          details: body
        });
      })
      .catch(() => {
        if (!cancelled) {
          setExecuteReadinessState({
            status: "blocked",
            summary: "Execute readiness dry-run failed with a safe client error."
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    confirmationOk,
    payload,
    prepareOk,
    readinessCanUpload,
    smokeApproval,
    smokeApprovalOk,
  ]);

  async function submitPrepare() {
    setExecuteReadinessState({
      status: "idle",
      summary: "Execute readiness dry-run is waiting for prepare and approval phrases."
    });
    setPrepareState({ status: "loading", summary: "대시보드 payload로 prepare 확인 중입니다." });
    setExecuteState({ status: "idle", summary: "아직 execute를 실행하지 않았습니다." });
    try {
      const response = await fetch("/api/uploads/youtube/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload)
      });
      const body = sanitizeApiBody(await response.json());
      setPrepareState({
        status: response.ok && body.ok !== false ? "success" : "blocked",
        summary: response.ok && body.ok !== false ? "Prepare 통과. Execute는 별도 readiness와 승인 문구가 필요합니다." : "Prepare가 안전하게 차단되었습니다.",
        details: body
      });
    } catch {
      setPrepareState({ status: "blocked", summary: "Prepare 요청이 안전한 client error로 실패했습니다." });
    }
  }

  async function submitExecute() {
    if (!canExecute) {
      setExecuteState({
        status: "blocked",
        summary: "Execute는 readiness, prepare, 승인 문구가 모두 통과할 때만 가능합니다.",
        details: { ok: false, blocked_reasons: executeDisabledReasons }
      });
      return;
    }
    setExecuteState({ status: "loading", summary: "대시보드에서 private smoke 실행 요청 중입니다." });
    try {
      const response = await fetch("/api/uploads/youtube/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload)
      });
      const body = sanitizeApiBody(await response.json());
      setExecuteState({
        status: response.ok && body.ok !== false ? "success" : "blocked",
        summary: response.ok && body.ok !== false ? "Execute 완료. Studio에서 비공개 상태를 직접 확인하세요." : "Execute가 안전하게 차단되었거나 실패했습니다.",
        details: body
      });
    } catch {
      setExecuteState({ status: "blocked", summary: "Execute 요청이 안전한 client error로 실패했습니다." });
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-950">YouTube 비공개 업로드 스모크</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            브라우저 대시보드에서 UTF-8 JSON payload를 구성하고, readiness가 통과한 경우에만 승인 문구 입력 후 실행할 수
            있습니다. 이 PR에서는 live upload smoke를 실행하지 않습니다.
          </p>
          <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-700">
            토큰 값, client secret, raw auth header, DB write, R2 upload, queue row, worker job, upload package,
            public upload, TikTok upload, Threads upload는 표시하거나 생성하지 않습니다.
          </p>
        </div>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
          private/unlisted only
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <TextInput label="후보 ID" value={candidateId} onChange={setCandidateId} />
          <TextInput label="영상 파일 경로" value={videoPath} onChange={setVideoPath} />
          <label className="text-sm font-semibold text-slate-700">
            공개 범위
            <select
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as Visibility)}
            >
              <option value="private">비공개</option>
              <option value="unlisted">일부 공개</option>
              <option value="public" disabled>
                공개 업로드 차단
              </option>
            </select>
          </label>
          <TextInput label="제목" value={title} onChange={setTitle} />
          <TextInput label="제휴 링크" value={affiliateUrl} onChange={setAffiliateUrl} />
          <label className="text-sm font-semibold text-slate-700">
            설명
            <textarea
              className="mt-1 block min-h-32 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            제휴 고지 미리보기
            <textarea
              className="mt-1 block min-h-20 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              value={disclosureText}
              onChange={(event) => setDisclosureText(event.target.value)}
            />
          </label>
        </div>

        <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">제휴 고지 진단</p>
          <dl className="space-y-2 text-sm">
            <StatusRow label="쿠팡파트너스 포함" value={disclosureHasCoupang} />
            <StatusRow label="수수료 포함" value={disclosureHasFee} />
            <StatusRow label="깨진 물음표 패턴 없음" value={!disclosureLooksGarbled} />
            <StatusRow label="UTF-8 브라우저 payload" value />
            <StatusRow label="public_upload_enabled" value={false} />
          </dl>
          {disclosureReasons.length > 0 ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">
              {disclosureReasons.join(", ")}
            </div>
          ) : (
            <div className="rounded-md border border-teal-200 bg-teal-50 p-3 text-sm font-semibold text-teal-800">
              제휴 고지 문구가 prepare에 사용할 수 있는 상태입니다.
            </div>
          )}

          <TextInput
            label="업로드 승인 문구"
            value={confirmation}
            onChange={setConfirmation}
            placeholder={APPROVE_YOUTUBE_PRIVATE_UPLOAD}
          />
          <TextInput
            label="스모크 실행 승인 문구"
            value={smokeApproval}
            onChange={setSmokeApproval}
            placeholder={RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE}
          />
          <div className="rounded-md bg-white p-3 text-sm text-slate-700">
            <p className="font-bold text-slate-950">필수 문구</p>
            <code className="mt-2 block rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-800">
              {RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE}
            </code>
            <code className="mt-2 block rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-800">
              {APPROVE_YOUTUBE_PRIVATE_UPLOAD}
            </code>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canPrepare || prepareState.status === "loading"}
              onClick={submitPrepare}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
            >
              업로드 준비 확인
            </button>
            <button
              type="button"
              disabled={!canExecute || executeState.status === "loading"}
              onClick={submitExecute}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
            >
              실제 업로드 실행
            </button>
          </div>
          {executeDisabledReasons.length > 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-bold">실행 불가 사유</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 font-semibold">
                {executeDisabledReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <ResultCard title="Prepare 결과" state={prepareState} />
        <ResultCard title="Execute readiness" state={executeReadinessState} />
        <ResultCard title="Execute 결과" state={executeState} />
      </div>

      <div className="mt-4 rounded-md border border-slate-200 p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">수동 확인 카드</p>
        <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
          <CheckboxRow label="Studio visibility가 private" checked={studioVisibility} onChange={setStudioVisibility} />
          <CheckboxRow label="Studio 제목 확인 완료" checked={studioTitle} onChange={setStudioTitle} />
          <CheckboxRow label="한국어 제휴 고지 확인 완료" checked={studioDisclosure} onChange={setStudioDisclosure} />
          <CheckboxRow label="public 또는 예약 공개 없음" checked={publicBlocked} onChange={setPublicBlocked} />
        </div>
        <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
          <SettingRow label="youtube_video_id" value={executeState.details?.youtube_video_id ?? "not available"} />
          <SettingRow label="youtube_url" value={executeState.details?.youtube_url ?? "not available"} />
          <SettingRow label="visibility" value={executeState.details?.visibility ?? visibility} />
          <SettingRow label="최종 검증 완료" value={String(finalVerified)} />
        </dl>
      </div>
    </section>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <input
        className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function StatusRow({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2">
      <dt className="font-medium text-slate-600">{label}</dt>
      <dd className={value ? "font-bold text-teal-700" : "font-bold text-rose-700"}>{String(value)}</dd>
    </div>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 font-semibold text-slate-700">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function ResultCard({ title, state }: { title: string; state: ApiState }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
        <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-700">{state.status}</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-slate-800">{state.summary}</p>
      {state.details ? (
        <dl className="mt-3 space-y-2 text-sm">
          <SettingRow label="ok" value={String(state.details.ok ?? state.status === "success")} />
          <SettingRow label="can_execute" value={String(state.details.can_execute ?? false)} />
          <SettingRow label="error_code" value={state.details.error_code ?? "none"} />
          <SettingRow label="safe_error" value={state.details.safe_error ?? "none"} />
          <SettingRow label="missing_reasons" value={(state.details.missing_reasons ?? []).join(", ") || "none"} />
          <SettingRow label="blocked_reasons" value={(state.details.blocked_reasons ?? []).join(", ") || "none"} />
          <SettingRow label="external_api_called" value={String(state.details.side_effects?.external_api_called ?? false)} />
          <SettingRow
            label="youtube_upload_executed"
            value={String(state.details.side_effects?.youtube_upload_executed ?? false)}
          />
          <SettingRow label="uploaded" value={String(state.details.side_effects?.uploaded ?? false)} />
          <SettingRow label="reauth_required" value={String(state.details.reauth_required ?? false)} />
        </dl>
      ) : null}
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2">
      <dt className="font-medium text-slate-600">{label}</dt>
      <dd className="break-all text-right font-bold text-slate-950">{value}</dd>
    </div>
  );
}

function buildExecuteDisabledReasons(input: {
  prepareOk: boolean;
  readinessCanUpload: boolean;
  readinessBlockedReasons: string[];
  confirmationOk: boolean;
  smokeApprovalOk: boolean;
  executeReadinessOk: boolean;
  executeReadinessBlockedReasons: string[];
  candidateId: string;
  videoPath: string;
  disclosureReady: boolean;
}) {
  const reasons: string[] = [];
  if (!input.prepareOk) {
    reasons.push("prepare 결과가 아직 통과하지 않았습니다.");
  }
  if (!input.readinessCanUpload) {
    const details = input.readinessBlockedReasons.length ? ` (${input.readinessBlockedReasons.join(", ")})` : "";
    reasons.push(`YouTube readiness가 통과하지 않았습니다${details}.`);
  }
  if (!input.confirmationOk) {
    reasons.push("APPROVE_YOUTUBE_PRIVATE_UPLOAD 승인 문구가 필요합니다.");
  }
  if (!input.smokeApprovalOk) {
    reasons.push("RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE 승인 문구가 필요합니다.");
  }
  if (input.prepareOk && input.readinessCanUpload && input.confirmationOk && input.smokeApprovalOk && !input.executeReadinessOk) {
    const details = input.executeReadinessBlockedReasons.length
      ? ` (${input.executeReadinessBlockedReasons.join(", ")})`
      : "";
    reasons.push(`Execute readiness dry-run is blocked${details}.`);
  }
  if (!input.candidateId.trim()) {
    reasons.push("후보 ID가 필요합니다.");
  }
  if (!input.videoPath.trim()) {
    reasons.push("로컬 mp4 경로가 필요합니다.");
  }
  if (!input.disclosureReady) {
    reasons.push("제휴 고지 문구가 disclosure guard를 통과해야 합니다.");
  }
  return reasons;
}

function sanitizeApiBody(input: unknown): SafeApiDetails {
  const redacted = redactSecrets(input);
  if (!redacted || typeof redacted !== "object" || Array.isArray(redacted)) {
    return {};
  }
  const value = redacted as Record<string, unknown>;
  const result = value.result && typeof value.result === "object" && !Array.isArray(value.result)
    ? value.result as Record<string, unknown>
    : {};
  const readiness = value.readiness && typeof value.readiness === "object" && !Array.isArray(value.readiness)
    ? value.readiness as Record<string, unknown>
    : {};
  const resultBlockedReasons = Array.isArray(result.blocked_reasons) ? result.blocked_reasons.map(String) : undefined;
  const valueSideEffects = value.side_effects && typeof value.side_effects === "object"
    ? value.side_effects as Record<string, unknown>
    : undefined;
  const resultSideEffects = result.side_effects && typeof result.side_effects === "object"
    ? result.side_effects as Record<string, unknown>
    : undefined;
  return {
    ok: value.ok === true,
    error_code: typeof value.error_code === "string" ? value.error_code : undefined,
    safe_error: typeof value.safe_error === "string" ? value.safe_error : undefined,
    can_execute: value.can_execute === true,
    missing_reasons: Array.isArray(value.missing_reasons) ? value.missing_reasons.map(String) : undefined,
    blocked_reasons: Array.isArray(value.blocked_reasons)
      ? value.blocked_reasons.map(String)
      : Array.isArray(readiness.blocked_reasons)
        ? readiness.blocked_reasons.map(String)
        : resultBlockedReasons,
    youtube_video_id: typeof result.youtube_video_id === "string" ? result.youtube_video_id : undefined,
    youtube_url: typeof result.youtube_url === "string" ? result.youtube_url : undefined,
    visibility: typeof result.visibility === "string" ? result.visibility : undefined,
    side_effects: valueSideEffects ?? resultSideEffects,
    reauth_required: value.reauth_required === true
  };
}

function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (/token|secret|authorization|bearer/i.test(key)) {
        return [key, "[redacted]"];
      }
      return [key, redactSecrets(item)];
    })
  );
}
