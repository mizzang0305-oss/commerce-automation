import Link from "next/link";
import { requireCommerceControlPageAuth } from "@/lib/commerce-control/auth";
import { getCommerceControlRepository } from "@/lib/google-sheets/commerceControlRepository";
import { CommerceControlPage, CommerceControlUnavailable } from "@/components/commerce-control/CommerceControlNav";
import { CommandButton } from "@/components/commerce-control/CommandButton";

export const dynamic = "force-dynamic";

export default async function CommerceControlDashboardPage() {
  await requireCommerceControlPageAuth();
  let dashboard;
  try { dashboard = await getCommerceControlRepository().dashboard(); } catch { dashboard = null; }
  return <CommerceControlPage title="운영 대시보드" description="Google Sheets의 현재 상태만 표시합니다. credential이 없으면 성공으로 가장하지 않습니다.">
    {!dashboard ? <CommerceControlUnavailable /> : <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {[
          ["오늘 상품", dashboard.counts.today], ["영상 생성중", dashboard.counts.generating], ["검토 대기", dashboard.counts.reviewPending],
          ["수정 필요", dashboard.counts.needsFix], ["업로드 가능", dashboard.counts.uploadReady], ["수동 업로드", dashboard.counts.manualUploaded]
        ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></div>)}
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-5"><h3 className="font-black">빠른 실행</h3><div className="mt-4 flex flex-wrap gap-2"><CommandButton command="오늘상품찾기">오늘 상품 찾기</CommandButton><Link href="/commerce-control/commands" className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold">대기 명령 새로고침</Link><Link href="/commerce-control/queue?status=수정필요" className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold">실패 항목 보기</Link><Link href="/commerce-control/queue?status=검토대기" className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold">검토대기 보기</Link></div></div>
        <div className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white"><p className="text-xs font-bold text-emerald-300">LOCAL RUNNER</p><p className="mt-2 text-xl font-black">마지막 확인</p><p className="mt-2 text-sm text-slate-300">{dashboard.workerLastSeenAt}</p></div>
      </section>
      <section className="grid gap-4 lg:grid-cols-2"><div className="rounded-3xl border border-slate-200 bg-white p-5"><h3 className="font-black">최근 명령</h3><div className="mt-3 space-y-2">{dashboard.recentCommands.length ? dashboard.recentCommands.map((item) => <p key={item.commandId} className="rounded-xl bg-slate-50 p-3 text-sm"><b>{item.command}</b> · {item.status}</p>) : <p className="text-sm text-slate-500">명령 기록 없음</p>}</div></div><div className="rounded-3xl border border-slate-200 bg-white p-5"><h3 className="font-black">최근 오류</h3><div className="mt-3 space-y-2">{dashboard.recentErrors.length ? dashboard.recentErrors.map((item) => <p key={item.logId} className="rounded-xl bg-red-50 p-3 text-sm text-red-800"><b>{item.command}</b> · {item.safeMessage}</p>) : <p className="text-sm text-slate-500">오류 기록 없음</p>}</div></div></section>
    </>}
  </CommerceControlPage>;
}
