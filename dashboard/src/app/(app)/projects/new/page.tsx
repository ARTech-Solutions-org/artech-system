import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { canEditBrief, canEditBudget, canEditInstallationDate } from "@/lib/permissions";
import { CreateProjectForm } from "../project-forms";

export default async function NewProjectPage() {
  const me = await requireUser();
  if (!canEditBrief(me)) redirect("/projects");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/projects" className="text-sm text-muted-foreground hover:underline">
          ← Projects
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">New brief</h1>
        <p className="text-muted-foreground">Once created, the brief appears in the Tech Head&apos;s queue.</p>
      </div>
      <Card>
        <CardContent>
          <CreateProjectForm withBudget={canEditBudget(me)} withSchedule={canEditInstallationDate(me)} />
        </CardContent>
      </Card>
    </div>
  );
}
