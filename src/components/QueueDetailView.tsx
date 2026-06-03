"use client";

import { useState } from "react";
import Image from "next/image";
import type {
  AutomationSettings,
  ChannelProfile,
  ChannelUploadPackage,
  GeneratedContent,
  Platform,
  ProductAsset,
  ProductQueueItem,
  WorkerJob
} from "@/types/automation";
import { canMarkReadyForManualUpload } from "@/lib/guards";
import { getRenderableChecklist } from "@/lib/queueAnalytics";
import { getWorkerJobStatusLabel, getWorkerJobTypeLabel } from "@/lib/statusLabels";
import { GuardNotice } from "@/components/GuardNotice";
import { QueueActionButtons } from "@/components/QueueActionButtons";
import { RenderPlanPreview } from "@/components/RenderPlanPreview";
import { StatusBadge } from "@/components/StatusBadge";

export function QueueDetailView({
  item,
  content,
  settings,
  assets = [],
  workerJobs = [],
  channels = [],
  channelPackages = []
}: {
  item: ProductQueueItem;
  content: GeneratedContent | null;
  settings: AutomationSettings;
  assets?: ProductAsset[];
  workerJobs?: WorkerJob[];
  channels?: ChannelProfile[];
  channelPackages?: ChannelUploadPackage[];
}) {
  const [message, setMessage] = useState("");
  const [draftContent, setDraftContent] = useState<GeneratedContent | null>(content);
  const [contentMessage, setContentMessage] = useState("");
  const [contentGenerationStatus, setContentGenerationStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [contentProviderMeta, setContentProviderMeta] = useState<{
    provider: string;
    requestedProvider: string;
    usedFallback: boolean;
    providerConfigured: boolean;
    safetyWarnings: string[];
  } | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState(channels[0]?.id ?? "");
  const [uploadPackages, setUploadPackages] = useState<ChannelUploadPackage[]>(channelPackages);
  const [uploadPackageMessage, setUploadPackageMessage] = useState("");
  const [uploadPackageStatus, setUploadPackageStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [uploadedUrl, setUploadedUrl] = useState(channelPackages[0]?.uploaded_url ?? "");
  const [uploadedBy, setUploadedBy] = useState("");
  const [uploadNotes, setUploadNotes] = useState("");
  const readyGuard = canMarkReadyForManualUpload(item, draftContent);
  const relatedJobs = workerJobs.filter((job) => job.product_queue_id === item.id);
  const checklist = getRenderableChecklist(item, draftContent, assets, relatedJobs);
  const latestUploadPackage = uploadPackages[0];

  async function markManual(platform: Platform) {
    setMessage("");
    try {
      const response = await fetch("/api/queue/mark-manual-uploaded", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, platform })
      });
      const payload = await response.json();
      setMessage(payload.message ?? "상태가 변경되었습니다.");
      if (response.ok) {
        window.setTimeout(() => window.location.reload(), 350);
      }
    } catch {
      setMessage("상태 변경 요청에 실패했습니다.");
    }
  }

  async function generateContentDraft() {
    setContentMessage("");
    setContentGenerationStatus("loading");
    try {
      const response = await fetch(`/api/queue/${item.id}/generate-content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restore_scheduled: item.queue_status === "manual_review" })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        setContentGenerationStatus("error");
        setContentMessage(typeof payload.message === "string" ? payload.message : "콘텐츠 초안 생성에 실패했습니다.");
        return;
      }
      if (isGeneratedContent(payload.content)) {
        setDraftContent(payload.content);
      }
      setContentProviderMeta(readContentProviderMeta(payload));
      setContentGenerationStatus("success");
      setContentMessage(typeof payload.message === "string" ? payload.message : "콘텐츠 초안을 생성했습니다.");
    } catch {
      setContentGenerationStatus("error");
      setContentMessage("콘텐츠 초안 생성 요청에 실패했습니다.");
    }
  }

  async function buildUploadPackage() {
    setUploadPackageMessage("");
    setUploadPackageStatus("loading");
    try {
      const response = await fetch(`/api/queue/${item.id}/build-upload-package`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_profile_id: selectedChannelId })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        setUploadPackageStatus("error");
        setUploadPackageMessage(typeof payload.message === "string" ? payload.message : "채널 업로드 패키지 생성에 실패했습니다.");
        return;
      }
      if (isChannelUploadPackage(payload.package)) {
        setUploadPackages((current) => [payload.package, ...current.filter((entry) => entry.id !== payload.package.id)]);
        setUploadedUrl(payload.package.uploaded_url);
      }
      setUploadPackageStatus("success");
      setUploadPackageMessage(typeof payload.message === "string" ? payload.message : "채널 업로드 패키지를 생성했습니다.");
    } catch {
      setUploadPackageStatus("error");
      setUploadPackageMessage("채널 업로드 패키지 생성 요청에 실패했습니다.");
    }
  }

  async function updateManualUploadResult(action: "uploaded" | "skipped" | "needs_fix") {
    if (!latestUploadPackage) {
      return;
    }

    setUploadPackageMessage("");
    setUploadPackageStatus("loading");
    const routeByAction = {
      uploaded: "mark-uploaded",
      skipped: "mark-skipped",
      needs_fix: "mark-needs-fix"
    } as const;

    try {
      const response = await fetch(`/api/upload-packages/${latestUploadPackage.id}/${routeByAction[action]}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploaded_url: uploadedUrl,
          uploaded_by: uploadedBy,
          upload_notes: uploadNotes
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        setUploadPackageStatus("error");
        setUploadPackageMessage(typeof payload.message === "string" ? payload.message : "업로드 결과 저장에 실패했습니다.");
        return;
      }
      if (isChannelUploadPackage(payload.package)) {
        setUploadPackages((current) => [payload.package, ...current.filter((entry) => entry.id !== payload.package.id)]);
        setUploadedUrl(payload.package.uploaded_url);
      }
      setUploadPackageStatus("success");
      setUploadPackageMessage(typeof payload.message === "string" ? payload.message : "업로드 결과를 저장했습니다.");
    } catch {
      setUploadPackageStatus("error");
      setUploadPackageMessage("업로드 결과 저장 요청에 실패했습니다.");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row">
          <div className="relative h-48 w-full overflow-hidden rounded-lg bg-slate-100 lg:w-80">
            {item.thumbnail_url ? (
              <Image src={item.thumbnail_url} alt={item.product_name} fill unoptimized sizes="320px" className="object-cover" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={item.queue_status} />
              <span className="text-sm font-semibold text-slate-500">순위 {item.queue_rank}</span>
            </div>
            <h1 className="mt-3 text-2xl font-bold text-slate-950">{item.product_name}</h1>
            <p className="mt-2 text-sm text-slate-600">{item.score_reason}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Info label="키워드" value={item.keyword} />
              <Info label="테마" value={item.theme} />
              <Info label="카테고리" value={item.category_path} />
              <Info label="현재 가격" value={item.price_now_text} />
              <Info label="상품 점수" value={`${item.product_score}`} />
              <Info label="영상 각도" value={item.video_angle} />
            </div>
          </div>
        </div>
      </section>

      <GuardNotice settings={settings} item={item} />

      <RenderPlanPreview item={item} content={draftContent} />

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-950">worker job 전달 가능 체크리스트</h2>
        <p className="mt-2 text-sm text-slate-500">
          누락 항목을 보완해야 video_render job과 수동 검수가 안전하게 진행됩니다.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {checklist.items.map((entry) => (
            <div key={entry.label} className={`rounded-lg border p-3 ${entry.ok ? "border-emerald-200 bg-emerald-50" : "border-yellow-200 bg-yellow-50"}`}>
              <p className={`text-sm font-bold ${entry.ok ? "text-emerald-800" : "text-yellow-800"}`}>
                {entry.ok ? "확인" : "누락"}: {entry.label}
              </p>
              <p className="mt-1 text-xs text-slate-600">{entry.help}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <LinkBox label="쿠팡 원본 링크" url={item.raw_coupang_url} />
        <LinkBox label="제휴 링크" url={item.selected_affiliate_url} />
        <LinkBox label="영상 URL" url={item.video_url} />
        <LinkBox label="썸네일 URL" url={item.video_snapshot_url || findAssetUrl(assets, "thumbnail")} />
        <LinkBox label="자막(SRT) URL" url={findAssetUrl(assets, "subtitle")} />
        <LinkBox label="Worker upload package URL" url={findAssetUrl(assets, "upload_package")} />
        <LinkBox label="블로그 초안 URL" url={item.blog_draft_url} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-950">관련 워커 작업</h2>
        <div className="mt-4 space-y-2">
          {relatedJobs.length === 0 ? (
            <p className="text-sm text-slate-500">아직 이 상품에 연결된 worker job이 없습니다.</p>
          ) : (
            relatedJobs.map((job) => (
              <div key={job.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                <p className="font-bold text-slate-950">{job.id}</p>
                <p className="mt-1 text-slate-600">
                  {getWorkerJobTypeLabel(job.job_type)} / {getWorkerJobStatusLabel(job.status)} / 재시도 {job.retry_count}/{job.max_retries}
                </p>
                {job.error_message ? <p className="mt-1 text-red-700">{job.error_message}</p> : null}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-950">생성 콘텐츠 검수</h2>
            <p className="mt-2 text-sm text-slate-500">
              콘텐츠 초안 생성은 worker job을 만들지 않습니다. 다음 배치 실행 시 조건을 통과한 항목만 영상 생성 작업으로 전달됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={generateContentDraft}
            disabled={contentGenerationStatus === "loading"}
            className="focus-ring rounded-lg bg-teal-700 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {contentGenerationStatus === "loading" ? "생성 중" : "콘텐츠 초안 생성"}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <ContentPresence label="영상 대본" ok={Boolean(draftContent?.video_script?.trim())} />
          <ContentPresence label="제휴 고지" ok={Boolean(draftContent?.disclosure_text?.trim())} />
          <ContentPresence label="YouTube 설명" ok={Boolean(draftContent?.youtube_description?.trim())} />
          <ContentPresence label="해시태그" ok={Boolean(draftContent?.hashtags?.trim())} />
        </div>
        {contentMessage ? (
          <p className={`mt-3 rounded-lg px-3 py-2 text-sm font-semibold ${
            contentGenerationStatus === "error" ? "bg-red-50 text-red-700" : "bg-teal-50 text-teal-700"
          }`}>
            {contentMessage}
          </p>
        ) : null}
        {contentProviderMeta ? (
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <p className="font-semibold">
              Provider: {contentProviderMeta.provider}
              {contentProviderMeta.usedFallback ? ` (fallback from ${contentProviderMeta.requestedProvider})` : ""}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Configured: {contentProviderMeta.providerConfigured ? "yes" : "no"} / Safety warnings: {contentProviderMeta.safetyWarnings.length}
            </p>
          </div>
        ) : null}

        {draftContent ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <TextBlock label="영상 대본" value={draftContent.video_script} />
            <TextBlock label="제휴 고지 문구" value={draftContent.disclosure_text} />
            <TextBlock label="YouTube 설명" value={draftContent.youtube_description} />
            <TextBlock label="TikTok 캡션" value={draftContent.tiktok_caption} />
            <TextBlock label="해시태그" value={draftContent.hashtags} />
            <TextBlock label="블로그 제목" value={draftContent.blog_title} />
            <TextBlock label="Threads 문구" value={draftContent.threads_text} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">생성 콘텐츠가 아직 없습니다.</p>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-950">채널 업로드 패키지</h2>
            <p className="mt-2 text-sm text-slate-500">
              video_ready 항목을 채널별 수동 업로드 자료로 정리합니다. 실제 YouTube/TikTok/Threads API는 호출하지 않습니다.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={selectedChannelId}
              onChange={(event) => setSelectedChannelId(event.target.value)}
              className="focus-ring rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
            >
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.channel_name} ({channel.platform})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={buildUploadPackage}
              disabled={uploadPackageStatus === "loading" || channels.length === 0}
              className="focus-ring rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {uploadPackageStatus === "loading" ? "생성 중" : "채널 업로드 패키지 생성"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ChecklistBadge label="영상 파일 열림" ok={Boolean(item.video_url)} />
          <ChecklistBadge label="고지 문구 확인" ok={Boolean(draftContent?.disclosure_text?.trim())} />
          <ChecklistBadge label="제휴 링크 확인" ok={Boolean(item.selected_affiliate_url)} />
          <ChecklistBadge label="자동 업로드 비활성" ok />
        </div>

        {uploadPackageMessage ? (
          <p className={`mt-3 rounded-lg px-3 py-2 text-sm font-semibold ${
            uploadPackageStatus === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
          }`}>
            {uploadPackageMessage}
          </p>
        ) : null}

        {latestUploadPackage ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_1fr]">
            <div className="rounded-lg bg-slate-50 p-4">
              <div className="mb-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
                  {latestUploadPackage.status}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                  upload_enabled=false
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                  manual_upload_only=true
                </span>
              </div>
              <TextBlock label="제목" value={latestUploadPackage.title} />
              <TextBlock label="설명/고지" value={latestUploadPackage.description} />
              <TextBlock label="해시태그" value={latestUploadPackage.hashtags} />
            </div>
            <div className="grid gap-3">
              <LinkBox label="영상 파일" url={latestUploadPackage.video_url} />
              <LinkBox label="썸네일" url={latestUploadPackage.thumbnail_url} />
              <LinkBox label="자막(SRT)" url={latestUploadPackage.subtitle_url} />
              <LinkBox label="Worker upload package" url={latestUploadPackage.upload_package_url} />
              <LinkBox label="업로드 결과 URL" url={latestUploadPackage.uploaded_url} />
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 xl:col-span-2">
              <h3 className="text-sm font-bold text-slate-900">수동 업로드 결과 기록</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                운영자가 플랫폼에 직접 업로드한 뒤 결과 URL과 메모만 기록합니다. 실제 업로드 API는 호출하지 않습니다.
              </p>
              <div className="mt-3 grid gap-3 lg:grid-cols-[1.4fr_0.8fr]">
                <label className="text-sm font-semibold text-slate-700">
                  업로드 결과 URL
                  <input
                    value={uploadedUrl}
                    onChange={(event) => setUploadedUrl(event.target.value)}
                    placeholder="https://..."
                    className="focus-ring mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900"
                  />
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  작업자
                  <input
                    value={uploadedBy}
                    onChange={(event) => setUploadedBy(event.target.value)}
                    placeholder="operator"
                    className="focus-ring mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900"
                  />
                </label>
              </div>
              <label className="mt-3 block text-sm font-semibold text-slate-700">
                메모
                <textarea
                  value={uploadNotes}
                  onChange={(event) => setUploadNotes(event.target.value)}
                  rows={3}
                  className="focus-ring mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900"
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => updateManualUploadResult("uploaded")}
                  disabled={uploadPackageStatus === "loading"}
                  className="focus-ring rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  업로드 완료 기록
                </button>
                <button
                  type="button"
                  onClick={() => updateManualUploadResult("skipped")}
                  disabled={uploadPackageStatus === "loading"}
                  className="focus-ring rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                  스킵 처리
                </button>
                <button
                  type="button"
                  onClick={() => updateManualUploadResult("needs_fix")}
                  disabled={uploadPackageStatus === "loading"}
                  className="focus-ring rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm font-bold text-yellow-800 disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                  수정 필요
                </button>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">아직 생성된 채널 업로드 패키지가 없습니다.</p>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-950">상태 변경</h2>
        <p className="mt-2 text-sm text-slate-500">{readyGuard.message}</p>
        <div className="mt-4">
          <QueueActionButtons item={item} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => markManual("youtube")} className="focus-ring rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            YouTube 수동 업로드 완료 표시
          </button>
          <button type="button" onClick={() => markManual("tiktok")} className="focus-ring rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            TikTok 수동 업로드 완료 표시
          </button>
          <button type="button" onClick={() => markManual("threads")} className="focus-ring rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            Threads 수동 게시 완료 표시
          </button>
          <button type="button" disabled className="focus-ring rounded-lg bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-500">
            실제 자동 공개 업로드 없음
          </button>
        </div>
        {message ? <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</p> : null}
      </section>

      {item.error_message ? (
        <section className="rounded-lg border border-red-200 bg-red-50 p-5">
          <h2 className="text-base font-bold text-red-800">오류 로그와 해결 가이드</h2>
          <p className="mt-2 text-sm text-red-700">{item.error_message}</p>
          <p className="mt-2 text-sm text-red-700">ffmpeg 오류라면 PC의 ffmpeg 또는 imageio-ffmpeg 설정을 확인하고 Python Worker를 다시 실행하세요.</p>
        </section>
      ) : null}
    </div>
  );
}

function findAssetUrl(assets: ProductAsset[], assetType: ProductAsset["asset_type"]) {
  return assets.find((asset) => asset.asset_type === assetType)?.url ?? "";
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <span className="block text-xs font-semibold text-slate-500">{label}</span>
      <span className="mt-1 block text-sm font-semibold text-slate-900">{value || "-"}</span>
    </div>
  );
}

function LinkBox({ label, url }: { label: string; url: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900">{label}</h3>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="mt-2 block break-all text-sm font-semibold text-teal-700">
          {url}
        </a>
      ) : (
        <p className="mt-2 text-sm text-slate-500">아직 생성되지 않음</p>
      )}
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <h3 className="text-sm font-bold text-slate-900">{label}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{value || "-"}</p>
    </div>
  );
}

function ContentPresence({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${
      ok ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-yellow-50 text-yellow-800 ring-yellow-200"
    }`}>
      {label} {ok ? "있음" : "없음"}
    </span>
  );
}

function ChecklistBadge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
      ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-yellow-200 bg-yellow-50 text-yellow-800"
    }`}>
      {ok ? "확인" : "확인 필요"}: {label}
    </div>
  );
}

function isGeneratedContent(value: unknown): value is GeneratedContent {
  return Boolean(
    value &&
      typeof value === "object" &&
      "product_queue_id" in value &&
      "video_script" in value &&
      "disclosure_text" in value
  );
}

function readContentProviderMeta(value: Record<string, unknown>) {
  const safetyWarnings = Array.isArray(value.safety_warnings)
    ? value.safety_warnings.filter((entry): entry is string => typeof entry === "string")
    : [];
  return {
    provider: typeof value.content_provider === "string" ? value.content_provider : "template",
    requestedProvider: typeof value.requested_provider === "string" ? value.requested_provider : "template",
    usedFallback: Boolean(value.used_fallback),
    providerConfigured: Boolean(value.provider_configured),
    safetyWarnings
  };
}

function isChannelUploadPackage(value: unknown): value is ChannelUploadPackage {
  return Boolean(
    value &&
      typeof value === "object" &&
      "product_queue_id" in value &&
      "channel_profile_id" in value &&
      "manual_upload_only" in value &&
      "upload_enabled" in value
  );
}
