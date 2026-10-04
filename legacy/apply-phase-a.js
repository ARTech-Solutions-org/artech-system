/**
 * Phase A: Description + Reference/Voice links (Projects), Location_Link (Technician)
 * Run: N8N_API_KEY=... node apply-phase-a.js
 */
const fs = require('fs');
const path = require('path');

const key = process.env.N8N_API_KEY;
if (!key) {
  console.error('Set N8N_API_KEY');
  process.exit(1);
}

const API = process.env.N8N_API_URL || 'http://localhost:5678';
const WF_ID = 'CucijOQolo68IGMR';
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'sheets-config.json'), 'utf8'));
const TAB_CFG = CONFIG.tabs;
const CRED = { googleSheetsOAuth2Api: { id: 'hPGaEBv6Ym0uVjSh', name: 'Google Sheets account' } };

const SCHEMAS = {
  Projects: [
    'Project_Name', 'Assets', 'Description', 'Reference_Link', 'Voice_Note_Link',
    'Assigned_Developer', 'Devices_Needed', 'Deadline', 'Build_Link', 'Video_Link', 'Status',
  ],
  Technician: [
    'Technician_ID', 'Project_Name', 'Technician', 'Equipment_Needed',
    'Installation_Date', 'Location_Link', 'Status', 'Notes',
  ],
};

const PROJECT_HEADERS = SCHEMAS.Projects;
const TECH_HEADERS = SCHEMAS.Technician;

const buildAssignCode = `const teamRaw = $('READ — Team').all().map(i => i.json).filter(r => r.Name || r.Team_ID);
const equipmentRaw = $('READ — Equipment (Form)').all().map(i => i.json).filter(r => r.Equipment_ID || r.Equipment_Name);

const team = [];
const teamSeen = new Set();
for (const t of teamRaw) {
  const k = String(t.Team_ID || t.Name).toLowerCase();
  if (teamSeen.has(k)) continue;
  teamSeen.add(k);
  team.push(t);
}

const equipment = [];
const eqSeen = new Set();
for (const e of equipmentRaw) {
  const k = String(e.Equipment_ID).toLowerCase();
  if (eqSeen.has(k)) continue;
  eqSeen.add(k);
  equipment.push(e);
}

const teamOptions = team
  .filter(t => String(t.Status || '') !== 'Off')
  .map(t => ({ option: String(t.Name).trim() }))
  .filter(o => o.option);

const none = [{ option: '(None)' }];

function unitAvailable(e) {
  const n = Number(e.Available);
  if (Number.isFinite(n)) return Math.max(0, n);
  const status = String(e.Status || 'Available');
  if (['Broken', 'Maintenance', 'Installed', 'Reserved'].includes(status)) return 0;
  const amount = Number(e.Amount);
  return Number.isFinite(amount) && amount > 0 ? amount : 1;
}

const byName = new Map();
for (const e of equipment) {
  if (unitAvailable(e) <= 0) continue;
  if (String(e.Date_Needed_Until || '').trim()) continue;
  const name = String(e.Equipment_Name || '').trim();
  if (!name) continue;
  const cur = byName.get(name.toLowerCase()) || { name, available: 0 };
  cur.available += unitAvailable(e);
  byName.set(name.toLowerCase(), cur);
}

const eqOptions = [];
for (const g of byName.values()) {
  for (let q = 1; q <= g.available; q++) {
    eqOptions.push({ option: g.name + ' | qty ' + q + ' (' + g.available + ' free)' });
  }
}

return [{
  json: {
    form_fields: [
      { fieldLabel: 'Assigned Developer', fieldType: 'dropdown', requiredField: true, fieldOptions: { values: teamOptions.length ? teamOptions : [{ option: 'No team found' }] } },
      { fieldLabel: 'Technician', fieldType: 'dropdown', requiredField: false, fieldOptions: { values: none.concat(teamOptions) } },
      { fieldLabel: 'Installation Date', fieldType: 'date', requiredField: false },
      { fieldLabel: 'Location Link', fieldType: 'text', requiredField: false, placeholder: 'Google Maps or site URL' },
      { fieldLabel: 'Devices Needed', fieldType: 'dropdown', requiredField: false, fieldOptions: { values: eqOptions.length ? [{ option: '(None)' }].concat(eqOptions) : [{ option: '(No equipment free)' }] } },
      { fieldLabel: 'More Devices', fieldType: 'dropdown', requiredField: false, fieldOptions: { values: eqOptions.length ? [{ option: '(None)' }].concat(eqOptions) : [{ option: '(No equipment free)' }] } },
    ],
  },
}];`;

