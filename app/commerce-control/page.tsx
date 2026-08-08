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
  return <CommerceControlPage title="Daily 69 No-Upload Control Center" description="Local JSON이 권위 원장이고 Google Sheets는 읽기 projection과 허용 명령 bus로만 동작합니다.">
    {!dashboard ? <CommerceControlUnavailable /> : <>
      <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5"><p className="text-xs font-black tracking-wider text-emerald-700">SAFETY BOUNDARY</p><p className="mt-2 text-lg font-black text-emerald-950">NO UPLOAD · NO POST · LOCAL ARTIFACTS ONLY</p><p className="mt-1 text-sm text-emerald-800">daily target 69 · reserve minimum 14 · processing cap 9 · batch 3</p></section>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {[
          ["Active Queue", dashboard.daily69.activeCount], ["Reserve", dashboard.daily69.reserveCount], ["Scheduled", dashboard.daily69.scheduled],
          ["Processing", dashboard.daily69.processing], ["Ready", dashboard.daily69.ready], ["Failed/Hold", dashboard.daily69.failed + dashboard.daily69.hold]
        ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></div>)}
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-5"><h3 className="font-black">허용된 빠른 실행</h3><div className="mt-4 flex flex-wrap gap-2"><CommandButton command="RUN_NIGHTLY_SCOUT" namespace={dashboard.daily69.namespace}>Nightly Scout</CommandButton><CommandButton command="RUN_NEXT_BATCH" namespace={dashboard.daily69.namespace}>Next Batch</CommandButton>{dashboard.daily69.paused ? <CommandButton command="RESUME_AUTOMATION" namespace={dashboard.daily69.namespace} tone="success">Resume</CommandButton> : <CommandButton command="PAUSE_AUTOMATION" namespace={dashboard.daily69.namespace} tone="danger">Pause</CommandButton>}<CommandButton command="REFRESH_PROJECTION" namespace={dashboard.daily69.namespace}>Projection 새로고침</CommandButton><Link href="/commerce-control/commands" className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold">명령큐</Link></div></div>
        <div className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white"><p className="text-xs font-bold text-emerald-300">REVISION / PROJECTION</p><p className="mt-2 text-xl font-black">local {dashboard.daily69.localRevision} · projected {dashboard.daily69.projectionRevision}</p><p className="mt-2 text-sm text-slate-300">{dashboard.daily69.projectedAt || "projection 기록 없음"}</p><p className="mt-2 break-all font-mono text-[10px] text-slate-500">{dashboard.daily69.snapshotHash || "snapshot hash 없음"}</p></div>
      </section>
      <section className="grid gap-4 lg:grid-cols-2"><div className="rounded-3xl border border-slate-200 bg-white p-5"><h3 className="font-black">최근 명령</h3><div className="mt-3 space-y-2">{dashboard.recentCommands.length ? dashboard.recentCommands.map((item) => <p key={item.commandId} className="rounded-xl bg-slate-50 p-3 text-sm"><b>{item.command}</b> · {item.status}</p>) : <p className="text-sm text-slate-500">명령 기록 없음</p>}</div></div><div className="rounded-3xl border border-slate-200 bg-white p-5"><h3 className="font-black">최근 오류</h3><div className="mt-3 space-y-2">{dashboard.recentErrors.length ? dashboard.recentErrors.map((item) => <p key={item.logId} className="rounded-xl bg-red-50 p-3 text-sm text-red-800"><b>{item.command}</b> · {item.safeMessage}</p>) : <p className="text-sm text-slate-500">오류 기록 없음</p>}</div></div></section>
    </>}
  </CommerceControlPage>;
}
