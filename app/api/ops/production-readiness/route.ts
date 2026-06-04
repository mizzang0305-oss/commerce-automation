import { NextResponse } from "next/server";
import { buildProductionReadinessSummary } from "@/lib/ops/productionReadiness";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(buildProductionReadinessSummary());
}
