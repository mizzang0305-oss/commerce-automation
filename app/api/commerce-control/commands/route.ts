import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { readJsonObject, requireApiAuth, safeApiError } from "@/lib/commerce-control/api";
import { parseOwnerCommand } from "@/lib/commerce-control/commandParser";
import { getCommerceControlRepository } from "@/lib/google-sheets/commerceControlRepository";
import { isAllowedCommand } from "@/lib/google-sheets/sheetSchemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = requireApiAuth(request); if (denied) return denied;
  try { return NextResponse.json({ ok: true, commands: (await getCommerceControlRepository().commands.list()).reverse() }); }
  catch (error) { return safeApiError(error); }
}

export async function POST(request: Request) {
  const denied = requireApiAuth(request); if (denied) return denied;
  try {
    const body = await readJsonObject(request);
    let command = typeof body.command === "string" ? body.command : "";
    let requestValue = typeof body.requestValue === "string" ? body.requestValue : "";
    if (!command && typeof body.naturalLanguage === "string") {
      const parsed = parseOwnerCommand(body.naturalLanguage);
      if ("error" in parsed) return NextResponse.json({ ok: false, code: "COMMAND_NOT_UNDERSTOOD", message: parsed.error }, { status: 400 });
      command = parsed.command;
      requestValue = parsed.requestValue ?? "";
    }
    if (!isAllowedCommand(command)) return NextResponse.json({ ok: false, code: "COMMAND_NOT_ALLOWED", message: "허용되지 않은 명령입니다." }, { status: 400 });
    const queueId = typeof body.queueId === "string" ? body.queueId.trim() : "";
    if (command !== "오늘상품찾기" && !queueId) return NextResponse.json({ ok: false, code: "QUEUE_ID_REQUIRED", message: "Queue ID가 필요합니다." }, { status: 400 });
    if (queueId.length > 128 || requestValue.length > 10_000) return NextResponse.json({ ok: false, code: "COMMAND_PAYLOAD_TOO_LARGE", message: "명령 요청값이 너무 깁니다." }, { status: 400 });
    const suppliedWebRequestKey = typeof body.webRequestKey === "string" ? body.webRequestKey.trim() : "";
    if (suppliedWebRequestKey && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(suppliedWebRequestKey)) {
      return NextResponse.json({ ok: false, code: "WEB_REQUEST_KEY_INVALID", message: "웹 요청 키가 올바르지 않습니다." }, { status: 400 });
    }
    const result = await getCommerceControlRepository().commands.create({
      queueId, command, requestValue,
      requester: "web-owner", webRequestKey: suppliedWebRequestKey || randomUUID()
    });
    return NextResponse.json({ ok: true, ...result }, { status: result.created ? 201 : 200 });
  } catch (error) { return safeApiError(error); }
}
