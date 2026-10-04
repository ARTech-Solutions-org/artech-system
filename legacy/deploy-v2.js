/**
 * Studio OS v2 — simplified sheets + Projects Hub workflow
 * Run: N8N_API_KEY=... node deploy-v2.js
 * Requires n8n at http://localhost:5678
 */
const key = process.env.N8N_API_KEY;
if (!key) {
  console.error('Set N8N_API_KEY');
  process.exit(1);
}

const API = process.env.N8N_API_URL || 'http://localhost:5678';
const WF_ID = 'CucijOQolo68IGMR';

const CRED = {
  googleSheetsOAuth2Api: { id: 'hPGaEBv6Ym0uVjSh', name: 'Google Sheets account' },
};

const DOCS = {
  projects: '1KXfojWoFoRfeOsfwV3wwX48_kPqn3lD0seQjaGnqFVc',
  team: '1KXfojWoFoRfeOsfwV3wwX48_kPqn3lD0seQjaGnqFVc', // Team tab in Projects workbook
  equipment: '1SOpTC6zINBOVdJW8rp7k1o00Dlx8Tl9Pw-2FC8Aqx6I',
};

const STATUSES = [
  'New', 'Planning', 'Waiting Assets', 'Development', 'Internal Review',
  'Client Review', 'Changes Required', 'Approved', 'Deployment', 'Completed', 'Blocked',
];

function sheetDoc(id) {
  return { __rl: true, mode: 'id', value: id };
}

function sheetName(name) {
  return { __rl: true, mode: 'name', value: name };
}

function readSheet(id, name, nodeId, x, y) {
  return {
    id: nodeId,
    name: `READ — ${name}`,
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [x, y],
    parameters: { documentId: sheetDoc(DOCS[id]), sheetName: sheetName(name), options: {} },
    credentials: CRED,
    alwaysOutputData: true,
  };
}

function writeSheet(id, name, nodeId, op, matchCol, x, y, nodeName) {
  const cols = {
    projects: [
      'Project_Name', 'Assets', 'Description', 'Reference_Link', 'Voice_Note_Link',
      'Assigned_Developer', 'Devices_Needed', 'Deadline', 'Build_Link', 'Video_Link', 'Status',
    ],
    equipment: ['Equipment_ID', 'Equipment_Name', 'Category', 'Amount', 'Available', 'Status', 'Location', 'Date_Needed_Until', 'Notes'],
    team: ['Team_ID', 'Name', 'Role', 'Email', 'Phone', 'Status', 'Current_Project', 'Available_From', 'Notes'],
    technician: ['Technician_ID', 'Project_Name', 'Technician', 'Equipment_Needed', 'Installation_Date', 'Location_Link', 'Status', 'Notes'],
  }[id];

  return {
    id: nodeId,
    name: nodeName || (op === 'append' ? `CREATE — ${name}` : `UPDATE — ${name}`),
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [x, y],
    parameters: {
      operation: op === 'append' ? 'append' : 'appendOrUpdate',
      documentId: sheetDoc(DOCS[id === 'technician' ? 'projects' : id]),
      sheetName: sheetName(name),
      columns: {
        mappingMode: 'autoMapInputData',
        value: {},
        matchingColumns: matchCol ? [matchCol] : [],
        schema: (cols || []).map((c) => ({
          id: c,
          displayName: c,
          required: false,
          defaultMatch: c === matchCol,
          display: true,
          type: 'string',
          canBeUsedToMatch: true,
        })),
      },
      options: {},
    },
    credentials: CRED,
  };
}

function codeNode(id, name, jsCode, x, y) {
  return {
    id,
    name,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [x, y],
    parameters: { jsCode },
  };
}

function ifNode(id, name, left, right, x, y, type = 'string') {
  return {
    id,
    name,
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [x, y],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [
          {
            id: 'c1',
            leftValue: left,
            rightValue: right,
            operator: { type, operation: type === 'boolean' ? 'equals' : 'equals' },
          },
        ],
        combinator: 'and',
      },
      options: {},
    },
  };
}

function ifSkip(id, name, x, y) {
  return {
    id,
    name,
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [x, y],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [
          {
            id: 'c1',
            leftValue: '={{ $json._skip }}',
            rightValue: true,
            operator: { type: 'boolean', operation: 'notEquals' },
          },
        ],
        combinator: 'and',
      },
      options: {},
    },
  };
}

