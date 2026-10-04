/**
 * Migrate Projects + Equipment headers to v2; add Technician tab via batchUpdate.
 */
const key = process.env.N8N_API_KEY;
const PROJECT_DOC = '1KXfojWoFoRfeOsfwV3wwX48_kPqn3lD0seQjaGnqFVc';
const EQUIP_DOC = '1SOpTC6zINBOVdJW8rp7k1o00Dlx8Tl9Pw-2FC8Aqx6I';
const CRED = { googleSheetsOAuth2Api: { id: 'hPGaEBv6Ym0uVjSh', name: 'Google Sheets account' } };

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

(async () => {
  const auth = { authentication: 'predefinedCredentialType', nodeCredentialType: 'googleSheetsOAuth2Api' };

  async function sheetsGet(doc, range) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${doc}/values/${encodeURIComponent(range)}`;
    const r = await fetch(url, { headers: { 'X-N8N-API-KEY': key } }); // wrong - need oauth via n8n
    return r;
  }

  // Use n8n webhook one-shot workflow
  const nodes = [
    {
      id: 'wh',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 300],
      webhookId: 'studio-os-migrate-v2b',
      parameters: { httpMethod: 'POST', path: 'studio-os-migrate-v2b', responseMode: 'lastNode', options: {} },
    },
    {
      id: 'meta',
      name: 'GET Meta',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [200, 300],
      parameters: {
        method: 'GET',
        url: `=https://sheets.googleapis.com/v4/spreadsheets/${PROJECT_DOC}?fields=sheets.properties`,
        ...auth,
        options: {},
      },
      credentials: CRED,
    },
    {
      id: 'ensureTech',
      name: 'Ensure Technician Tab',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [420, 300],
      parameters: {
        jsCode: `const sheets = $json.sheets || [];
const has = sheets.some(s => String(s.properties?.title) === 'Technician');
const requests = has ? [] : [{ addSheet: { properties: { title: 'Technician' } } }];
return [{ json: { body: { requests }, hasTech: has } }];`,
      },
    },
    {
      id: 'addTab',
      name: 'Add Technician Tab',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [640, 300],
      parameters: {
        method: 'POST',
        url: `=https://sheets.googleapis.com/v4/spreadsheets/${PROJECT_DOC}:batchUpdate`,
        ...auth,
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ $json.body.requests.length ? $json.body : { requests: [] } }}',
        options: { response: { response: { neverError: true } } },
      },
      credentials: CRED,
    },
    {
      id: 'gp',
      name: 'GET Projects',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [860, 200],
      parameters: {
        method: 'GET',
        url: `=https://sheets.googleapis.com/v4/spreadsheets/${PROJECT_DOC}/values/Projects`,
        ...auth,
        options: {},
      },
      credentials: CRED,
    },
    {
      id: 'ge',
      name: 'GET Equipment',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [860, 400],
      parameters: {
        method: 'GET',
        url: `=https://sheets.googleapis.com/v4/spreadsheets/${EQUIP_DOC}/values/Equipment`,
        ...auth,
        options: {},
      },
      credentials: CRED,
    },
    {
      id: 'merge',
      name: 'Merge',
      type: 'n8n-nodes-base.merge',
      typeVersion: 3,
      position: [1080, 300],
      parameters: { mode: 'combine', combineBy: 'combineAll', options: {} },
    },
    {
      id: 'map',
      name: 'Map v2',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1300, 300],
      parameters: {
        jsCode: `const PROJECT_HEADERS = ${JSON.stringify(PROJECT_HEADERS)};
const EQUIP_HEADERS = ${JSON.stringify(EQUIP_HEADERS)};
const TECH_HEADERS = ${JSON.stringify(TECH_HEADERS)};
const oldProjects = $('GET Projects').first().json.values || [];
const oldEquip = $('GET Equipment').first().json.values || [];

function mapProjects(values) {
  const h = (values[0] || []).map(String);
  const idx = (n) => h.indexOf(n);
  const rows = [PROJECT_HEADERS];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const get = (col, alt) => {
      for (const k of [col, alt].filter(Boolean)) {
        const j = idx(k);
        if (j >= 0 && String(r[j] ?? '').trim()) return String(r[j]).trim();
      }
      return '';
    };
    const name = get('Project_Name', 'Project Name');
    if (!name) continue;
    rows.push([
      name,
      get('Assets', 'Client_Assets_Status') || get('Client Assets'),
      get('Assigned_Developer', 'Developer'),
      get('Devices_Needed'),
      get('Deadline'),
      get('Build_Link', 'Build Link'),
      get('Video_Link', 'Demo_Link') || get('Demo Link'),
      get('Status') || 'New',
    ]);
  }
  return rows;
}

function mapEquipment(values) {
  const h = (values[0] || []).map(String);
  const idx = (n) => h.indexOf(n);
  const seen = new Set();
  const rows = [EQUIP_HEADERS];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const id = String(r[idx('Equipment_ID')] || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const amount = Number(r[idx('Amount')]) || 1;
    let available = Number(r[idx('Available')]);
    if (!Number.isFinite(available)) {
      available = String(r[idx('Status')] || '') === 'Reserved' ? 0 : amount;
    }
    rows.push([
      id,
      String(r[idx('Equipment_Name')] || ''),
      String(r[idx('Category')] || ''),
      String(amount),
      String(Math.max(0, Math.min(amount, available))),
      String(r[idx('Status')] || 'Available'),
      String(r[idx('Location')] || ''),
      String(r[idx('Date_Needed_Until')] || r[idx('Current_Project')] ? '' : ''),
      String(r[idx('Notes')] || ''),
    ]);
  }
  return rows;
}

return [{ json: { projects: mapProjects(oldProjects), equipment: mapEquipment(oldEquip), technician: [TECH_HEADERS] } }];`,
      },
    },
    {
      id: 'pp',
      name: 'PUT Projects',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1520, 180],
      parameters: {
        method: 'PUT',
        url: `=https://sheets.googleapis.com/v4/spreadsheets/${PROJECT_DOC}/values/Projects?valueInputOption=RAW`,
        ...auth,
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ { range: "Projects", majorDimension: "ROWS", values: $json.projects } }}',
        options: {},
      },
      credentials: CRED,
    },
    {
      id: 'pe',
      name: 'PUT Equipment',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1520, 320],
      parameters: {
        method: 'PUT',
        url: `=https://sheets.googleapis.com/v4/spreadsheets/${EQUIP_DOC}/values/Equipment?valueInputOption=RAW`,
        ...auth,
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ { range: "Equipment", majorDimension: "ROWS", values: $json.equipment } }}',
        options: {},
      },
      credentials: CRED,
    },
    {
      id: 'pt',
      name: 'PUT Technician',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1520, 460],
      parameters: {
        method: 'PUT',
        url: `=https://sheets.googleapis.com/v4/spreadsheets/${PROJECT_DOC}/values/Technician?valueInputOption=RAW`,
        ...auth,
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ { range: "Technician", majorDimension: "ROWS", values: $json.technician } }}',
        options: {},
      },
      credentials: CRED,
    },
    {
      id: 'sum',
      name: 'Summary',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.4,
      position: [1740, 320],
      parameters: {
        assignments: {
          assignments: [
            { id: '1', name: 'ok', value: 'v2 migrated', type: 'string' },
            { id: '2', name: 'projects', value: '={{ $("Map v2").first().json.projects.length }}', type: 'number' },
          ],
        },
        options: {},
      },
    },
  ];

  const connections = {
    Webhook: { main: [[{ node: 'GET Meta', type: 'main', index: 0 }]] },
    'GET Meta': { main: [[{ node: 'Ensure Technician Tab', type: 'main', index: 0 }]] },
    'Ensure Technician Tab': { main: [[{ node: 'Add Technician Tab', type: 'main', index: 0 }]] },
    'Add Technician Tab': {
      main: [[{ node: 'GET Projects', type: 'main', index: 0 }, { node: 'GET Equipment', type: 'main', index: 0 }]],
    },
    'GET Projects': { main: [[{ node: 'Merge', type: 'main', index: 0 }]] },
    'GET Equipment': { main: [[{ node: 'Merge', type: 'main', index: 1 }]] },
    Merge: { main: [[{ node: 'Map v2', type: 'main', index: 0 }]] },
    'Map v2': {
      main: [[{ node: 'PUT Projects', type: 'main', index: 0 }, { node: 'PUT Equipment', type: 'main', index: 0 }, { node: 'PUT Technician', type: 'main', index: 0 }]],
    },
    'PUT Projects': { main: [[{ node: 'Summary', type: 'main', index: 0 }]] },
  };

  const API = 'http://localhost:5678';
  const list = await (await fetch(`${API}/api/v1/workflows`, { headers: { 'X-N8N-API-KEY': key } })).json();
  const workflows = list.data || list;
  let id = workflows.find((w) => w.name === '[Studio OS] Setup - Migrate v2b')?.id;
  const body = { name: '[Studio OS] Setup - Migrate v2b', nodes, connections, settings: { executionOrder: 'v1' } };
  if (id) {
    await fetch(`${API}/api/v1/workflows/${id}`, { method: 'PUT', headers: { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } else {
    const post = await (await fetch(`${API}/api/v1/workflows`, { method: 'POST', headers: { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
    id = post.id;
  }
  await fetch(`${API}/api/v1/workflows/${id}/activate`, { method: 'POST', headers: { 'X-N8N-API-KEY': key } });
  const res = await fetch(`${API}/webhook/studio-os-migrate-v2b`, { method: 'POST', body: '{}' });
  console.log('migrate', res.status, await res.text());
  await fetch(`${API}/api/v1/workflows/${id}/deactivate`, { method: 'POST', headers: { 'X-N8N-API-KEY': key } });
})().catch((e) => { console.error(e); process.exit(1); });
