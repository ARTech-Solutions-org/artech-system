/** Add Projects tab + header row to main Studio OS workbook */
const key = process.env.N8N_API_KEY;
if (!key) process.exit(1);

const API = 'http://localhost:5678';
const MAIN_DOC = process.env.MAIN_SHEET_ID || '1GrxxzPg0DilXLxOi4ap8Ar7hwl24k8Gp00sl-RYkeR0';
const CRED = { googleSheetsOAuth2Api: { id: 'hPGaEBv6Ym0uVjSh', name: 'Google Sheets account' } };

const HEADERS = [
  ['Project_Name', 'Assets', 'Assigned_Developer', 'Devices_Needed', 'Deadline', 'Build_Link', 'Video_Link', 'Status'],
];

const nodes = [
  {
    id: 'wh',
    name: 'Webhook',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [0, 300],
    webhookId: 'studio-os-seed-projects',
    parameters: { httpMethod: 'POST', path: 'studio-os-seed-projects', responseMode: 'lastNode', options: {} },
  },
  {
    id: 'add',
    name: 'Add Projects Tab',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [220, 300],
    parameters: {
      method: 'POST',
      url: `=https://sheets.googleapis.com/v4/spreadsheets/${MAIN_DOC}:batchUpdate`,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleSheetsOAuth2Api',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ { requests: [{ addSheet: { properties: { title: "Projects" } } }] } }}',
      options: { response: { response: { neverError: true } } },
    },
    credentials: CRED,
  },
  {
    id: 'put',
    name: 'PUT Headers',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [440, 300],
    parameters: {
      method: 'PUT',
      url: `=https://sheets.googleapis.com/v4/spreadsheets/${MAIN_DOC}/values/Projects!A1?valueInputOption=RAW`,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleSheetsOAuth2Api',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: `={{ { range: "Projects!A1", majorDimension: "ROWS", values: ${JSON.stringify(HEADERS)} } }}`,
      options: { response: { response: { neverError: true } } },
    },
    credentials: CRED,
  },
  {
    id: 'sum',
    name: 'Summary',
    type: 'n8n-nodes-base.set',
    typeVersion: 3.4,
    position: [660, 300],
    parameters: {
      assignments: {
        assignments: [
          { id: '1', name: 'ok', value: 'Projects tab ready', type: 'string' },
          { id: '2', name: 'doc', value: MAIN_DOC, type: 'string' },
        ],
      },
      options: {},
    },
  },
];

const connections = {
  Webhook: { main: [[{ node: 'Add Projects Tab', type: 'main', index: 0 }]] },
  'Add Projects Tab': { main: [[{ node: 'PUT Headers', type: 'main', index: 0 }]] },
  'PUT Headers': { main: [[{ node: 'Summary', type: 'main', index: 0 }]] },
};

(async () => {
  const list = await (await fetch(`${API}/api/v1/workflows`, { headers: { 'X-N8N-API-KEY': key } })).json();
  const existing = list.data?.find((w) => w.name === '[Studio OS] Setup - Seed Projects');
  let wfId = existing?.id;

  const body = {
    name: '[Studio OS] Setup - Seed Projects',
    nodes,
    connections,
    settings: { executionOrder: 'v1' },
  };

  if (wfId) {
    await fetch(`${API}/api/v1/workflows/${wfId}`, {
      method: 'PUT',
      headers: { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } else {
    const created = await (
      await fetch(`${API}/api/v1/workflows`, {
        method: 'POST',
        headers: { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    ).json();
    wfId = created.id;
  }

  await fetch(`${API}/api/v1/workflows/${wfId}/activate`, { method: 'POST', headers: { 'X-N8N-API-KEY': key } });
  const res = await fetch(`${API}/webhook/studio-os-seed-projects`, { method: 'POST', body: '{}' });
  const text = await res.text();
  console.log(res.status, text.slice(0, 500));
  await fetch(`${API}/api/v1/workflows/${wfId}/deactivate`, { method: 'POST', headers: { 'X-N8N-API-KEY': key } });
})();
