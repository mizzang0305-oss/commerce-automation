"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AllowedCommand } from "@/lib/google-sheets/sheetSchemas";

export function CommandButton({ queueId = "", command, requestValue = "", children, tone = "default" }: {
  queueId?: string; command: AllowedCommand; requestValue?: string; children: React.ReactNode; tone?: "default" | "success" | "danger";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const colors = tone === "success" ? "bg-emerald-700 text-white" : tone === "danger" ? "bg-red-700 text-white" : "bg-slate-900 text-white";
  async function run() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/commerce-control/commands", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId, command, requestValue, webRequestKey: crypto.randomUUID() })
      });
      const body = await response.json() as { message?: string };
      setMessage(response.ok ? "명령이 대기열에 추가되었습니다." : body.message || "명령 생성 실패");
      if (response.ok) router.refresh();
    } finally { setBusy(false); }
  }
  return <span className="inline-flex flex-col gap-1"><button type="button" onClick={run} disabled={busy} className={`rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50 ${colors}`}>{busy ? "요청 중…" : children}</button>{message ? <small className="max-w-36 text-[10px] text-slate-500">{message}</small> : null}</span>;
}