const normalizeCreateCode = `const p1 = $('FORM — Create Details').first().json;
const p2 = $('FORM — Assign Team & Equipment').first().json;

const projectName = String(p1['Project Name'] || '').trim();
if (!projectName) throw new Error('Project Name is required.');

function parseDevice(raw) {
  const v = String(raw || '').trim();
  if (!v || v === '(None)' || v.includes('No equipment')) return null;
  const m = v.match(/^(.+?)\\s*\\|\\s*qty\\s*(\\d+)/i);
  if (m) return { name: m[1].trim(), qty: Number(m[2]) || 1 };
  return { name: v, qty: 1 };
}

const devices = [];
for (const k of ['Devices Needed', 'More Devices']) {
  const d = parseDevice(p2[k]);
  if (d) devices.push(d);
}

const merged = new Map();
for (const d of devices) {
  const k = d.name.toLowerCase();
  merged.set(k, { name: d.name, qty: (merged.get(k)?.qty || 0) + d.qty });
}

const developer = String(p2['Assigned Developer'] || '').trim();
const technician = String(p2.Technician || '').trim();
const installationDate = String(p2['Installation Date'] || '').trim();
const deadline = String(p1.Deadline || '').trim();

return [{
  json: {
    project_name: projectName,
    assets: String(p1.Assets || '').trim(),
    description: String(p1.Description || '').trim(),
    reference_link: String(p1['Reference Link'] || '').trim(),
    voice_note_link: String(p1['Voice Note Link'] || '').trim(),
    assigned_developer: developer === 'No team found' ? '' : developer,
    devices_needed: [...merged.values()].map(d => d.name + ' x' + d.qty).join(', ') || String(p1['Devices Needed Text'] || '').trim(),
    device_requests: [...merged.values()],
    deadline,
    status: String(p1.Status || 'New').trim() || 'New',
    technician: technician === '(None)' ? '' : technician,
    installation_date: installationDate,
    location_link: String(p2['Location Link'] || '').trim(),
    now: new Date().toISOString(),
  },
}];`;

const processCreateCode = `const input = $('Normalize Create Input').first().json;
const projects = $('READ — Projects').all().map(i => i.json).filter(r => r.Project_Name);
const equipment = $('READ — Equipment (Logic)').all().map(i => i.json).filter(r => r.Equipment_ID);
const team = $('READ — Team (Logic)').all().map(i => i.json).filter(r => r.Team_ID || r.Name);

const dup = projects.find(p => String(p.Project_Name || '').toLowerCase() === input.project_name.toLowerCase());
if (dup) {
  return [{ json: { is_duplicate: true, summary: { message: 'Project name already exists', project_name: input.project_name } } }];
}

const allowed = new Set(["New","Planning","Waiting Assets","Development","Internal Review","Client Review","Changes Required","Approved","Deployment","Completed","Blocked"]);
let status = input.status;
if (!allowed.has(status)) status = 'New';

const projectRow = {
  Project_Name: input.project_name,
  Assets: input.assets,
  Description: input.description || '',
  Reference_Link: input.reference_link || '',
  Voice_Note_Link: input.voice_note_link || '',
  Assigned_Developer: input.assigned_developer,
  Devices_Needed: input.devices_needed,
  Deadline: input.deadline,
  Build_Link: '',
  Video_Link: '',
  Status: status,
};

const equipmentRows = [];
const requests = input.device_requests || [];

function unitAvailable(eq) {
  const n = Number(eq.Available);
  if (Number.isFinite(n)) return Math.max(0, n);
  return String(eq.Status) === 'Available' ? (Number(eq.Amount) || 1) : 0;
}

function unitAmount(eq) {
  const a = Number(eq.Amount);
  return Number.isFinite(a) && a > 0 ? a : 1;
}

for (const req of requests) {
  const qty = Math.max(1, req.qty || 1);
  const matches = equipment.filter(e => String(e.Equipment_Name).toLowerCase() === req.name.toLowerCase() && !String(e.Date_Needed_Until || '').trim());
  const freeUnits = matches.filter(e => unitAvailable(e) > 0);
  const take = freeUnits.slice(0, qty);
  for (const eq of take) {
    const avail = unitAvailable(eq);
    const newAvail = Math.max(0, avail - 1);
    equipmentRows.push({
      Equipment_ID: eq.Equipment_ID,
      Equipment_Name: eq.Equipment_Name,
      Category: eq.Category || '',
      Amount: unitAmount(eq),
      Available: newAvail,
      Status: newAvail > 0 ? 'Available' : 'Reserved',
      Location: eq.Location || '',
      Date_Needed_Until: input.deadline,
      Notes: eq.Notes || '',
    });
  }
}

const teamRows = [];
if (input.assigned_developer) {
  const dev = team.find(t => String(t.Name).toLowerCase() === input.assigned_developer.toLowerCase());
  if (dev) {
    teamRows.push({
      Team_ID: dev.Team_ID,
      Name: dev.Name,
      Role: dev.Role || 'Developer',
      Email: dev.Email || '',
      Phone: dev.Phone || '',
      Status: 'Working',
      Current_Project: input.project_name,
      Available_From: dev.Available_From || '',
      Notes: dev.Notes || '',
    });
  }
}

const technicianRows = [];
if (input.technician && input.installation_date) {
  technicianRows.push({
    Technician_ID: 'TECH-' + Date.now().toString(36),
    Project_Name: input.project_name,
    Technician: input.technician,
    Equipment_Needed: input.devices_needed,
    Installation_Date: input.installation_date,
    Location_Link: input.location_link || '',
    Status: 'Pending',
    Notes: '',
  });
}

return [{
  json: {
    is_duplicate: false,
    project_row: projectRow,
    equipment_rows: equipmentRows,
    team_rows: teamRows,
    technician_rows: technicianRows,
    summary: { action: 'create', project_name: input.project_name, status, devices: input.devices_needed },
  },
}];`;

