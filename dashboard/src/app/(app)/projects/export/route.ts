import ExcelJS from "exceljs";
import { requireUser } from "@/lib/auth/session";
import { PROJECT_STATUS_LABELS } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { todayInCairo } from "@/lib/installations";
import { listProjects } from "@/lib/project-list";

const cairoDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
/** Excel stores dates without a time zone; a UTC midnight keeps the calendar day intact. */
const excelDate = (ymd: string | null | undefined) => {
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
const QUARTER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };

export async function GET(req: Request) {
  const me = await requireUser();
  const { t, locale } = await getI18n();
  const { rows, team, showBudget, showInstallation } = await listProjects(me);
  const byInstallation = showInstallation && new URL(req.url).searchParams.get("by") === "installation";

  const projects = rows
    .map((p) => {
      const briefDate = cairoDate(p.createdAt);
      const date = byInstallation ? (p.installationDate ?? null) : briefDate;
      const quarter = date ? `${date.slice(0, 4)}-Q${Math.ceil(Number(date.slice(5, 7)) / 3)}` : null;
      return { ...p, briefDate, date, quarter };
    })
    .sort((a, b) => {
      if (a.date === b.date) return a.name.localeCompare(b.name);
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date < b.date ? -1 : 1;
    });

  const quarters = [...new Set(projects.map((p) => p.quarter))];
  const quarterLabel = (q: string | null) =>
    q ? t("Q{quarter} {year}", { quarter: q.slice(6), year: q.slice(0, 4) }) : t("No date yet");
  const totals = (list: typeof projects) => {
    const sums = new Map<string, number>();
    for (const p of list) {
      if (p.budget == null) continue;
      const currency = p.currency ?? "EGP";
      sums.set(currency, (sums.get(currency) ?? 0) + Number(p.budget));
    }
    return [...sums].map(([c, n]) => `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${c}`).join(" + ");
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = "Studio OS";
  wb.created = new Date();
  const rtl = locale === "ar";

  const columns: { header: string; width: number; date?: boolean; money?: boolean }[] = [
    { header: t("Project"), width: 34 },
    { header: t("Client"), width: 22 },
    { header: t("Status"), width: 20 },
    { header: t("Team"), width: 30 },
    { header: t("Brief date"), width: 14, date: true },
    { header: t("Dev deadline"), width: 14, date: true },
    ...(showInstallation ? [{ header: t("Installation date"), width: 16, date: true }] : []),
    ...(showBudget
      ? [
          { header: t("Budget"), width: 16, money: true },
          { header: t("Currency"), width: 10 },
        ]
      : []),
  ];

  const sheet = wb.addWorksheet(t("Projects"), { views: [{ rightToLeft: rtl, state: "frozen", ySplit: 3 }] });
  sheet.columns = columns.map((c) => ({ width: c.width }));
  const title = sheet.addRow([
    t("Projects by quarter ({basis}) — exported {date}", {
      basis: byInstallation ? t("installation date") : t("brief date"),
      date: todayInCairo(),
    }),
  ]);
  title.font = { bold: true, size: 14 };
  sheet.addRow([]);
  const header = sheet.addRow(columns.map((c) => c.header));
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.eachCell((cell) => (cell.fill = HEADER_FILL));

  for (const q of quarters) {
    const list = projects.filter((p) => p.quarter === q);
    const band = sheet.addRow([`${quarterLabel(q)} · ${t("{count} project(s)", { count: list.length })}`]);
    sheet.mergeCells(band.number, 1, band.number, columns.length);
    band.font = { bold: true };
    band.getCell(1).fill = QUARTER_FILL;

    for (const p of list) {
      const row = sheet.addRow([
        p.name,
        p.clientName ?? "",
        t(PROJECT_STATUS_LABELS[p.status]),
        team(p.id).join(", "),
        excelDate(p.briefDate),
        excelDate(p.devDeadline),
        ...(showInstallation ? [excelDate(p.installationDate)] : []),
        ...(showBudget
          ? [p.budget == null ? null : Number(p.budget), p.budget == null ? "" : (p.currency ?? "EGP")]
          : []),
      ]);
      columns.forEach((c, i) => {
        if (c.date) row.getCell(i + 1).numFmt = "yyyy-mm-dd";
        if (c.money) row.getCell(i + 1).numFmt = "#,##0.00";
      });
    }

    if (showBudget && totals(list)) {
      const total = sheet.addRow([`${t("Total")}: ${totals(list)}`]);
      sheet.mergeCells(total.number, 1, total.number, columns.length);
      total.font = { italic: true };
    }
    sheet.addRow([]);
  }

  const summary = wb.addWorksheet(t("Summary"), { views: [{ rightToLeft: rtl }] });
  summary.columns = [{ width: 18 }, { width: 12 }, ...(showBudget ? [{ width: 40 }] : [])];
  const sumHeader = summary.addRow([t("Quarter"), t("Projects"), ...(showBudget ? [t("Total budget")] : [])]);
  sumHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };
  sumHeader.eachCell((cell) => (cell.fill = HEADER_FILL));
  for (const q of quarters) {
    const list = projects.filter((p) => p.quarter === q);
    summary.addRow([quarterLabel(q), list.length, ...(showBudget ? [totals(list) || "—"] : [])]);
  }
  const all = summary.addRow([t("Total"), projects.length, ...(showBudget ? [totals(projects) || "—"] : [])]);
  all.font = { bold: true };

  const file = await wb.xlsx.writeBuffer();
  const name = `studio-os-projects-${todayInCairo()}.xlsx`;
  return new Response(file, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
