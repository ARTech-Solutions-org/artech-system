import { config } from "dotenv";

config({ path: ".env.local" });

// Creates or updates the Studio OS credentials and workflows in n8n. Safe to run again.
// SMTP: uses SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD/SMTP_SECURE when set, otherwise the local Mailpit test inbox.

const N8N_URL = (process.env.N8N_URL ?? "http://localhost:5678").replace(/\/$/, "");
const API_KEY = process.env.N8N_API_KEY;
const SECRET = process.env.AUTOMATION_SECRET;
if (!API_KEY || !SECRET) throw new Error("Set N8N_API_KEY and AUTOMATION_SECRET in .env.local");

const SMTP_CREDENTIAL = "Studio OS Email";
const SECRET_CREDENTIAL = "Studio OS automation secret";

type Item = { id: string; name: string; type?: string };
type Page = { data: Item[]; nextCursor?: string | null };

async function api<T = Item>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${N8N_URL}/api/v1${path}`, {
    method,
    headers: { "X-N8N-API-KEY": API_KEY!, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : res.json();
}

async function listAll(path: string) {
  const items: Item[] = [];
  let cursor: string | undefined;
  do {
    const page = await api<Page>(`GET`, `${path}?limit=100${cursor ? `&cursor=${cursor}` : ""}`);
    items.push(...page.data);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return items;
}

async function upsertCredential(name: string, type: string, data: Record<string, unknown>, overwrite: boolean) {
  const existing = (await listAll("/credentials")).find((c) => c.name === name && c.type === type);
  if (existing && !overwrite) {
    console.log(`Credential "${name}" kept as is`);
    return existing.id as string;
  }
  if (existing) {
    await api("PATCH", `/credentials/${existing.id}`, { name, type, data });
    console.log(`Credential "${name}" updated`);
    return existing.id as string;
  }
  const created = await api("POST", "/credentials", { name, type, data });
  console.log(`Credential "${name}" created`);
  return created.id as string;
}

function smtpData() {
  if (!process.env.SMTP_HOST) {
    return { host: "mailpit", port: 1025, secure: false, disableStartTls: true, user: "", password: "" };
  }
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: (process.env.SMTP_SECURE ?? "true") === "true",
    user: process.env.SMTP_USER ?? "",
    password: process.env.SMTP_PASSWORD ?? "",
  };
}

function workflows(smtpId: string, secretId: string) {
  const secretCredential = { httpHeaderAuth: { id: secretId, name: SECRET_CREDENTIAL } };
  const callDashboard = (job: string) => ({
    id: `call-${job}`,
    name: `Run ${job} job`,
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [260, 0],
    parameters: {
      method: "POST",
      url: `={{ $env.DASHBOARD_URL }}/api/automations/${job}`,
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      options: { timeout: 120000 },
    },
    credentials: secretCredential,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
  });
  const settings = {
    executionOrder: "v1",
    timezone: "Africa/Cairo",
    saveDataErrorExecution: "all",
    saveDataSuccessExecution: "all",
  };

  return [
    {
      name: "[Studio OS] Send email",
      settings,
      nodes: [
        {
          id: "webhook",
          name: "Emails from dashboard",
          type: "n8n-nodes-base.webhook",
          typeVersion: 2,
          position: [0, 0],
          webhookId: "studio-os-email",
          parameters: {
            httpMethod: "POST",
            path: "studio-os-email",
            authentication: "headerAuth",
            responseMode: "lastNode",
            responseData: "noData",
            options: {},
          },
          credentials: secretCredential,
        },
        {
          id: "split",
          name: "One item per email",
          type: "n8n-nodes-base.splitOut",
          typeVersion: 1,
          position: [220, 0],
          parameters: { fieldToSplitOut: "body.emails", options: {} },
        },
        {
          id: "send",
          name: "Send email",
          type: "n8n-nodes-base.emailSend",
          typeVersion: 2.1,
          position: [440, 0],
          parameters: {
            fromEmail: "={{ $json.from }}",
            toEmail: "={{ $json.to }}",
            subject: "={{ $json.subject }}",
            emailFormat: "both",
            text: "={{ $json.text }}",
            html: "={{ $json.html }}",
            options: { appendAttribution: false },
          },
          credentials: { smtp: { id: smtpId, name: SMTP_CREDENTIAL } },
        },
      ],
      connections: {
        "Emails from dashboard": { main: [[{ node: "One item per email", type: "main", index: 0 }]] },
        "One item per email": { main: [[{ node: "Send email", type: "main", index: 0 }]] },
      },
    },
    {
      name: "[Studio OS] Daily reminders",
      settings,
      nodes: [
        {
          id: "schedule",
          name: "Every day at 8:00",
          type: "n8n-nodes-base.scheduleTrigger",
          typeVersion: 1.2,
          position: [0, 0],
          parameters: { rule: { interval: [{ field: "days", triggerAtHour: 8 }] } },
        },
        callDashboard("daily"),
      ],
      connections: { "Every day at 8:00": { main: [[{ node: "Run daily job", type: "main", index: 0 }]] } },
    },
    {
      name: "[Studio OS] Weekly summary",
      settings,
      nodes: [
        {
          id: "schedule",
          name: "Sunday at 9:00",
          type: "n8n-nodes-base.scheduleTrigger",
          typeVersion: 1.2,
          position: [0, 0],
          parameters: { rule: { interval: [{ field: "weeks", triggerAtDay: [0], triggerAtHour: 9 }] } },
        },
        callDashboard("weekly"),
      ],
      connections: { "Sunday at 9:00": { main: [[{ node: "Run weekly job", type: "main", index: 0 }]] } },
    },
  ];
}

async function main() {
  const smtpId = await upsertCredential(SMTP_CREDENTIAL, "smtp", smtpData(), !!process.env.SMTP_HOST);
  const secretId = await upsertCredential(
    SECRET_CREDENTIAL,
    "httpHeaderAuth",
    { name: "x-studio-secret", value: SECRET },
    true,
  );

  const existing = await listAll("/workflows");
  for (const wf of workflows(smtpId, secretId)) {
    const found = existing.find((w) => w.name === wf.name);
    const saved = found ? await api("PUT", `/workflows/${found.id}`, wf) : await api("POST", "/workflows", wf);
    await api("POST", `/workflows/${saved.id}/activate`);
    console.log(`Workflow "${wf.name}" ${found ? "updated" : "created"} and active`);
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
