import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  tone = "default",
  helper,
  icon
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "danger" | "warning" | "success" | "info";
  helper?: string;
  icon?: ReactNode;
}) {
  const toneClasses = {
    default: "border-slate-200 bg-white",
    danger: "border-red-200 bg-red-50",
    warning: "border-yellow-200 bg-yellow-50",
    success: "border-emerald-200 bg-emerald-50",
    info: "border-blue-200 bg-blue-50"
  };

  return (
    <div className={`rounded-lg border p-4 shadow-sm ${toneClasses[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <div className="mt-2 text-2xl font-bold text-slate-950">{value}</div>
        </div>
        {icon ? <div className="text-slate-400">{icon}</div> : null}
      </div>
      {helper ? <p className="mt-2 text-sm text-slate-600">{helper}</p> : null}
    </div>
  );
}
