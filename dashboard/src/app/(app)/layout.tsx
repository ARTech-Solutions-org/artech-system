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
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 flex h-14 shrink-0 border-b bg-card shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        <Link href="/" className="flex w-56 shrink-0 items-center bg-brand-black px-5" aria-label="ARTECH">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/artech-wordmark-white.png" alt="ARTECH" className="h-4 w-auto" />
        </Link>
        <div className="flex flex-1 items-center justify-end gap-2 px-5">
          <LanguageSwitch />
          <div className="mx-2 h-6 w-px bg-border" />
          <div className="flex items-center gap-3">
            <div className="text-end leading-tight whitespace-nowrap max-sm:hidden">
              <div className="text-sm font-medium">{me.name}</div>
              <div className="text-xs text-muted-foreground">{t(roleTitle(me))}</div>
            </div>
            <span className="flex size-9 items-center justify-center rounded-full bg-brand-black text-xs font-semibold text-white">
              {initials}
            </span>
          </div>
          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm">
              {t("Sign out")}
            </Button>
          </form>
        </div>
      </header>
      <div className="flex flex-1">
        <aside className="sticky top-14 flex h-[calc(100vh-3.5rem)] w-56 shrink-0 flex-col overflow-y-auto bg-sidebar text-sidebar-foreground">
          <div className="px-5 pt-5 pb-2 text-[11px] font-medium tracking-[0.2em] uppercase opacity-60">
            {t("Navigation")}
          </div>
          <SideNav items={items} />
          <div className="mt-auto px-5 py-4 text-[10px] tracking-[0.3em] uppercase opacity-40">Live the experience</div>
        </aside>
        <main className="min-w-0 flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
