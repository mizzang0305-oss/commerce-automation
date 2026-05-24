"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Pause, RefreshCw, SkipForward } from "lucide-react";
import type { ProductQueueItem } from "@/types/automation";

export function QueueActionButtons({ item, compact = false }: { item: ProductQueueItem; compact?: boolean }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function callAction(action: "retry" | "hold" | "skip") {
    setLoading(action);
    setMessage("");
    try {
      const response = await fetch(`/api/queue/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id })
      });
      const payload = await response.json();
      setMessage(payload.message ?? "요청이 처리되었습니다.");
      if (response.ok) {
        window.setTimeout(() => window.location.reload(), 350);
      }
    } catch {
      setMessage("요청 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(null);
    }
  }

  const buttonClass =
    "focus-ring inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={loading !== null} onClick={() => callAction("retry")} className={buttonClass}>
          <RefreshCw size={14} aria-hidden="true" />
          {loading === "retry" ? "재시도 중" : "재시도"}
        </button>
        <button type="button" disabled={loading !== null} onClick={() => callAction("hold")} className={buttonClass}>
          <Pause size={14} aria-hidden="true" />
          보류
        </button>
        <button type="button" disabled={loading !== null} onClick={() => callAction("skip")} className={buttonClass}>
          <SkipForward size={14} aria-hidden="true" />
          건너뜀
        </button>
        {compact ? (
          <Link href={`/queue/${item.id}`} className={buttonClass}>
            상세 보기
          </Link>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {item.video_url ? (
          <a className={buttonClass} href={item.video_url} target="_blank" rel="noreferrer">
            <ExternalLink size={14} aria-hidden="true" />
            영상 열기
          </a>
        ) : null}
        {item.blog_draft_url ? (
          <a className={buttonClass} href={item.blog_draft_url} target="_blank" rel="noreferrer">
            <ExternalLink size={14} aria-hidden="true" />
            초안 열기
          </a>
        ) : null}
        {item.selected_affiliate_url ? (
          <a className={buttonClass} href={item.selected_affiliate_url} target="_blank" rel="noreferrer">
            <ExternalLink size={14} aria-hidden="true" />
            제휴 링크
          </a>
        ) : null}
      </div>
      {message ? <p className="text-xs font-medium text-slate-600">{message}</p> : null}
    </div>
  );
}
