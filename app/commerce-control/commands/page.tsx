import { requireCommerceControlPageAuth } from "@/lib/commerce-control/auth";
import { getCommerceControlRepository } from "@/lib/google-sheets/commerceControlRepository";
import { CommerceControlPage, CommerceControlUnavailable } from "@/components/commerce-control/CommerceControlNav";
import { CommandList } from "@/components/commerce-control/CommandList";

export const dynamic = "force-dynamic";

export default async function CommerceCommandsPage() {
  await requireCommerceControlPageAuth();
  let commands; try { const repository = getCommerceControlRepository(); commands = (await repository.commands.list(await repository.activeNamespace())).reverse(); } catch { commands = null; }
  return <CommerceControlPage title="명령큐" description="대기 명령 취소와 실패 명령의 단 한 번 재시도만 허용합니다.">{commands ? <CommandList commands={commands} /> : <CommerceControlUnavailable />}</CommerceControlPage>;
}
