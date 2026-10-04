/**
 * Restore full form pages + sync all Google Sheet IDs for production testing.
 * Run: N8N_API_KEY=... node fix-full-production.js
 */
const key = process.env.N8N_API_KEY;
if (!key) {
  console.error('Set N8N_API_KEY');
  process.exit(1);
}

const API = process.env.N8N_API_URL || 'http://localhost:5678';
const WF_ID = 'CucijOQolo68IGMR';

// IDs detected from your updated nodes in the live workflow
const DOCS = {
  projects: process.env.PROJECTS_SHEET_ID || '16euefGvdllQh9yrV24HTCjtBPtJPs4l0uT9IP8BNkkY',
  team: process.env.TEAM_SHEET_ID || '1GrxxzPg0DilXLxOi4ap8Ar7hwl24k8Gp00sl-RYkeR0',
  equipment: process.env.EQUIPMENT_SHEET_ID || '1Cq9G7E6Ow-ajTc_7MRS8yhTn4yzh7ELgVQSWZLCTmik',
  technician: process.env.TECHNICIAN_SHEET_ID || '1IvlOufwnpGmDJyva5GF_Z-j1XdW8mXsisiQYqfAnQvU',
};

const STATUSES = [
  'New', 'Planning', 'Waiting Assets', 'Development', 'Internal Review',
  'Client Review', 'Changes Required', 'Approved', 'Deployment', 'Completed', 'Blocked',
];

const FORM_FIXES = {
  'FORM — Create Details': {
    operation: 'page',
    formTitle: 'New Project',
    formDescription: 'Deadline only (no start date). Next page: developer, devices, technician.',
    defineForm: 'fields',
    formFields: {
      values: [
        { fieldLabel: 'Project Name', requiredField: true },
        { fieldLabel: 'Assets', placeholder: 'Waiting / Received / links' },
        { fieldLabel: 'Deadline', fieldType: 'date', requiredField: true },
        {
          fieldLabel: 'Status',
          fieldType: 'dropdown',
          fieldOptions: { values: STATUSES.map((option) => ({ option })) },
        },
      ],
    },
    options: {},
  },
  'FORM — Assign Team & Equipment': {
    operation: 'page',
    formTitle: 'Team & Devices',
    formDescription: 'Pick developer, optional technician/install date, and devices.',
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

function sheetTab(name) {
  const n = String(name).toLowerCase();
  if (n.includes('technician')) return DOCS.technician;
  if (n.includes('equipment')) return DOCS.equipment;
  if (n.includes('team')) return DOCS.team;
  if (n.includes('project')) return DOCS.projects;
  return null;
}

function getSheetName(node) {
  const sn = node.parameters?.sheetName;
  if (!sn) return '';
  if (typeof sn === 'string') return sn;
  return sn.cachedResultName || sn.value || '';
}

function patchSheetNode(node) {
  const docId = sheetTab(node.name) || sheetTab(getSheetName(node));
  if (!docId || !node.parameters?.documentId) return false;

  node.parameters.documentId = {
    __rl: true,
    mode: 'id',
    value: docId,
  };
  return true;
}

(async () => {
  const wf = await (
    await fetch(`${API}/api/v1/workflows/${WF_ID}`, {
      headers: { 'X-N8N-API-KEY': key },
    })
  ).json();

  let formsFixed = 0;
  let sheetsPatched = 0;

  for (const node of wf.nodes) {
    if (FORM_FIXES[node.name]) {
      node.parameters = FORM_FIXES[node.name];
      if (node.name === 'FORM — Assign Team & Equipment' && !node.webhookId) {
        node.webhookId = 'studio-os-assign-team-equipment';
      }
      formsFixed += 1;
    }

    if (node.type === 'n8n-nodes-base.googleSheets' && patchSheetNode(node)) {
      sheetsPatched += 1;
    }
  }

  const put = await fetch(`${API}/api/v1/workflows/${WF_ID}`, {
    method: 'PUT',
    headers: {
      'X-N8N-API-KEY': key,
      'Content-Type': 'application/json',
    },
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

  // Re-activate so production form URL stays live
  await fetch(`${API}/api/v1/workflows/${WF_ID}/activate`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': key },
  });

  console.log('Fixed form nodes:', formsFixed);
  console.log('Patched sheet nodes:', sheetsPatched);
  console.log('Sheet IDs:', DOCS);
  console.log('');
  console.log('PRODUCTION form (writes to sheets):');
  console.log(`${API}/form/studio-os-new-project`);
  console.log('');
  console.log('Do NOT use "Test workflow" in the n8n editor — that is test mode only.');
})();
