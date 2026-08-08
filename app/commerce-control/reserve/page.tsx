import { requireCommerceControlPageAuth } from "@/lib/commerce-control/auth";
import { getCommerceControlRepository } from "@/lib/google-sheets/commerceControlRepository";
import { CommerceControlPage, CommerceControlUnavailable } from "@/components/commerce-control/CommerceControlNav";

export const dynamic = "force-dynamic";

export default async function CommerceControlReservePage() {
  await requireCommerceControlPageAuth();
  let items; try { items = await getCommerceControlRepository().queueControlReserve(); } catch { items = null; }
  return <CommerceControlPage title="예비상품" description="Local reserve pool의 안전 projection입니다. 선택과 claim 권위는 Local JSON에만 있습니다.">
    {!items ? <CommerceControlUnavailable code="QUEUE_RESERVE_PROJECTION_NOT_AVAILABLE" /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <article key={`${item.namespace}:${item.productKeyHash}`} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex justify-between gap-3"><div><p className="text-xs font-bold text-emerald-700">reserve #{item.rank}</p><h3 className="mt-1 font-black">{item.productName}</h3></div><span className="text-xs text-slate-500">{item.score}</span></div><dl className="mt-4 grid grid-cols-2 gap-2 text-xs"><div><dt className="text-slate-500">Use case</dt><dd className="font-bold">{item.useCase}</dd></div><div><dt className="text-slate-500">Category</dt><dd className="font-bold">{item.category}</dd></div><div><dt className="text-slate-500">Claimed slot</dt><dd className="font-bold">{item.claimedSlot || "available"}</dd></div><div><dt className="text-slate-500">Queue date</dt><dd className="font-bold">{item.queueDate}</dd></div></dl></article>)}</div>}
  </CommerceControlPage>;
}
