import { RunLogTable } from "@/components/RunLogTable";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const runs = await getAutomationRepository().getRuns();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">자동화 실행 로그</h1>
        <p className="mt-2 text-sm text-slate-500">실제 실행 결과, safe message, 실패 로그를 확인합니다.</p>
      </div>
      <RunLogTable runs={runs} />
    </div>
  );
}
