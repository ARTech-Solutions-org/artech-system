/**
 * Sync Google Sheets from sheet-templates CSVs + patch Projects Hub workflow.
 * Run: N8N_API_KEY=... node sync-and-apply.js
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
const TAB_CFG = CONFIG.tabs || {
  Projects: { docId: CONFIG.mainWorkbook?.id, sheetName: 'Projects' },
  Team: { docId: CONFIG.mainWorkbook?.id, sheetName: 'Team' },
  Technician: { docId: CONFIG.mainWorkbook?.id, sheetName: 'Technician' },
  Equipment: { docId: CONFIG.equipmentWorkbook?.id, sheetName: 'Equipment' },
};
const TEMPLATES = path.join(__dirname, 'sheet-templates');
const CRED = { googleSheetsOAuth2Api: { id: 'hPGaEBv6Ym0uVjSh', name: 'Google Sheets account' } };

const SCHEMAS = {
  Projects: [
    'Project_Name', 'Assets', 'Description', 'Reference_Link', 'Voice_Note_Link',
    'Assigned_Developer', 'Devices_Needed', 'Deadline', 'Build_Link', 'Video_Link', 'Status',
  ],
  Team: ['Team_ID', 'Name', 'Role', 'Email', 'Phone', 'Status', 'Current_Project', 'Available_From', 'Notes'],
  Equipment: ['Equipment_ID', 'Equipment_Name', 'Category', 'Amount', 'Available', 'Status', 'Location', 'Date_Needed_Until', 'Notes'],
  Technician: ['Technician_ID', 'Project_Name', 'Technician', 'Equipment_Needed', 'Installation_Date', 'Location_Link', 'Status', 'Notes'],
};

function parseCsv(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(',').map((c) => c.trim()));
}

function sheetByName(tab) {
  return { __rl: true, mode: 'name', value: tab };
}

function docId(id) {
  return { __rl: true, mode: 'id', value: id };
}

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

const TAB_DOCS = Object.fromEntries(
  Object.entries(TAB_CFG).map(([tab, cfg]) => [tab, cfg.docId])
);

const WRITE_NODES = {
  'CREATE — Project': { tab: 'Projects', match: null },
  'UPDATE — Project': { tab: 'Projects', match: 'Project_Name' },
  'UPDATE — Equipment': { tab: 'Equipment', match: 'Equipment_ID' },
  'UPDATE — Release Equipment': { tab: 'Equipment', match: 'Equipment_ID' },
  'UPDATE — Auto Release': { tab: 'Equipment', match: 'Equipment_ID' },
  'UPDATE — Team': { tab: 'Team', match: 'Team_ID' },
  'CREATE — Technician': { tab: 'Technician', match: null },
};

async function seedSheetsFromTemplates() {
  const data = {
    Projects: parseCsv(path.join(TEMPLATES, 'Projects.csv')),
    Team: parseCsv(path.join(TEMPLATES, 'Team.csv')),
    Equipment: parseCsv(path.join(TEMPLATES, 'Equipment.csv')),
    Technician: parseCsv(path.join(TEMPLATES, 'Technician.csv')),
  };

  const seedEntries = Object.entries(TAB_CFG).map(([tab, cfg], i) => ({
    tab,
    doc: cfg.docId,
    sheetName: cfg.sheetName || tab,
    rows: data[tab],
    y: 160 + i * 120,
  }));

  const nodes = [
    {
      id: 'wh',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 360],
      webhookId: 'studio-os-sync-templates',
      parameters: { httpMethod: 'POST', path: 'studio-os-sync-templates', responseMode: 'lastNode', options: {} },
    },
  ];

  const connections = {};
  let prev = 'Webhook';

  for (const entry of seedEntries) {
    const addName = `Ensure ${entry.tab} Tab`;
    const putName = `PUT ${entry.tab}`;
    nodes.push({
      id: `add-${entry.tab.toLowerCase()}`,
      name: addName,
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [240, entry.y],
      parameters: {
        method: 'POST',
        url: `=https://sheets.googleapis.com/v4/spreadsheets/${entry.doc}:batchUpdate`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'googleSheetsOAuth2Api',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: `={{ { requests: [{ addSheet: { properties: { title: "${entry.sheetName}" } } }] } }}`,
        options: { response: { response: { neverError: true } } },
      },
      credentials: CRED,
    });
    nodes.push({
      id: `put-${entry.tab.toLowerCase()}`,
      name: putName,
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [520, entry.y],
      parameters: {
        method: 'PUT',
        url: `=https://sheets.googleapis.com/v4/spreadsheets/${entry.doc}/values/${entry.sheetName}?valueInputOption=RAW`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'googleSheetsOAuth2Api',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: `={{ { range: "${entry.sheetName}", majorDimension: "ROWS", values: ${JSON.stringify(entry.rows)} } }}`,
        options: {},
      },
      credentials: CRED,
    });

    connections[prev] = { main: [[{ node: addName, type: 'main', index: 0 }]] };
    connections[addName] = { main: [[{ node: putName, type: 'main', index: 0 }]] };
    prev = putName;
  }

  connections[prev] = { main: [[{ node: 'Summary', type: 'main', index: 0 }]] };

  nodes.push({
    id: 'sum',
    name: 'Summary',
    type: 'n8n-nodes-base.set',
    typeVersion: 3.4,
    position: [800, 360],
    parameters: {
      assignments: {
        assignments: [
          { id: '1', name: 'ok', value: 'Templates synced to all spreadsheets', type: 'string' },
          { id: '2', name: 'config', value: JSON.stringify(TAB_CFG), type: 'string' },
        ],
      },
      options: {},
    },
  });

  const list = await (await fetch(`${API}/api/v1/workflows`, { headers: { 'X-N8N-API-KEY': key } })).json();
  const existing = (list.data || list).find((w) => w.name === '[Studio OS] Setup - Sync Templates');
  let setupId = existing?.id;
  const body = { name: '[Studio OS] Setup - Sync Templates', nodes, connections, settings: { executionOrder: 'v1' } };

  if (setupId) {
    await fetch(`${API}/api/v1/workflows/${setupId}`, {
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
    setupId = created.id;
  }

  await fetch(`${API}/api/v1/workflows/${setupId}/activate`, { method: 'POST', headers: { 'X-N8N-API-KEY': key } });
  const res = await fetch(`${API}/webhook/studio-os-sync-templates`, { method: 'POST', body: '{}' });
  const text = await res.text();
  console.log('Seed sheets:', res.status, text);
  await fetch(`${API}/api/v1/workflows/${setupId}/deactivate`, { method: 'POST', headers: { 'X-N8N-API-KEY': key } });
}

async function patchWorkflow() {
  const wf = await (
    await fetch(`${API}/api/v1/workflows/${WF_ID}`, { headers: { 'X-N8N-API-KEY': key } })
  ).json();

  const FORM_FIXES = {
    'FORM — Create Details': {
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
    },
    'FORM — Assign Team & Equipment': {
      operation: 'page',
      formTitle: 'Team & Devices',
      formDescription: 'Pick developer, technician, install location link, and devices.',
      defineForm: 'json',
      jsonOutput: '={{ $json.form_fields }}',
      options: {},
    },
    'FORM — Update Project': {
      operation: 'page',
      formTitle: 'Update Project',
      formDescription: 'Add build & video links, change status.',
      defineForm: 'json',
      jsonOutput: '={{ $json.form_fields }}',
      options: {},
    },
    'FORM — Release Equipment': {
      operation: 'page',
      formTitle: 'Release Equipment',
      formDescription: 'Free reserved gear early.',
      defineForm: 'json',
      jsonOutput: '={{ $json.form_fields }}',
      options: {},
    },
  };

  let patched = 0;
  for (const node of wf.nodes) {
    if (FORM_FIXES[node.name]) {
      node.parameters = FORM_FIXES[node.name];
      patched += 1;
    }

    if (node.type === 'n8n-nodes-base.googleSheets') {
      const tab = (() => {
        const sn = node.parameters?.sheetName;
        if (!sn) return '';
        if (typeof sn === 'string') return sn;
        return sn.cachedResultName || sn.value || '';
      })();

      if (TAB_DOCS[tab]) {
        node.parameters.documentId = docId(TAB_DOCS[tab]);
        node.parameters.sheetName = sheetByName(TAB_CFG[tab]?.sheetName || tab);
      }

      node.retryOnFail = true;
      node.maxTries = 5;
      node.waitBetweenTries = 2000;
      node.alwaysOutputData = true;

      const writeSpec = WRITE_NODES[node.name];
      if (writeSpec) {
        node.parameters.columns = makeColumns(SCHEMAS[writeSpec.tab], writeSpec.match);
      }

      patched += 1;
    }
  }

  // Ensure Equipment (Logic) node exists
  if (!wf.nodes.find((n) => n.name === 'READ — Equipment (Logic)')) {
    const formEquip = wf.nodes.find((n) => n.name === 'READ — Equipment (Form)');
    wf.nodes.push({
      id: 'read-equip-logic',
      name: 'READ — Equipment (Logic)',
      type: 'n8n-nodes-base.googleSheets',
      typeVersion: 4.5,
      position: formEquip?.position ? [formEquip.position[0], formEquip.position[1] + 140] : [1984, 200],
      parameters: {
        documentId: docId(TAB_CFG.Equipment.docId),
        sheetName: sheetByName(TAB_CFG.Equipment.sheetName || 'Equipment'),
        options: {},
      },
      credentials: CRED,
      alwaysOutputData: true,
      retryOnFail: true,
      maxTries: 5,
      waitBetweenTries: 2000,
    });
  }

  wf.connections['Normalize Create Input'] = { main: [[{ node: 'READ — Projects', type: 'main', index: 0 }]] };
  wf.connections['READ — Projects'] = { main: [[{ node: 'READ — Equipment (Logic)', type: 'main', index: 0 }]] };
  wf.connections['READ — Equipment (Logic)'] = { main: [[{ node: 'READ — Team (Logic)', type: 'main', index: 0 }]] };
  wf.connections['READ — Team (Logic)'] = { main: [[{ node: 'Process Create Logic', type: 'main', index: 0 }]] };

  // Technician write should not block overall success
  const createTech = wf.nodes.find((n) => n.name === 'CREATE — Technician');
  if (createTech) {
    createTech.continueOnFail = true;
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
  console.log(`Workflow patched (${patched} nodes).`);
  console.log('Sheet IDs from sheets-config.json:');
  for (const [tab, cfg] of Object.entries(TAB_CFG)) {
    console.log(`  ${tab}: ${cfg.docId}`);
  }
  console.log('Form URL:', `${API}/form/studio-os-new-project`);
}

(async () => {
  await seedSheetsFromTemplates();
  await patchWorkflow();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
