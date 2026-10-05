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
    <nav className="flex flex-col">
      {items.map((n) => {
        const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
        const Icon = ICONS[n.icon];
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 border-s-[3px] px-5 py-2.5 text-sm transition-colors ${
              active
                ? "border-white bg-sidebar-accent text-white"
                : "border-transparent hover:bg-sidebar-accent hover:text-white"
            }`}
          >
            <Icon className="size-4" />
            <span className="flex-1">{n.label}</span>
            {!!n.count && (
              <span className="rounded-full bg-destructive px-2 text-xs leading-5 font-semibold text-white">
                {n.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
