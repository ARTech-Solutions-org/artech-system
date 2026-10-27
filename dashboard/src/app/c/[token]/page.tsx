import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LanguageSwitch } from "@/components/language-switch";
import { LinkedText } from "@/components/linked-text";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { feedbackComments, feedbackItems, feedbackRounds, projects } from "@/db/schema";
import { CLIENT_FEEDBACK_STATUS_LABELS, type FeedbackStatus } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { ClientFeedbackForm, ClientReplyForm } from "./client-forms";

export const metadata: Metadata = { title: "ARTECH", robots: { index: false, follow: false } };

const ORDER: Record<FeedbackStatus, number> = {
  done: 0,
  in_progress: 1,
  new: 2,
  awaiting_scope: 3,
  client_approved: 4,
  rejected: 5,
};

export default async function ClientFeedbackPage({ params }: PageProps<"/c/[token]">) {
  const { token } = await params;
  if (token.length < 20 || token.length > 64) notFound();
  const [project] = await db
    .select({ id: projects.id, name: projects.name, clientName: projects.clientName })
    .from(projects)
    .where(eq(projects.clientToken, token));
  if (!project) notFound();
  const { t, fmt } = await getI18n();

  const [items, comments] = await Promise.all([
    db
      .select({
        id: feedbackItems.id,
        body: feedbackItems.body,
        status: feedbackItems.status,
        receivedOn: feedbackItems.receivedOn,
        round: feedbackRounds.number,
      })
      .from(feedbackItems)
      .innerJoin(feedbackRounds, eq(feedbackRounds.id, feedbackItems.roundId))
      .where(eq(feedbackItems.projectId, project.id))
      .orderBy(desc(feedbackRounds.number), asc(feedbackItems.createdAt)),
    // Only the client's own replies are shown; team discussion stays internal.
    db
      .select({
        id: feedbackComments.id,
        itemId: feedbackComments.itemId,
        clientName: feedbackComments.clientName,
        body: feedbackComments.body,
        createdAt: feedbackComments.createdAt,
      })
      .from(feedbackComments)
      .innerJoin(feedbackItems, eq(feedbackItems.id, feedbackComments.itemId))
      .where(and(eq(feedbackItems.projectId, project.id), isNotNull(feedbackComments.clientName)))
      .orderBy(asc(feedbackComments.createdAt)),
  ]);

  const sorted = [...items].sort((a, b) => b.round - a.round || ORDER[a.status] - ORDER[b.status]);
  const ready = items.filter((i) => i.status === "done").length;

  return (
    <main className="flex flex-1 flex-col items-center gap-8 bg-brand-black p-4 sm:p-10">
      <div className="flex flex-col items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/artech-logo-white.png" alt="ARTECH, Live the experience" className="w-48 max-w-full" />
        <p className="text-[10px] font-medium tracking-[0.32em] text-white/45 uppercase">{t("Studio")}</p>
      </div>
      <div className="flex w-full max-w-2xl flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-light tracking-tight">{project.name}</CardTitle>
            <CardDescription>
              {project.clientName ? `${project.clientName} · ` : ""}
              {t("Send us your comments and follow every change you asked for.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ClientFeedbackForm token={token} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("Your requests")}</CardTitle>
            <CardDescription>
              {ready
                ? t("{count} item(s) are ready for your review.", { count: ready })
                : t("We'll show items here as soon as they are ready for your review.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {sorted.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("No requests yet.")}</p>
            ) : (
              sorted.map((i) => {
                const replies = comments.filter((c) => c.itemId === i.id);
                return (
                  <div
                    key={i.id}
                    className={`flex flex-col gap-2 border p-3 ${
                      i.status === "done" ? "border-violet-500/50 bg-violet-500/5" : ""
                    } ${i.status === "rejected" ? "opacity-60" : ""}`}
                  >
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="rounded-full border px-2 py-0.5 text-xs font-medium">
                        {t(CLIENT_FEEDBACK_STATUS_LABELS[i.status])}
                      </span>
                      <span className="text-muted-foreground">
                        {t("Round {n}", { n: i.round })} · {fmt.date(i.receivedOn)}
                      </span>
                    </div>
                    <LinkedText text={i.body} />
                    {replies.length > 0 && (
                      <ul className="flex flex-col gap-1 border-s-2 ps-3 text-sm">
                        {replies.map((c) => (
                          <li key={c.id}>
                            <span className="font-medium">{c.clientName}</span>{" "}
                            <span className="text-xs text-muted-foreground">{fmt.dateTime(c.createdAt)}</span>
                            <LinkedText text={c.body} />
                          </li>
                        ))}
                      </ul>
                    )}
                    {i.status === "done" && <ClientReplyForm token={token} itemId={i.id} />}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
      <LanguageSwitch className="[&_button]:text-white/70 [&_button]:hover:bg-white/10 [&_button]:hover:text-white" />
    </main>
  );
}
