import { and, eq, gte, ne, sql } from "drizzle-orm";
import { flags } from "@/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { flagPeople, flagProjects, loadFlags, visibleFlagsWhere } from "@/lib/flags";
import { getI18n } from "@/lib/i18n/server";
import { RaiseFlagForm } from "../projects/work-forms";
import { FlagCard, myOpenParts, toPeople } from "./flag-card";

export default async function FlagsPage() {
  const me = await requireUser();
  const { t } = await getI18n();
  const [open, closed, people, projects] = await Promise.all([
    loadFlags(and(eq(flags.status, "open"), visibleFlagsWhere(me))),
    loadFlags(
      and(ne(flags.status, "open"), gte(flags.resolvedAt, sql`now() - interval '30 days'`), visibleFlagsWhere(me)),
    ),
    flagPeople(me),
    flagProjects(me),
  ]);

  const waitingOnMe = open.filter((f) => myOpenParts(me, f).length > 0);
  const sentByMe = open.filter((f) => !waitingOnMe.includes(f) && f.raisedBy === me.id);
  const others = open.filter((f) => !waitingOnMe.includes(f) && !sentByMe.includes(f));

  const section = (title: string, description: string, list: typeof open) =>
    list.length > 0 && (
      <Card>
        <CardHeader>
          <CardTitle>
            {title} ({list.length})
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {list.map((f) => (
            <FlagCard key={f.id} me={me} flag={f} />
          ))}
        </CardContent>
      </Card>
    );

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("Flags")}</h1>
        <p className="text-muted-foreground">
          {t("Ask anyone on the team for something you need. They and their head get an email.")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("Send a flag")}</CardTitle>
        </CardHeader>
        <CardContent>
          <RaiseFlagForm projects={projects} people={toPeople(people)} />
        </CardContent>
      </Card>

      {open.length === 0 && (
        <Card>
          <CardContent>
            <p className="py-6 text-center text-muted-foreground">{t("Nothing open.")}</p>
          </CardContent>
        </Card>
      )}

      {section(
        t("Waiting on you"),
        me.isHead ? t("Flags sent to you or to your team.") : t("Flags sent to you."),
        waitingOnMe,
      )}
      {section(t("Sent by you"), t("Waiting on others. You can cancel a flag you no longer need."), sentByMe)}
      {section(t("Other open flags"), t("Flags you can follow but don't need to act on."), others)}

      {closed.length > 0 && (
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer font-medium">
            {t("Closed in the last 30 days ({count})", { count: closed.length })}
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            {closed.map((f) => (
              <FlagCard key={f.id} me={me} flag={f} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
