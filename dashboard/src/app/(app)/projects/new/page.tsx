import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { canEditBrief, canEditBudget, canEditInstallationDate } from "@/lib/permissions";
import { CreateProjectForm } from "../project-forms";

export default async function NewProjectPage() {
  const me = await requireUser();
  if (!canEditBrief(me)) redirect("/projects");
  const { t } = await getI18n();

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/projects" className="text-sm text-muted-foreground hover:underline">
          {t("← Projects")}
        </Link>
        <PageHeader
          title={t("New brief")}
          description={t("Once created, the brief appears in the Tech Head's queue.")}
        />
      </div>
      <Card>
        <CardContent>
          <CreateProjectForm withBudget={canEditBudget(me)} withSchedule={canEditInstallationDate(me)} />
        </CardContent>
      </Card>
    </div>
  );
}
