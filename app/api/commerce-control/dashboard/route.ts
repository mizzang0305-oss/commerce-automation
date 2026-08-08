import { NextResponse } from "next/server";
import { requireApiAuth, safeApiError } from "@/lib/commerce-control/api";
import { getCommerceControlRepository } from "@/lib/google-sheets/commerceControlRepository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = requireApiAuth(request); if (denied) return denied;
  try { return NextResponse.json({ ok: true, dashboard: await getCommerceControlRepository().dashboard() }); }
  catch (error) { return safeApiError(error); }
}
