import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { countMyOpenFlags } from "@/lib/flags";
import {
  canAssign,
  canManageAnyUsers,
  canManageEquipment,
  canRequestEquipment,
  canViewBudget,
  roleTitle,
} from "@/lib/permissions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const me = await requireUser({ allowPasswordChange: true });
  const ready = !me.mustChangePassword;
  const openFlags = ready ? await countMyOpenFlags(me) : 0;

  const nav = [
    { href: "/", label: "Home", show: ready },
    { href: "/projects", label: "Projects", show: ready },
    { href: "/flags", label: "Flags", show: ready, count: openFlags },
    { href: "/assignments", label: "Assignments", show: ready && canAssign(me) },
    { href: "/equipment", label: "Equipment", show: ready && (canRequestEquipment(me) || canManageEquipment(me)) },
    { href: "/finance", label: "Finance", show: ready && canViewBudget(me) },
    { href: "/users", label: "Users", show: ready && canManageAnyUsers(me) },
    { href: "/account", label: "Account", show: true },
  ].filter((n) => n.show);

  return (
    <div className="flex min-h-full flex-1">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-muted/30 p-4">
        <div className="mb-6 px-2 text-lg font-semibold">Studio OS</div>
        <nav className="flex flex-col gap-1">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              {n.label}
              {!!n.count && (
                <span className="rounded-full bg-destructive px-1.5 text-xs font-medium text-white">{n.count}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 border-t pt-4">
          <div className="px-2">
            <div className="text-sm font-medium">{me.name}</div>
            <div className="text-xs text-muted-foreground">{roleTitle(me)}</div>
          </div>
          <form action={logout}>
            <Button type="submit" variant="outline" size="sm" className="w-full">
              Sign out
            </Button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
