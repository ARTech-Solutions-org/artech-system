import { audit } from "@/lib/audit";
import { runDaily, runMonthly, runWeekly } from "@/lib/automations";
import { isAutomationRequest } from "@/lib/mail";

export const maxDuration = 60;

const JOBS = { daily: runDaily, weekly: runWeekly, monthly: () => runMonthly("previous") };

async function run(req: Request, ctx: RouteContext<"/api/automations/[job]">) {
  if (!isAutomationRequest(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { job } = await ctx.params;
  if (!(job in JOBS)) return Response.json({ error: "Unknown job" }, { status: 404 });

  const result = await JOBS[job as keyof typeof JOBS]();
  await audit({ userId: null, action: `automation_${job}`, entity: "automation", entityId: job, changes: result });
  return Response.json(result);
}

/** Vercel Cron sends GET with `Authorization: Bearer CRON_SECRET`. */
export function GET(req: Request, ctx: RouteContext<"/api/automations/[job]">) {
  return run(req, ctx);
}

/** n8n (local) and the Automations page send POST with `x-studio-secret`. */
export function POST(req: Request, ctx: RouteContext<"/api/automations/[job]">) {
  return run(req, ctx);
}
