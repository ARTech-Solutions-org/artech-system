import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { DEPARTMENT_LABELS, roleTitle } from "@/lib/permissions";
import { ChangePasswordForm } from "./change-password-form";

export default async function AccountPage() {
  const me = await requireUser({ allowPasswordChange: true });
  const { t } = await getI18n();

  return (
    <div className="flex max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("Account")}</h1>

      {me.mustChangePassword && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {t("You are using a temporary password. Choose a new one to continue.")}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{me.name}</CardTitle>
          <CardDescription>
            <span dir="ltr">{me.email}</span> · {t(roleTitle(me))}
            {me.department && !me.isSuperAdmin ? ` · ${t(DEPARTMENT_LABELS[me.department])}` : ""}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Change password")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
