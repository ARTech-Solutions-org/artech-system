import { audit } from "@/lib/audit";
import { runDaily, runWeekly } from "@/lib/automations";
import { isAutomationRequest } from "@/lib/mail";

const JOBS = { daily: runDaily, weekly: runWeekly };

/** Triggered by the scheduled n8n workflows with the `x-studio-secret` header. */
export async function POST(req: Request, ctx: RouteContext<"/api/automations/[job]">) {
  if (!isAutomationRequest(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { job } = await ctx.params;
  if (!(job in JOBS)) return Response.json({ error: "Unknown job" }, { status: 404 });

  const result = await JOBS[job as keyof typeof JOBS]();
  await audit({ userId: null, action: `automation_${job}`, entity: "automation", entityId: job, changes: result });
  return Response.json(result);
}
