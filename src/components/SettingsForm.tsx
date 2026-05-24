"use client";

import { useMemo, useState } from "react";
import type { AutomationSettings, RunMode } from "@/types/automation";
import { getAvailableSlotCount, getDailyCapacity, getDailyCapacityWarning } from "@/lib/scheduler";
import { getRunModeLabel } from "@/lib/statusLabels";
import { StatCard } from "@/components/StatCard";

const intervalOptions = [1, 2, 3, 6, 12];
const runModes: Array<{ value: RunMode; label: string }> = [
  { value: "generate_only", label: `${getRunModeLabel("generate_only")}(generate_only)` },
  { value: "youtube_private", label: getRunModeLabel("youtube_private") },
  { value: "youtube_unlisted", label: getRunModeLabel("youtube_unlisted") },
  { value: "youtube_public", label: getRunModeLabel("youtube_public") }
];

export function SettingsForm({
  initialSettings,
  todayVideoJobs = 0
}: {
  initialSettings: AutomationSettings;
  todayVideoJobs?: number;
}) {
  const [form, setForm] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const changed = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialSettings), [form, initialSettings]);
  const capacity = getDailyCapacity(form);
  const availableSlots = getAvailableSlotCount(form);
  const capacityWarning = getDailyCapacityWarning(form);
  const riskyPublic = form.youtube_upload_enabled || form.run_mode === "youtube_public";
  const remainingVideos = Math.max(0, form.max_daily_videos - todayVideoJobs);

  function update<K extends keyof AutomationSettings>(key: K, value: AutomationSettings[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    if (riskyPublic && !window.confirm("공개 업로드 관련 위험 설정입니다. 저장할까요?")) {
      setSaving(false);
      return;
    }

    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.message ?? "설정 저장 중 오류가 발생했습니다.");
        return;
      }
      setForm(payload.settings);
      setMessage("설정이 저장되었습니다.");
    } catch {
      setError("설정 저장 요청에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-950">운영 설정</h1>
            <p className="mt-1 text-sm text-slate-500">변경사항 있음: {changed ? "예" : "아니오"}</p>
          </div>
          <button
            type="submit"
            disabled={saving || !changed}
            className="focus-ring rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-200 disabled:text-slate-500"
          >
            {saving ? "저장 중" : "저장"}
          </button>
        </div>
        {message ? <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Python Worker" value={form.python_worker_enabled ? "사용" : "중지"} tone={form.python_worker_enabled ? "success" : "warning"} />
        <StatCard label="video_render 허용" value={form.allowed_worker_job_types.includes("video_render") ? "예" : "아니오"} tone={form.allowed_worker_job_types.includes("video_render") ? "success" : "warning"} />
        <StatCard label="오늘 사용량 / 제한" value={`${todayVideoJobs}/${form.max_daily_videos}`} helper={`${remainingVideos}개 남음`} />
        <StatCard label="공개 업로드" value={form.youtube_upload_enabled ? "위험: 활성화" : "비활성화"} tone={form.youtube_upload_enabled ? "danger" : "default"} />
      </section>

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
        <NumberField label="하루 생성 상품 수" value={form.daily_target_count} min={1} max={200} onChange={(value) => update("daily_target_count", value)} />
        <NumberField label="배치당 처리 상품 수" value={form.batch_size} min={1} max={10} onChange={(value) => update("batch_size", value)} />
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">실행 간격</span>
          <select value={form.interval_hours} onChange={(event) => update("interval_hours", Number(event.target.value))} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            {intervalOptions.map((value) => (
              <option key={value} value={value}>{value}시간마다</option>
            ))}
          </select>
        </label>
        <NumberField label="하루 공개 업로드 제한" value={form.max_daily_uploads} min={0} max={69} onChange={(value) => update("max_daily_uploads", value)} />
        <NumberField label="하루 Worker 영상 생성 제한" value={form.max_daily_videos} min={0} max={200} onChange={(value) => update("max_daily_videos", value)} />
        <NumberField label="시작 시간" value={form.start_hour} min={0} max={23} onChange={(value) => update("start_hour", value)} />
        <NumberField label="종료 시간" value={form.end_hour} min={0} max={23} onChange={(value) => update("end_hour", value)} />
      </section>

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
        <label className="block md:col-span-2">
          <span className="text-sm font-semibold text-slate-700">실행 모드</span>
          <select value={form.run_mode} onChange={(event) => update("run_mode", event.target.value as RunMode)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            {runModes.map((mode) => (
              <option key={mode.value} value={mode.value}>{mode.label}</option>
            ))}
          </select>
        </label>
        <CheckField label="자동화 일시 정지" checked={form.is_paused} onChange={(value) => update("is_paused", value)} />
        <CheckField label="Python Worker 사용" checked={form.python_worker_enabled} onChange={(value) => update("python_worker_enabled", value)} />
        <CheckField label="YouTube 자동 업로드 활성화" checked={form.youtube_upload_enabled} onChange={(value) => update("youtube_upload_enabled", value)} />
        <CheckField label="업로드 전 승인 필요" checked={form.approval_required} onChange={(value) => update("approval_required", value)} />
        <button type="button" disabled className="focus-ring rounded-lg bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-500">
          자동 공개 업로드 비활성화
        </button>
      </section>

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
        <CheckField
          label="video_render 작업 허용"
          checked={form.allowed_worker_job_types.includes("video_render")}
          onChange={(checked) => update("allowed_worker_job_types", toggleJobType(form.allowed_worker_job_types, "video_render", checked))}
        />
        <CheckField
          label="sheet_sync 작업 허용"
          checked={form.allowed_worker_job_types.includes("sheet_sync")}
          onChange={(checked) => update("allowed_worker_job_types", toggleJobType(form.allowed_worker_job_types, "sheet_sync", checked))}
        />
        <TextAreaField label="포함 카테고리" value={form.category_include.join(", ")} onChange={(value) => update("category_include", splitList(value))} />
        <TextAreaField label="제외 카테고리" value={form.category_exclude.join(", ")} onChange={(value) => update("category_exclude", splitList(value))} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-950">설정 분석</h2>
        <div className="mt-3 space-y-2 text-sm">
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">목표 생성 수: {form.daily_target_count}개</p>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">사용 가능한 실행 슬롯: {availableSlots}개</p>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">하루 처리 가능량: {capacity}개</p>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">실행 모드: {getRunModeLabel(form.run_mode)}({form.run_mode})</p>
          {capacityWarning ? <p className="rounded-lg bg-yellow-50 px-3 py-2 font-semibold text-yellow-800">{capacityWarning}</p> : null}
          {!form.python_worker_enabled ? <p className="rounded-lg bg-yellow-50 px-3 py-2 font-semibold text-yellow-800">Python Worker가 꺼져 있으면 next-batch가 worker job을 만들 수 없습니다.</p> : null}
          {!form.allowed_worker_job_types.includes("video_render") ? <p className="rounded-lg bg-yellow-50 px-3 py-2 font-semibold text-yellow-800">video_render가 허용되지 않으면 다음 배치가 영상 생성 작업을 만들 수 없습니다.</p> : null}
          {form.run_mode !== "generate_only" ? <p className="rounded-lg bg-red-50 px-3 py-2 font-semibold text-red-700">운영 기본값은 generate_only입니다. 공개 업로드는 구현되어 있지 않습니다.</p> : null}
          {form.youtube_upload_enabled ? <p className="rounded-lg bg-red-50 px-3 py-2 font-semibold text-red-700">youtube_upload_enabled=true는 위험 설정입니다. 실제 공개 업로드는 구현하지 않습니다.</p> : null}
        </div>
      </section>
    </form>
  );
}

function splitList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function toggleJobType(
  current: AutomationSettings["allowed_worker_job_types"],
  jobType: AutomationSettings["allowed_worker_job_types"][number],
  checked: boolean
) {
  if (checked) {
    return current.includes(jobType) ? current : [...current, jobType];
  }
  return current.filter((item) => item !== jobType);
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input aria-label={label} type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
    </label>
  );
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
    </label>
  );
}
