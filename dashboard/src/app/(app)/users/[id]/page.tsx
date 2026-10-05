import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { setUserStatus } from "@/app/actions/users";
import { db } from "@/db";
import { users } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { USER_STATUS_LABELS } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { canManageUser, canSetHead, roleTitle } from "@/lib/permissions";
import { EditUserForm, ResetPasswordForm } from "./user-forms";

export default async function UserPage({ params }: PageProps<"/users/[id]">) {
  const me = await requireUser();
  const { t } = await getI18n();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      department: users.department,
      isHead: users.isHead,
      isSuperAdmin: users.isSuperAdmin,
      status: users.status,
    })
    .from(users)
    .where(eq(users.id, id.data));
  if (!user || !canManageUser(me, user)) notFound();

  const isSelf = user.id === me.id;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/users" className="text-sm text-muted-foreground hover:underline">
          {t("← Users")}
        </Link>
        <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold">
          {user.name}
          <Badge variant={user.status === "active" ? "secondary" : "destructive"}>
            {t(USER_STATUS_LABELS[user.status])}
          </Badge>
        </h1>
        <p className="text-muted-foreground">{t(roleTitle(user))}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("Details")}</CardTitle>
        </CardHeader>
        <CardContent>
          <EditUserForm user={user} canSetHead={canSetHead(me)} />
        </CardContent>
      </Card>

      {!isSelf && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("Password")}</CardTitle>
              <CardDescription>
                {t("Signs the user out everywhere. They must choose a new password on next login.")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResetPasswordForm userId={user.id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("Access")}</CardTitle>
              <CardDescription>
                {user.status === "active"
                  ? t("Disabling signs the user out immediately and blocks login. Their history is kept.")
                  : t("Enabling lets the user sign in again.")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={setUserStatus}>
                <input type="hidden" name="id" value={user.id} />
                <input type="hidden" name="status" value={user.status === "active" ? "disabled" : "active"} />
                <Button type="submit" variant={user.status === "active" ? "destructive" : "default"}>
                  {user.status === "active" ? t("Disable account") : t("Enable account")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
