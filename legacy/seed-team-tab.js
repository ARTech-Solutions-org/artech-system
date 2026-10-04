/**
 * Add Team tab to Projects workbook + seed rows (no meta GET).
 */
const key = process.env.N8N_API_KEY;
const PROJECT_DOC = '1KXfojWoFoRfeOsfwV3wwX48_kPqn3lD0seQjaGnqFVc';
const CRED = { googleSheetsOAuth2Api: { id: 'hPGaEBv6Ym0uVjSh', name: 'Google Sheets account' } };

const TEAM_ROWS = [
  ['Team_ID', 'Name', 'Role', 'Email', 'Phone', 'Status', 'Current_Project', 'Available_From', 'Notes'],
  ['TM-001', 'Mohannad', 'Developer', '', '', 'Available', '', '', ''],
  ['TM-002', 'Mahmoud', 'Developer', '', '', 'Available', '', '', ''],
  ['TM-003', 'Khattab', 'Designer', '', '', 'Available', '', '', ''],
  ['TM-004', 'Aglan', 'Installer', '', '', 'Available', '', '', ''],
];

const nodes = [
  {
    id: 'wh',
    name: 'Webhook',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [0, 300],
    webhookId: 'studio-os-seed-team',
    parameters: { httpMethod: 'POST', path: 'studio-os-seed-team', responseMode: 'lastNode', options: {} },
  },
  {
    id: 'add',
    name: 'Add Team Tab',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [220, 300],
    parameters: {
      method: 'POST',
      url: `=https://sheets.googleapis.com/v4/spreadsheets/${PROJECT_DOC}:batchUpdate`,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleSheetsOAuth2Api',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ { requests: [{ addSheet: { properties: { title: "Team" } } }] } }}',
      options: { response: { response: { neverError: true } } },
    },
    credentials: CRED,
  },
  {
    id: 'put',
    name: 'PUT Team',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [440, 300],
    parameters: {
      method: 'PUT',
      url: `=https://sheets.googleapis.com/v4/spreadsheets/${PROJECT_DOC}/values/Team?valueInputOption=RAW`,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleSheetsOAuth2Api',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: `={{ { range: "Team", majorDimension: "ROWS", values: ${JSON.stringify(TEAM_ROWS)} } }}`,
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
          { id: '1', name: 'add', value: '={{ JSON.stringify($("Add Team Tab").first().json) }}', type: 'string' },
          { id: '2', name: 'put', value: '={{ JSON.stringify($("PUT Team").first().json) }}', type: 'string' },
        ],
      },
      options: {},
    },
  },
];

const connections = {
  Webhook: { main: [[{ node: 'Add Team Tab', type: 'main', index: 0 }]] },
  'Add Team Tab': { main: [[{ node: 'PUT Team', type: 'main', index: 0 }]] },
  'PUT Team': { main: [[{ node: 'Summary', type: 'main', index: 0 }]] },
};

(async () => {
  const API = 'http://localhost:5678';
  const list = await (await fetch(`${API}/api/v1/workflows`, { headers: { 'X-N8N-API-KEY': key } })).json();
  const workflows = list.data || list;
  let id = workflows.find((w) => w.name === '[Studio OS] Setup - Seed Team')?.id;
  const body = { name: '[Studio OS] Setup - Seed Team', nodes, connections, settings: { executionOrder: 'v1' } };
  if (id) {
    await fetch(`${API}/api/v1/workflows/${id}`, {
      method: 'PUT',
      headers: { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } else {
    const post = await (await fetch(`${API}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })).json();
    id = post.id;
  }
  await fetch(`${API}/api/v1/workflows/${id}/activate`, { method: 'POST', headers: { 'X-N8N-API-KEY': key } });
  const res = await fetch(`${API}/webhook/studio-os-seed-team`, { method: 'POST', body: '{}' });
  console.log(await res.text());
  await fetch(`${API}/api/v1/workflows/${id}/deactivate`, { method: 'POST', headers: { 'X-N8N-API-KEY': key } });

  // ensure workflow team nodes use projects doc
  const WF_ID = 'CucijOQolo68IGMR';
  const wf = await (await fetch(`${API}/api/v1/workflows/${WF_ID}`, { headers: { 'X-N8N-API-KEY': key } })).json();
  for (const n of wf.nodes) {
    if (n.type === 'n8n-nodes-base.googleSheets' && /Team/i.test(n.name)) {
      n.parameters.documentId = { __rl: true, mode: 'id', value: PROJECT_DOC };
      n.parameters.sheetName = { __rl: true, mode: 'name', value: 'Team' };
    }
  }
  await fetch(`${API}/api/v1/workflows/${WF_ID}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings }),
  });
  console.log('workflow team nodes -> Projects/Team');
})();
