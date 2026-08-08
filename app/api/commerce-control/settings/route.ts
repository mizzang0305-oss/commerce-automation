import { NextResponse } from "next/server";
import { readJsonObject, requireApiAuth, requireMutationApi, safeApiError } from "@/lib/commerce-control/api";
import { getCommerceControlRepository } from "@/lib/google-sheets/commerceControlRepository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = requireApiAuth(request); if (denied) return denied;
  try { return NextResponse.json({ ok: true, settings: await getCommerceControlRepository().settings.list() }); }
  catch (error) { return safeApiError(error); }
}

export async function PATCH(request: Request) {
  const denied = requireMutationApi(request); if (denied) return denied;
  try {
    const body = await readJsonObject(request);
    if (!body.expected || !body.updates || typeof body.expected !== "object" || typeof body.updates !== "object" || Array.isArray(body.expected) || Array.isArray(body.updates)) {
      return NextResponse.json({ ok: false, code: "SETTINGS_PATCH_INVALID", message: "expected와 updates가 필요합니다." }, { status: 400 });
    }
    const expectedEntries = Object.entries(body.expected);
    const updateEntries = Object.entries(body.updates);
    if ([...expectedEntries, ...updateEntries].some(([, value]) => typeof value !== "string")) {
      return NextResponse.json({ ok: false, code: "SETTINGS_PATCH_INVALID", message: "설정값은 문자열이어야 합니다." }, { status: 400 });
    }
    const expected = Object.fromEntries(expectedEntries) as Record<string, string>;
    const updates = Object.fromEntries(updateEntries) as Record<string, string>;
    return NextResponse.json({ ok: true, settings: await getCommerceControlRepository().settings.update(expected, updates) });
  } catch (error) { return safeApiError(error); }
}
