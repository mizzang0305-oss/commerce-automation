import Link from "next/link";
import {
  Activity,
  BriefcaseBusiness,
  CalendarClock,
  ClipboardCheck,
  FileVideo,
  FlaskConical,
  Image,
  LayoutDashboard,
  ListChecks,
  RadioTower,
  ScrollText,
  ServerCog,
  Settings,
  ShieldCheck,
  UploadCloud,
  Webhook
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/queue", label: "Queue", icon: ListChecks },
  { href: "/candidates", label: "Candidates", icon: ClipboardCheck },
  { href: "/candidates/analytics", label: "Candidate Analytics", icon: ClipboardCheck },
  { href: "/image-prompts", label: "Image Prompts", icon: Image },
  { href: "/planner", label: "Planner", icon: CalendarClock },
  { href: "/channels", label: "Channels", icon: RadioTower },
  { href: "/uploads", label: "Uploads", icon: UploadCloud },
  { href: "/ops/production-readiness", label: "Production Readiness", icon: ShieldCheck },
  { href: "/artifacts", label: "Artifact QA", icon: FileVideo },
  { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
  { href: "/workers", label: "Workers", icon: ServerCog },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/runs", label: "Runs", icon: ScrollText },
  { href: "/dev/test-lab", label: "Dev Test Lab", icon: FlaskConical },
  { href: "/dev/webhook-test", label: "Webhook Test", icon: Webhook }
];

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white px-4 py-5 lg:block">
      <Link href="/dashboard" className="flex items-center gap-3 rounded-lg px-2 py-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-700 text-white">
          <Activity size={18} aria-hidden="true" />
        </span>
        <span>
          <span className="block text-sm font-bold text-slate-950">Commerce Automation</span>
          <span className="block text-xs text-slate-500">Control room</span>
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
