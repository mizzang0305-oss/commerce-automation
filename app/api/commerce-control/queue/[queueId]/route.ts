import { NextResponse } from "next/server";
import { readJsonObject, requireApiAuth, requireMutationApi, safeApiError } from "@/lib/commerce-control/api";
import { getCommerceControlRepository } from "@/lib/google-sheets/commerceControlRepository";
import type { QueuePatch } from "@/lib/google-sheets/sheetSchemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ queueId: string }> }) {
  const denied = requireApiAuth(request); if (denied) return denied;
  try {
    const { queueId } = await context.params;
    const repository = getCommerceControlRepository();
    const namespace = await repository.activeNamespace();
    const item = await repository.queue.find(queueId, namespace);
    if (!item) return NextResponse.json({ ok: false, code: "GOOGLE_SHEETS_ROW_NOT_FOUND", message: "상품을 찾을 수 없습니다." }, { status: 404 });
    const [commands, logs] = await Promise.all([repository.commands.list(namespace), repository.logs.list()]);
    return NextResponse.json({ ok: true, item, commands: commands.filter((entry) => entry.queueId === queueId), logs: logs.filter((entry) => entry.queueId === queueId) });
  } catch (error) { return safeApiError(error); }
}

export async function PATCH(request: Request, context: { params: Promise<{ queueId: string }> }) {
  const denied = requireMutationApi(request); if (denied) return denied;
  try {
    const { queueId } = await context.params;
    const body = await readJsonObject(request);
    const allowed = ["productName", "category", "price", "affiliateUrl", "errorMemo", "progressStatus", "humanReview"] as const;
    const patch: QueuePatch = {};
    for (const key of allowed) if (typeof body[key] === "string") patch[key] = body[key] as never;
    if (typeof body.expectedLastModified !== "string") {
      return NextResponse.json({ ok: false, code: "EXPECTED_LAST_MODIFIED_REQUIRED", message: "최종수정 값이 필요합니다." }, { status: 400 });
    }
    const repository = getCommerceControlRepository();
    const namespace = await repository.activeNamespace();
    const item = await repository.queue.update(queueId, patch, body.expectedLastModified, namespace);
    return NextResponse.json({ ok: true, item });
  } catch (error) { return safeApiError(error); }
}