const processUpdateCode = `const page = $('FORM — Update Project').first().json;
const projects = $('READ — Projects For Update').all().map(i => i.json).filter(r => r.Project_Name);

const label = String(page.Project || '').trim();
if (!label || label.startsWith('No projects')) throw new Error('Pick a project.');
const projectName = label.split('|')[0].trim();
const existing = projects.find(p => String(p.Project_Name).trim() === projectName);
if (!existing) throw new Error('Project not found');

const pick = (label, key) => {
  const v = String(page[label] ?? '').trim();
  return v || String(existing[key] || '');
};

const allowed = new Set(["New","Planning","Waiting Assets","Development","Internal Review","Client Review","Changes Required","Approved","Deployment","Completed","Blocked"]);
let status = pick('Status', 'Status');
if (!allowed.has(status)) status = existing.Status || 'Development';

return [{
  json: {
    project_row: {
      Project_Name: existing.Project_Name,
      Assets: existing.Assets || '',
      Description: existing.Description || '',
      Reference_Link: existing.Reference_Link || '',
      Voice_Note_Link: existing.Voice_Note_Link || '',
      Assigned_Developer: existing.Assigned_Developer || '',
      Devices_Needed: existing.Devices_Needed || '',
      Deadline: existing.Deadline || '',
      Build_Link: pick('Build Link', 'Build_Link'),
      Video_Link: pick('Video Link', 'Video_Link'),
      Status: status,
    },
    summary: { action: 'update', project_name: projectName, submitted_by: page['Submitted By'], status },
  },
}];`;

function makeColumns(cols, matchCol) {
  return {
    mappingMode: 'autoMapInputData',
    value: {},
    matchingColumns: matchCol ? [matchCol] : [],
    schema: cols.map((c) => ({
      id: c,
      displayName: c,
      required: false,
      defaultMatch: c === matchCol,
      display: true,
      type: 'string',
      canBeUsedToMatch: true,
    })),
  };
}

const FORM_CREATE = {
  operation: 'page',
  formTitle: 'New Project',
  formDescription: 'Add project details, description, and reference links. Next page: team & devices.',
  defineForm: 'fields',
  formFields: {
    values: [
      { fieldLabel: 'Project Name', requiredField: true },
      { fieldLabel: 'Assets', placeholder: 'Waiting / Received / links' },
      { fieldLabel: 'Description', fieldType: 'textarea', placeholder: 'Project brief, notes, context' },
      { fieldLabel: 'Reference Link', placeholder: 'Video, Loom, Drive, or reference URL' },
      { fieldLabel: 'Voice Note Link', placeholder: 'Paste link to voice note (Drive, WhatsApp, etc.)' },
      { fieldLabel: 'Deadline', fieldType: 'date', requiredField: true },
      {
        fieldLabel: 'Status',
        fieldType: 'dropdown',
        fieldOptions: {
          values: ['New', 'Planning', 'Waiting Assets', 'Development', 'Internal Review', 'Client Review', 'Changes Required', 'Approved', 'Deployment', 'Completed', 'Blocked'].map((option) => ({ option })),
        },
      },
    ],
  },
  options: {},
};

