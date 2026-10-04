/**
 * Deploy Studio OS MVP workflows to local n8n.
 * Usage: node deploy-workflows.js
 */
const fs = require('fs');
const path = require('path');
const https = require('http');

const API_URL = process.env.N8N_API_URL || 'http://localhost:5678';
const API_KEY = process.env.N8N_API_KEY;
if (!API_KEY) {
  console.error('Set N8N_API_KEY');
  process.exit(1);
}

const SHEET_ID = 'YOUR_STUDIO_OS_SHEET_ID';

function sheetDoc() {
  return { __rl: true, mode: 'id', value: SHEET_ID };
}
function sheetTab(name) {
  return { __rl: true, mode: 'name', value: name };
}

function sheetsRead(id, name, tab, x, y) {
  return {
    id,
    name,
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [x, y],
    parameters: {
      authentication: 'oAuth2',
      resource: 'sheet',
      operation: 'read',
      documentId: sheetDoc(),
      sheetName: sheetTab(tab),
      options: {},
    },
  };
}

function sheetsAppend(id, name, tab, x, y) {
  return {
    id,
    name,
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [x, y],
    parameters: {
      authentication: 'oAuth2',
      resource: 'sheet',
      operation: 'append',
      documentId: sheetDoc(),
      sheetName: sheetTab(tab),
      columns: {
        mappingMode: 'autoMapInputData',
        value: {},
        matchingColumns: [],
        schema: [],
      },
      options: {},
    },
  };
}

function sheetsUpsert(id, name, tab, matchCol, x, y) {
  return {
    id,
    name,
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [x, y],
    parameters: {
      authentication: 'oAuth2',
      resource: 'sheet',
      operation: 'appendOrUpdate',
      documentId: sheetDoc(),
      sheetName: sheetTab(tab),
      columns: {
        mappingMode: 'autoMapInputData',
        value: {},
        matchingColumns: [matchCol],
        schema: [],
      },
      options: {},
    },
  };
}

function sticky(id, name, content, x, y, h = 320, w = 420) {
  return {
    id,
    name,
    type: 'n8n-nodes-base.stickyNote',
    typeVersion: 1,
    position: [x, y],
    parameters: { content, height: h, width: w, color: 5 },
  };
}

function codeNode(id, name, jsCode, x, y, mode = 'runOnceForAllItems') {
  return {
    id,
    name,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [x, y],
    parameters: { language: 'javaScript', mode, jsCode },
  };
}

function setNode(id, name, assignments, x, y) {
  return {
    id,
    name,
    type: 'n8n-nodes-base.set',
    typeVersion: 3.4,
    position: [x, y],
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: assignments.map((a, i) => ({
          id: `a${i}`,
          name: a.name,
          value: a.value,
          type: a.type || 'string',
        })),
      },
      options: {},
    },
  };
}

function ifNode(id, name, left, right, op, type, x, y) {
  return {
    id,
    name,
    type: 'n8n-nodes-base.if',
    typeVersion: 2,
    position: [x, y],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 1 },
        combinator: 'and',
        conditions: [
          {
            id: 'c1',
            leftValue: left,
            rightValue: right,
            operator: { type, operation: op },
          },
        ],
      },
      options: {},
    },
  };
}

function conn(from, to, outIndex = 0) {
  return { from, to, outIndex };
}

function buildConnections(pairs) {
  const out = {};
  for (const p of pairs) {
    if (!out[p.from]) out[p.from] = { main: [] };
    while (out[p.from].main.length <= (p.outIndex || 0)) out[p.from].main.push([]);
    out[p.from].main[p.outIndex || 0].push({ node: p.to, type: 'main', index: 0 });
  }
  return out;
}

