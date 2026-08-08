import { requireCommerceControlPageAuth } from "@/lib/commerce-control/auth";
import { getCommerceControlRepository } from "@/lib/google-sheets/commerceControlRepository";
import { CommerceControlPage, CommerceControlUnavailable } from "@/components/commerce-control/CommerceControlNav";

export const dynamic = "force-dynamic";

export default async function CommerceLogsPage({ searchParams }: { searchParams: Promise<{ commandId?: string }> }) {
  await requireCommerceControlPageAuth();
  const { commandId = "" } = await searchParams;
  let logs; try { logs = (await getCommerceControlRepository().logs.list()).reverse(); } catch { logs = null; }
  const visible = logs?.filter((log) => !commandId || log.commandId === commandId);
  return <CommerceControlPage title="실행로그" description="credential, token, nonce 원문 없이 안전 메시지와 상태 변화만 기록합니다.">{!visible ? <CommerceControlUnavailable /> : <div className="grid gap-3">{visible.map((log) => <article key={log.logId} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap justify-between gap-2"><div><p className="text-xs font-bold text-emerald-700">{log.queueId || "GLOBAL"}</p><h3 className="font-black">{log.command} · {log.status}</h3></div><p className="text-xs text-slate-500">{log.startedAt} → {log.completedAt}</p></div><p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">{log.safeMessage}</p><p className="mt-2 text-xs text-slate-500">외부호출: {log.externalCall || "false"} · {log.details}</p><details className="mt-3 rounded-xl border border-slate-200 p-3 text-xs"><summary className="cursor-pointer font-bold">변경 전/후 보기</summary><p className="mt-2 break-all"><b>전:</b> {log.before || "-"}</p><p className="mt-2 break-all"><b>후:</b> {log.after || "-"}</p></details></article>)}</div>}</CommerceControlPage>;
}