async function migrateHeaders() {
  const nodes = [
    {
      id: 'wh',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 300],
      webhookId: 'studio-os-phase-a-headers',
      parameters: { httpMethod: 'POST', path: 'studio-os-phase-a-headers', responseMode: 'lastNode', options: {} },
    },
    {
      id: 'pp',
      name: 'PUT Projects Header',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [240, 240],
      parameters: {
        method: 'PUT',
        url: `=https://sheets.googleapis.com/v4/spreadsheets/${TAB_CFG.Projects.docId}/values/Projects!A1:K1?valueInputOption=RAW`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'googleSheetsOAuth2Api',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: `={{ { range: "Projects!A1:K1", majorDimension: "ROWS", values: [${JSON.stringify(PROJECT_HEADERS)}] } }}`,
        options: {},
      },
      credentials: CRED,
    },
    {
      id: 'pt',
      name: 'PUT Technician Header',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [240, 380],
      parameters: {
        method: 'PUT',
        url: `=https://sheets.googleapis.com/v4/spreadsheets/${TAB_CFG.Technician.docId}/values/Technician!A1:H1?valueInputOption=RAW`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'googleSheetsOAuth2Api',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: `={{ { range: "Technician!A1:H1", majorDimension: "ROWS", values: [${JSON.stringify(TECH_HEADERS)}] } }}`,
        options: {},
      },
      credentials: CRED,
    },
    {
      id: 'sum',
      name: 'Summary',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.4,
      position: [480, 300],
      parameters: {
        assignments: { assignments: [{ id: '1', name: 'ok', value: 'Phase A headers updated', type: 'string' }] },
        options: {},
      },
    },
  ];

  const connections = {
    Webhook: { main: [[{ node: 'PUT Projects Header', type: 'main', index: 0 }]] },
    'PUT Projects Header': { main: [[{ node: 'PUT Technician Header', type: 'main', index: 0 }]] },
    'PUT Technician Header': { main: [[{ node: 'Summary', type: 'main', index: 0 }]] },
  };

  const list = await (await fetch(`${API}/api/v1/workflows`, { headers: { 'X-N8N-API-KEY': key } })).json();
  const existing = (list.data || list).find((w) => w.name === '[Studio OS] Setup - Phase A Headers');
  let setupId = existing?.id;
  const body = { name: '[Studio OS] Setup - Phase A Headers', nodes, connections, settings: { executionOrder: 'v1' } };

  if (setupId) {
    await fetch(`${API}/api/v1/workflows/${setupId}`, {
      method: 'PUT',
      headers: { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } else {
    setupId = (await (await fetch(`${API}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })).json()).id;
  }

  await fetch(`${API}/api/v1/workflows/${setupId}/activate`, { method: 'POST', headers: { 'X-N8N-API-KEY': key } });
  const res = await fetch(`${API}/webhook/studio-os-phase-a-headers`, { method: 'POST', body: '{}' });
  console.log('Headers:', res.status, (await res.text()).slice(0, 200));
  await fetch(`${API}/api/v1/workflows/${setupId}/deactivate`, { method: 'POST', headers: { 'X-N8N-API-KEY': key } });
}

async function patchWorkflow() {
  const wf = await (
    await fetch(`${API}/api/v1/workflows/${WF_ID}`, { headers: { 'X-N8N-API-KEY': key } })
  ).json();

  const codeNodes = {
    'CODE — Build Assignment Form': buildAssignCode,
    'Normalize Create Input': normalizeCreateCode,
    'Process Create Logic': processCreateCode,
    'Process Update Logic': processUpdateCode,
  };

  for (const node of wf.nodes) {
    if (node.name === 'FORM — Create Details') {
      node.parameters = FORM_CREATE;
    }
    if (node.name === 'FORM — Assign Team & Equipment') {
      node.parameters.formDescription = 'Pick developer, technician, install location link, and devices.';
    }
    if (codeNodes[node.name]) {
      node.parameters.jsCode = codeNodes[node.name];
    }
    if (node.name === 'CREATE — Project' || node.name === 'UPDATE — Project') {
      node.parameters.columns = makeColumns(SCHEMAS.Projects, node.name.includes('UPDATE') ? 'Project_Name' : null);
    }
    if (node.name === 'CREATE — Technician') {
      node.parameters.columns = makeColumns(SCHEMAS.Technician, null);
    }
  }

  const setup = wf.nodes.find((n) => n.name === 'SETUP');
  if (setup) {
    setup.parameters.content = setup.parameters.content.replace(
      'Projects (8 cols)',
      'Projects (+ Description, Reference_Link, Voice_Note_Link)'
    );
  }

  const put = await fetch(`${API}/api/v1/workflows/${WF_ID}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: wf.name,
      nodes: wf.nodes,
      connections: wf.connections,
      settings: wf.settings,
    }),
  });

  const out = await put.json();
  if (!put.ok) {
    console.error(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  await fetch(`${API}/api/v1/workflows/${WF_ID}/activate`, { method: 'POST', headers: { 'X-N8N-API-KEY': key } });
  console.log('Workflow updated for Phase A.');
}

(async () => {
  await migrateHeaders();
  await patchWorkflow();
  console.log('Done. Test: http://localhost:5678/form/studio-os-new-project');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
