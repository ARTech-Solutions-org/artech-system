"use client";

import {
  Activity,
  CalendarClock,
  ClipboardList,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  Package,
  Truck,
  UserCog,
  Users,
  Wallet,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS = {
  home: LayoutDashboard,
  projects: FolderKanban,
  requests: Inbox,
  assignments: ClipboardList,
  installations: CalendarClock,
  equipment: Package,
  suppliers: Truck,
  finance: Wallet,
  users: Users,
  activity: Activity,
  automations: Workflow,
  account: UserCog,
} satisfies Record<string, LucideIcon>;

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; count?: number };

export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 px-3">
      {items.map((n) => {
        const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
        const Icon = ICONS[n.icon];
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition-colors ${
              active ? "bg-white/10 text-white" : "text-white/55 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon className="size-4 opacity-80" />
            <span className="flex-1">{n.label}</span>
            {!!n.count && (
              <span className="rounded-full bg-destructive px-1.5 text-[10px] leading-5 font-semibold text-white">
                {n.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
