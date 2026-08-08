import { requireCommerceControlPageAuth } from "@/lib/commerce-control/auth";
import { getCommerceControlRepository } from "@/lib/google-sheets/commerceControlRepository";
import { CommerceControlPage, CommerceControlUnavailable } from "@/components/commerce-control/CommerceControlNav";
import { CommandButton } from "@/components/commerce-control/CommandButton";

export const dynamic = "force-dynamic";

export default async function CommerceSettingsPage() {
  await requireCommerceControlPageAuth();
  let dashboard; try { dashboard = await getCommerceControlRepository().dashboard(); } catch { dashboard = null; }
  return <CommerceControlPage title="Daily 69 안전 설정" description="설정 권위는 Local JSON입니다. Sheets 설정값을 Queue로 복사하지 않습니다.">{dashboard ? <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
      ["Daily target / max", "69 / 69"], ["Batch / hours", "3 · 01~23 KST"], ["Reserve", "20% · minimum 14"], ["Processing cap", "9"],
      ["Raw / provider cap", "240 / 30"], ["Minimum free disk", "20 GB + estimate"], ["Product candidates", "3"], ["Upload", "FALSE · locked"]
    ].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-2 font-black">{value}</p></div>)}</div>
    <div className="rounded-3xl border border-slate-200 bg-white p-5"><h3 className="font-black">운영 상태</h3><p className="mt-2 text-sm">enabled={String(dashboard.daily69.enabled)} · paused={String(dashboard.daily69.paused)} · namespace={dashboard.daily69.namespace || "not_projected"}</p><div className="mt-4 flex gap-2">{dashboard.daily69.paused ? <CommandButton command="RESUME_AUTOMATION" namespace={dashboard.daily69.namespace}>Resume</CommandButton> : <CommandButton command="PAUSE_AUTOMATION" namespace={dashboard.daily69.namespace} tone="danger">Pause</CommandButton>}<CommandButton command="REFRESH_PROJECTION" namespace={dashboard.daily69.namespace}>Refresh projection</CommandButton></div></div>
    <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-bold text-emerald-950">SAFE_TO_UPLOAD=false · PLATFORM_UPLOAD=0 · Drive media=0 · Production DB=0</div>
  </div> : <CommerceControlUnavailable />}</CommerceControlPage>;
}
