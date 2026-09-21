"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AllowedCommand, SheetQueueItem } from "@/lib/google-sheets/sheetSchemas";
import { driveVideoLinks, safeHttpUrl } from "@/lib/google-sheets/sheetSchemas";
import { CommandButton } from "./CommandButton";

export function QueueDetailEditor({ item }: { item: SheetQueueItem }) {
  const router = useRouter();
  const [form, setForm] = useState({
    productName: item.productName, category: item.category, price: item.price, affiliateUrl: item.affiliateUrl,
    errorMemo: item.errorMemo, progressStatus: item.progressStatus, humanReview: item.humanReview
  });
  const [metadata, setMetadata] = useState({ videoTitle: "", hookText: "", description: "" });
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [naturalLanguage, setNaturalLanguage] = useState("");
  const [message, setMessage] = useState("");
  const video = driveVideoLinks(item.videoUrl);
  const imageUrl = safeHttpUrl(item.imageOrUsageScene);

  if (item.projectionSource === "local_queue_scheduler") {
    return <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-3xl border border-slate-200 bg-white p-5">
        <p className="text-xs font-black text-emerald-700">LOCAL JSON AUTHORITATIVE</p>
        <h3 className="mt-2 text-xl font-black">{item.productName}</h3>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">Queue / Slot</dt><dd className="font-bold">{item.queueId} · {item.slotId}</dd></div>
          <div><dt className="text-slate-500">Revision</dt><dd className="font-bold">local {item.localRevision ?? "-"} · projected {item.projectionRevision ?? "-"}</dd></div>
          <div><dt className="text-slate-500">상태</dt><dd className="font-bold">{item.progressStatus}</dd></div>
          <div><dt className="text-slate-500">Artifact Reference</dt><dd className="break-all font-bold">{item.artifactReferenceId || "not_ready"}</dd></div>
          <div className="sm:col-span-2"><dt className="text-slate-500">Safe Media Metadata</dt><dd className="break-all font-mono text-xs">{item.safeMediaMetadata || "{}"}</dd></div>
          <div className="sm:col-span-2"><dt className="text-slate-500">오류</dt><dd className="font-bold text-red-700">{item.errorMemo || "없음"}</dd></div>
        </dl>
        <p className="mt-5 rounded-xl bg-slate-100 p-3 text-xs text-slate-600">Sheets 행은 읽기 전용 projection입니다. 명령에는 현재 Local Revision이 포함되며, stale 명령은 거부됩니다.</p>
      </section>
      <section className="space-y-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-5">
          <h3 className="font-black">허용된 로컬 명령</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {item.progressStatus === "hold" ? <CommandButton queueId={item.queueId} command="RELEASE_HOLD" expectedRevision={item.localRevision} namespace={item.namespace}>보류 해제</CommandButton> : <CommandButton queueId={item.queueId} command="HOLD_SLOT" expectedRevision={item.localRevision} namespace={item.namespace}>보류</CommandButton>}
            <CommandButton queueId={item.queueId} command="SKIP_SLOT" expectedRevision={item.localRevision} namespace={item.namespace}>건너뛰기</CommandButton>
            <CommandButton queueId={item.queueId} command="RETRY_SLOT" expectedRevision={item.localRevision} namespace={item.namespace}>재시도</CommandButton>
            <CommandButton queueId={item.queueId} command="REPLACE_FROM_RESERVE" expectedRevision={item.localRevision} namespace={item.namespace}>예비상품 교체</CommandButton>
          </div>
        </div>
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-bold text-emerald-950">NO UPLOAD · NO DRIVE MEDIA · NO LOCAL PATH EXPOSURE</div>
      </section>
    </div>;
  }

  async function save() {
    const response = await fetch(`/api/commerce-control/queue/${encodeURIComponent(item.queueId)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, expectedLastModified: item.lastModified })
    });
    const body = await response.json() as { message?: string };
    setMessage(response.ok ? "저장했습니다." : body.message || "저장 실패");
    if (response.ok) router.refresh();
  }

  async function enqueue(command: AllowedCommand, requestValue = "") {
    const response = await fetch("/api/commerce-control/commands", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queueId: item.queueId, command, requestValue, webRequestKey: crypto.randomUUID() })
    });
    const body = await response.json() as { message?: string };
    setMessage(response.ok ? "명령이 대기열에 추가되었습니다." : body.message || "명령 생성 실패");
    if (response.ok) router.refresh();
    return response.ok;
  }

  async function submitNaturalLanguage() {
    const response = await fetch("/api/commerce-control/commands", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queueId: item.queueId, naturalLanguage, webRequestKey: crypto.randomUUID() })
    });
    const body = await response.json() as { message?: string };
    setMessage(response.ok ? "명령이 대기열에 추가되었습니다." : body.message || "명령 생성 실패");
    if (response.ok) { setNaturalLanguage(""); router.refresh(); }
  }

  const field = (key: keyof typeof form, label: string) => <label className="block text-sm font-bold">{label}<input value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-normal" /></label>;
  const metadataField = (key: keyof typeof metadata, label: string) => <label className="block text-sm font-bold">{label}<input value={metadata[key]} onChange={(event) => setMetadata({ ...metadata, [key]: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-normal" /></label>;

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="space-y-5">
        <div className="rounded-3xl border border-slate-200 bg-white p-5">
          <h3 className="text-lg font-black">상품 정보 수정</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">{field("productName", "상품명")}{field("category", "카테고리")}{field("price", "가격")}{field("affiliateUrl", "제휴 URL")}{field("progressStatus", "진행 상태")}{field("humanReview", "사람검토")}</div>
          <label className="mt-4 block text-sm font-bold">오류/메모<textarea value={form.errorMemo} onChange={(event) => setForm({ ...form, errorMemo: event.target.value })} className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2 font-normal" /></label>
          <button type="button" onClick={save} className="mt-4 rounded-xl bg-emerald-700 px-4 py-2 font-bold text-white">변경 저장</button>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5">
          <h3 className="font-black">콘텐츠 메타데이터 수정 명령</h3>
          <p className="mt-1 text-xs text-slate-500">현재 상품큐 스키마에 별도 열이 없어 값은 메타데이터수정 명령으로 전달되며, runner 적용 전 완료로 표시되지 않습니다.</p>
          <div className="mt-4 grid gap-4">{metadataField("videoTitle", "영상 제목")}{metadataField("hookText", "후킹 문구")}{metadataField("description", "설명")}</div>
          <button type="button" onClick={() => enqueue("메타데이터수정", JSON.stringify(metadata))} disabled={!Object.values(metadata).some((value) => value.trim())} className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">메타데이터 수정 요청</button>
        </div>
        {message ? <p className="rounded-xl bg-slate-100 p-3 text-sm font-semibold" role="status">{message}</p> : null}
      </section>
      <section className="space-y-4">
        {imageUrl ? <div role="img" aria-label={`${item.productName} 상품 이미지`} className="aspect-video rounded-3xl bg-slate-100 bg-cover bg-center" style={{ backgroundImage: `url(${JSON.stringify(imageUrl)})` }} /> : null}
        {video ? <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-3"><iframe title="생성 영상 미리보기" src={video.previewUrl} className="aspect-[9/16] max-h-[620px] w-full rounded-2xl bg-slate-950" allow="autoplay" /><div className="mt-2 flex gap-3 text-sm font-bold"><a href={video.openUrl} target="_blank" rel="noreferrer">새 창에서 열기</a><a href={video.downloadUrl} target="_blank" rel="noreferrer">다운로드</a></div></div> : <div className="rounded-3xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Google Drive 영상 URL이 아직 없습니다.</div>}
        <div className="flex flex-wrap gap-2 rounded-3xl border border-slate-200 bg-white p-4"><CommandButton queueId={item.queueId} command="영상재생성">영상 다시 만들기</CommandButton><CommandButton queueId={item.queueId} command="음성재생성">음성만 다시 만들기</CommandButton><CommandButton queueId={item.queueId} command="전체재시도">전체 다시 시도</CommandButton><CommandButton queueId={item.queueId} command="보류">보류</CommandButton><CommandButton queueId={item.queueId} command="제외">제외</CommandButton><CommandButton queueId={item.queueId} command="검토PASS" tone="success">PASS</CommandButton><CommandButton queueId={item.queueId} command="검토FAIL" tone="danger">FAIL</CommandButton></div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4"><label className="text-sm font-black">수동 업로드 YouTube URL<input value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal" /></label><button type="button" disabled={!youtubeUrl.trim()} onClick={async () => { if (await enqueue("수동업로드완료", JSON.stringify({ youtubeUrl }))) setYoutubeUrl(""); }} className="mt-3 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">수동 업로드 완료 기록</button><p className="mt-2 text-xs text-slate-500">업로드를 실행하지 않고 이미 완료한 URL만 기록합니다.</p></div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4"><label className="text-sm font-black">자연어 명령<textarea value={naturalLanguage} onChange={(event) => setNaturalLanguage(event.target.value)} placeholder="이 영상 목소리를 조금 빠르게 다시 만들어" className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 p-3 font-normal" /></label><button type="button" onClick={submitNaturalLanguage} className="mt-3 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white">명령 해석 후 추가</button></div>
      </section>
    </div>
  );
}
