import { NextResponse } from "next/server";
import { readJsonObject, requireMutationApi, safeApiError } from "@/lib/commerce-control/api";
import { getCommerceControlRepository } from "@/lib/google-sheets/commerceControlRepository";

export async function PATCH(request: Request, context: { params: Promise<{ commandId: string }> }) {
  const denied = requireMutationApi(request); if (denied) return denied;
  try {
    const { commandId } = await context.params;
    const body = await readJsonObject(request);
    if (body.action !== "retry" && body.action !== "cancel") {
      return NextResponse.json({ ok: false, code: "COMMAND_ACTION_INVALID", message: "cancel 또는 retry만 허용됩니다." }, { status: 400 });
    }
    const repository = getCommerceControlRepository();
    const namespace = await repository.activeNamespace();
    const command = body.action === "retry" ? await repository.commands.retryOnce(commandId, namespace) : await repository.commands.cancel(commandId, namespace);
    return NextResponse.json({ ok: true, command });
  } catch (error) { return safeApiError(error); }
}
