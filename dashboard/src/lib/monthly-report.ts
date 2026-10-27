import "server-only";
import ExcelJS from "exceljs";
import { and, asc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { projectMembers, projects, projectSchedule, users } from "@/db/schema";
import { todayInCairo } from "@/lib/installations";
import { makeT, type Locale } from "@/lib/i18n";
import type { EmailAttachment } from "@/lib/mail";

export type ReportPeriod = "previous" | "current";

export type CompletedProject = {
  id: string;
  name: string;
  clientName: string | null;
  createdAt: Date;
  completedAt: Date;
  devDeadline: string | null;
  installationDate: string | null;
};

const cairoDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const excelDate = (ymd: string | null | undefined) => {
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };

/** Calendar month in Cairo: previous full month, or this month up to today. */
export function reportRange(period: ReportPeriod, today = todayInCairo()) {
  const [y, m] = today.split("-").map(Number);
  if (period === "current") {
    return { year: y, month: m - 1, start: `${y}-${String(m).padStart(2, "0")}-01`, end: today };
  }
  const prev = new Date(Date.UTC(y, m - 1, 0));
  const year = prev.getUTCFullYear();
  const month = prev.getUTCMonth();
  const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const end = `${year}-${String(month + 1).padStart(2, "0")}-${String(prev.getUTCDate()).padStart(2, "0")}`;
  return { year, month, start, end };
}

export async function listCompletedInRange(start: string, end: string): Promise<CompletedProject[]> {
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      clientName: projects.clientName,
      createdAt: projects.createdAt,
      completedAt: projects.completedAt,
      devDeadline: projects.devDeadline,
      installationDate: projectSchedule.installationDate,
    })
    .from(projects)
    .leftJoin(projectSchedule, eq(projectSchedule.projectId, projects.id))
    .where(
      and(
        eq(projects.status, "completed"),
        isNotNull(projects.completedAt),
        sql`(${projects.completedAt} at time zone 'Africa/Cairo')::date between ${start}::date and ${end}::date`,
      ),
    )
    .orderBy(asc(projects.completedAt), asc(projects.name));
  return rows.filter((r): r is CompletedProject => r.completedAt != null);
}

export async function teamNames(projectIds: string[]) {
  if (!projectIds.length) return () => [] as string[];
  const rows = await db
    .select({ projectId: projectMembers.projectId, name: users.name })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(inArray(projectMembers.projectId, projectIds))
    .orderBy(asc(projectMembers.role), asc(users.name));
  return (id: string) => rows.filter((r) => r.projectId === id).map((r) => r.name);
}

export async function monthlyReportRecipients() {
  return db
    .select({ id: users.id, name: users.name, email: users.email, locale: users.locale })
    .from(users)
    .where(
      and(
        eq(users.status, "active"),
        or(and(eq(users.department, "business"), eq(users.isHead, true)), eq(users.isSuperAdmin, true)),
      ),
    );
}

export async function completedProjectsWorkbook(
  rows: CompletedProject[],
  locale: Locale,
  monthLabel: string,
  stamp: string,
): Promise<EmailAttachment> {
  const t = makeT(locale);
  const rtl = locale === "ar";
  const team = await teamNames(rows.map((r) => r.id));

  const wb = new ExcelJS.Workbook();
  wb.creator = "Studio OS";
  wb.created = new Date();

  const columns = [
    { header: t("Project"), width: 34 },
    { header: t("Client"), width: 22 },
    { header: t("Team"), width: 30 },
    { header: t("Brief date"), width: 14, date: true },
    { header: t("Dev deadline"), width: 14, date: true },
    { header: t("Installation date"), width: 16, date: true },
    { header: t("Completed date"), width: 16, date: true },
  ];

  const sheet = wb.addWorksheet(t("Completed projects"), { views: [{ rightToLeft: rtl, state: "frozen", ySplit: 3 }] });
  sheet.columns = columns.map((c) => ({ width: c.width }));
  const title = sheet.addRow([t("Completed projects — {month}", { month: monthLabel })]);
  title.font = { bold: true, size: 14 };
  sheet.addRow([t("{count} project(s)", { count: rows.length })]);
  const header = sheet.addRow(columns.map((c) => c.header));
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.eachCell((cell) => (cell.fill = HEADER_FILL));

  for (const p of rows) {
    const row = sheet.addRow([
      p.name,
      p.clientName ?? "",
      team(p.id).join(", "),
      excelDate(cairoDate(p.createdAt)),
      excelDate(p.devDeadline),
      excelDate(p.installationDate),
      excelDate(cairoDate(p.completedAt)),
    ]);
    columns.forEach((c, i) => {
      if (c.date) row.getCell(i + 1).numFmt = "yyyy-mm-dd";
    });
  }

  const file = Buffer.from(await wb.xlsx.writeBuffer());
  return {
    filename: `studio-os-completed-${stamp}.xlsx`,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    content: file.toString("base64"),
  };
}
