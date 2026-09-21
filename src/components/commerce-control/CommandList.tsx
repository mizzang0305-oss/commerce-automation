"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SheetCommand } from "@/lib/google-sheets/sheetSchemas";

export function CommandList({ commands }: { commands: SheetCommand[] }) {
  const router = useRouter();
  async function action(commandId: string, value: "cancel" | "retry") {
    await fetch(`/api/commerce-control/commands/${encodeURIComponent(commandId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: value }) });
    router.refresh();
  }
  return <div className="grid gap-3">{commands.map((command) => <article key={command.commandId} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="break-all text-xs font-bold text-emerald-700">{command.commandId}</p><h3 className="font-black">{command.command}</h3><p className="mt-1 text-sm text-slate-500">요청 {command.requestedAt} · {command.status}{command.completedAt ? ` · 완료 ${command.completedAt}` : ""}</p></div><div className="flex flex-wrap gap-2">{command.queueId ? <Link className="rounded-lg border px-3 py-2 text-xs font-bold" href={`/commerce-control/queue/${encodeURIComponent(command.queueId)}`}>상품 보기</Link> : null}<Link className="rounded-lg border px-3 py-2 text-xs font-bold" href={`/commerce-control/logs?commandId=${encodeURIComponent(command.commandId)}`}>실행로그</Link>{command.status === "대기" ? <button onClick={() => action(command.commandId, "cancel")} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white">취소</button> : null}{command.status === "실패" && command.retryCount < 1 ? <button onClick={() => action(command.commandId, "retry")} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white">1회 재시도</button> : null}</div></div>{command.result || command.errorMemo ? <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">{command.result || command.errorMemo}</p> : null}</article>)}</div>;
}
