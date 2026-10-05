import { alias } from "drizzle-orm/pg-core";
import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { flags, projects, users } from "@/db/schema";
import { LinkedText } from "@/components/linked-text";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { myOpenFlagsWhere } from "@/lib/flags";
import { FLAG_TYPE_LABELS, formatDateTime } from "@/lib/format";
import { canResolveFlag, DEPARTMENT_LABELS } from "@/lib/permissions";
import { ResolveFlagForm } from "../projects/work-forms";

export default async function FlagsPage() {
  const me = await requireUser();
  const raiser = alias(users, "raiser");

  const rows = await db
    .select({
      id: flags.id,
      type: flags.type,
      details: flags.details,
      ownerDepartment: flags.ownerDepartment,
      raisedBy: flags.raisedBy,
      raisedByName: raiser.name,
      createdAt: flags.createdAt,
      projectId: projects.id,
      projectName: projects.name,
    })
    .from(flags)
    .innerJoin(projects, eq(projects.id, flags.projectId))
    .innerJoin(raiser, eq(raiser.id, flags.raisedBy))
    .where(myOpenFlagsWhere(me))
    .orderBy(asc(flags.createdAt));

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Open flags</h1>
        <p className="text-muted-foreground">
          {me.isSuperAdmin
            ? "Every open flag."
            : `Flags waiting on ${me.department ? DEPARTMENT_LABELS[me.department] : "you"}, and flags you raised.`}
        </p>
      </div>

      {rows.length === 0 && (
        <Card>
          <CardContent>
            <p className="py-6 text-center text-muted-foreground">Nothing open.</p>
          </CardContent>
        </Card>
      )}

      {rows.map((f) => (
        <Card key={f.id}>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="destructive">{FLAG_TYPE_LABELS[f.type]}</Badge>
              <Link href={`/projects/${f.projectId}`} className="font-medium underline-offset-4 hover:underline">
                {f.projectName}
              </Link>
              <span className="text-muted-foreground">
                for {DEPARTMENT_LABELS[f.ownerDepartment]} · raised by {f.raisedByName} on {formatDateTime(f.createdAt)}
              </span>
            </div>
            <LinkedText text={f.details} />
            {canResolveFlag(me, f) && <ResolveFlagForm flagId={f.id} />}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
