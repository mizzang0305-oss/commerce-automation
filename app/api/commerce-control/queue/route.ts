import { NextResponse } from "next/server";
import { requireApiAuth, safeApiError } from "@/lib/commerce-control/api";
import { getCommerceControlRepository } from "@/lib/google-sheets/commerceControlRepository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = requireApiAuth(request); if (denied) return denied;
  try {
    const url = new URL(request.url);
    const search = (url.searchParams.get("search") || "").toLocaleLowerCase("ko");
    const status = url.searchParams.get("status") || "";
    const date = url.searchParams.get("date") || "";
    const slot = url.searchParams.get("slot") || "";
    const quality = url.searchParams.get("quality") || "";
    const upload = url.searchParams.get("upload") || "";
    const repository = getCommerceControlRepository();
    const namespace = await repository.activeNamespace();
    const items = (await repository.queue.list(namespace)).filter((item) =>
      (!search || `${item.productName} ${item.category} ${item.queueId}`.toLocaleLowerCase("ko").includes(search)) &&
      (!status || item.progressStatus === status) && (!date || item.registeredDate === date) && (!slot || item.slot === slot) &&
      (!quality || item.qualityDecision === quality) && (!upload || item.uploadStatus === upload)
    );
    return NextResponse.json({ ok: true, items });
  } catch (error) { return safeApiError(error); }
}
