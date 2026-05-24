"use client";

import { useState } from "react";
import Image from "next/image";
import type { AutomationSettings, GeneratedContent, Platform, ProductAsset, ProductQueueItem, WorkerJob } from "@/types/automation";
import { canMarkReadyForManualUpload } from "@/lib/guards";
import { getRenderableChecklist } from "@/lib/queueAnalytics";
import { getWorkerJobStatusLabel, getWorkerJobTypeLabel } from "@/lib/statusLabels";
import { GuardNotice } from "@/components/GuardNotice";
import { QueueActionButtons } from "@/components/QueueActionButtons";
import { StatusBadge } from "@/components/StatusBadge";

export function QueueDetailView({
  item,
  content,
  settings,
  assets = [],
  workerJobs = []
}: {
  item: ProductQueueItem;
  content: GeneratedContent | null;
  settings: AutomationSettings;
  assets?: ProductAsset[];
  workerJobs?: WorkerJob[];
}) {
  const [message, setMessage] = useState("");
  const readyGuard = canMarkReadyForManualUpload(item, content);
  const relatedJobs = workerJobs.filter((job) => job.product_queue_id === item.id);
  const checklist = getRenderableChecklist(item, content, assets, relatedJobs);

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

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-950">worker job 전달 가능 체크리스트</h2>
        <p className="mt-2 text-sm text-slate-500">누락 항목을 보완해야 video_render job과 수동 검수가 안전하게 진행됩니다.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {checklist.items.map((entry) => (
            <div key={entry.label} className={`rounded-lg border p-3 ${entry.ok ? "border-emerald-200 bg-emerald-50" : "border-yellow-200 bg-yellow-50"}`}>
              <p className={`text-sm font-bold ${entry.ok ? "text-emerald-800" : "text-yellow-800"}`}>
                {entry.ok ? "확인됨" : "누락"}: {entry.label}
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
        <LinkBox label="업로드 패키지 URL" url={findAssetUrl(assets, "upload_package")} />
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
        <h2 className="text-base font-bold text-slate-950">생성 콘텐츠 검수</h2>
        {content ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <TextBlock label="영상 대본" value={content.video_script} />
            <TextBlock label="제휴 고지 문구" value={content.disclosure_text} />
            <TextBlock label="YouTube 설명" value={content.youtube_description} />
            <TextBlock label="해시태그" value={content.hashtags} />
            <TextBlock label="블로그 제목" value={content.blog_title} />
            <TextBlock label="Threads 문구" value={content.threads_text} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">생성 콘텐츠가 아직 없습니다.</p>
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
          <p className="mt-2 text-sm text-red-700">ffmpeg 오류라면 PC에 ffmpeg를 설치하고 새 PowerShell에서 worker를 다시 실행하세요.</p>
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
