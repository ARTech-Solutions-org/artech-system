import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { LanguageSwitch } from "@/components/language-switch";
import { SideNav, type NavItem } from "@/components/side-nav";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { countMyOpenFlags } from "@/lib/flags";
import type { Msg } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import {
  canAssign,
  canManageAnyUsers,
  canManageEquipment,
  canManageSuppliers,
  canRequestEquipment,
  canViewBudget,
  canViewInstallationDate,
  roleTitle,
} from "@/lib/permissions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const me = await requireUser({ allowPasswordChange: true });
  const { t } = await getI18n();
  const ready = !me.mustChangePassword;
  const openFlags = ready ? await countMyOpenFlags(me) : 0;

  const nav: (Omit<NavItem, "label"> & { label: Msg; show: boolean })[] = [
    { href: "/", label: "Home", icon: "home", show: ready },
    { href: "/projects", label: "Projects", icon: "projects", show: ready },
    { href: "/requests", label: "Requests", icon: "requests", show: ready, count: openFlags },
    { href: "/assignments", label: "Assignments", icon: "assignments", show: ready && canAssign(me) },
    {
      href: "/installations",
      label: "Installations",
      icon: "installations",
      show: ready && canViewInstallationDate(me),
    },
    {
      href: "/equipment",
      label: "Equipment",
      icon: "equipment",
      show: ready && (canRequestEquipment(me) || canManageEquipment(me)),
    },
    { href: "/suppliers", label: "Suppliers", icon: "suppliers", show: ready && canManageSuppliers(me) },
    { href: "/finance", label: "Finance", icon: "finance", show: ready && canViewBudget(me) },
    { href: "/users", label: "Users", icon: "users", show: ready && canManageAnyUsers(me) },
    { href: "/activity", label: "Activity", icon: "activity", show: ready && me.isSuperAdmin },
    { href: "/automations", label: "Automations", icon: "automations", show: ready && me.isSuperAdmin },
    { href: "/account", label: "Account", icon: "account", show: true },
  ];
  const items: NavItem[] = nav
    .filter((n) => n.show)
    .map((n) => ({ href: n.href, icon: n.icon, count: n.count, label: t(n.label) }));
  const initials = me.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-full flex-1 bg-background">
      <aside className="sticky top-0 flex h-svh w-64 shrink-0 flex-col overflow-y-auto border-e border-sidebar-border bg-sidebar text-sidebar-foreground">
        <Link href="/" className="flex flex-col gap-3 px-6 pt-8 pb-6" aria-label="ARTECH">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/artech-wordmark-white.png" alt="ARTECH" className="h-4 w-auto" />
          <span className="font-heading text-[9px] font-semibold tracking-[0.32em] text-white/35 uppercase">
            {t("Live the experience")}
          </span>
        </Link>
        <SideNav items={items} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-end gap-3 border-b border-border px-5 sm:px-8">
          <LanguageSwitch />
          <div className="h-5 w-px bg-border" />
          <div className="flex items-center gap-3">
            <div className="text-end leading-tight whitespace-nowrap max-sm:hidden">
              <div className="text-sm font-medium">{me.name}</div>
              <div className="text-[11px] text-muted-foreground">{t(roleTitle(me))}</div>
            </div>
            <span className="flex size-9 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-black">
              {initials}
            </span>
          </div>
          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm">
              {t("Sign out")}
            </Button>
          </form>
        </header>
        <main className="min-w-0 flex-1 overflow-auto px-5 py-7 sm:px-8 lg:px-10 lg:py-9">{children}</main>
      </div>
    </div>
  );
}
