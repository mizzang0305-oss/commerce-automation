import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/commerce-control/api";
import { commerceControlAuthConfigured } from "@/lib/commerce-control/auth";
import { commerceControlHealth } from "@/lib/google-sheets/commerceControlRepository";

export async function GET(request: Request) {
  const denied = requireApiAuth(request); if (denied) return denied;
  return NextResponse.json({ ok: true, health: { ...commerceControlHealth(), authConfigured: commerceControlAuthConfigured() } });
}
