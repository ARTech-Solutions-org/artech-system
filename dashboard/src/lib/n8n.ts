import "server-only";

export type N8nWorkflow = { id: string; name: string; active: boolean; updatedAt: string };
export type N8nExecution = {
  id: string;
  workflowId: string;
  status: "success" | "error" | "crashed" | "running" | "waiting" | "canceled" | "new" | "unknown";
  mode: string;
  startedAt: string;
  stoppedAt: string | null;
};

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${process.env.N8N_URL}/api/v1${path}`, {
    headers: { "X-N8N-API-KEY": process.env.N8N_API_KEY ?? "" },
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`n8n API ${res.status}`);
  return res.json();
}

/** Studio OS workflows and their latest runs; `error` is set when n8n can't be reached. */
export async function automationStatus() {
  if (!process.env.N8N_URL) return { error: null, workflows: [], executions: [] };
  try {
    const [workflows, executions] = await Promise.all([
      api<{ data: N8nWorkflow[] }>("/workflows?limit=100"),
      api<{ data: N8nExecution[] }>("/executions?limit=50"),
    ]);
    const ours = workflows.data.filter((w) => w.name.startsWith("[Studio OS]"));
    const ids = new Set(ours.map((w) => w.id));
    return {
      error: null,
      workflows: ours.sort((a, b) => a.name.localeCompare(b.name)),
      executions: executions.data.filter((e) => ids.has(e.workflowId)).slice(0, 20),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), workflows: [], executions: [] };
  }
}
