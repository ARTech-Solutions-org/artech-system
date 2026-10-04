/**
 * Fix Team 404: create Team tab in Projects workbook + point all Team nodes there.
 */
const key = process.env.N8N_API_KEY;
const PROJECT_DOC = '1KXfojWoFoRfeOsfwV3wwX48_kPqn3lD0seQjaGnqFVc';
const OLD_TEAM_DOC = '1zzIknZ261MrcqmxWKLlbQ3FMKq5YM7xafmWCJAADZFo';
const WF_ID = 'CucijOQolo68IGMR';
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
    webhookId: 'studio-os-fix-team-tab',
    parameters: { httpMethod: 'POST', path: 'studio-os-fix-team-tab', responseMode: 'lastNode', options: {} },
  },
  {
    id: 'meta',
    name: 'GET Projects Meta',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [220, 300],
    parameters: {
      method: 'GET',
      url: `=https://sheets.googleapis.com/v4/spreadsheets/${PROJECT_DOC}?fields=sheets.properties`,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleSheetsOAuth2Api',
      options: {},
    },
    credentials: CRED,
  },
  {
    id: 'prep',
    name: 'Ensure Team Tab',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [440, 300],
    parameters: {
      jsCode: `const sheets = $json.sheets || [];
const hasTeam = sheets.some(s => String(s.properties?.title) === 'Team');
const requests = hasTeam ? [] : [{ addSheet: { properties: { title: 'Team' } } }];
return [{ json: { hasTeam, body: { requests }, teamRows: ${JSON.stringify(TEAM_ROWS)} } }];`,
    },
  },
  {
    id: 'add',
    name: 'Add Team Tab',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [660, 300],
    parameters: {
      method: 'POST',
      url: `=https://sheets.googleapis.com/v4/spreadsheets/${PROJECT_DOC}:batchUpdate`,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleSheetsOAuth2Api',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ $json.body.requests.length ? $json.body : { requests: [] } }}',
      options: { response: { response: { neverError: true } } },
    },
    credentials: CRED,
  },
  {
    id: 'getOld',
    name: 'Try Old Team Sheet',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [880, 200],
    parameters: {
      method: 'GET',
      url: `=https://sheets.googleapis.com/v4/spreadsheets/${OLD_TEAM_DOC}/values/Team`,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleSheetsOAuth2Api',
      options: { response: { response: { neverError: true } } },
    },
    credentials: CRED,
  },
  {
    id: 'pickRows',
    name: 'Pick Team Rows',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1100, 300],
    parameters: {
      jsCode: `const ensure = $('Ensure Team Tab').first().json;
const old = $('Try Old Team Sheet').first().json;
let rows = ensure.teamRows;
if (Array.isArray(old.values) && old.values.length > 1 && !old.error) {
  rows = old.values;
}
return [{ json: { rows, skipSeed: ensure.hasTeam && rows.length <= 1 } }];`,
    },
  },
  {
    id: 'ifSeed',
    name: 'IF — Seed Team?',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [1320, 300],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ id: 'c1', leftValue: '={{ $json.skipSeed }}', rightValue: true, operator: { type: 'boolean', operation: 'notEquals' } }],
        combinator: 'and',
      },
      options: {},
    },
  },
  {
    id: 'put',
    name: 'PUT Team Rows',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [1540, 220],
    parameters: {
      method: 'PUT',
      url: `=https://sheets.googleapis.com/v4/spreadsheets/${PROJECT_DOC}/values/Team?valueInputOption=RAW`,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleSheetsOAuth2Api',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ { range: "Team", majorDimension: "ROWS", values: $json.rows } }}',
      options: {},
    },
    credentials: CRED,
  },
  {
    id: 'sum',
    name: 'Summary',
    type: 'n8n-nodes-base.set',
    typeVersion: 3.4,
    position: [1760, 300],
    parameters: {
      assignments: {
        assignments: [
          { id: '1', name: 'ok', value: 'Team tab ready in Projects workbook', type: 'string' },
          { id: '2', name: 'rows', value: '={{ $("Pick Team Rows").first().json.rows.length }}', type: 'number' },
        ],
      },
      options: {},
    },
  },
];

const connections = {
  Webhook: { main: [[{ node: 'GET Projects Meta', type: 'main', index: 0 }]] },
  'GET Projects Meta': { main: [[{ node: 'Ensure Team Tab', type: 'main', index: 0 }]] },
  'Ensure Team Tab': { main: [[{ node: 'Add Team Tab', type: 'main', index: 0 }]] },
  'Add Team Tab': { main: [[{ node: 'Try Old Team Sheet', type: 'main', index: 0 }]] },
  'Try Old Team Sheet': { main: [[{ node: 'Pick Team Rows', type: 'main', index: 0 }]] },
  'Pick Team Rows': { main: [[{ node: 'IF — Seed Team?', type: 'main', index: 0 }]] },
  'IF — Seed Team?': {
    main: [[{ node: 'PUT Team Rows', type: 'main', index: 0 }], [{ node: 'Summary', type: 'main', index: 0 }]],
  },
  'PUT Team Rows': { main: [[{ node: 'Summary', type: 'main', index: 0 }]] },
};

async function patchWorkflowTeamDoc() {
  const wf = await (await fetch(`http://localhost:5678/api/v1/workflows/${WF_ID}`, {
    headers: { 'X-N8N-API-KEY': key },
  })).json();

  let patched = 0;
  for (const n of wf.nodes) {
    if (n.type !== 'n8n-nodes-base.googleSheets') continue;
    const doc = n.parameters?.documentId?.value;
    const sheet = n.parameters?.sheetName?.value;
    const isTeam = doc === OLD_TEAM_DOC || (typeof sheet === 'string' && sheet === 'Team' && /Team/i.test(n.name));
    if (doc === OLD_TEAM_DOC || (isTeam && n.name.includes('Team'))) {
      n.parameters.documentId = { __rl: true, mode: 'id', value: PROJECT_DOC };
      n.parameters.sheetName = { __rl: true, mode: 'name', value: 'Team' };
      patched++;
    }
  }

  const put = await fetch(`http://localhost:5678/api/v1/workflows/${WF_ID}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings }),
  });
  if (!put.ok) throw new Error(await put.text());
  console.log('Patched Team nodes:', patched);
}

(async () => {
  const API = 'http://localhost:5678';
  const list = await (await fetch(`${API}/api/v1/workflows`, { headers: { 'X-N8N-API-KEY': key } })).json();
  const workflows = list.data || list;
  let id = workflows.find((w) => w.name === '[Studio OS] Setup - Fix Team Tab')?.id;
  const body = { name: '[Studio OS] Setup - Fix Team Tab', nodes, connections, settings: { executionOrder: 'v1' } };
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
  const res = await fetch(`${API}/webhook/studio-os-fix-team-tab`, { method: 'POST', body: '{}' });
  console.log('setup', res.status, await res.text());
  await fetch(`${API}/api/v1/workflows/${id}/deactivate`, { method: 'POST', headers: { 'X-N8N-API-KEY': key } });
  await patchWorkflowTeamDoc();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