function formPage(id, name, title, desc, x, y, webhookId) {
  return {
    id,
    name,
    type: 'n8n-nodes-base.form',
    typeVersion: 2.2,
    position: [x, y],
    webhookId,
    parameters: {
      operation: 'page',
      formTitle: title,
      formDescription: desc,
      defineForm: 'json',
      jsonOutput: '={{ $json.form_fields }}',
      options: {},
    },
  };
}

const buildAssignCode = `const teamRaw = $('READ — Team').all().map(i => i.json).filter(r => r.Name || r.Team_ID);
const equipmentRaw = $('READ — Equipment').all().map(i => i.json).filter(r => r.Equipment_ID || r.Equipment_Name);

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
    assigned_developer: developer === 'No team found' ? '' : developer,
    devices_needed: [...merged.values()].map(d => d.name + ' x' + d.qty).join(', ') || String(p1['Devices Needed Text'] || '').trim(),
    device_requests: [...merged.values()],
    deadline,
    status: String(p1.Status || 'New').trim() || 'New',
    technician: technician === '(None)' ? '' : technician,
    installation_date: installationDate,
    now: new Date().toISOString(),
  },
}];`;

const processCreateCode = `const input = $('Normalize Create Input').first().json;
const projects = $('READ — Projects').all().map(i => i.json).filter(r => r.Project_Name);
const equipment = $('READ — Equipment').all().map(i => i.json).filter(r => r.Equipment_ID);
const team = $('READ — Team').all().map(i => i.json).filter(r => r.Team_ID || r.Name);

const dup = projects.find(p => String(p.Project_Name || '').toLowerCase() === input.project_name.toLowerCase());
if (dup) {
  return [{ json: { is_duplicate: true, summary: { message: 'Project name already exists', project_name: input.project_name } } }];
}

const allowed = new Set(${JSON.stringify(STATUSES)});
let status = input.status;
if (!allowed.has(status)) status = 'New';

const projectRow = {
  Project_Name: input.project_name,
  Assets: input.assets,
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

const buildUpdateCode = `const projects = $('READ — Projects For Update').all().map(i => i.json).filter(r => r.Project_Name);
const team = $('READ — Team For Update').all().map(i => i.json).filter(r => r.Name);

const projectOptions = projects.map(p => ({
  option: [p.Project_Name, p.Status ? '(' + p.Status + ')' : '', p.Deadline ? 'due ' + p.Deadline : ''].filter(Boolean).join(' | '),
}));
if (!projectOptions.length) projectOptions.push({ option: 'No projects yet' });

const teamOptions = team.filter(t => String(t.Status) !== 'Off').map(t => ({ option: String(t.Name).trim() }));
if (!teamOptions.length) teamOptions.push({ option: 'No team found' });

const statusOptions = ${JSON.stringify(STATUSES)}.map(s => ({ option: s }));

