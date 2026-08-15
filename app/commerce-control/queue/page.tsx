import { requireCommerceControlPageAuth } from "@/lib/commerce-control/auth";
import { getCommerceControlRepository } from "@/lib/google-sheets/commerceControlRepository";
import { CommerceControlPage, CommerceControlUnavailable } from "@/components/commerce-control/CommerceControlNav";
import { QueueCards } from "@/components/commerce-control/QueueCards";

export const dynamic = "force-dynamic";

export default async function CommerceControlQueuePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireCommerceControlPageAuth();
  const { status = "" } = await searchParams;
  let items; try { const repository = getCommerceControlRepository(); items = await repository.queue.list(await repository.activeNamespace()); } catch { items = null; }
  return <CommerceControlPage title="상품큐" description="행 번호가 아닌 Queue ID로 상품을 찾고 수정합니다.">{items ? <QueueCards items={items} initialStatus={status} /> : <CommerceControlUnavailable />}</CommerceControlPage>;
}
