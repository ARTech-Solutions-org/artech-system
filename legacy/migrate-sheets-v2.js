/**
 * Migrate Google Sheets to Studio OS v2 schema.
 * Projects: 8 columns | Equipment: Date_Needed_Until | Technician tab
 */
const key = process.env.N8N_API_KEY;
if (!key) {
  console.error('Set N8N_API_KEY');
  process.exit(1);
}

const PROJECT_HEADERS = [
  'Project_Name', 'Assets', 'Assigned_Developer', 'Devices_Needed',
  'Deadline', 'Build_Link', 'Video_Link', 'Status',
];

const EQUIP_HEADERS = [
  'Equipment_ID', 'Equipment_Name', 'Category', 'Amount', 'Available',
  'Status', 'Location', 'Date_Needed_Until', 'Notes',
];

const TECH_HEADERS = [
  'Technician_ID', 'Project_Name', 'Technician', 'Equipment_Needed',
  'Installation_Date', 'Status', 'Notes',
];

const DOCS = {
  projects: '1KXfojWoFoRfeOsfwV3wwX48_kPqn3lD0seQjaGnqFVc',
  equipment: '1SOpTC6zINBOVdJW8rp7k1o00Dlx8Tl9Pw-2FC8Aqx6I',
};

const CRED = {
  googleSheetsOAuth2Api: { id: 'hPGaEBv6Ym0uVjSh', name: 'Google Sheets account' },
};

function httpGet(url) {
  return {
    id: 'get-' + Math.random().toString(36).slice(2, 8),
    name: 'GET ' + url.slice(-20),
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [0, 0],
    parameters: {
      method: 'GET',
      url,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleSheetsOAuth2Api',
      options: {},
    },
    credentials: CRED,
  };
}

function httpPut(urlExpr, bodyExpr) {
  return {
    id: 'put-' + Math.random().toString(36).slice(2, 8),
    name: 'PUT',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [0, 0],
    parameters: {
      method: 'PUT',
      url: urlExpr,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleSheetsOAuth2Api',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: bodyExpr,
      options: {},
    },
    credentials: CRED,
  };
}

const migrateCode = `const PROJECT_HEADERS = ${JSON.stringify(PROJECT_HEADERS)};
const EQUIP_HEADERS = ${JSON.stringify(EQUIP_HEADERS)};
const TECH_HEADERS = ${JSON.stringify(TECH_HEADERS)};

const oldProjects = $('GET Projects').first().json.values || [];
const oldEquip = $('GET Equipment').first().json.values || [];

function mapProjects(values) {
  const h = (values[0] || []).map(String);
  const idx = (name) => h.indexOf(name);
  const rows = [PROJECT_HEADERS];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const get = (col, alt) => {
      const v = r[idx(col)];
      if (v !== undefined && String(v).trim()) return String(v);
      if (alt !== undefined && r[idx(alt)] !== undefined) return String(r[idx(alt)] || '');
      return '';
    };
    if (!get('Project_Name') && !get('Project Name')) continue;
    rows.push([
      get('Project_Name', 'Project Name'),
      get('Assets', 'Client_Assets_Status') || get('Client Assets') || get('Assets'),
      get('Assigned_Developer', 'Developer'),
      get('Devices_Needed', 'Devices Needed') || '',
      get('Deadline'),
      get('Build_Link', 'Build Link'),
      get('Video_Link', 'Demo_Link') || get('Demo Link') || get('Video Link'),
      get('Status') || 'New',
    ]);
  }
  return rows;
}

function mapEquipment(values) {
  const h = (values[0] || []).map(String);
  const idx = (name) => h.indexOf(name);
  const seen = new Map();
  const rows = [EQUIP_HEADERS];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const id = String(r[idx('Equipment_ID')] || '').trim();
    if (!id || seen.has(id)) continue;
    seen.set(id, true);
    const amount = Number(r[idx('Amount')]) || 1;
    let available = Number(r[idx('Available')]);
    if (!Number.isFinite(available)) {
      const st = String(r[idx('Status')] || 'Available');
      available = ['Reserved'].includes(st) ? 0 : amount;
    }
    const until = String(r[idx('Date_Needed_Until')] || r[idx('Reserve Until')] || '').trim();
    rows.push([
      id,
      String(r[idx('Equipment_Name')] || ''),
      String(r[idx('Category')] || ''),
      String(amount),
      String(Math.max(0, Math.min(amount, available))),
      String(r[idx('Status')] || 'Available'),
      String(r[idx('Location')] || ''),
      until,
      String(r[idx('Notes')] || ''),
    ]);
  }
  return rows;
}

return [{
  json: {
    projects: mapProjects(oldProjects),
    equipment: mapEquipment(oldEquip),
    technician: [TECH_HEADERS],
  },
}];`;