async function api(method, apiPath, body) {
  const url = new URL(apiPath, API_URL);
  const payload = body ? JSON.stringify(body) : null;
  const res = await fetch(url, {
    method,
    headers: {
      'X-N8N-API-KEY': API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: payload,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${method} ${apiPath} -> ${res.status}: ${text.slice(0, 500)}`);
  }
  return data;
}

// ===================== WORKFLOW 01 =====================
function workflow01() {
  const normalizeCode = `const f = $input.first().json;
const projectName = String(f['Project Name'] || '').trim();
const client = String(f.Client || '').trim();
if (!projectName || !client) throw new Error('Project Name and Client are required.');

const startDate = String(f['Start Date'] || '').trim();
const deadline = String(f.Deadline || '').trim();
const requiredEquipment = String(f['Required Equipment'] || '').trim();
const developer = String(f.Developer || '').trim();
const designer = String(f.Designer || '').trim();
const installer = String(f.Installer || '').trim();
const clientAssets = String(f['Client Assets'] || 'Unknown').trim();
const notes = String(f.Notes || '').trim();

const submissionKey = [
  projectName.toLowerCase(),
  client.toLowerCase(),
  startDate,
  deadline,
  requiredEquipment.toLowerCase(),
  developer.toLowerCase(),
  designer.toLowerCase(),
  installer.toLowerCase(),
].join('|');

return [{
  json: {
    project_name: projectName,
    client,
    project_type: String(f['Project Type'] || '').trim(),
    description: String(f.Description || '').trim(),
    technology: String(f.Technology || '').trim(),
    start_date: startDate,
    deadline,
    priority: String(f.Priority || 'Medium').trim(),
    developer,
    designer,
    installer,
    location: String(f.Location || '').trim(),
    required_equipment_raw: requiredEquipment,
    client_assets_status: clientAssets,
    notes,
    submission_key: submissionKey,
    now: new Date().toISOString(),
  }
}];`;

  const processCode = `const input = $('Normalize Form Input').first().json;
const projects = $('READ — Projects').all().map(i => i.json).filter(r => r.Project_ID || r.Project_Name);
const equipment = $('READ — Equipment').all().map(i => i.json).filter(r => r.Equipment_ID || r.Equipment_Name);
const reservations = $('READ — Reservations').all().map(i => i.json).filter(r => r.Reservation_ID || r.Equipment_ID);
const team = $('READ — Team').all().map(i => i.json).filter(r => r.Team_ID || r.Name);

const existing = projects.find(p => String(p.Submission_Key || '') === input.submission_key);
if (existing) {
  return [{
    json: {
      is_duplicate: true,
      summary: {
        project_created: false,
        project_id: existing.Project_ID,
        message: 'Duplicate submission detected. Existing project reused.',
        team_assigned: [],
        equipment_available: [],
        equipment_unavailable: [],
        current_blockers: existing.Current_Blocker || '',
      },
      project_row: null,
      reservation_rows: [],
      equipment_rows: [],
      team_rows: [],
      notification_rows: [],
    }
  }];
}

const year = new Date().getFullYear();
const prefix = 'PRJ-' + year + '-';
let maxNum = 0;
for (const p of projects) {
  const m = String(p.Project_ID || '').match(new RegExp('^PRJ-' + year + '-(\\\\d+)$'));
  if (m) maxNum = Math.max(maxNum, Number(m[1]));
}
const projectId = prefix + String(maxNum + 1).padStart(3, '0');

function parseEquipment(raw) {
  if (!raw) return [];
  return String(raw).split(/\\n|,|;/).map(s => s.trim()).filter(Boolean).map(line => {
    let qty = 1;
    let name = line;
    const m1 = line.match(/^(.+?)\\s*[xX×]\\s*(\\d+)$/);
    const m2 = line.match(/^(\\d+)\\s*[xX×]\\s*(.+)$/);
    if (m1) { name = m1[1].trim(); qty = Number(m1[2]); }
    else if (m2) { qty = Number(m2[1]); name = m2[2].trim(); }
    return { name, qty: Number.isFinite(qty) && qty > 0 ? qty : 1 };
  });
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  const as = new Date(aStart || 0).getTime();
  const ae = new Date(aEnd || aStart || 0).getTime();
  const bs = new Date(bStart || 0).getTime();
  const be = new Date(bEnd || bStart || 0).getTime();
  if (!as || !bs) return false;
  return as <= be && bs <= ae;
}

const requested = parseEquipment(input.required_equipment_raw);
const reservedStatuses = new Set(['Reserved', 'Active']);
const availableEquipment = [];
const unavailable = [];
const reservationRows = [];
const equipmentRows = [];

for (const req of requested) {
  const matches = equipment.filter(e => String(e.Equipment_Name || '').toLowerCase() === req.name.toLowerCase());
  const free = matches.filter(eq => {
    const status = String(eq.Status || '');
    if (['Broken', 'Maintenance'].includes(status)) return false;
    if (status === 'Installed') return false;
    const conflicting = reservations.some(r =>
      String(r.Equipment_ID) === String(eq.Equipment_ID) &&
      reservedStatuses.has(String(r.Status || '')) &&
      overlaps(input.start_date, input.deadline, r.Start_Date, r.End_Date)
    );
    return !conflicting && (status === 'Available' || status === '');
  });

  const take = free.slice(0, req.qty);
  if (take.length < req.qty) {
    unavailable.push({ name: req.name, requested: req.qty, available: take.length });
  }
  for (const eq of take) {
    availableEquipment.push({ name: eq.Equipment_Name, id: eq.Equipment_ID });
    const reservationId = 'RES-' + projectId + '-' + eq.Equipment_ID;
    reservationRows.push({
      Reservation_ID: reservationId,
      Equipment_ID: eq.Equipment_ID,
      Equipment_Name: eq.Equipment_Name,
      Project_ID: projectId,
      Project_Name: input.project_name,
      Reserved_By: 'Studio OS',
      Start_Date: input.start_date,
      End_Date: input.deadline,
      Status: 'Reserved',
      Notes: 'Auto-reserved on project create',
      Created_At: input.now,
    });
    equipmentRows.push({
      Equipment_ID: eq.Equipment_ID,
      Equipment_Name: eq.Equipment_Name,
      Category: eq.Category || '',
      Status: 'Reserved',
      Location: eq.Location || '',
      Current_Project: projectId,
      Notes: eq.Notes || '',
    });
  }
}

const blockerText = unavailable.length
  ? unavailable.map(u => \`\${u.name}: need \${u.requested}, available \${u.available}\`).join('; ')
  : '';

let status = 'Planning';
if (unavailable.length && availableEquipment.length === 0 && requested.length > 0) status = 'Blocked';
else if (unavailable.length) status = 'Blocked';
else status = 'Planning';

if (String(input.client_assets_status).toLowerCase().includes('waiting')) {
  // keep planning/blocked but note assets
}

const projectRow = {
  Project_ID: projectId,
  Project_Name: input.project_name,
  Client: input.client,
  Project_Type: input.project_type,
  Description: input.description,
  Technology: input.technology,
  Start_Date: input.start_date,
  Deadline: input.deadline,
  Priority: input.priority,
  Status: status,
  Developer: input.developer,
  Designer: input.designer,
  Installer: input.installer,
  Location: input.location,
  Client_Assets_Status: input.client_assets_status,
  Demo_Link: '',
  Build_Link: '',
  Current_Blocker: blockerText,
  Created_At: input.now,
  Updated_At: input.now,
  Submission_Key: input.submission_key,
};

const teamRows = [];
const teamWarnings = [];
const notificationRows = [];
const assigned = [];

function assignPerson(name, role) {
  if (!name) return;
  const person = team.find(t => String(t.Name || '').toLowerCase() === name.toLowerCase());
  if (!person) {
    teamWarnings.push(\`\${role} "\${name}" not found in Team sheet\`);
    notificationRows.push({
      Notification_ID: 'NTF-' + projectId + '-' + role.toUpperCase() + '-MISSING',
      Project_ID: projectId,
      Recipient: 'Studio Lead',
      Channel: 'Dashboard',
      Message: \`Warning: assigned \${role} "\${name}" was not found in Team sheet for project \${input.project_name}.\`,
      Type: 'Team Warning',
      Priority: 'WARNING',
      Status: 'Pending',
      Dedup_Key: projectId + '|missing|' + role + '|' + name.toLowerCase(),
      Created_At: input.now,
      Sent_At: '',
    });
    return;
  }
  const currentStatus = String(person.Status || '');
  const currentProject = String(person.Current_Project || '');
  if (currentStatus === 'Working' && currentProject && currentProject !== projectId) {
    teamWarnings.push(\`\${name} already Working on \${currentProject}\`);
    notificationRows.push({
      Notification_ID: 'NTF-' + projectId + '-' + role.toUpperCase() + '-BUSY',
      Project_ID: projectId,
      Recipient: 'Studio Lead',
      Channel: 'Dashboard',
      Message: \`Warning: \${name} is already Working on \${currentProject}, but was also assigned as \${role} on \${input.project_name}.\`,
      Type: 'Team Warning',
      Priority: 'WARNING',
      Status: 'Pending',
      Dedup_Key: projectId + '|busy|' + name.toLowerCase() + '|' + currentProject,
      Created_At: input.now,
      Sent_At: '',
    });
  } else {
    teamRows.push({
      Team_ID: person.Team_ID,
      Name: person.Name,
      Role: person.Role || role,
      Email: person.Email || '',
      Phone: person.Phone || '',
      Status: 'Working',
      Current_Project: projectId,
      Available_From: person.Available_From || '',
      Notes: person.Notes || '',
    });
  }
  assigned.push({ name: person.Name, role, email: person.Email || '' });
  const roleLine = role === 'Developer'
    ? \`You are assigned as Developer.\\nTechnology: \${input.technology || 'n/a'}.\`
    : role === 'Designer'
      ? \`You are assigned as Designer.\\nClient assets status: \${input.client_assets_status}.\`
      : \`You are assigned as Installer.\\nLocation: \${input.location || 'n/a'}.\`;
  notificationRows.push({
    Notification_ID: 'NTF-' + projectId + '-' + role.toUpperCase(),
    Project_ID: projectId,
    Recipient: person.Name,
    Channel: 'Dashboard',
    Message: \`New project assigned: \${input.project_name}.\\nClient: \${input.client}.\\n\${roleLine}\\nDeadline: \${input.deadline || 'n/a'}.\\nCurrent status: \${status}.\\nBlockers: \${blockerText || 'None'}.\\nNotes: \${input.notes || 'None'}\`,
    Type: 'Assignment',
    Priority: 'NORMAL',
    Status: 'Pending',
    Dedup_Key: projectId + '|assign|' + role + '|' + person.Name.toLowerCase(),
    Created_At: input.now,
    Sent_At: '',
  });
}

assignPerson(input.developer, 'Developer');
assignPerson(input.designer, 'Designer');
assignPerson(input.installer, 'Installer');

if (unavailable.length) {
  const msg = \`Project \${input.project_name} requires equipment that is not fully available. \${blockerText}\`;
  notificationRows.push({
    Notification_ID: 'NTF-' + projectId + '-EQUIP',
    Project_ID: projectId,
    Recipient: 'Studio Lead',
    Channel: 'Dashboard',
    Message: msg,
    Type: 'Equipment Blocker',
    Priority: 'HIGH',
    Status: 'Pending',
    Dedup_Key: projectId + '|equip|' + blockerText,
    Created_At: input.now,
    Sent_At: '',
  });
}

return [{
  json: {
    is_duplicate: false,
    project_row: projectRow,
    reservation_rows: reservationRows,
    equipment_rows: equipmentRows,
    team_rows: teamRows,
    notification_rows: notificationRows,
    summary: {
      project_created: true,
      project_id: projectId,
      project_name: input.project_name,
      status,
      team_assigned: assigned,
      team_warnings: teamWarnings,
      equipment_available: availableEquipment,
      equipment_unavailable: unavailable,
      current_blockers: blockerText || 'None',
      notifications_queued: notificationRows.length,
    },
  }
}];`;

  const explode = (field) => `const root = $input.first().json;
const rows = root.${field} || [];
if (!rows.length) return [];
return rows.map(r => ({ json: r }));`;

  const nodes = [
    sticky('s1', 'SETUP', `## [Studio OS] 01 - New Project\n\n1. Create Google Sheet **Studio_OS**\n2. Import CSVs from \`C:\\\\n8n\\\\studio-os\\\\sheet-templates\`\n3. Connect **Google Sheets OAuth2** on every Sheets node\n4. Replace \`YOUR_STUDIO_OS_SHEET_ID\` in all Sheets nodes\n5. Test via Form (do not activate until validated)\n\nMVP channel: Notifications sheet only (WhatsApp later).`, -200, 40, 380, 460),
    {
      id: 'form1',
      name: 'FORM — New Project',
      type: 'n8n-nodes-base.formTrigger',
      typeVersion: 2.2,
      position: [0, 300],
      webhookId: 'studio-os-new-project',
      parameters: {
        formTitle: 'Studio OS — New Project',
        formDescription: 'Create a new studio project, reserve equipment, and notify the team.',
        responseMode: 'lastNode',
        formFields: {
          values: [
            { fieldLabel: 'Project Name', fieldType: 'text', requiredField: true },
            { fieldLabel: 'Client', fieldType: 'text', requiredField: true },
            { fieldLabel: 'Project Type', fieldType: 'text', requiredField: false, placeholder: 'Activation / XR / Demo' },
            { fieldLabel: 'Description', fieldType: 'textarea', requiredField: false },
            { fieldLabel: 'Technology', fieldType: 'text', requiredField: false, placeholder: 'Unity / Unreal / Web' },
            { fieldLabel: 'Start Date', fieldType: 'date', requiredField: false },
            { fieldLabel: 'Deadline', fieldType: 'date', requiredField: false },
            { fieldLabel: 'Priority', fieldType: 'dropdown', requiredField: false, fieldOptions: { values: [{ option: 'Low' }, { option: 'Medium' }, { option: 'High' }, { option: 'Critical' }] } },
            { fieldLabel: 'Developer', fieldType: 'text', requiredField: false },
            { fieldLabel: 'Designer', fieldType: 'text', requiredField: false },
            { fieldLabel: 'Installer', fieldType: 'text', requiredField: false },
            { fieldLabel: 'Location', fieldType: 'text', requiredField: false },
            { fieldLabel: 'Required Equipment', fieldType: 'textarea', requiredField: false, placeholder: 'Quest 3 x2\\nMini PC x1\\nRouter x1' },
            { fieldLabel: 'Client Assets', fieldType: 'text', requiredField: false, placeholder: 'Waiting / Received / Partial' },
            { fieldLabel: 'Notes', fieldType: 'textarea', requiredField: false },
          ],
        },
        options: {},
      },
    },
    codeNode('norm1', 'Normalize Form Input', normalizeCode, 240, 300),
    sheetsRead('readProj', 'READ — Projects', 'Projects', 480, 120),
    sheetsRead('readEq', 'READ — Equipment', 'Equipment', 480, 300),
    sheetsRead('readRes', 'READ — Reservations', 'Reservations', 480, 480),
    sheetsRead('readTeam', 'READ — Team', 'Team', 480, 660),
    codeNode('logic1', 'Process Project Logic', processCode, 760, 300),
    ifNode('ifDup', 'IF — Duplicate Submission?', '={{ $json.is_duplicate }}', true, 'equals', 'boolean', 1000, 300),
    setNode('sumDup', 'Summary — Duplicate', [
      { name: 'status', value: 'duplicate' },
      { name: 'summary', value: '={{ JSON.stringify($json.summary) }}' },
    ], 1240, 480),
    codeNode('expProj', 'Prepare Project Row', `const r = $input.first().json.project_row; if (!r) return []; return [{ json: r }];`, 1240, 120),
    sheetsAppend('writeProj', 'CREATE — Project', 'Projects', 1480, 120),
    codeNode('expRes', 'Prepare Reservation Rows', explode('reservation_rows'), 1240, 280),
    sheetsAppend('writeRes', 'CREATE — Reservations', 'Reservations', 1480, 280),
    codeNode('expEq', 'Prepare Equipment Rows', explode('equipment_rows'), 1240, 440),
    sheetsUpsert('writeEq', 'UPDATE — Equipment', 'Equipment', 'Equipment_ID', 1480, 440),
    codeNode('expTeam', 'Prepare Team Rows', explode('team_rows'), 1240, 600),
    sheetsUpsert('writeTeam', 'UPDATE — Team', 'Team', 'Team_ID', 1480, 600),
    codeNode('expNtf', 'Prepare Notification Rows', explode('notification_rows'), 1240, 760),
    sheetsAppend('writeNtf', 'CREATE — Notifications', 'Notifications', 1480, 760),
    setNode('sumOk', 'Summary — Project Created', [
      { name: 'status', value: 'created' },
      { name: 'summary', value: "={{ JSON.stringify($('Process Project Logic').first().json.summary) }}" },
    ], 1720, 300),
  ];

  // Wiring: form -> normalize -> read projects -> equipment -> reservations -> team -> logic
  const connections = buildConnections([
    conn('FORM — New Project', 'Normalize Form Input'),
    conn('Normalize Form Input', 'READ — Projects'),
    conn('READ — Projects', 'READ — Equipment'),
    conn('READ — Equipment', 'READ — Reservations'),
    conn('READ — Reservations', 'READ — Team'),
    conn('READ — Team', 'Process Project Logic'),
    conn('Process Project Logic', 'IF — Duplicate Submission?'),
    conn('IF — Duplicate Submission?', 'Summary — Duplicate', 0), // true
    conn('IF — Duplicate Submission?', 'Prepare Project Row', 1), // false
    conn('Prepare Project Row', 'CREATE — Project'),
    conn('CREATE — Project', 'Prepare Reservation Rows'),
    conn('Prepare Reservation Rows', 'CREATE — Reservations'),
    conn('CREATE — Reservations', 'Prepare Equipment Rows'),
    conn('Prepare Equipment Rows', 'UPDATE — Equipment'),
    conn('UPDATE — Equipment', 'Prepare Team Rows'),
    conn('Prepare Team Rows', 'UPDATE — Team'),
    conn('UPDATE — Team', 'Prepare Notification Rows'),
    conn('Prepare Notification Rows', 'CREATE — Notifications'),
    conn('CREATE — Notifications', 'Summary — Project Created'),
  ]);

  // Fix IF outputs: in n8n, output 0 is TRUE, output 1 is FALSE
  // Duplicate true -> summary duplicate; false -> create path. Good.

  // Empty reservation/equipment arrays: Sheets append with 0 items may error.
  // Handle in explode by returning empty - n8n may stop branch. Add IF before append for reservations.
  // Simpler: explode returns a noop skip row? Better add IF nodes.

  return {
    name: '[Studio OS] 01 - New Project',
    settings: { executionOrder: 'v1', timezone: 'Africa/Cairo' },
    nodes,
    connections,
  };
}

// Fix WF01: empty appends - update explode to pass through a marker and IF, or use always at least continue.
// I'll update prepare nodes to if empty, emit {_skip:true} and IF before sheets.

function workflow01Fixed() {
  const wf = workflow01();
  // Replace prepare reservation/equipment/team/notification code to handle empty by skipping via IF
  const skipAware = (field) => `const root = $('Process Project Logic').first().json;
const rows = root.${field} || [];
if (!rows.length) return [{ json: { _skip: true } }];
return rows.map(r => ({ json: { ...r, _skip: false } }));`;

  for (const n of wf.nodes) {
    if (n.name === 'Prepare Reservation Rows') n.parameters.jsCode = skipAware('reservation_rows');
    if (n.name === 'Prepare Equipment Rows') n.parameters.jsCode = skipAware('equipment_rows');
    if (n.name === 'Prepare Team Rows') n.parameters.jsCode = skipAware('team_rows');
    if (n.name === 'Prepare Notification Rows') n.parameters.jsCode = skipAware('notification_rows');
  }

  // Insert IF skip nodes - keep simpler: Google Sheets with 0 items - in n8n, empty input means node doesn't run if previous returned []. Returning [] stops the chain!
  // Critical bug: if reservation_rows empty, returning [] stops workflow before notifications.
  // Fix: chain using $('Process Project Logic') references independently from a Merge-like fan-out.

  // Rebuild connections as fan-out from Process/IF false:
  wf.connections = buildConnections([
    conn('FORM — New Project', 'Normalize Form Input'),
    conn('Normalize Form Input', 'READ — Projects'),
    conn('READ — Projects', 'READ — Equipment'),
    conn('READ — Equipment', 'READ — Reservations'),
    conn('READ — Reservations', 'READ — Team'),
    conn('READ — Team', 'Process Project Logic'),
    conn('Process Project Logic', 'IF — Duplicate Submission?'),
    conn('IF — Duplicate Submission?', 'Summary — Duplicate', 0),
    conn('IF — Duplicate Submission?', 'Prepare Project Row', 1),
    conn('Prepare Project Row', 'CREATE — Project'),
    // Fan-out from CREATE — Project to all writers that pull from Process Project Logic
    conn('CREATE — Project', 'Prepare Reservation Rows'),
    conn('CREATE — Project', 'Prepare Equipment Rows'),
    conn('CREATE — Project', 'Prepare Team Rows'),
    conn('CREATE — Project', 'Prepare Notification Rows'),
    conn('Prepare Reservation Rows', 'CREATE — Reservations'),
    conn('Prepare Equipment Rows', 'UPDATE — Equipment'),
    conn('Prepare Team Rows', 'UPDATE — Team'),
    conn('Prepare Notification Rows', 'CREATE — Notifications'),
    conn('CREATE — Notifications', 'Summary — Project Created'),
  ]);

  // Update explode to never return empty array - return skip token and filter with IF
  // Actually if we return [{_skip:true}], Sheets will write a junk row. Use IF.

  const ifSkipRes = ifNode('ifRes', 'IF — Has Reservations?', '={{ $json._skip }}', true, 'notEquals', 'boolean', 1360, 280);
  const ifSkipEq = ifNode('ifEq', 'IF — Has Equipment Updates?', '={{ $json._skip }}', true, 'notEquals', 'boolean', 1360, 440);
  const ifSkipTeam = ifNode('ifTeam', 'IF — Has Team Updates?', '={{ $json._skip }}', true, 'notEquals', 'boolean', 1360, 600);
  const ifSkipNtf = ifNode('ifNtf', 'IF — Has Notifications?', '={{ $json._skip }}', true, 'notEquals', 'boolean', 1360, 760);

  // reposition write nodes
  for (const n of wf.nodes) {
    if (n.name === 'CREATE — Reservations') n.position = [1600, 280];
    if (n.name === 'UPDATE — Equipment') n.position = [1600, 440];
    if (n.name === 'UPDATE — Team') n.position = [1600, 600];
    if (n.name === 'CREATE — Notifications') n.position = [1600, 760];
    if (n.name === 'Summary — Project Created') n.position = [1840, 760];
  }
  wf.nodes.push(ifSkipRes, ifSkipEq, ifSkipTeam, ifSkipNtf);

  wf.connections = buildConnections([
    conn('FORM — New Project', 'Normalize Form Input'),
    conn('Normalize Form Input', 'READ — Projects'),
    conn('READ — Projects', 'READ — Equipment'),
    conn('READ — Equipment', 'READ — Reservations'),
    conn('READ — Reservations', 'READ — Team'),
    conn('READ — Team', 'Process Project Logic'),
    conn('Process Project Logic', 'IF — Duplicate Submission?'),
    conn('IF — Duplicate Submission?', 'Summary — Duplicate', 0),
    conn('IF — Duplicate Submission?', 'Prepare Project Row', 1),
    conn('Prepare Project Row', 'CREATE — Project'),
    conn('CREATE — Project', 'Prepare Reservation Rows'),
    conn('CREATE — Project', 'Prepare Equipment Rows'),
    conn('CREATE — Project', 'Prepare Team Rows'),
    conn('CREATE — Project', 'Prepare Notification Rows'),
    conn('Prepare Reservation Rows', 'IF — Has Reservations?'),
    conn('IF — Has Reservations?', 'CREATE — Reservations', 0),
    conn('Prepare Equipment Rows', 'IF — Has Equipment Updates?'),
    conn('IF — Has Equipment Updates?', 'UPDATE — Equipment', 0),
    conn('Prepare Team Rows', 'IF — Has Team Updates?'),
    conn('IF — Has Team Updates?', 'UPDATE — Team', 0),
    conn('Prepare Notification Rows', 'IF — Has Notifications?'),
    conn('IF — Has Notifications?', 'CREATE — Notifications', 0),
    conn('CREATE — Notifications', 'Summary — Project Created'),
  ]);

  return wf;
}

// ===================== WORKFLOW 02 =====================
function workflow02() {
  const monitorCode = `const projects = $('READ — Projects').all().map(i => i.json).filter(r => r.Project_ID);
const team = $('READ — Team').all().map(i => i.json).filter(r => r.Team_ID || r.Name);
const equipment = $('READ — Equipment').all().map(i => i.json).filter(r => r.Equipment_ID);
const reservations = $('READ — Reservations').all().map(i => i.json).filter(r => r.Reservation_ID || r.Equipment_ID);
const existingNotes = $('READ — Notifications').all().map(i => i.json).filter(r => r.Notification_ID);

const now = new Date();
const todayKey = now.toISOString().slice(0, 10);
const msDay = 86400000;

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - now.getTime()) / msDay);
}

function hoursSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return (now.getTime() - d.getTime()) / 3600000;
}

function alreadySent(dedupKey) {
  return existingNotes.some(n => String(n.Dedup_Key || '') === dedupKey && String(n.Status || '') !== 'Cancelled');
}

const activeStatuses = new Set(['New','Planning','Waiting Assets','Development','Internal Review','Client Review','Changes Required','Approved','Deployment','Blocked']);
const active = projects.filter(p => activeStatuses.has(String(p.Status || '')) && String(p.Status) !== 'Completed');

const atRisk = [];
const blocked = [];
const waitingClient = [];
const upcoming = [];
const equipmentConflicts = [];
const teamIssues = [];
const notifications = [];

for (const p of active) {
  const days = daysUntil(p.Deadline);
  if (days !== null && days <= 1) {
    atRisk.push(p);
    upcoming.push({ project: p.Project_Name, days, level: 'HIGH' });
    const key = \`\${todayKey}|deadline1|\${p.Project_ID}\`;
    if (!alreadySent(key)) {
      notifications.push({
        Notification_ID: 'NTF-MON-' + p.Project_ID + '-D1-' + todayKey,
        Project_ID: p.Project_ID,
        Recipient: 'Studio Lead',
        Channel: 'Dashboard',
        Message: \`HIGH: \${p.Project_Name} deadline is within 1 day (Deadline: \${p.Deadline}). Status: \${p.Status}. Blocker: \${p.Current_Blocker || 'None'}\`,
        Type: 'Deadline',
        Priority: 'HIGH',
        Status: 'Pending',
        Dedup_Key: key,
        Created_At: now.toISOString(),
        Sent_At: '',
      });
    }
  } else if (days !== null && days <= 3) {
    upcoming.push({ project: p.Project_Name, days, level: 'WARNING' });
    const key = \`\${todayKey}|deadline3|\${p.Project_ID}\`;
    if (!alreadySent(key)) {
      notifications.push({
        Notification_ID: 'NTF-MON-' + p.Project_ID + '-D3-' + todayKey,
        Project_ID: p.Project_ID,
        Recipient: 'Studio Lead',
        Channel: 'Dashboard',
        Message: \`WARNING: \${p.Project_Name} deadline is within 3 days (Deadline: \${p.Deadline}). Status: \${p.Status}.\`,
        Type: 'Deadline',
        Priority: 'WARNING',
        Status: 'Pending',
        Dedup_Key: key,
        Created_At: now.toISOString(),
        Sent_At: '',
      });
    }
  }

  if (String(p.Status) === 'Blocked') {
    blocked.push(p);
    const key = \`\${todayKey}|blocked|\${p.Project_ID}|\${p.Current_Blocker || ''}\`;
    if (!alreadySent(key)) {
      notifications.push({
        Notification_ID: 'NTF-MON-' + p.Project_ID + '-BLK-' + todayKey,
        Project_ID: p.Project_ID,
        Recipient: 'Studio Lead',
        Channel: 'Dashboard',
        Message: \`Blocked project: \${p.Project_Name}. Current blocker: \${p.Current_Blocker || 'Unspecified'}\`,
        Type: 'Blocked',
        Priority: 'HIGH',
        Status: 'Pending',
        Dedup_Key: key,
        Created_At: now.toISOString(),
        Sent_At: '',
      });
    }
  }

  if (String(p.Status) === 'Waiting Assets') {
    const hrs = hoursSince(p.Updated_At || p.Created_At);
    if (hrs !== null && hrs > 24) {
      waitingClient.push(p);
      const key = \`\${todayKey}|assets|\${p.Project_ID}\`;
      if (!alreadySent(key)) {
        notifications.push({
          Notification_ID: 'NTF-MON-' + p.Project_ID + '-AST-' + todayKey,
          Project_ID: p.Project_ID,
          Recipient: 'Studio Lead',
          Channel: 'Dashboard',
          Message: \`Reminder: \${p.Project_Name} is Waiting Assets for more than 24h. Assets status: \${p.Client_Assets_Status || 'n/a'}\`,
          Type: 'Waiting Assets',
          Priority: 'WARNING',
          Status: 'Pending',
          Dedup_Key: key,
          Created_At: now.toISOString(),
          Sent_At: '',
        });
      }
    }
  }

  if (String(p.Status) === 'Client Review') {
    const hrs = hoursSince(p.Updated_At || p.Created_At);
    if (hrs !== null && hrs > 24) {
      const key = \`\${todayKey}|clientreview|\${p.Project_ID}\`;
      if (!alreadySent(key)) {
        notifications.push({
          Notification_ID: 'NTF-MON-' + p.Project_ID + '-CR-' + todayKey,
          Project_ID: p.Project_ID,
          Recipient: 'Studio Lead',
          Channel: 'Dashboard',
          Message: \`Reminder: \${p.Project_Name} has been in Client Review for more than 24h.\`,
          Type: 'Client Review',
          Priority: 'WARNING',
          Status: 'Pending',
          Dedup_Key: key,
          Created_At: now.toISOString(),
          Sent_At: '',
        });
      }
    }
  }
}

for (const t of team) {
  if (['Blocked', 'Waiting'].includes(String(t.Status || ''))) {
    teamIssues.push({ name: t.Name, status: t.Status, project: t.Current_Project || '', notes: t.Notes || '' });
  }
}
if (teamIssues.length) {
  const key = todayKey + '|teamissues|' + teamIssues.map(t => t.name).join(',');
  if (!alreadySent(key)) {
    notifications.push({
      Notification_ID: 'NTF-MON-TEAM-' + todayKey,
      Project_ID: '',
      Recipient: 'Studio Lead',
      Channel: 'Dashboard',
      Message: 'Team issues:\\n' + teamIssues.map(t => \`- \${t.name}: \${t.status} | Project: \${t.project || 'n/a'} | \${t.notes || ''}\`).join('\\n'),
      Type: 'Team',
      Priority: 'WARNING',
      Status: 'Pending',
      Dedup_Key: key,
      Created_At: now.toISOString(),
      Sent_At: '',
    });
  }
}

// Equipment conflicts
const activeRes = reservations.filter(r => ['Reserved', 'Active'].includes(String(r.Status || '')));
for (let i = 0; i < activeRes.length; i++) {
  for (let j = i + 1; j < activeRes.length; j++) {
    const a = activeRes[i], b = activeRes[j];
    if (String(a.Equipment_ID) !== String(b.Equipment_ID)) continue;
    const as = new Date(a.Start_Date).getTime(), ae = new Date(a.End_Date || a.Start_Date).getTime();
    const bs = new Date(b.Start_Date).getTime(), be = new Date(b.End_Date || b.Start_Date).getTime();
    if (as <= be && bs <= ae) {
      equipmentConflicts.push(\`Overlap: \${a.Equipment_Name} (\${a.Equipment_ID}) between \${a.Project_Name} and \${b.Project_Name}\`);
    }
  }
}
for (const eq of equipment) {
  const hasActive = activeRes.some(r => String(r.Equipment_ID) === String(eq.Equipment_ID));
  if (String(eq.Status) === 'Available' && hasActive) {
    equipmentConflicts.push(\`\${eq.Equipment_Name} (\${eq.Equipment_ID}) marked Available but has active reservation\`);
  }
  if (String(eq.Status) === 'Reserved' && !hasActive) {
    equipmentConflicts.push(\`\${eq.Equipment_Name} (\${eq.Equipment_ID}) marked Reserved without active reservation\`);
  }
}

if (equipmentConflicts.length) {
  const key = todayKey + '|equip|' + equipmentConflicts.slice(0, 3).join('|');
  if (!alreadySent(key)) {
    notifications.push({
      Notification_ID: 'NTF-MON-EQUIP-' + todayKey,
      Project_ID: '',
      Recipient: 'Studio Lead',
      Channel: 'Dashboard',
      Message: 'Equipment conflicts:\\n- ' + equipmentConflicts.join('\\n- '),
      Type: 'Equipment Conflict',
      Priority: 'HIGH',
      Status: 'Pending',
      Dedup_Key: key,
      Created_At: now.toISOString(),
      Sent_At: '',
    });
  }
}

const onTrack = active.length - atRisk.length - blocked.length;
const topIssue = atRisk[0]
  ? \`\${atRisk[0].Project_Name} is due \${atRisk[0].Deadline} and status is \${atRisk[0].Status}\${atRisk[0].Current_Blocker ? ' — ' + atRisk[0].Current_Blocker : ''}\`
  : (blocked[0] ? \`\${blocked[0].Project_Name} is blocked: \${blocked[0].Current_Blocker || 'unspecified'}\` : 'No critical issue');

const executive = [
  '🌅 Studio Operations — Morning Report',
  '',
  \`🔴 \${atRisk.length + blocked.length} projects need attention\`,
  \`🟡 \${waitingClient.length} project(s) waiting for client assets\`,
  \`⚠️ \${equipmentConflicts.length} equipment conflict(s)\`,
  \`🟢 \${Math.max(onTrack, 0)} projects on track\`,
  '',
  'ACTIVE PROJECTS: ' + active.map(p => p.Project_Name).join(', '),
  'PROJECTS AT RISK: ' + (atRisk.map(p => p.Project_Name).join(', ') || 'None'),
  'BLOCKED PROJECTS: ' + (blocked.map(p => p.Project_Name).join(', ') || 'None'),
  'WAITING CLIENT: ' + (waitingClient.map(p => p.Project_Name).join(', ') || 'None'),
  'UPCOMING DEADLINES: ' + (upcoming.map(u => u.project + ' (' + u.days + 'd)').join(', ') || 'None'),
  'EQUIPMENT CONFLICTS: ' + (equipmentConflicts.length ? equipmentConflicts.length : 'None'),
  'TEAM ISSUES: ' + (teamIssues.length ? teamIssues.map(t => t.name).join(', ') : 'None'),
  '',
  'Top issue:',
  topIssue,
].join('\\n');

const reportKey = todayKey + '|morning-report';
if (!alreadySent(reportKey)) {
  notifications.unshift({
    Notification_ID: 'NTF-MON-REPORT-' + todayKey,
    Project_ID: '',
    Recipient: 'Studio Lead',
    Channel: 'Dashboard',
    Message: executive,
    Type: 'Morning Report',
    Priority: 'NORMAL',
    Status: 'Pending',
    Dedup_Key: reportKey,
    Created_At: now.toISOString(),
    Sent_At: '',
  });
}

return [{
  json: {
    executive_summary: executive,
    notification_rows: notifications,
    stats: {
      active: active.length,
      at_risk: atRisk.length,
      blocked: blocked.length,
      waiting_client: waitingClient.length,
      equipment_conflicts: equipmentConflicts.length,
      team_issues: teamIssues.length,
      notifications_queued: notifications.length,
    },
  }
}];`;

  const nodes = [
    sticky('s2', 'SETUP', `## [Studio OS] 02 - Project Monitor\n\nRuns daily 09:00 (Africa/Cairo) + Manual Trigger for tests.\n\nConnect Google Sheets OAuth2 and set Sheet ID \`YOUR_STUDIO_OS_SHEET_ID\`.\n\nDedup via Notifications.Dedup_Key (no spam).\nWhatsApp/Email not connected yet — stores to Notifications sheet.`, -220, 40, 360, 440),
    {
      id: 'sched',
      name: 'SCHEDULE — Morning 09:00',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.2,
      position: [0, 200],
      parameters: {
        rule: {
          interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 9, triggerAtMinute: 0 }],
        },
      },
    },
    {
      id: 'manual',
      name: 'MANUAL — Run Monitor',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [0, 400],
      parameters: {},
    },
    sheetsRead('rp', 'READ — Projects', 'Projects', 280, 300),
    sheetsRead('re', 'READ — Equipment', 'Equipment', 520, 180),
    sheetsRead('rr', 'READ — Reservations', 'Reservations', 520, 300),
    sheetsRead('rt', 'READ — Team', 'Team', 520, 420),
    sheetsRead('rn', 'READ — Notifications', 'Notifications', 520, 540),
    codeNode('mon', 'Build Morning Report', monitorCode, 800, 300),
    codeNode('exp', 'Prepare Notification Rows', `const rows = $input.first().json.notification_rows || [];\nif (!rows.length) return [{ json: { _skip: true } }];\nreturn rows.map(r => ({ json: { ...r, _skip: false } }));`, 1040, 300),
    ifNode('ifn', 'IF — Has Notifications?', '={{ $json._skip }}', true, 'notEquals', 'boolean', 1280, 300),
    sheetsAppend('wn', 'CREATE — Notifications', 'Notifications', 1520, 220),
    setNode('sum', 'Summary — Monitor Result', [
      { name: 'status', value: 'ok' },
      { name: 'executive_summary', value: "={{ $('Build Morning Report').first().json.executive_summary }}" },
      { name: 'stats', value: "={{ JSON.stringify($('Build Morning Report').first().json.stats) }}" },
    ], 1520, 400),
  ];

  const connections = buildConnections([
    conn('SCHEDULE — Morning 09:00', 'READ — Projects'),
    conn('MANUAL — Run Monitor', 'READ — Projects'),
    conn('READ — Projects', 'READ — Equipment'),
    conn('READ — Equipment', 'READ — Reservations'),
    conn('READ — Reservations', 'READ — Team'),
    conn('READ — Team', 'READ — Notifications'),
    conn('READ — Notifications', 'Build Morning Report'),
    conn('Build Morning Report', 'Prepare Notification Rows'),
    conn('Prepare Notification Rows', 'IF — Has Notifications?'),
    conn('IF — Has Notifications?', 'CREATE — Notifications', 0),
    conn('IF — Has Notifications?', 'Summary — Monitor Result', 1),
    conn('CREATE — Notifications', 'Summary — Monitor Result'),
  ]);

  return {
    name: '[Studio OS] 02 - Project Monitor',
    settings: { executionOrder: 'v1', timezone: 'Africa/Cairo' },
    nodes,
    connections,
  };
}

// ===================== WORKFLOW 03 =====================
function workflow03() {
  const routeCode = `const f = $input.first().json;
const stage = String(f.Stage || '').trim();
const projectName = String(f.Project || f['Project Name'] || '').trim();
if (!stage) throw new Error('Stage is required.');
if (!projectName) throw new Error('Project is required.');

return [{
  json: {
    stage,
    project_query: projectName,
    submitted_by: String(f['Submitted By'] || f.Reviewer || f.Client || f['Approved By'] || '').trim(),
    demo_link: String(f['Demo Link'] || '').trim(),
    build_link: String(f['Build Link'] || '').trim(),
    comment: String(f.Comment || f.Feedback || f['Approval Comment'] || '').trim(),
    decision: String(f.Decision || '').trim(),
    priority: String(f.Priority || 'Medium').trim(),
    client: String(f.Client || '').trim(),
    now: new Date().toISOString(),
  }
}];`;

  const processCode = `const input = $('Normalize Review Input').first().json;
const projects = $('READ — Projects').all().map(i => i.json).filter(r => r.Project_ID);
const reservations = $('READ — Reservations').all().map(i => i.json).filter(r => r.Reservation_ID || r.Equipment_ID);
const team = $('READ — Team').all().map(i => i.json).filter(r => r.Name);

const project = projects.find(p =>
  String(p.Project_ID).toLowerCase() === input.project_query.toLowerCase() ||
  String(p.Project_Name).toLowerCase() === input.project_query.toLowerCase()
);

if (!project) {
  throw new Error('Project not found: ' + input.project_query);
}

const now = input.now;
const stage = input.stage;
const updateRows = [];
const notificationRows = [];
let projectRow = { ...project, Updated_At: now };
let warning = '';

function ntf(idSuffix, recipient, message, type, priority, dedup) {
  notificationRows.push({
    Notification_ID: 'NTF-REV-' + project.Project_ID + '-' + idSuffix,
    Project_ID: project.Project_ID,
    Recipient: recipient,
    Channel: 'Dashboard',
    Message: message,
    Type: type,
    Priority: priority || 'NORMAL',
    Status: 'Pending',
    Dedup_Key: dedup,
    Created_At: now,
    Sent_At: '',
  });
}

function parseFeedbackTasks(text) {
  const clean = String(text || '').trim();
  if (!clean) return [];
  const parts = clean
    .split(/\\band\\b|,|;|\\.|\\n/i)
    .map(s => s.trim())
    .filter(s => s.length > 3);
  return parts.map((task, idx) => {
    const lower = task.toLowerCase();
    let role = 'Developer';
    if (/(logo|background|color|brand|design|ui|font|image)/i.test(lower)) role = 'Designer';
    if (/(install|deploy|hardware|device|quest|cable)/i.test(lower)) role = 'Installer';
    if (/(animat|button|code|bug|performance|unity|logic)/i.test(lower)) role = 'Developer';
    return { task_id: idx + 1, task, assigned_role: role };
  });
}

if (stage === 'Ready for Review') {
  projectRow.Status = 'Internal Review';
  projectRow.Demo_Link = input.demo_link || project.Demo_Link || '';
  projectRow.Build_Link = input.build_link || project.Build_Link || '';
  updateRows.push({
    Update_ID: 'UPD-' + Date.now(),
    Project_ID: project.Project_ID,
    Project_Name: project.Project_Name,
    Submitted_By: input.submitted_by,
    Update_Type: 'Ready for Review',
    Status: 'Internal Review',
    Comment: input.comment,
    Demo_Link: input.demo_link,
    Build_Link: input.build_link,
    Created_At: now,
    Tasks_JSON: '',
  });
  ntf('RFR', 'Studio Lead', \`🎬 \${project.Project_Name} is ready for internal review.\\n\\nSubmitted by: \${input.submitted_by}\\n\\nDemo:\\n\${input.demo_link || 'n/a'}\\n\\nBuild:\\n\${input.build_link || 'n/a'}\\n\\nComment:\\n\${input.comment || 'None'}\`, 'Ready for Review', 'HIGH', project.Project_ID + '|rfr|' + now.slice(0,13));
}

else if (stage === 'Internal Review Result') {
  const decision = input.decision;
  if (!['Approved', 'Changes Required'].includes(decision)) {
    throw new Error('Decision must be Approved or Changes Required');
  }
  if (decision === 'Approved') {
    projectRow.Status = 'Client Review';
    updateRows.push({
      Update_ID: 'UPD-' + Date.now(),
      Project_ID: project.Project_ID,
      Project_Name: project.Project_Name,
      Submitted_By: input.submitted_by,
      Update_Type: 'Progress',
      Status: 'Client Review',
      Comment: input.comment,
      Demo_Link: project.Demo_Link || '',
      Build_Link: project.Build_Link || '',
      Created_At: now,
      Tasks_JSON: '',
    });
    ntf('IRA', 'Studio Lead', \`Internal review APPROVED for \${project.Project_Name}. Moved to Client Review.\\nReviewer: \${input.submitted_by}\\nFeedback: \${input.comment || 'None'}\`, 'Internal Review', 'NORMAL', project.Project_ID + '|ira|' + now.slice(0,13));
  } else {
    projectRow.Status = 'Changes Required';
    projectRow.Current_Blocker = input.comment || project.Current_Blocker || 'Changes required from internal review';
    updateRows.push({
      Update_ID: 'UPD-' + Date.now(),
      Project_ID: project.Project_ID,
      Project_Name: project.Project_Name,
      Submitted_By: input.submitted_by,
      Update_Type: 'Progress',
      Status: 'Changes Required',
      Comment: input.comment,
      Demo_Link: project.Demo_Link || '',
      Build_Link: project.Build_Link || '',
      Created_At: now,
      Tasks_JSON: '',
    });
    for (const role of ['Developer', 'Designer']) {
      const person = project[role];
      if (person) {
        ntf('IRC-' + role, person, \`Changes required on \${project.Project_Name}.\\nReviewer: \${input.submitted_by}\\nFeedback: \${input.comment || 'None'}\`, 'Changes Required', 'HIGH', project.Project_ID + '|irc|' + role + '|' + now.slice(0,13));
      }
    }
  }
}

else if (stage === 'Client Feedback') {
  projectRow.Status = 'Changes Required';
  projectRow.Current_Blocker = 'Client feedback pending implementation';
  const tasks = parseFeedbackTasks(input.comment);
  updateRows.push({
    Update_ID: 'UPD-' + Date.now(),
    Project_ID: project.Project_ID,
    Project_Name: project.Project_Name,
    Submitted_By: input.submitted_by || input.client || 'Client',
    Update_Type: 'Client Feedback',
    Status: 'Changes Required',
    Comment: input.comment,
    Demo_Link: project.Demo_Link || '',
    Build_Link: project.Build_Link || '',
    Created_At: now,
    Tasks_JSON: JSON.stringify(tasks),
  });
  ntf('CF', 'Studio Lead', \`Client feedback received for \${project.Project_Name}.\\nPriority: \${input.priority}\\nFeedback: \${input.comment}\\n\\nParsed tasks:\\n\${tasks.map(t => t.task_id + '. [' + t.assigned_role + '] ' + t.task).join('\\n') || 'None'}\`, 'Client Feedback', input.priority === 'High' || input.priority === 'Critical' ? 'HIGH' : 'WARNING', project.Project_ID + '|cf|' + now.slice(0,13));
  for (const t of tasks) {
    const person = project[t.assigned_role];
    if (person) {
      ntf('CFT' + t.task_id, person, \`Client change on \${project.Project_Name}:\\n\${t.task}\\nAssigned role: \${t.assigned_role}\`, 'Client Feedback Task', 'HIGH', project.Project_ID + '|cft|' + t.task_id + '|' + now.slice(0,13));
    }
  }
}

else if (stage === 'Client Approval') {
  projectRow.Status = 'Approved';
  projectRow.Current_Blocker = '';
  updateRows.push({
    Update_ID: 'UPD-' + Date.now(),
    Project_ID: project.Project_ID,
    Project_Name: project.Project_Name,
    Submitted_By: input.submitted_by,
    Update_Type: 'Completed',
    Status: 'Approved',
    Comment: input.comment,
    Demo_Link: project.Demo_Link || '',
    Build_Link: project.Build_Link || '',
    Created_At: now,
    Tasks_JSON: '',
  });
  for (const role of ['Developer', 'Designer', 'Installer']) {
    const person = project[role];
    if (person) {
      ntf('CA-' + role, person, \`Project approved: \${project.Project_Name}.\\nApproved by: \${input.submitted_by}\\nComment: \${input.comment || 'None'}\\nNext: prepare for Deployment.\`, 'Client Approval', 'HIGH', project.Project_ID + '|ca|' + role + '|' + now.slice(0,10));
    }
  }
  ntf('CA-LEAD', 'Studio Lead', \`Project approved: \${project.Project_Name}. Approved by: \${input.submitted_by}.\`, 'Client Approval', 'HIGH', project.Project_ID + '|ca|lead|' + now.slice(0,10));

  const hasReservation = reservations.some(r =>
    String(r.Project_ID) === String(project.Project_ID) &&
    ['Reserved', 'Active'].includes(String(r.Status || ''))
  );
  if (!hasReservation) {
    warning = 'Project approved, but no equipment reservation was found.';
    ntf('CA-EQ', 'Studio Lead', \`Project approved, but equipment has not been reserved for \${project.Project_Name}.\`, 'Deployment Warning', 'WARNING', project.Project_ID + '|ca|equip|' + now.slice(0,10));
  }
} else {
  throw new Error('Unsupported stage: ' + stage);
}

return [{
  json: {
    project_row: projectRow,
    update_rows: updateRows,
    notification_rows: notificationRows,
    summary: {
      project_id: project.Project_ID,
      project_name: project.Project_Name,
      stage,
      new_status: projectRow.Status,
      updates: updateRows.length,
      notifications_queued: notificationRows.length,
      warning: warning || 'None',
    },
  }
}];`;

  const nodes = [
    sticky('s3', 'SETUP', `## [Studio OS] 03 - Review & Feedback\n\nOne form with Stage dropdown:\n- Ready for Review\n- Internal Review Result\n- Client Feedback\n- Client Approval\n\nAI credentials not available → feedback parsed with rule-based task extraction (no invented requirements).\n\nConnect Google Sheets + set Sheet ID.`, -220, 40, 360, 420),
    {
      id: 'form3',
      name: 'FORM — Review & Feedback',
      type: 'n8n-nodes-base.formTrigger',
      typeVersion: 2.2,
      position: [0, 300],
      webhookId: 'studio-os-review-feedback',
      parameters: {
        formTitle: 'Studio OS — Review & Feedback',
        formDescription: 'Submit review stage updates for a project.',
        responseMode: 'lastNode',
        formFields: {
          values: [
            {
              fieldLabel: 'Stage',
              fieldType: 'dropdown',
              requiredField: true,
              fieldOptions: {
                values: [
                  { option: 'Ready for Review' },
                  { option: 'Internal Review Result' },
                  { option: 'Client Feedback' },
                  { option: 'Client Approval' },
                ],
              },
            },
            { fieldLabel: 'Project', fieldType: 'text', requiredField: true, placeholder: 'Project name or Project_ID' },
            { fieldLabel: 'Submitted By', fieldType: 'text', requiredField: false },
            { fieldLabel: 'Reviewer', fieldType: 'text', requiredField: false },
            { fieldLabel: 'Client', fieldType: 'text', requiredField: false },
            { fieldLabel: 'Approved By', fieldType: 'text', requiredField: false },
            {
              fieldLabel: 'Decision',
              fieldType: 'dropdown',
              requiredField: false,
              fieldOptions: { values: [{ option: 'Approved' }, { option: 'Changes Required' }] },
            },
            { fieldLabel: 'Demo Link', fieldType: 'text', requiredField: false },
            { fieldLabel: 'Build Link', fieldType: 'text', requiredField: false },
            { fieldLabel: 'Feedback', fieldType: 'textarea', requiredField: false },
            { fieldLabel: 'Comment', fieldType: 'textarea', requiredField: false },
            { fieldLabel: 'Approval Comment', fieldType: 'textarea', requiredField: false },
            {
              fieldLabel: 'Priority',
              fieldType: 'dropdown',
              requiredField: false,
              fieldOptions: { values: [{ option: 'Low' }, { option: 'Medium' }, { option: 'High' }, { option: 'Critical' }] },
            },
          ],
        },
        options: {},
      },
    },
    codeNode('n3', 'Normalize Review Input', routeCode, 240, 300),
    sheetsRead('rp3', 'READ — Projects', 'Projects', 480, 180),
    sheetsRead('rr3', 'READ — Reservations', 'Reservations', 480, 300),
    sheetsRead('rt3', 'READ — Team', 'Team', 480, 420),
    codeNode('p3', 'Process Review Logic', processCode, 760, 300),
    codeNode('pp3', 'Prepare Project Row', `const r = $input.first().json.project_row; return r ? [{ json: r }] : [];`, 1000, 140),
    sheetsUpsert('up3', 'UPDATE — Project', 'Projects', 'Project_ID', 1240, 140),
    codeNode('pu3', 'Prepare Update Rows', `const rows = $('Process Review Logic').first().json.update_rows || []; if (!rows.length) return [{ json: { _skip: true } }]; return rows.map(r => ({ json: { ...r, _skip: false } }));`, 1000, 300),
    ifNode('ifu', 'IF — Has Updates?', '={{ $json._skip }}', true, 'notEquals', 'boolean', 1240, 300),
    sheetsAppend('au3', 'CREATE — Project Update', 'Project_Updates', 1480, 300),
    codeNode('pn3', 'Prepare Notification Rows', `const rows = $('Process Review Logic').first().json.notification_rows || []; if (!rows.length) return [{ json: { _skip: true } }]; return rows.map(r => ({ json: { ...r, _skip: false } }));`, 1000, 460),
    ifNode('ifn3', 'IF — Has Notifications?', '={{ $json._skip }}', true, 'notEquals', 'boolean', 1240, 460),
    sheetsAppend('an3', 'CREATE — Notifications', 'Notifications', 1480, 460),
    setNode('sum3', 'Summary — Review Result', [
      { name: 'status', value: 'ok' },
      { name: 'summary', value: "={{ JSON.stringify($('Process Review Logic').first().json.summary) }}" },
    ], 1720, 300),
  ];

  const connections = buildConnections([
    conn('FORM — Review & Feedback', 'Normalize Review Input'),
    conn('Normalize Review Input', 'READ — Projects'),
    conn('READ — Projects', 'READ — Reservations'),
    conn('READ — Reservations', 'READ — Team'),
    conn('READ — Team', 'Process Review Logic'),
    conn('Process Review Logic', 'Prepare Project Row'),
    conn('Process Review Logic', 'Prepare Update Rows'),
    conn('Process Review Logic', 'Prepare Notification Rows'),
    conn('Prepare Project Row', 'UPDATE — Project'),
    conn('Prepare Update Rows', 'IF — Has Updates?'),
    conn('IF — Has Updates?', 'CREATE — Project Update', 0),
    conn('Prepare Notification Rows', 'IF — Has Notifications?'),
    conn('IF — Has Notifications?', 'CREATE — Notifications', 0),
    conn('CREATE — Notifications', 'Summary — Review Result'),
    conn('UPDATE — Project', 'Summary — Review Result'),
  ]);

  return {
    name: '[Studio OS] 03 - Review & Feedback',
    settings: { executionOrder: 'v1', timezone: 'Africa/Cairo' },
    nodes,
    connections,
  };
}

async function upsertWorkflow(wf) {
  const list = await api('GET', '/api/v1/workflows');
  const existing = (list.data || []).find((w) => w.name === wf.name);
  if (existing) {
    console.log('Updating existing:', wf.name, existing.id);
    const updated = await api('PUT', `/api/v1/workflows/${existing.id}`, wf);
    return updated;
  }
  console.log('Creating:', wf.name);
  return api('POST', '/api/v1/workflows', wf);
}

async function main() {
  const workflows = [workflow01Fixed(), workflow02(), workflow03()];
  const results = [];
  for (const wf of workflows) {
    // Remove undefined / clean
    const created = await upsertWorkflow(wf);
    results.push({ id: created.id, name: created.name, active: created.active, nodes: (created.nodes || []).length });
    console.log('OK', created.id, created.name, 'nodes=', (created.nodes || []).length);
  }
  fs.writeFileSync(path.join(__dirname, 'deploy-result.json'), JSON.stringify(results, null, 2));
  console.log('\\nDeployed:\\n', JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
