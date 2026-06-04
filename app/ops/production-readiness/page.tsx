import { ProductionReadinessPanel } from "@/components/ProductionReadinessPanel";
import { buildProductionReadinessSummary } from "@/lib/ops/productionReadiness";

export const dynamic = "force-dynamic";

export default function ProductionReadinessPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Production Readiness</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Approval-gated readiness summary for Vercel WebApp, Supabase, Cloudflare R2, and the local Windows Python Worker.
        </p>
      </div>
      <ProductionReadinessPanel readiness={buildProductionReadinessSummary()} />
    </div>
  );
}
