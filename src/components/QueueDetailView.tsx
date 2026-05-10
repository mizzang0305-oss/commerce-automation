"use client";

import { useState } from "react";
import Image from "next/image";
import type { AutomationSettings, GeneratedContent, Platform, ProductQueueItem } from "@/types/automation";
import { canMarkReadyForManualUpload } from "@/lib/guards";
import { GuardNotice } from "@/components/GuardNotice";
import { QueueActionButtons } from "@/components/QueueActionButtons";
import { StatusBadge } from "@/components/StatusBadge";

export function QueueDetailView({
  item,
  content,
  settings
}: {
  item: ProductQueueItem;
  content: GeneratedContent | null;
  settings: AutomationSettings;
}) {
  const [message, setMessage] = useState("");
  const readyGuard = canMarkReadyForManualUpload(item, content);

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
              <Image
                src={item.thumbnail_url}
                alt={item.product_name}
                fill
                unoptimized
                sizes="320px"
                className="object-cover"
              />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={item.queue_status} />
              <span className="text-sm font-semibold text-slate-500">Rank {item.queue_rank}</span>
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

      <section className="grid gap-4 lg:grid-cols-3">
        <LinkBox label="쿠팡 원본 링크" url={item.raw_coupang_url} />
        <LinkBox label="제휴 링크" url={item.selected_affiliate_url} />
        <LinkBox label="영상 URL" url={item.video_url} />
        <LinkBox label="영상 스냅샷" url={item.video_snapshot_url} />
        <LinkBox label="블로그 초안 URL" url={item.blog_draft_url} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-950">생성 콘텐츠 검수</h2>
        {content ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <TextBlock label="유튜브 설명" value={content.youtube_description} />
            <TextBlock label="틱톡 캡션" value={content.tiktok_caption} />
            <TextBlock label="스레드 문구" value={content.threads_text} />
            <TextBlock label="해시태그" value={content.hashtags} />
            <TextBlock label="블로그 제목" value={content.blog_title} />
            <TextBlock label="제휴 고지 문구" value={content.disclosure_text} />
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
          <button
            type="button"
            onClick={() => markManual("youtube")}
            className="focus-ring rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
          >
            유튜브 수동 업로드 완료 표시
          </button>
          <button
            type="button"
            onClick={() => markManual("tiktok")}
            className="focus-ring rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
          >
            틱톡 수동 업로드 완료 표시
          </button>
          <button
            type="button"
            onClick={() => markManual("threads")}
            className="focus-ring rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
          >
            스레드 수동 게시 완료 표시
          </button>
          <button
            type="button"
            disabled
            className="focus-ring rounded-lg bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-500"
          >
            실제 유튜브 자동 업로드 없음
          </button>
        </div>
        {message ? <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</p> : null}
      </section>

      {item.error_message ? (
        <section className="rounded-lg border border-red-200 bg-red-50 p-5">
          <h2 className="text-base font-bold text-red-800">오류 로그</h2>
          <p className="mt-2 text-sm text-red-700">{item.error_message}</p>
        </section>
      ) : null}
    </div>
  );
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
