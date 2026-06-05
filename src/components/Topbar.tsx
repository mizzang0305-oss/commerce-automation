import Link from "next/link";
import { OperatorCommandPalette } from "@/components/OperatorCommandPalette";

export function Topbar() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/dashboard" className="text-sm font-bold text-slate-950 lg:hidden">
          Commerce Automation
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
          <span className="rounded-full bg-slate-100 px-3 py-1">Operator console</span>
          <span className="rounded-full bg-teal-50 px-3 py-1 text-teal-700">In-house worker flow</span>
          <span className="rounded-full bg-orange-50 px-3 py-1 text-orange-700">Public upload disabled</span>
        </div>
        <OperatorCommandPalette />
      </div>
    </header>
  );
}
