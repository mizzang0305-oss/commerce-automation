import Link from "next/link";

const links = [
  ["/commerce-control", "대시보드"], ["/commerce-control/queue", "상품큐"],
  ["/commerce-control/commands", "명령큐"], ["/commerce-control/logs", "실행로그"],
  ["/commerce-control/settings", "설정"]
] as const;

export function CommerceControlNav() {
  const mockMode = process.env.NODE_ENV !== "production" && process.env.COMMERCE_CONTROL_MOCK_MODE === "true";
  return (
    <div className="mb-6 rounded-3xl bg-slate-950 p-4 text-white shadow-xl shadow-slate-200/60">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-emerald-300">GOOGLE SHEETS CONTROL CENTER</p>
          <h1 className="mt-1 text-xl font-black">쿠팡 쇼츠 빠른 운영판</h1>
          <p className="mt-1 text-xs text-slate-400">자동 생성 · 웹 관리 · 사람 검토 · 수동 업로드</p>
          {mockMode ? <p className="mt-2 inline-block rounded-full bg-amber-400 px-3 py-1 text-xs font-black text-slate-950">WEB_MVP_TEST_ONLY · MOCK DATA</p> : null}
        </div>
        <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Commerce control navigation">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className="shrink-0 rounded-full border border-white/15 px-3 py-2 text-sm font-semibold hover:bg-white/10">
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

export function CommerceControlPage({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <CommerceControlNav />
      <header>
        <h2 className="text-2xl font-black tracking-tight text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </header>
      {children}
    </div>
  );
}

export function CommerceControlUnavailable({ code = "GOOGLE_SHEETS_NOT_CONFIGURED" }: { code?: string }) {
  return (
    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
      <p className="text-sm font-black text-amber-950">{code}</p>
      <p className="mt-2 text-sm text-amber-800">Google credential이 설정되기 전에는 운영 데이터를 성공으로 가장하지 않습니다.</p>
    </div>
  );
}
