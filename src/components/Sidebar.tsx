import Link from "next/link";
import {
  Activity,
  BriefcaseBusiness,
  CalendarClock,
  ClipboardCheck,
  FlaskConical,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  Settings,
  ServerCog,
  Webhook
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/queue", label: "상품 큐", icon: ListChecks },
  { href: "/candidates", label: "후보 검수", icon: ClipboardCheck },
  { href: "/planner", label: "제작 플래너", icon: CalendarClock },
  { href: "/jobs", label: "작업 목록", icon: BriefcaseBusiness },
  { href: "/workers", label: "워커 상태", icon: ServerCog },
  { href: "/settings", label: "설정", icon: Settings },
  { href: "/runs", label: "실행 로그", icon: ScrollText },
  { href: "/dev/test-lab", label: "스모크 테스트", icon: FlaskConical },
  { href: "/dev/webhook-test", label: "Webhook 테스트", icon: Webhook }
];

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white px-4 py-5 lg:block">
      <Link href="/dashboard" className="flex items-center gap-3 rounded-lg px-2 py-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-700 text-white">
          <Activity size={18} aria-hidden="true" />
        </span>
        <span>
          <span className="block text-sm font-bold text-slate-950">자동화</span>
          <span className="block text-xs text-slate-500">관제실</span>
        </span>
      </Link>
      <nav className="mt-8 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
            >
              <Icon size={17} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