const nodes = [
  {
    id: 'wh',
    name: 'Webhook',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [0, 300],
    webhookId: 'studio-os-migrate-v2',
    parameters: { httpMethod: 'POST', path: 'studio-os-migrate-v2', responseMode: 'lastNode', options: {} },
  },
  {
    ...httpGet(`=https://sheets.googleapis.com/v4/spreadsheets/${DOCS.projects}/values/Projects`),
    id: 'gp',
    name: 'GET Projects',
    position: [200, 200],
  },
  {
    ...httpGet(`=https://sheets.googleapis.com/v4/spreadsheets/${DOCS.equipment}/values/Equipment`),
    id: 'ge',
    name: 'GET Equipment',
    position: [200, 400],
  },
  {
    id: 'merge',
    name: 'Merge',
    type: 'n8n-nodes-base.merge',
    typeVersion: 3,
    position: [420, 300],
    parameters: { mode: 'combine', combineBy: 'combineAll', options: {} },
  },
  {
    id: 'map',
    name: 'Map v2',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [640, 300],
    parameters: { jsCode: migrateCode },
  },
  {
    ...httpPut(
      `=https://sheets.googleapis.com/v4/spreadsheets/${DOCS.projects}/values/Projects?valueInputOption=RAW`,
      '={{ { range: "Projects", majorDimension: "ROWS", values: $json.projects } }}'
    ),
    id: 'pp',
    name: 'PUT Projects',
    position: [860, 200],
  },
  {
    ...httpPut(
      `=https://sheets.googleapis.com/v4/spreadsheets/${DOCS.equipment}/values/Equipment?valueInputOption=RAW`,
      '={{ { range: "Equipment", majorDimension: "ROWS", values: $json.equipment } }}'
    ),
    id: 'pe',
    name: 'PUT Equipment',
    position: [860, 400],
  },
  {
    ...httpPut(
      `=https://sheets.googleapis.com/v4/spreadsheets/${DOCS.projects}/values/Technician?valueInputOption=RAW`,
      '={{ { range: "Technician", majorDimension: "ROWS", values: $json.technician } }}'
    ),
    id: 'pt',
    name: 'PUT Technician',
    position: [860, 600],
  },
  {
    id: 'sum',
    name: 'Summary',
    type: 'n8n-nodes-base.set',
    typeVersion: 3.4,
    position: [1080, 400],
    parameters: {
      assignments: {
        assignments: [
          { id: '1', name: 'ok', value: 'v2 sheets migrated', type: 'string' },
          { id: '2', name: 'project_rows', value: '={{ $("Map v2").first().json.projects.length }}', type: 'number' },
        ],
      },
      options: {},
    },
  },
];

const connections = {
  Webhook: { main: [[{ node: 'GET Projects', type: 'main', index: 0 }, { node: 'GET Equipment', type: 'main', index: 0 }]] },
  'GET Projects': { main: [[{ node: 'Merge', type: 'main', index: 0 }]] },
  'GET Equipment': { main: [[{ node: 'Merge', type: 'main', index: 1 }]] },
  Merge: { main: [[{ node: 'Map v2', type: 'main', index: 0 }]] },
  'Map v2': {
    main: [[
      { node: 'PUT Projects', type: 'main', index: 0 },
      { node: 'PUT Equipment', type: 'main', index: 0 },
      { node: 'PUT Technician', type: 'main', index: 0 },
    ]],
  },
  'PUT Projects': { main: [[{ node: 'Summary', type: 'main', index: 0 }]] },
};

(async () => {
  const API = 'http://localhost:5678';
  try {
    await fetch(`${API}/healthz`);
  } catch {
    console.log('n8n offline — run migrate after starting Docker');
    process.exit(0);
  }

  const list = await (await fetch(`${API}/api/v1/workflows`, { headers: { 'X-N8N-API-KEY': key } })).json();
  const workflows = list.data || list;
  let id = workflows.find((w) => w.name === '[Studio OS] Setup - Migrate v2')?.id;
  const body = { name: '[Studio OS] Setup - Migrate v2', nodes, connections, settings: { executionOrder: 'v1' } };

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
  const res = await fetch(`${API}/webhook/studio-os-migrate-v2`, { method: 'POST', body: '{}' });
  console.log('migrate', res.status, await res.text());
  await fetch(`${API}/api/v1/workflows/${id}/deactivate`, { method: 'POST', headers: { 'X-N8N-API-KEY': key } });
})();
