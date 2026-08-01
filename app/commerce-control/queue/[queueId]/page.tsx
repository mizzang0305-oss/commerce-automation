import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCommerceControlPageAuth } from "@/lib/commerce-control/auth";
import { getCommerceControlRepository } from "@/lib/google-sheets/commerceControlRepository";
import { CommerceControlPage, CommerceControlUnavailable } from "@/components/commerce-control/CommerceControlNav";
import { QueueDetailEditor } from "@/components/commerce-control/QueueDetailEditor";

export const dynamic = "force-dynamic";

export default async function CommerceQueueDetailPage({ params }: { params: Promise<{ queueId: string }> }) {
  await requireCommerceControlPageAuth();
  const { queueId } = await params;
  let item; try { item = await getCommerceControlRepository().queue.find(queueId); } catch { item = undefined; }
  if (item === null) notFound();
  const history = item ? await Promise.all([
    getCommerceControlRepository().commands.list(), getCommerceControlRepository().logs.list()
  ]).catch(() => [[], []] as const) : [[], []] as const;
  const commands = history[0].filter((entry) => entry.queueId === queueId).slice(-10).reverse();
  const logs = history[1].filter((entry) => entry.queueId === queueId).slice(-10).reverse();
  return <CommerceControlPage title={item?.productName || "상품 상세"} description={item ? `${item.queueId} · 최종수정 ${item.lastModified}` : "Google Sheets 연결이 필요합니다."}>
    {!item ? <CommerceControlUnavailable /> : <>
      <section className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-xs text-slate-500">가격</p><p className="font-black">{item.price || "-"}</p></div><div><p className="text-xs text-slate-500">음성/ASR</p><p className="font-black">{item.voiceStatus || "-"} · {item.asrScore ?? "-"}</p></div><div><p className="text-xs text-slate-500">실사용 장면</p><p className="font-black">{item.usageSceneConfirmed || "미확인"}</p></div><div><p className="text-xs text-slate-500">품질/업로드</p><p className="font-black">{item.qualityDecision || "미정"} · {item.uploadStatus || "미정"}</p></div><div className="flex gap-3 text-sm font-bold sm:col-span-2 lg:col-span-4">{item.rawCoupangUrl ? <a href={item.rawCoupangUrl} target="_blank" rel="noreferrer">쿠팡 링크</a> : null}{item.affiliateUrl ? <a href={item.affiliateUrl} target="_blank" rel="noreferrer">제휴 링크</a> : null}{item.youtubeUrl ? <a href={item.youtubeUrl} target="_blank" rel="noreferrer">YouTube 결과</a> : null}</div>{item.errorMemo ? <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800 sm:col-span-2 lg:col-span-4">오류: {item.errorMemo}</p> : null}</section>
      <QueueDetailEditor item={item} />
      <section className="grid gap-4 lg:grid-cols-2"><div className="rounded-3xl border border-slate-200 bg-white p-5"><h3 className="font-black">명령 이력</h3><div className="mt-3 space-y-2">{commands.length ? commands.map((entry) => <p key={entry.commandId} className="rounded-xl bg-slate-50 p-3 text-sm"><b>{entry.command}</b> · {entry.status}<br /><span className="text-xs text-slate-500">{entry.requestedAt} {entry.result || entry.errorMemo}</span></p>) : <p className="text-sm text-slate-500">명령 이력 없음</p>}</div></div><div className="rounded-3xl border border-slate-200 bg-white p-5"><h3 className="font-black">실행 이력</h3><div className="mt-3 space-y-2">{logs.length ? logs.map((entry) => <p key={entry.logId} className="rounded-xl bg-slate-50 p-3 text-sm"><b>{entry.command}</b> · {entry.status}<br /><span className="text-xs text-slate-500">{entry.startedAt} → {entry.completedAt} · {entry.safeMessage}</span></p>) : <p className="text-sm text-slate-500">실행 이력 없음</p>}</div></div></section>
      <Link href="/commerce-control/queue" className="inline-block text-sm font-bold text-emerald-700">← 상품큐로 돌아가기</Link>
    </>}
  </CommerceControlPage>;
}
