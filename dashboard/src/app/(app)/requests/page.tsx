import { and, eq, gte, ne, sql } from "drizzle-orm";
import Link from "next/link";
import { flags } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { listCatalogForRequest } from "@/lib/equipment";
import { countMyOpenFlags, flagPeople, flagProjects, loadFlags, visibleFlagsWhere } from "@/lib/flags";
import { getI18n } from "@/lib/i18n/server";
import { canRequestEquipment } from "@/lib/permissions";
import { requestableProjects } from "@/lib/projects";
import { NewEquipmentRequestButton, NewRequestButton } from "../projects/work-forms";
import { FlagCard, myOpenParts, toPeople } from "./flag-card";

export default async function RequestsPage(props: PageProps<"/requests">) {
  const me = await requireUser();
  const { t } = await getI18n();
  const showClosed = (await props.searchParams).view === "closed";

  const canRequest = canRequestEquipment(me);
  const [list, people, projects, waiting, catalog, equipmentProjects] = await Promise.all([
    showClosed
      ? loadFlags(
          and(ne(flags.status, "open"), gte(flags.resolvedAt, sql`now() - interval '90 days'`), visibleFlagsWhere(me)),
        )
      : loadFlags(and(eq(flags.status, "open"), visibleFlagsWhere(me))),
    flagPeople(me),
    flagProjects(me),
    countMyOpenFlags(me),
    canRequest ? listCatalogForRequest() : Promise.resolve([]),
    canRequest ? requestableProjects(me) : Promise.resolve([]),
  ]);
  const requestItems = catalog.map((i) => ({
    id: i.id,
    name: i.name,
    code: i.code,
    status: i.status,
    free: i.status === "active" ? i.quantity - i.inUse : 0,
  }));

  const waitingOnMe = showClosed ? [] : list.filter((f) => myOpenParts(me, f).length > 0);
  const sentByMe = showClosed ? [] : list.filter((f) => !waitingOnMe.includes(f) && f.raisedBy === me.id);
  const others = showClosed ? [] : list.filter((f) => !waitingOnMe.includes(f) && !sentByMe.includes(f));

  const section = (title: string, description: string, items: typeof list) =>
    items.length > 0 && (
      <Card>
        <CardHeader>
          <CardTitle>
            {title} ({items.length})
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {items.map((f) => (
            <FlagCard key={f.id} me={me} flag={f} />
          ))}
        </CardContent>
      </Card>
    );

  const tab = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`border-b-2 px-1 pb-2 text-sm ${active ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <PageHeader
        title={t("Requests")}
        description={t("Ask anyone on the team for something you need. They and their head get an email.")}
        actions={
          <>
            {canRequest && <NewEquipmentRequestButton projects={equipmentProjects} items={requestItems} />}
            <NewRequestButton projects={projects} people={toPeople(people)} />
          </>
        }
      />

      <div className="flex w-fit gap-6 border-b">
        {tab(
          "/requests",
          waiting > 0 ? t("Open ({count} waiting on you)", { count: waiting }) : t("Open"),
          !showClosed,
        )}
        {tab("/requests?view=closed", t("Closed"), showClosed)}
      </div>

      {list.length === 0 && (
        <Card>
          <CardContent>
            <p className="py-6 text-center text-muted-foreground">
              {showClosed ? t("No requests closed in the last 90 days.") : t("Nothing open.")}
            </p>
          </CardContent>
        </Card>
      )}

      {showClosed ? (
        <div className="flex flex-col gap-3">
          {list.map((f) => (
            <FlagCard key={f.id} me={me} flag={f} />
          ))}
        </div>
      ) : (
        <>
          {section(
            t("Waiting on you"),
            me.isHead ? t("Requests sent to you or to your team.") : t("Requests sent to you."),
            waitingOnMe,
          )}
          {section(
            t("Sent by you"),
            t("Waiting on others. Send a reminder, or cancel a request you no longer need."),
            sentByMe,
          )}
          {section(t("Other open requests"), t("Requests you can follow but don't need to act on."), others)}
        </>
      )}
    </div>
  );
}
