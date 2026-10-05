import "server-only";
import { timingSafeEqual } from "node:crypto";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { dirOf, type Formatters, isLocale, type Locale, makeFormatters, makeT, type T } from "@/lib/i18n";

export type Recipient = { id: string | null; name: string; email: string; locale: string };

/** What an email says, built once per recipient in their language. */
export type EmailContent = {
  subject: string;
  heading?: string;
  lines: string[];
  /** Path inside the dashboard, e.g. `/projects/123`. */
  link?: { label: string; path: string };
};

export type OutgoingEmail = {
  event: string;
  recipient: Recipient;
  content: (t: T, fmt: Formatters) => EmailContent;
  projectId?: string;
  /** Emails with the same key go to each address at most once. */
  dedupeKey?: string;
};

const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const webhookUrl = () => `${(process.env.N8N_URL ?? "").replace(/\/$/, "")}/webhook/studio-os-email`;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function render(content: EmailContent, locale: Locale, t: T) {
  const dir = dirOf(locale);
  const align = dir === "rtl" ? "right" : "left";
  const url = content.link ? appUrl() + content.link.path : null;
  const footer = t("You get this email because you have an account on Studio OS.");
  const font =
    locale === "ar" ? "Tahoma, 'Segoe UI', Arial, sans-serif" : "-apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

  const html = `<!doctype html>
<html lang="${locale}" dir="${dir}">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:${font};color:#18181b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${dir}" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;text-align:${align}">
        <tr><td style="padding:20px 24px 0;font-size:13px;color:#71717a;font-weight:600">Studio OS</td></tr>
        <tr><td style="padding:8px 24px 0;font-size:18px;font-weight:600;line-height:1.4">${escapeHtml(content.heading ?? content.subject)}</td></tr>
        <tr><td style="padding:12px 24px 0;font-size:14px;line-height:1.7">
          ${content.lines.map((l) => `<p dir="auto" style="margin:0 0 8px;white-space:pre-wrap">${escapeHtml(l)}</p>`).join("")}
        </td></tr>
        ${
          url
            ? `<tr><td style="padding:12px 24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px">${escapeHtml(content.link!.label)}</a></td></tr>`
            : ""
        }
        <tr><td style="padding:20px 24px;font-size:12px;color:#a1a1aa">${escapeHtml(footer)}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    content.heading ?? content.subject,
    "",
    ...content.lines,
    ...(url ? ["", `${content.link!.label}: ${url}`] : []),
  ]
    .concat(["", "—", footer])
    .join("\n");
  return { html, text };
}

/**
 * Logs each email, then hands the batch to the n8n email workflow, which sends it through the SMTP credential.
 * Never throws: a failed send is recorded in `notifications` and shown on the Automations page.
 */
export async function sendEmails(emails: OutgoingEmail[]) {
  const ready = emails.filter((e) => e.recipient.email.includes("@"));
  if (!ready.length) return { sent: 0, failed: 0 };

  const rows = ready.map((e) => {
    const locale = isLocale(e.recipient.locale) ? e.recipient.locale : "en";
    const t = makeT(locale);
    const content = e.content(t, makeFormatters(locale));
    return { e, content, ...render(content, locale, t) };
  });

  const inserted = await db
    .insert(notifications)
    .values(
      rows.map(({ e, content }) => ({
        event: e.event,
        dedupeKey: e.dedupeKey ?? null,
        userId: e.recipient.id,
        email: e.recipient.email,
        subject: content.subject,
        projectId: e.projectId ?? null,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: notifications.id, email: notifications.email, dedupeKey: notifications.dedupeKey });
  if (!inserted.length) return { sent: 0, failed: 0 };

  const batch = inserted.map((row) => {
    const match = rows.find((r) => r.e.recipient.email === row.email && (r.e.dedupeKey ?? null) === row.dedupeKey)!;
    return {
      id: row.id,
      to: row.email,
      from: process.env.MAIL_FROM ?? "Studio OS <developers@artechsolutions.io>",
      subject: match.content.subject,
      html: match.html,
      text: match.text,
    };
  });
  const ids = batch.map((b) => b.id);

  let error: string | null = null;
  try {
    if (!process.env.N8N_URL || !process.env.AUTOMATION_SECRET)
      throw new Error("N8N_URL or AUTOMATION_SECRET is not set");
    const res = await fetch(webhookUrl(), {
      method: "POST",
      headers: { "content-type": "application/json", "x-studio-secret": process.env.AUTOMATION_SECRET },
      body: JSON.stringify({ emails: batch }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) error = `n8n answered ${res.status}: ${(await res.text()).slice(0, 300)}`;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  await db
    .update(notifications)
    .set(error ? { status: "failed", error } : { status: "sent", sentAt: new Date() })
    .where(inArray(notifications.id, ids));
  return error ? { sent: 0, failed: ids.length } : { sent: ids.length, failed: 0 };
}

export function isAutomationRequest(req: Request) {
  const secret = process.env.AUTOMATION_SECRET;
  const given = req.headers.get("x-studio-secret");
  if (!secret || !given) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
