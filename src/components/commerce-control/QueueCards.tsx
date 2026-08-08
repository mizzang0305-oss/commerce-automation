"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SheetQueueItem } from "@/lib/google-sheets/sheetSchemas";
import { driveVideoLinks, safeHttpUrl } from "@/lib/google-sheets/sheetSchemas";
import { CommandButton } from "./CommandButton";

function options(items: SheetQueueItem[], field: keyof SheetQueueItem) {
  return [...new Set(items.map((item) => String(item[field] ?? "")))].filter(Boolean).sort();
}

function QueueActions({ item }: { item: SheetQueueItem }) {
  if (item.projectionSource === "local_queue_scheduler") return <div className="mt-4 flex flex-wrap gap-2">
    <Link href={`/commerce-control/queue/${encodeURIComponent(item.queueId)}`} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold">상세보기</Link>
    {item.progressStatus === "hold"
      ? <CommandButton queueId={item.queueId} command="RELEASE_HOLD" expectedRevision={item.localRevision} namespace={item.namespace}>보류 해제</CommandButton>
      : <CommandButton queueId={item.queueId} command="HOLD_SLOT" expectedRevision={item.localRevision} namespace={item.namespace}>보류</CommandButton>}
    <CommandButton queueId={item.queueId} command="SKIP_SLOT" expectedRevision={item.localRevision} namespace={item.namespace}>건너뛰기</CommandButton>
    {(["failed", "blocked", "manual_review"].includes(item.progressStatus)) ? <CommandButton queueId={item.queueId} command="RETRY_SLOT" expectedRevision={item.localRevision} namespace={item.namespace}>재시도</CommandButton> : null}
    <CommandButton queueId={item.queueId} command="REPLACE_FROM_RESERVE" expectedRevision={item.localRevision} namespace={item.namespace}>예비상품 교체</CommandButton>
  </div>;
  const video = driveVideoLinks(item.videoUrl);
  return <div className="mt-4 flex flex-wrap gap-2">
    <Link href={`/commerce-control/queue/${encodeURIComponent(item.queueId)}`} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold">상세보기</Link>
    {video ? <a href={video.openUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold">영상보기</a> : null}
    <CommandButton queueId={item.queueId} command="영상재생성">영상재생성</CommandButton>
    <CommandButton queueId={item.queueId} command="음성재생성">음성재생성</CommandButton>
    <CommandButton queueId={item.queueId} command="보류">보류</CommandButton>
    <CommandButton queueId={item.queueId} command="제외">제외</CommandButton>
    <CommandButton queueId={item.queueId} command="검토PASS" tone="success">PASS</CommandButton>
    <CommandButton queueId={item.queueId} command="검토FAIL" tone="danger">FAIL</CommandButton>
  </div>;
}

export function QueueCards({ items, initialStatus = "" }: { items: SheetQueueItem[]; initialStatus?: string }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [quality, setQuality] = useState("");
  const [upload, setUpload] = useState("");
  const [mode, setMode] = useState<"cards" | "table">("cards");
  const visible = useMemo(() => items.filter((item) =>
    (!search || `${item.productName} ${item.category} ${item.queueId}`.toLocaleLowerCase("ko").includes(search.toLocaleLowerCase("ko"))) &&
    (!date || item.registeredDate === date) && (!slot || item.slot === slot) && (!status || item.progressStatus === status) &&
    (!quality || item.qualityDecision === quality) && (!upload || item.uploadStatus === upload)
  ), [items, search, date, slot, status, quality, upload]);

  const select = (label: string, value: string, setter: (value: string) => void, values: string[]) =>
    <select aria-label={`${label} 필터`} value={value} onChange={(event) => setter(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2">
      <option value="">{label} 전체</option>{values.map((entry) => <option key={entry}>{entry}</option>)}
    </select>;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-4">
        <input aria-label="상품 검색" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="상품명, 카테고리, Queue ID 검색" className="rounded-xl border border-slate-300 px-3 py-2 sm:col-span-2" />
        {select("날짜", date, setDate, options(items, "registeredDate"))}
        {select("시간대", slot, setSlot, options(items, "slot"))}
        {select("진행상태", status, setStatus, options(items, "progressStatus"))}
        {select("품질판정", quality, setQuality, options(items, "qualityDecision"))}
        {select("업로드상태", upload, setUpload, options(items, "uploadStatus"))}
        <div className="flex gap-2">
          <button type="button" onClick={() => router.refresh()} className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold">새로고침</button>
          <button type="button" onClick={() => setMode(mode === "cards" ? "table" : "cards")} className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold">{mode === "cards" ? "표 보기" : "카드 보기"}</button>
        </div>
      </div>
      <p className="text-sm text-slate-500">{visible.length}개 상품</p>
      {mode === "cards" ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map((item) => {
        const imageUrl = safeHttpUrl(item.imageOrUsageScene);
        return <article key={item.queueId} className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          {imageUrl ? <div role="img" aria-label={`${item.productName} 상품 이미지`} className="mb-4 aspect-video rounded-2xl bg-slate-100 bg-cover bg-center" style={{ backgroundImage: `url(${JSON.stringify(imageUrl)})` }} /> : <div className="mb-4 flex aspect-video items-center justify-center rounded-2xl bg-slate-100 text-xs font-bold text-slate-500">상품 이미지 없음</div>}
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-bold text-emerald-700">{item.queueId}</p><h3 className="mt-1 line-clamp-2 font-black">{item.productName}</h3></div><span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">{item.progressStatus || "미정"}</span></div>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs"><div><dt className="text-slate-500">슬롯</dt><dd className="font-bold">{item.slotId || `${item.registeredDate} ${item.slot}`}</dd></div><div><dt className="text-slate-500">Local Revision</dt><dd className="font-bold">{item.localRevision ?? "-"}</dd></div><div><dt className="text-slate-500">품질/ASR</dt><dd className="font-bold">{item.asrScore ?? item.qualityDecision ?? "-"}</dd></div><div><dt className="text-slate-500">오류</dt><dd className="line-clamp-2 font-bold text-red-700">{item.errorMemo || "없음"}</dd></div></dl>
          <QueueActions item={item} />
        </article>;
      })}</div> : <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50"><tr>{["Queue ID", "상품명", "진행상태", "품질판정", "업로드상태", "작업"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead><tbody>{visible.map((item) => <tr key={item.queueId} className="border-t align-top"><td className="px-4 py-3 text-xs font-bold text-emerald-700">{item.queueId}</td><td className="px-4 py-3 font-bold">{item.productName}</td><td className="px-4 py-3">{item.progressStatus}</td><td className="px-4 py-3">{item.qualityDecision}</td><td className="px-4 py-3">{item.uploadStatus}</td><td className="min-w-96 px-4 py-3"><QueueActions item={item} /></td></tr>)}</tbody></table></div>}
      {mode === "table" ? <p className="text-xs text-slate-500 md:hidden">모바일에서는 카드 보기를 사용합니다.</p> : null}
    </div>
  );
}