return [{
  json: {
    form_fields: [
      { fieldLabel: 'Project', fieldType: 'dropdown', requiredField: true, fieldOptions: { values: projectOptions } },
      { fieldLabel: 'Submitted By', fieldType: 'dropdown', requiredField: true, fieldOptions: { values: teamOptions } },
      { fieldLabel: 'Build Link', fieldType: 'text' },
      { fieldLabel: 'Video Link', fieldType: 'text' },
      { fieldLabel: 'Status', fieldType: 'dropdown', fieldOptions: { values: statusOptions } },
    ],
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

const allowed = new Set(${JSON.stringify(STATUSES)});
let status = pick('Status', 'Status');
if (!allowed.has(status)) status = existing.Status || 'Development';

return [{
  json: {
    project_row: {
      Project_Name: existing.Project_Name,
      Assets: existing.Assets || '',
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

const buildReleaseCode = `const equipment = $('READ — Equipment For Release').all().map(i => i.json).filter(r => r.Equipment_ID);
const reserved = equipment.filter(e => String(e.Date_Needed_Until || '').trim());

const options = reserved.map(e => ({
  option: [e.Equipment_ID, e.Equipment_Name, 'until ' + e.Date_Needed_Until].join(' | '),
}));
if (!options.length) options.push({ option: 'Nothing reserved' });

return [{
  json: {
    form_fields: [
      { fieldLabel: 'Equipment', fieldType: 'dropdown', requiredField: true, fieldOptions: { values: options } },
      { fieldLabel: 'Released By', fieldType: 'text', requiredField: true },
    ],
  },
}];`;

const processReleaseCode = `const page = $('FORM — Release Equipment').first().json;
const equipment = $('READ — Equipment For Release').all().map(i => i.json);

const label = String(page.Equipment || '').trim();
if (!label || label.startsWith('Nothing')) throw new Error('Pick equipment to release.');
const eqId = label.split('|')[0].trim();
const eq = equipment.find(e => String(e.Equipment_ID) === eqId);
if (!eq) throw new Error('Equipment not found');

const amount = Number(eq.Amount) || 1;
let available = Number(eq.Available);
if (!Number.isFinite(available)) available = 0;
available = Math.min(amount, available + 1);

return [{
  json: {
    equipment_row: {
      Equipment_ID: eq.Equipment_ID,
      Equipment_Name: eq.Equipment_Name,
      Category: eq.Category || '',
      Amount: amount,
      Available: available,
      Status: 'Available',
      Location: eq.Location || '',
      Date_Needed_Until: '',
      Notes: eq.Notes || '',
    },
    summary: { action: 'release', equipment_id: eqId, released_by: page['Released By'] },
  },
}];`;

const autoReleaseCode = `const now = Date.now();
const equipment = $('READ — Equipment Auto').all().map(i => i.json).filter(r => r.Equipment_ID);
const rows = [];

for (const eq of equipment) {
  const until = String(eq.Date_Needed_Until || '').trim();
  if (!until) continue;
  const end = new Date(until).getTime();
  if (!end || end > now) continue;
  const amount = Number(eq.Amount) || 1;
  let available = Number(eq.Available);
  if (!Number.isFinite(available)) available = 0;
  available = Math.min(amount, available + 1);
  rows.push({
    Equipment_ID: eq.Equipment_ID,
    Equipment_Name: eq.Equipment_Name,
    Category: eq.Category || '',
    Amount: amount,
    Available: available,
    Status: 'Available',
    Location: eq.Location || '',
    Date_Needed_Until: '',
    Notes: eq.Notes || '',
  });
}

return [{ json: { equipment_rows: rows, summary: { auto_released: rows.length }, _skip: rows.length === 0 } }];`;

function buildWorkflow() {
  const nodes = [
    {
      id: 'setup',
      name: 'SETUP',
      type: 'n8n-nodes-base.stickyNote',
      typeVersion: 1,
      position: [-200, 40],
      parameters: {
        content: `## Studio OS v2\n\nSheets: Projects (8 cols), Team, Equipment (+ Date_Needed_Until), Technician\n\nActions:\n- Create → project + devices + technician row\n- Update → build/video links + status\n- Release → clear equipment reservation\n\nAuto-release every 30m when Date_Needed_Until passed`,
        height: 320,
        width: 420,
      },
    },
    {
      id: 'form-hub',
      name: 'FORM — Projects Hub',
      type: 'n8n-nodes-base.formTrigger',
      typeVersion: 2.2,
      position: [0, 300],
      webhookId: 'studio-os-new-project',
      parameters: {
        formTitle: 'Studio OS',
        formDescription: 'Create projects, submit build/video links, or release equipment.',
        responseMode: 'lastNode',
        formFields: {
          values: [{
            fieldLabel: 'Action',
            fieldType: 'dropdown',
            requiredField: true,
            fieldOptions: {
              values: [
                { option: 'Create New Project' },
                { option: 'Update Project' },
                { option: 'Release Equipment' },
              ],
            },
          }],
        },
        options: {},
      },
    },
    ifNode('if-create', 'IF — Create?', '={{ $json.Action }}', 'Create New Project', 220, 300),
    ifNode('if-update', 'IF — Update?', '={{ $json.Action }}', 'Update Project', 440, 420),
    {
      id: 'form-create',
      name: 'FORM — Create Details',
      type: 'n8n-nodes-base.form',
      typeVersion: 2.2,
      position: [440, 160],
      parameters: {
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
    },
    readSheet('team', 'Team', 'read-team', 660, 160),
    codeNode('collapse', 'Collapse Team', `return [{ json: { ok: true } }];`, 880, 160),
    readSheet('equipment', 'Equipment', 'read-equip-create', 1100, 160),
    codeNode('build-assign', 'CODE — Build Assignment Form', buildAssignCode, 1320, 160),
    formPage('form-assign', 'FORM — Assign Team & Equipment', 'Team & Devices', 'Pick developer, optional technician/install date, and devices.', 1540, 160, 'studio-os-assign-team-equipment'),
    codeNode('norm-create', 'Normalize Create Input', normalizeCreateCode, 1760, 160),
    readSheet('projects', 'Projects', 'read-proj-create', 1980, 80),
    readSheet('equipment', 'Equipment', 'read-equip-logic', 1980, 200),
    readSheet('team', 'Team', 'read-team-logic', 1980, 320),
    codeNode('process-create', 'Process Create Logic', processCreateCode, 2200, 160),
    ifNode('if-dup', 'IF — Duplicate?', '={{ $json.is_duplicate }}', true, 2420, 160, 'boolean'),
    {
      id: 'sum-dup',
      name: 'Summary — Duplicate',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.4,
      position: [2640, 280],
      parameters: {
        assignments: {
          assignments: [
            { id: '1', name: 'summary', value: '={{ JSON.stringify($json.summary) }}', type: 'string' },
          ],
        },
        options: {},
      },
    },
    codeNode('prep-proj', 'Prepare Project Row', `const r=$input.first().json.project_row; return r?[{json:r}]:[];`, 2640, 80),
    writeSheet('projects', 'Projects', 'create-proj', 'append', null, 2860, 80, 'CREATE — Project'),
    codeNode('prep-eq', 'Prepare Equipment Rows', `const rows=$('Process Create Logic').first().json.equipment_rows||[]; if(!rows.length) return [{json:{_skip:true}}]; return rows.map(r=>({json:r}));`, 2860, 200),
    ifSkip('if-eq', 'IF — Has Equipment?', 3080, 200),
    writeSheet('equipment', 'Equipment', 'upd-eq', 'update', 'Equipment_ID', 3300, 120),
    codeNode('prep-team', 'Prepare Team Rows', `const rows=$('Process Create Logic').first().json.team_rows||[]; if(!rows.length) return [{json:{_skip:true}}]; return rows.map(r=>({json:r}));`, 3080, 320),
    ifSkip('if-team', 'IF — Has Team?', 3300, 320),
    writeSheet('team', 'Team', 'upd-team', 'update', 'Team_ID', 3520, 320),
    codeNode('prep-tech', 'Prepare Technician Rows', `const rows=$('Process Create Logic').first().json.technician_rows||[]; if(!rows.length) return [{json:{_skip:true}}]; return rows.map(r=>({json:r}));`, 3520, 200),
    ifSkip('if-tech', 'IF — Has Technician?', 3740, 200),
    writeSheet('technician', 'Technician', 'create-tech', 'append', null, 3960, 200, 'CREATE — Technician'),
    {
      id: 'sum-create',
      name: 'Summary — Created',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.4,
      position: [4180, 240],
      parameters: {
        assignments: {
          assignments: [
            { id: '1', name: 'summary', value: '={{ JSON.stringify($("Process Create Logic").first().json.summary) }}', type: 'string' },
          ],
        },
        options: {},
      },
    },
    readSheet('projects', 'Projects', 'read-proj-upd', 660, 480),
    readSheet('team', 'Team', 'read-team-upd', 880, 480),
    codeNode('build-upd', 'CODE — Build Update Form', buildUpdateCode, 1100, 480),
    formPage('form-upd', 'FORM — Update Project', 'Update Project', 'Add build & video links, change status.', 1320, 480, 'studio-os-update-project'),
    codeNode('process-upd', 'Process Update Logic', processUpdateCode, 1540, 480),
    codeNode('prep-upd', 'Prepare Update Row', `const r=$input.first().json.project_row; return [{json:r}];`, 1760, 480),
    writeSheet('projects', 'Projects', 'upd-proj', 'update', 'Project_Name', 1980, 480, 'UPDATE — Project'),
    {
      id: 'sum-upd',
      name: 'Summary — Updated',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.4,
      position: [2200, 480],
      parameters: {
        assignments: {
          assignments: [
            { id: '1', name: 'summary', value: '={{ JSON.stringify($("Process Update Logic").first().json.summary) }}', type: 'string' },
          ],
        },
        options: {},
      },
    },
    readSheet('equipment', 'Equipment', 'read-eq-rel', 660, 640),
    codeNode('build-rel', 'CODE — Build Release Form', buildReleaseCode, 880, 640),
    formPage('form-rel', 'FORM — Release Equipment', 'Release Equipment', 'Free reserved gear early.', 1100, 640, 'studio-os-release-equipment'),
    codeNode('process-rel', 'Process Release Logic', processReleaseCode, 1320, 640),
    codeNode('prep-rel', 'Prepare Release Row', `const r=$input.first().json.equipment_row; return [{json:r}];`, 1540, 640),
    writeSheet('equipment', 'Equipment', 'upd-rel', 'update', 'Equipment_ID', 1760, 640, 'UPDATE — Release Equipment'),
    {
      id: 'sum-rel',
      name: 'Summary — Released',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.4,
      position: [1980, 640],
      parameters: {
        assignments: {
          assignments: [
            { id: '1', name: 'summary', value: '={{ JSON.stringify($("Process Release Logic").first().json.summary) }}', type: 'string' },
          ],
        },
        options: {},
      },
    },
    {
      id: 'sched',
      name: 'SCHEDULE — Auto Release',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.2,
      position: [0, 820],
      parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 30 }] } },
    },
    readSheet('equipment', 'Equipment', 'read-eq-auto', 220, 820),
    codeNode('process-auto', 'Process Auto Release', autoReleaseCode, 440, 820),
    codeNode('prep-auto', 'Prepare Auto Rows', `const rows=$input.first().json.equipment_rows||[]; if(!rows.length) return [{json:{_skip:true}}]; return rows.map(r=>({json:r}));`, 660, 820),
    ifSkip('if-auto', 'IF — Auto Release?', 880, 820),
    writeSheet('equipment', 'Equipment', 'upd-auto', 'update', 'Equipment_ID', 1100, 820, 'UPDATE — Auto Release'),
    {
      id: 'sum-auto',
      name: 'Summary — Auto',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.4,
      position: [1320, 820],
      parameters: {
        assignments: {
          assignments: [
            { id: '1', name: 'summary', value: '={{ JSON.stringify($("Process Auto Release").first().json.summary) }}', type: 'string' },
          ],
        },
        options: {},
      },
    },
  ];

  const c = {
    'FORM — Projects Hub': { main: [[{ node: 'IF — Create?', type: 'main', index: 0 }]] },
    'IF — Create?': {
      main: [
        [{ node: 'FORM — Create Details', type: 'main', index: 0 }],
        [{ node: 'IF — Update?', type: 'main', index: 0 }],
      ],
    },
    'IF — Update?': {
      main: [
        [{ node: 'READ — Projects For Update', type: 'main', index: 0 }],
        [{ node: 'READ — Equipment For Release', type: 'main', index: 0 }],
      ],
    },
    'FORM — Create Details': { main: [[{ node: 'READ — Team', type: 'main', index: 0 }]] },
    'READ — Team': { main: [[{ node: 'Collapse Team', type: 'main', index: 0 }]] },
    'Collapse Team': { main: [[{ node: 'READ — Equipment', type: 'main', index: 0 }]] },
    'READ — Equipment': { main: [[{ node: 'CODE — Build Assignment Form', type: 'main', index: 0 }]] },
    'CODE — Build Assignment Form': { main: [[{ node: 'FORM — Assign Team & Equipment', type: 'main', index: 0 }]] },
    'FORM — Assign Team & Equipment': { main: [[{ node: 'Normalize Create Input', type: 'main', index: 0 }]] },
    'Normalize Create Input': {
      main: [[
        { node: 'READ — Projects', type: 'main', index: 0 },
        { node: 'READ — Equipment', type: 'main', index: 0 },
        { node: 'READ — Team', type: 'main', index: 0 },
      ]],
    },
    'READ — Projects': { main: [[{ node: 'Process Create Logic', type: 'main', index: 0 }]] },
    'Process Create Logic': { main: [[{ node: 'IF — Duplicate?', type: 'main', index: 0 }]] },
    'IF — Duplicate?': {
      main: [
        [{ node: 'Summary — Duplicate', type: 'main', index: 0 }],
        [{ node: 'Prepare Project Row', type: 'main', index: 0 }],
      ],
    },
    'Prepare Project Row': { main: [[{ node: 'CREATE — Project', type: 'main', index: 0 }]] },
    'CREATE — Project': { main: [[{ node: 'Prepare Equipment Rows', type: 'main', index: 0 }]] },
    'Prepare Equipment Rows': { main: [[{ node: 'IF — Has Equipment?', type: 'main', index: 0 }]] },
    'IF — Has Equipment?': {
      main: [
        [{ node: 'UPDATE — Equipment', type: 'main', index: 0 }],
        [{ node: 'Prepare Team Rows', type: 'main', index: 0 }],
      ],
    },
    'UPDATE — Equipment': { main: [[{ node: 'Prepare Team Rows', type: 'main', index: 0 }]] },
    'Prepare Team Rows': { main: [[{ node: 'IF — Has Team?', type: 'main', index: 0 }]] },
    'IF — Has Team?': {
      main: [
        [{ node: 'UPDATE — Team', type: 'main', index: 0 }],
        [{ node: 'Prepare Technician Rows', type: 'main', index: 0 }],
      ],
    },
    'UPDATE — Team': { main: [[{ node: 'Prepare Technician Rows', type: 'main', index: 0 }]] },
    'Prepare Technician Rows': { main: [[{ node: 'IF — Has Technician?', type: 'main', index: 0 }]] },
    'IF — Has Technician?': {
      main: [
        [{ node: 'CREATE — Technician', type: 'main', index: 0 }],
        [{ node: 'Summary — Created', type: 'main', index: 0 }],
      ],
    },
    'CREATE — Technician': { main: [[{ node: 'Summary — Created', type: 'main', index: 0 }]] },
    'READ — Projects For Update': { main: [[{ node: 'READ — Team For Update', type: 'main', index: 0 }]] },
    'READ — Team For Update': { main: [[{ node: 'CODE — Build Update Form', type: 'main', index: 0 }]] },
    'CODE — Build Update Form': { main: [[{ node: 'FORM — Update Project', type: 'main', index: 0 }]] },
    'FORM — Update Project': { main: [[{ node: 'Process Update Logic', type: 'main', index: 0 }]] },
    'Process Update Logic': { main: [[{ node: 'Prepare Update Row', type: 'main', index: 0 }]] },
    'Prepare Update Row': { main: [[{ node: 'UPDATE — Project', type: 'main', index: 0 }]] },
    'UPDATE — Project': { main: [[{ node: 'Summary — Updated', type: 'main', index: 0 }]] },
    'READ — Equipment For Release': { main: [[{ node: 'CODE — Build Release Form', type: 'main', index: 0 }]] },
    'CODE — Build Release Form': { main: [[{ node: 'FORM — Release Equipment', type: 'main', index: 0 }]] },
    'FORM — Release Equipment': { main: [[{ node: 'Process Release Logic', type: 'main', index: 0 }]] },
    'Process Release Logic': { main: [[{ node: 'Prepare Release Row', type: 'main', index: 0 }]] },
    'Prepare Release Row': { main: [[{ node: 'UPDATE — Release Equipment', type: 'main', index: 0 }]] },
    'UPDATE — Release Equipment': { main: [[{ node: 'Summary — Released', type: 'main', index: 0 }]] },
    'SCHEDULE — Auto Release': { main: [[{ node: 'READ — Equipment Auto', type: 'main', index: 0 }]] },
    'READ — Equipment Auto': { main: [[{ node: 'Process Auto Release', type: 'main', index: 0 }]] },
    'Process Auto Release': { main: [[{ node: 'Prepare Auto Rows', type: 'main', index: 0 }]] },
    'Prepare Auto Rows': { main: [[{ node: 'IF — Auto Release?', type: 'main', index: 0 }]] },
    'IF — Auto Release?': {
      main: [
        [{ node: 'UPDATE — Auto Release', type: 'main', index: 0 }],
        [{ node: 'Summary — Auto', type: 'main', index: 0 }],
      ],
    },
    'UPDATE — Auto Release': { main: [[{ node: 'Summary — Auto', type: 'main', index: 0 }]] },
  };

  // Fix duplicate node names - READ Equipment used twice in create path
  // Rename nodes for clarity in connections
  const rename = {
    'read-equip-create': 'READ — Equipment (Form)',
    'read-equip-logic': 'READ — Equipment (Logic)',
    'read-team-logic': 'READ — Team (Logic)',
    'read-proj-create': 'READ — Projects',
    'read-proj-upd': 'READ — Projects For Update',
    'read-team-upd': 'READ — Team For Update',
    'read-eq-rel': 'READ — Equipment For Release',
    'read-eq-auto': 'READ — Equipment Auto',
  };
  for (const n of nodes) {
    if (rename[n.id]) n.name = rename[n.id];
  }

  // Fix connections for renamed equipment nodes
  c['Collapse Team'].main[0][0].node = 'READ — Equipment (Form)';
  c['READ — Equipment (Form)'] = c['READ — Equipment'];
  delete c['READ — Equipment'];
  c['Normalize Create Input'].main[0] = [
    { node: 'READ — Projects', type: 'main', index: 0 },
    { node: 'READ — Equipment (Logic)', type: 'main', index: 0 },
    { node: 'READ — Team (Logic)', type: 'main', index: 0 },
  ];
  // Process waits for all 3 - n8n merges when multiple inputs; use only READ Projects as trigger chain instead
  c['Normalize Create Input'] = { main: [[{ node: 'READ — Projects', type: 'main', index: 0 }]] };
  c['READ — Projects'] = {
    main: [[
      { node: 'READ — Equipment (Logic)', type: 'main', index: 0 },
    ]],
  };
  c['READ — Equipment (Logic)'] = { main: [[{ node: 'READ — Team (Logic)', type: 'main', index: 0 }]] };
  c['READ — Team (Logic)'] = { main: [[{ node: 'Process Create Logic', type: 'main', index: 0 }]] };

  // Fix build assign code to use Form equipment read
  const buildNode = nodes.find((n) => n.id === 'build-assign');
  buildNode.parameters.jsCode = buildNode.parameters.jsCode.replace(
    "$('READ — Equipment')",
    "$('READ — Equipment (Form)')"
  );

  const processNode = nodes.find((n) => n.id === 'process-create');
  processNode.parameters.jsCode = processNode.parameters.jsCode
    .replace("$('READ — Equipment')", "$('READ — Equipment (Logic)')")
    .replace("$('READ — Team')", "$('READ — Team (Logic)')");

  return {
    name: '[Studio OS] 01 - Projects Hub',
    nodes,
    connections: c,
    settings: { executionOrder: 'v1', timezone: 'Africa/Cairo' },
  };
}

async function fetchOk(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body)}`);
  return body;
}

(async () => {
  try {
    await fetchOk(`${API}/healthz`);
  } catch (e) {
    console.error('n8n not reachable. Start Docker Desktop, then: docker compose -f C:\\n8n\\docker-compose.yml up -d');
    console.error(e.message);
    // Still write workflow JSON for manual import
    const fs = require('fs');
    const wf = buildWorkflow();
    fs.writeFileSync(require('path').join(__dirname, 'workflow-v2.json'), JSON.stringify(wf, null, 2));
    console.log('Wrote workflow-v2.json — import when n8n is up');
    process.exit(1);
  }

  const wf = buildWorkflow();
  const out = await fetchOk(`${API}/api/v1/workflows/${WF_ID}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(wf),
  });
  console.log('Deployed:', out.name, 'nodes:', out.nodes?.length);

  // Deactivate old monitor/review workflows if present
  const list = await fetchOk(`${API}/api/v1/workflows`, { headers: { 'X-N8N-API-KEY': key } });
  const workflows = list.data || list;
  for (const w of workflows) {
    if (/Studio OS.*(02|03)/.test(w.name) && w.active) {
      await fetchOk(`${API}/api/v1/workflows/${w.id}/deactivate`, {
        method: 'POST',
        headers: { 'X-N8N-API-KEY': key },
      });
      console.log('Deactivated legacy:', w.name);
    }
  }
})();
