/**
 * Equipment Amount/Available + timed reservations + manual release
 * for [Studio OS] 01 - Projects Hub
 */
const key = process.env.N8N_API_KEY;
if (!key) {
  console.error('Set N8N_API_KEY');
  process.exit(1);
}

const WF_ID = 'CucijOQolo68IGMR';
const CRED = {
  googleSheetsOAuth2Api: {
    id: 'hPGaEBv6Ym0uVjSh',
    name: 'Google Sheets account',
  },
};

const EQUIP_DOC = {
  __rl: true,
  value: '1SOpTC6zINBOVdJW8rp7k1o00Dlx8Tl9Pw-2FC8Aqx6I',
  mode: 'id',
};
const EQUIP_SHEET = {
  __rl: true,
  value: 1243002609,
  mode: 'list',
  cachedResultName: 'Equipment',
  cachedResultUrl:
    'https://docs.google.com/spreadsheets/d/1SOpTC6zINBOVdJW8rp7k1o00Dlx8Tl9Pw-2FC8Aqx6I/edit#gid=1243002609',
};

const RES_DOC = {
  __rl: true,
  value: '1NqirW6xNUJHzMUu8JNlnxaV2jNxpAugZTn3tJJu07hA',
  mode: 'id',
};
const RES_SHEET = {
  __rl: true,
  value: 103464818,
  mode: 'list',
  cachedResultName: 'Reservations',
  cachedResultUrl:
    'https://docs.google.com/spreadsheets/d/1NqirW6xNUJHzMUu8JNlnxaV2jNxpAugZTn3tJJu07hA/edit#gid=103464818',
};

const buildAssignCode = `const team = $('READ — Team').all().map(i => i.json).filter(r => r.Name || r.Team_ID);
const equipment = $('READ — Equipment').all().map(i => i.json).filter(r => r.Equipment_ID || r.Equipment_Name);

const teamOptions = team
  .filter(t => String(t.Status || '') !== 'Off')
  .map(t => ({ option: String(t.Name).trim() }))
  .filter(o => o.option);

const uniqueTeam = [];
const seen = new Set();
for (const o of teamOptions) {
  const key = o.option.toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);
  uniqueTeam.push(o);
}

function stockByName(rows) {
  const map = new Map();
  for (const e of rows) {
    const name = String(e.Equipment_Name || '').trim();
    if (!name) continue;
    const amount = Number(e.Amount);
    const availCol = e.Available;
    let available;
    if (availCol !== undefined && availCol !== null && String(availCol).trim() !== '') {
      available = Number(availCol);
      if (!Number.isFinite(available)) available = 0;
    } else {
      const status = String(e.Status || 'Available');
      available = ['Broken', 'Maintenance', 'Installed', 'Reserved'].includes(status) ? 0 : (Number.isFinite(amount) && amount > 0 ? amount : 1);
    }
    const totalAmount = Number.isFinite(amount) && amount > 0 ? amount : Math.max(available, 1);
    const cur = map.get(name.toLowerCase()) || { name, available: 0, amount: 0, rows: [] };
    cur.available += Math.max(0, available);
    cur.amount += totalAmount;
    cur.rows.push(e);
    map.set(name.toLowerCase(), cur);
  }
  return [...map.values()].filter(g => g.available > 0);
}

const groups = stockByName(equipment);
const eqOptions = [];
for (const g of groups) {
  for (let q = 1; q <= g.available; q++) {
    eqOptions.push({
      option: g.name + ' | qty ' + q + ' (' + g.available + ' available)',
    });
  }
}

const none = [{ option: '(None)' }];
const form_fields = [
  {
    fieldLabel: 'Developer',
    fieldType: 'dropdown',
    requiredField: false,
    fieldOptions: { values: none.concat(uniqueTeam) },
  },
  {
    fieldLabel: 'Designer',
    fieldType: 'dropdown',
    requiredField: false,
    fieldOptions: { values: none.concat(uniqueTeam) },
  },
  {
    fieldLabel: 'Installer',
    fieldType: 'dropdown',
    requiredField: false,
    fieldOptions: { values: none.concat(uniqueTeam) },
  },
  {
    fieldLabel: 'Required Equipment',
    fieldType: 'dropdown',
    requiredField: false,
    fieldOptions: {
      values: eqOptions.length ? [{ option: '(None)' }].concat(eqOptions) : [{ option: '(No available equipment)' }],
    },
  },
  {
    fieldLabel: 'More Equipment',
    fieldType: 'dropdown',
    requiredField: false,
    fieldOptions: {
      values: eqOptions.length ? [{ option: '(None)' }].concat(eqOptions) : [{ option: '(No available equipment)' }],
    },
  },
  {
    fieldLabel: 'Reserve From',
    fieldType: 'date',
    requiredField: false,
  },
  {
    fieldLabel: 'Reserve Until',
    fieldType: 'date',
    requiredField: false,
  },
];

if (!uniqueTeam.length) {
  throw new Error('No team members found in Team sheet. Add rows first.');
}

return [{ json: { form_fields } }];`;

const normalizeCode = `const page1 = $('FORM — Create Details').first().json;
const page2 = $('FORM — Assign Team & Equipment').first().json;

const projectName = String(page1['Project Name'] || '').trim();
const client = String(page1.Client || '').trim();
if (!projectName || !client) throw new Error('Project Name and Client are required.');

function cleanPerson(v) {
  const s = String(v || '').trim();
  if (!s || s === '(None)') return '';
  return s;
}

function parseEquipOption(raw) {
  const v = String(raw || '').trim();
  if (!v || v === '(None)' || v.includes('No available equipment')) return null;
  // "Quest 3 | qty 2 (3 available)"
  const m = v.match(/^(.+?)\\s*\\|\\s*qty\\s*(\\d+)/i);
  if (m) {
    return { name: m[1].trim(), qty: Number(m[2]) || 1, label: v };
  }
  // legacy "EQ-001 | Quest 3 (...)"
  const parts = v.split('|');
  const id = (parts[0] || '').trim();
  const rest = (parts.slice(1).join('|') || '').trim();
  const name = rest.replace(/\\(.*\\)$/, '').trim() || id;
  return { id, name, qty: 1, label: v };
}

const selectedEquipment = [];
for (const key of ['Required Equipment', 'More Equipment']) {
  const parsed = parseEquipOption(page2[key]);
  if (parsed) selectedEquipment.push(parsed);
}

// merge same name qty
const merged = new Map();
for (const s of selectedEquipment) {
  const k = String(s.name || '').toLowerCase();
  const cur = merged.get(k) || { name: s.name, qty: 0, ids: [], label: s.label };
  cur.qty += s.qty;
  if (s.id) cur.ids.push(s.id);
  merged.set(k, cur);
}
const equipmentRequests = [...merged.values()];

const developer = cleanPerson(page2.Developer);
const designer = cleanPerson(page2.Designer);
const installer = cleanPerson(page2.Installer);
const startDate = String(page1['Start Date'] || '').trim();
const deadline = String(page1.Deadline || '').trim();
const reserveFrom = String(page2['Reserve From'] || startDate || '').trim();
const reserveUntil = String(page2['Reserve Until'] || deadline || '').trim();

const submissionKey = [
  projectName.toLowerCase(),
  client.toLowerCase(),
  startDate,
  deadline,
  reserveFrom,
  reserveUntil,
  equipmentRequests.map(e => e.name + 'x' + e.qty).sort().join(','),
  developer.toLowerCase(),
  designer.toLowerCase(),
  installer.toLowerCase(),
].join('|');

return [{
  json: {
    project_name: projectName,
    client,
    project_type: String(page1['Project Type'] || '').trim(),
    description: String(page1.Description || '').trim(),
    technology: String(page1.Technology || '').trim(),
    start_date: startDate,
    deadline,
    reserve_from: reserveFrom,
    reserve_until: reserveUntil,
    priority: String(page1.Priority || 'Medium').trim() || 'Medium',
    status: String(page1.Status || 'New').trim() || 'New',
    developer,
    designer,
    installer,
    location: String(page1.Location || '').trim(),
    required_equipment_raw: equipmentRequests.map(e => e.name + ' x' + e.qty).join('\\n'),
    equipment_requests: equipmentRequests,
    selected_equipment_ids: equipmentRequests.flatMap(e => e.ids || []),
    client_assets_status: String(page1['Client Assets'] || 'Unknown').trim() || 'Unknown',
    notes: String(page1.Notes || '').trim(),
    submission_key: submissionKey,
    now: new Date().toISOString(),
  }
}];`;

const processEquipBlock = `const reservedStatuses = new Set(['Reserved', 'Active']);
const availableEquipment = [];
const unavailable = [];
const reservationRows = [];
const equipmentRows = [];
const reserveFrom = input.reserve_from || input.start_date;
const reserveUntil = input.reserve_until || input.deadline;

function unitAvailable(eq) {
  if (eq.Available !== undefined && eq.Available !== null && String(eq.Available).trim() !== '') {
    const n = Number(eq.Available);
    return Number.isFinite(n) ? n : 0;
  }
  const status = String(eq.Status || 'Available');
  if (['Broken', 'Maintenance', 'Installed', 'Reserved'].includes(status)) return 0;
  const amount = Number(eq.Amount);
  return Number.isFinite(amount) && amount > 0 ? amount : 1;
}

function unitAmount(eq) {
  const amount = Number(eq.Amount);
  if (Number.isFinite(amount) && amount > 0) return amount;
  return Math.max(unitAvailable(eq), 1);
}

function hasConflict(eqId, from, until) {
  return reservations.some(r =>
    String(r.Equipment_ID) === String(eqId) &&
    reservedStatuses.has(String(r.Status || '')) &&
    overlaps(from, until, r.Start_Date, r.End_Date)
  );
}

const requests = Array.isArray(input.equipment_requests) && input.equipment_requests.length
  ? input.equipment_requests
  : (() => {
      const selectedIds = Array.isArray(input.selected_equipment_ids) ? input.selected_equipment_ids : [];
      if (selectedIds.length) {
        return selectedIds.map(id => {
          const eq = equipment.find(e => String(e.Equipment_ID) === String(id));
          return { name: eq ? eq.Equipment_Name : id, qty: 1, ids: [id] };
        });
      }
      return parseEquipment(input.required_equipment_raw);
    })();

for (const req of requests) {
  const qty = Math.max(1, Number(req.qty) || 1);
  const name = String(req.name || '').trim();
  const matches = equipment.filter(e => String(e.Equipment_Name || '').toLowerCase() === name.toLowerCase());

  if (!matches.length) {
    unavailable.push({ name, requested: qty, available: 0 });
    continue;
  }

  // Catalog-style single row with Amount > 1
  if (matches.length === 1 && unitAmount(matches[0]) > 1) {
    const eq = matches[0];
    const free = unitAvailable(eq);
    const conflict = hasConflict(eq.Equipment_ID, reserveFrom, reserveUntil);
    if (conflict || free < qty) {
      unavailable.push({ name: eq.Equipment_Name, requested: qty, available: conflict ? 0 : free });
      continue;
    }
    const newAvail = free - qty;
    availableEquipment.push({ name: eq.Equipment_Name, id: eq.Equipment_ID, qty });
    reservationRows.push({
      Reservation_ID: 'RES-' + projectId + '-' + eq.Equipment_ID + '-' + Date.now().toString(36),
      Equipment_ID: eq.Equipment_ID,
      Equipment_Name: eq.Equipment_Name,
      Project_ID: projectId,
      Project_Name: input.project_name,
      Reserved_By: input.developer || 'Studio OS',
      Start_Date: reserveFrom,
      End_Date: reserveUntil,
      Qty: qty,
      Status: 'Reserved',
      Notes: 'Timed reservation from project create',
      Created_At: input.now,
    });
    equipmentRows.push({
      Equipment_ID: eq.Equipment_ID,
      Equipment_Name: eq.Equipment_Name,
      Category: eq.Category || '',
      Amount: unitAmount(eq),
      Available: newAvail,
      Status: newAvail > 0 ? 'Available' : 'Reserved',
      Location: eq.Location || '',
      Current_Project: newAvail > 0 ? (eq.Current_Project || '') : projectId,
      Notes: eq.Notes || '',
    });
    continue;
  }

  // Unit rows (one physical item per row)
  const freeUnits = matches.filter(eq => {
    if (unitAvailable(eq) <= 0) return false;
    if (hasConflict(eq.Equipment_ID, reserveFrom, reserveUntil)) return false;
    return true;
  });

  if (freeUnits.length < qty) {
    unavailable.push({ name, requested: qty, available: freeUnits.length });
  }

  const take = freeUnits.slice(0, qty);
  for (const eq of take) {
    availableEquipment.push({ name: eq.Equipment_Name, id: eq.Equipment_ID, qty: 1 });
    reservationRows.push({
      Reservation_ID: 'RES-' + projectId + '-' + eq.Equipment_ID,
      Equipment_ID: eq.Equipment_ID,
      Equipment_Name: eq.Equipment_Name,
      Project_ID: projectId,
      Project_Name: input.project_name,
      Reserved_By: input.developer || 'Studio OS',
      Start_Date: reserveFrom,
      End_Date: reserveUntil,
      Qty: 1,
      Status: 'Reserved',
      Notes: 'Timed reservation from project create',
      Created_At: input.now,
    });
    equipmentRows.push({
      Equipment_ID: eq.Equipment_ID,
      Equipment_Name: eq.Equipment_Name,
      Category: eq.Category || '',
      Amount: unitAmount(eq),
      Available: 0,
      Status: 'Reserved',
      Location: eq.Location || '',
      Current_Project: projectId,
      Notes: eq.Notes || '',
    });
  }
}`;

const buildReleaseFormCode = `const reservations = $('READ — Reservations For Release').all().map(i => i.json)
  .filter(r => r.Reservation_ID || r.Equipment_ID);
const active = reservations.filter(r => ['Reserved', 'Active'].includes(String(r.Status || '')));

const options = active.map(r => {
  const qty = r.Qty ? (' x' + r.Qty) : '';
  return {
    option: [r.Reservation_ID, r.Equipment_Name + qty, r.Project_Name || r.Project_ID, (r.Start_Date || '') + ' → ' + (r.End_Date || '')]
      .filter(Boolean)
      .join(' | '),
  };
});

if (!options.length) options.push({ option: 'No active reservations' });

return [{
  json: {
    form_fields: [
      {
        fieldLabel: 'Reservation',
        fieldType: 'dropdown',
        requiredField: true,
        fieldOptions: { values: options },
      },
      {
        fieldLabel: 'Released By',
        fieldType: 'text',
        requiredField: true,
      },
      {
        fieldLabel: 'Notes',
        fieldType: 'textarea',
        requiredField: false,
      },
    ],
  },
}];`;

const processReleaseCode = `const page = $('FORM — Release Equipment').first().json;
const reservations = $('READ — Reservations For Release').all().map(i => i.json);
const equipment = $('READ — Equipment For Release').all().map(i => i.json);

const label = String(page.Reservation || '').trim();
if (!label || label.startsWith('No active')) throw new Error('Select an active reservation.');
const reservationId = label.split('|')[0].trim();
const res = reservations.find(r => String(r.Reservation_ID) === reservationId);
if (!res) throw new Error('Reservation not found: ' + reservationId);

const releasedBy = String(page['Released By'] || '').trim();
if (!releasedBy) throw new Error('Released By is required.');

const now = new Date().toISOString();
const qty = Math.max(1, Number(res.Qty) || 1);
const eq = equipment.find(e => String(e.Equipment_ID) === String(res.Equipment_ID));

const reservation_row = {
  Reservation_ID: res.Reservation_ID,
  Equipment_ID: res.Equipment_ID,
  Equipment_Name: res.Equipment_Name,
  Project_ID: res.Project_ID,
  Project_Name: res.Project_Name,
  Reserved_By: res.Reserved_By,
  Start_Date: res.Start_Date,
  End_Date: res.End_Date,
  Qty: qty,
  Status: 'Released',
  Notes: [res.Notes, 'Released by ' + releasedBy, String(page.Notes || '').trim()].filter(Boolean).join(' | '),
  Created_At: res.Created_At || '',
};

let equipment_row = null;
if (eq) {
  const amount = Number(eq.Amount);
  const total = Number.isFinite(amount) && amount > 0 ? amount : 1;
  let available = Number(eq.Available);
  if (!Number.isFinite(available)) available = String(eq.Status) === 'Available' ? total : 0;
  available = Math.min(total, available + qty);
  equipment_row = {
    Equipment_ID: eq.Equipment_ID,
    Equipment_Name: eq.Equipment_Name,
    Category: eq.Category || '',
    Amount: total,
    Available: available,
    Status: available > 0 ? 'Available' : 'Reserved',
    Location: eq.Location || '',
    Current_Project: available > 0 ? '' : (eq.Current_Project || ''),
    Notes: eq.Notes || '',
  };
}

return [{
  json: {
    reservation_row,
    equipment_row,
    summary: {
      action: 'release',
      reservation_id: reservationId,
      equipment_id: res.Equipment_ID,
      equipment_name: res.Equipment_Name,
      qty,
      released_by: releasedBy,
    },
  },
}];`;

const autoReleaseCode = `const now = Date.now();
const reservations = $('READ — Reservations Auto').all().map(i => i.json).filter(r => r.Reservation_ID);
const equipment = $('READ — Equipment Auto').all().map(i => i.json).filter(r => r.Equipment_ID);

const expired = reservations.filter(r => {
  if (!['Reserved', 'Active'].includes(String(r.Status || ''))) return false;
  const end = new Date(r.End_Date || 0).getTime();
  return end && end <= now;
});

const reservation_rows = [];
const equipmentMap = new Map(equipment.map(e => [String(e.Equipment_ID), { ...e }]));

for (const res of expired) {
  const qty = Math.max(1, Number(res.Qty) || 1);
  reservation_rows.push({
    Reservation_ID: res.Reservation_ID,
    Equipment_ID: res.Equipment_ID,
    Equipment_Name: res.Equipment_Name,
    Project_ID: res.Project_ID,
    Project_Name: res.Project_Name,
    Reserved_By: res.Reserved_By,
    Start_Date: res.Start_Date,
    End_Date: res.End_Date,
    Qty: qty,
    Status: 'Expired',
    Notes: [res.Notes, 'Auto-released on expiry'].filter(Boolean).join(' | '),
    Created_At: res.Created_At || '',
  });

  const eq = equipmentMap.get(String(res.Equipment_ID));
  if (!eq) continue;
  const amount = Number(eq.Amount);
  const total = Number.isFinite(amount) && amount > 0 ? amount : 1;
  let available = Number(eq.Available);
  if (!Number.isFinite(available)) available = 0;
  available = Math.min(total, available + qty);
  eq.Amount = total;
  eq.Available = available;
  eq.Status = available > 0 ? 'Available' : 'Reserved';
  if (available > 0) eq.Current_Project = '';
  equipmentMap.set(String(eq.Equipment_ID), eq);
}

const equipment_rows = expired.length
  ? [...equipmentMap.values()].filter(e => expired.some(r => String(r.Equipment_ID) === String(e.Equipment_ID)))
      .map(eq => ({
        Equipment_ID: eq.Equipment_ID,
        Equipment_Name: eq.Equipment_Name,
        Category: eq.Category || '',
        Amount: eq.Amount,
        Available: eq.Available,
        Status: eq.Status,
        Location: eq.Location || '',
        Current_Project: eq.Current_Project || '',
        Notes: eq.Notes || '',
      }))
  : [];

return [{
  json: {
    reservation_rows,
    equipment_rows,
    summary: { action: 'auto_release', expired: expired.length },
    _skip: expired.length === 0,
  },
}];`;

function equipSchema() {
  return ['Equipment_ID', 'Equipment_Name', 'Category', 'Amount', 'Available', 'Status', 'Location', 'Current_Project', 'Notes'].map((id) => ({
    id,
    displayName: id,
    required: false,
    defaultMatch: id === 'Equipment_ID',
    display: true,
    type: 'string',
    canBeUsedToMatch: true,
  }));
}

function resSchema() {
  return [
    'Reservation_ID',
    'Equipment_ID',
    'Equipment_Name',
    'Project_ID',
    'Project_Name',
    'Reserved_By',
    'Start_Date',
    'End_Date',
    'Qty',
    'Status',
    'Notes',
    'Created_At',
  ].map((id) => ({
    id,
    displayName: id,
    required: false,
    defaultMatch: id === 'Reservation_ID',
    display: true,
    type: 'string',
    canBeUsedToMatch: true,
  }));
}

function upsertNode(wf, node) {
  const i = wf.nodes.findIndex((n) => n.name === node.name);
  if (i >= 0) wf.nodes[i] = { ...wf.nodes[i], ...node, id: wf.nodes[i].id || node.id };
  else wf.nodes.push(node);
}

(async () => {
  const wf = await (
    await fetch(`http://localhost:5678/api/v1/workflows/${WF_ID}`, {
      headers: { 'X-N8N-API-KEY': key },
    })
  ).json();

  // Hub actions
  const hub = wf.nodes.find((n) => n.name === 'FORM — Projects Hub');
  hub.parameters.formFields.values = [
    {
      fieldLabel: 'Action',
      fieldType: 'dropdown',
      requiredField: true,
      fieldOptions: {
        values: [
          { option: 'Create New Project' },
          { option: 'Update Existing Project' },
          { option: 'Release Equipment' },
        ],
      },
    },
  ];
  hub.parameters.formDescription =
    'Create project, update deliverables, or manually release reserved equipment.';

  // Replace IF Create with nested routing: keep IF Create, add IF Update on false branch
  upsertNode(wf, {
    id: 'if-update-action',
    name: 'IF — Update Project?',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [240, 480],
    parameters: {
      conditions: {
        options: {
          caseSensitive: true,
          leftValue: '',
          typeValidation: 'strict',
          version: 2,
        },
        conditions: [
          {
            id: 'cond-update',
            leftValue: '={{ $json.Action }}',
            rightValue: 'Update Existing Project',
            operator: { type: 'string', operation: 'equals' },
          },
        ],
        combinator: 'and',
      },
      options: {},
    },
  });

  // Assignment form + normalize + process
  wf.nodes.find((n) => n.name === 'CODE — Build Assignment Form').parameters.jsCode =
    buildAssignCode;
  wf.nodes.find((n) => n.name === 'Normalize Form Input').parameters.jsCode = normalizeCode;

  const logic = wf.nodes.find((n) => n.name === 'Process Project Logic');
  let code = logic.parameters.jsCode;
  // Replace equipment allocation block from selectedIds through equipmentRows building before blockerText
  const startMarker = 'const selectedIds = Array.isArray(input.selected_equipment_ids)';
  const endMarker = 'const blockerText = unavailable.length';
  const startIdx = code.indexOf(startMarker);
  const endIdx = code.indexOf(endMarker);
  if (startIdx < 0 || endIdx < 0) {
    // try alternate - already patched?
    if (!code.includes('equipment_requests')) {
      throw new Error('Could not locate equipment allocation block in Process Project Logic');
    }
  } else {
    code = code.slice(0, startIdx) + processEquipBlock + '\n\n' + code.slice(endIdx);
  }
  code = code.replace(
    `// RESERVATIONS_NOTIFICATIONS_DISABLED
reservationRows.length = 0;
notificationRows.length = 0;`,
    `// Notifications still disabled for MVP; reservations enabled
notificationRows.length = 0;`
  );
  // ensure reserve times in summary
  if (!code.includes('reserve_from')) {
    code = code.replace(
      'equipment_unavailable: unavailable,',
      'equipment_unavailable: unavailable,\n      reserve_from: reserveFrom,\n      reserve_until: reserveUntil,'
    );
  }
  logic.parameters.jsCode = code;

  // UPDATE Equipment schema to include Amount/Available
  const updEq = wf.nodes.find((n) => n.name === 'UPDATE — Equipment');
  if (updEq) {
    updEq.parameters.columns.schema = equipSchema();
    updEq.parameters.columns.matchingColumns = ['Equipment_ID'];
    updEq.parameters.columns.mappingMode = 'autoMapInputData';
  }

  // CREATE Reservations nodes
  upsertNode(wf, {
    id: 'prep-res-rows',
    name: 'Prepare Reservation Rows',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1248, 280],
    parameters: {
      jsCode: `const root = $('Process Project Logic').first().json;
const rows = root.reservation_rows || [];
if (!rows.length) return [{ json: { _skip: true } }];
return rows.map(r => ({ json: r }));`,
    },
  });
  upsertNode(wf, {
    id: 'if-has-res',
    name: 'IF — Has Reservations?',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [1488, 280],
    parameters: {
      conditions: {
        options: {
          caseSensitive: true,
          leftValue: '',
          typeValidation: 'loose',
          version: 2,
        },
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
  });
  upsertNode(wf, {
    id: 'create-res',
    name: 'CREATE — Reservations',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [1728, 200],
    parameters: {
      operation: 'append',
      documentId: RES_DOC,
      sheetName: RES_SHEET,
      columns: {
        mappingMode: 'autoMapInputData',
        value: {},
        matchingColumns: [],
        schema: resSchema(),
      },
      options: {},
    },
    credentials: CRED,
  });

  // Release path nodes
  upsertNode(wf, {
    id: 'read-res-release',
    name: 'READ — Reservations For Release',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [480, 720],
    parameters: { documentId: RES_DOC, sheetName: RES_SHEET, options: {} },
    credentials: CRED,
    alwaysOutputData: true,
  });
  upsertNode(wf, {
    id: 'read-eq-release',
    name: 'READ — Equipment For Release',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [720, 720],
    parameters: { documentId: EQUIP_DOC, sheetName: EQUIP_SHEET, options: {} },
    credentials: CRED,
    alwaysOutputData: true,
  });
  upsertNode(wf, {
    id: 'build-release-form',
    name: 'CODE — Build Release Form',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [960, 720],
    parameters: { jsCode: buildReleaseFormCode },
  });
  upsertNode(wf, {
    id: 'form-release',
    name: 'FORM — Release Equipment',
    type: 'n8n-nodes-base.form',
    typeVersion: 2.2,
    position: [1200, 720],
    parameters: {
      operation: 'page',
      formTitle: 'Release Equipment',
      formDescription: 'Manually free a reserved equipment item before or after the reservation window.',
      defineForm: 'json',
      jsonOutput: '={{ $json.form_fields }}',
      options: {},
    },
  });
  upsertNode(wf, {
    id: 'process-release',
    name: 'Process Release Logic',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1440, 720],
    parameters: { jsCode: processReleaseCode },
  });
  upsertNode(wf, {
    id: 'prep-rel-res',
    name: 'Prepare Release Reservation',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1680, 640],
    parameters: {
      jsCode: `const r = $input.first().json.reservation_row; if (!r) return []; return [{ json: r }];`,
    },
  });
  upsertNode(wf, {
    id: 'upd-rel-res',
    name: 'UPDATE — Release Reservation',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [1920, 640],
    parameters: {
      operation: 'appendOrUpdate',
      documentId: RES_DOC,
      sheetName: RES_SHEET,
      columns: {
        mappingMode: 'autoMapInputData',
        value: {},
        matchingColumns: ['Reservation_ID'],
        schema: resSchema(),
      },
      options: {},
    },
    credentials: CRED,
  });
  upsertNode(wf, {
    id: 'prep-rel-eq',
    name: 'Prepare Release Equipment',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [2160, 720],
    parameters: {
      jsCode: `const r = $('Process Release Logic').first().json.equipment_row; if (!r) return [{ json: { _skip: true } }]; return [{ json: r }];`,
    },
  });
  upsertNode(wf, {
    id: 'if-rel-eq',
    name: 'IF — Has Release Equipment?',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [2400, 720],
    parameters: {
      conditions: {
        options: {
          caseSensitive: true,
          leftValue: '',
          typeValidation: 'loose',
          version: 2,
        },
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
  });
  upsertNode(wf, {
    id: 'upd-rel-eq',
    name: 'UPDATE — Release Equipment Row',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [2640, 640],
    parameters: {
      operation: 'appendOrUpdate',
      documentId: EQUIP_DOC,
      sheetName: EQUIP_SHEET,
      columns: {
        mappingMode: 'autoMapInputData',
        value: {},
        matchingColumns: ['Equipment_ID'],
        schema: equipSchema(),
      },
      options: {},
    },
    credentials: CRED,
  });
  upsertNode(wf, {
    id: 'sum-release',
    name: 'Summary — Equipment Released',
    type: 'n8n-nodes-base.set',
    typeVersion: 3.4,
    position: [2880, 720],
    parameters: {
      assignments: {
        assignments: [
          { id: '1', name: 'action', value: 'release', type: 'string' },
          {
            id: '2',
            name: 'summary',
            value: '={{ JSON.stringify($("Process Release Logic").first().json.summary) }}',
            type: 'string',
          },
        ],
      },
      options: {},
    },
  });

  // Auto-release schedule path
  upsertNode(wf, {
    id: 'sched-auto',
    name: 'SCHEDULE — Auto Release',
    type: 'n8n-nodes-base.scheduleTrigger',
    typeVersion: 1.2,
    position: [0, 960],
    parameters: {
      rule: {
        interval: [{ field: 'minutes', minutesInterval: 30 }],
      },
    },
  });
  upsertNode(wf, {
    id: 'read-res-auto',
    name: 'READ — Reservations Auto',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [240, 960],
    parameters: { documentId: RES_DOC, sheetName: RES_SHEET, options: {} },
    credentials: CRED,
    alwaysOutputData: true,
  });
  upsertNode(wf, {
    id: 'read-eq-auto',
    name: 'READ — Equipment Auto',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [480, 960],
    parameters: { documentId: EQUIP_DOC, sheetName: EQUIP_SHEET, options: {} },
    credentials: CRED,
    alwaysOutputData: true,
  });
  upsertNode(wf, {
    id: 'process-auto',
    name: 'Process Auto Release',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [720, 960],
    parameters: { jsCode: autoReleaseCode },
  });
  upsertNode(wf, {
    id: 'prep-auto-res',
    name: 'Prepare Auto Reservation Rows',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [960, 880],
    parameters: {
      jsCode: `const rows = $input.first().json.reservation_rows || [];
if (!rows.length) return [{ json: { _skip: true } }];
return rows.map(r => ({ json: r }));`,
    },
  });
  upsertNode(wf, {
    id: 'if-auto-res',
    name: 'IF — Has Auto Reservations?',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [1200, 880],
    parameters: {
      conditions: {
        options: {
          caseSensitive: true,
          leftValue: '',
          typeValidation: 'loose',
          version: 2,
        },
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
  });
  upsertNode(wf, {
    id: 'upd-auto-res',
    name: 'UPDATE — Auto Reservations',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [1440, 800],
    parameters: {
      operation: 'appendOrUpdate',
      documentId: RES_DOC,
      sheetName: RES_SHEET,
      columns: {
        mappingMode: 'autoMapInputData',
        value: {},
        matchingColumns: ['Reservation_ID'],
        schema: resSchema(),
      },
      options: {},
    },
    credentials: CRED,
  });
  upsertNode(wf, {
    id: 'prep-auto-eq',
    name: 'Prepare Auto Equipment Rows',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1680, 960],
    parameters: {
      jsCode: `const rows = $('Process Auto Release').first().json.equipment_rows || [];
if (!rows.length) return [{ json: { _skip: true } }];
return rows.map(r => ({ json: r }));`,
    },
  });
  upsertNode(wf, {
    id: 'if-auto-eq',
    name: 'IF — Has Auto Equipment?',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [1920, 960],
    parameters: {
      conditions: {
        options: {
          caseSensitive: true,
          leftValue: '',
          typeValidation: 'loose',
          version: 2,
        },
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
  });
  upsertNode(wf, {
    id: 'upd-auto-eq',
    name: 'UPDATE — Auto Equipment',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [2160, 880],
    parameters: {
      operation: 'appendOrUpdate',
      documentId: EQUIP_DOC,
      sheetName: EQUIP_SHEET,
      columns: {
        mappingMode: 'autoMapInputData',
        value: {},
        matchingColumns: ['Equipment_ID'],
        schema: equipSchema(),
      },
      options: {},
    },
    credentials: CRED,
  });
  upsertNode(wf, {
    id: 'sum-auto',
    name: 'Summary — Auto Release',
    type: 'n8n-nodes-base.set',
    typeVersion: 3.4,
    position: [2400, 960],
    parameters: {
      assignments: {
        assignments: [
          {
            id: '1',
            name: 'summary',
            value: '={{ JSON.stringify($("Process Auto Release").first().json.summary) }}',
            type: 'string',
          },
        ],
      },
      options: {},
    },
  });

  // Connections
  const c = wf.connections;

  // Create IF false → Update IF; Update false → Release
  c['IF — Create Project?'] = {
    main: [
      [{ node: 'FORM — Create Details', type: 'main', index: 0 }],
      [{ node: 'IF — Update Project?', type: 'main', index: 0 }],
    ],
  };
  c['IF — Update Project?'] = {
    main: [
      [{ node: 'READ — Projects For Update', type: 'main', index: 0 }],
      [{ node: 'READ — Reservations For Release', type: 'main', index: 0 }],
    ],
  };

  // Create path: after project create, write reservations then equipment
  c['CREATE — Project'] = {
    main: [[{ node: 'Prepare Reservation Rows', type: 'main', index: 0 }]],
  };
  c['Prepare Reservation Rows'] = {
    main: [[{ node: 'IF — Has Reservations?', type: 'main', index: 0 }]],
  };
  c['IF — Has Reservations?'] = {
    main: [
      [{ node: 'CREATE — Reservations', type: 'main', index: 0 }],
      [{ node: 'Prepare Equipment Rows', type: 'main', index: 0 }],
    ],
  };
  c['CREATE — Reservations'] = {
    main: [[{ node: 'Prepare Equipment Rows', type: 'main', index: 0 }]],
  };

  // Release path
  c['READ — Reservations For Release'] = {
    main: [[{ node: 'READ — Equipment For Release', type: 'main', index: 0 }]],
  };
  c['READ — Equipment For Release'] = {
    main: [[{ node: 'CODE — Build Release Form', type: 'main', index: 0 }]],
  };
  c['CODE — Build Release Form'] = {
    main: [[{ node: 'FORM — Release Equipment', type: 'main', index: 0 }]],
  };
  c['FORM — Release Equipment'] = {
    main: [[{ node: 'Process Release Logic', type: 'main', index: 0 }]],
  };
  c['Process Release Logic'] = {
    main: [[{ node: 'Prepare Release Reservation', type: 'main', index: 0 }]],
  };
  c['Prepare Release Reservation'] = {
    main: [[{ node: 'UPDATE — Release Reservation', type: 'main', index: 0 }]],
  };
  c['UPDATE — Release Reservation'] = {
    main: [[{ node: 'Prepare Release Equipment', type: 'main', index: 0 }]],
  };
  c['Prepare Release Equipment'] = {
    main: [[{ node: 'IF — Has Release Equipment?', type: 'main', index: 0 }]],
  };
  c['IF — Has Release Equipment?'] = {
    main: [
      [{ node: 'UPDATE — Release Equipment Row', type: 'main', index: 0 }],
      [{ node: 'Summary — Equipment Released', type: 'main', index: 0 }],
    ],
  };
  c['UPDATE — Release Equipment Row'] = {
    main: [[{ node: 'Summary — Equipment Released', type: 'main', index: 0 }]],
  };

  // Auto release
  c['SCHEDULE — Auto Release'] = {
    main: [[{ node: 'READ — Reservations Auto', type: 'main', index: 0 }]],
  };
  c['READ — Reservations Auto'] = {
    main: [[{ node: 'READ — Equipment Auto', type: 'main', index: 0 }]],
  };
  c['READ — Equipment Auto'] = {
    main: [[{ node: 'Process Auto Release', type: 'main', index: 0 }]],
  };
  c['Process Auto Release'] = {
    main: [[{ node: 'Prepare Auto Reservation Rows', type: 'main', index: 0 }]],
  };
  c['Prepare Auto Reservation Rows'] = {
    main: [[{ node: 'IF — Has Auto Reservations?', type: 'main', index: 0 }]],
  };
  c['IF — Has Auto Reservations?'] = {
    main: [
      [{ node: 'UPDATE — Auto Reservations', type: 'main', index: 0 }],
      [{ node: 'Summary — Auto Release', type: 'main', index: 0 }],
    ],
  };
  c['UPDATE — Auto Reservations'] = {
    main: [[{ node: 'Prepare Auto Equipment Rows', type: 'main', index: 0 }]],
  };
  c['Prepare Auto Equipment Rows'] = {
    main: [[{ node: 'IF — Has Auto Equipment?', type: 'main', index: 0 }]],
  };
  c['IF — Has Auto Equipment?'] = {
    main: [
      [{ node: 'UPDATE — Auto Equipment', type: 'main', index: 0 }],
      [{ node: 'Summary — Auto Release', type: 'main', index: 0 }],
    ],
  };
  c['UPDATE — Auto Equipment'] = {
    main: [[{ node: 'Summary — Auto Release', type: 'main', index: 0 }]],
  };

  const sticky = wf.nodes.find((n) => n.name === 'SETUP');
  if (sticky) {
    sticky.parameters.content = `## Projects Hub

Actions:
1. Create New Project — details → team/equipment with **available counts** + Reserve From/Until
2. Update Existing Project — status/links/instructions
3. Release Equipment — manually free a reservation

Equipment sheet columns: Amount, Available
Reservations: Qty + Start/End window; Status Reserved/Released/Expired

Auto-release: every 30 minutes when End date/time has passed.`;
  }

  const put = await fetch(`http://localhost:5678/api/v1/workflows/${WF_ID}`, {
    method: 'PUT',
    headers: {
      'X-N8N-API-KEY': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: wf.name,
      nodes: wf.nodes,
      connections: c,
      settings: wf.settings,
    }),
  });
  const out = await put.json();
  if (!put.ok) {
    console.error(JSON.stringify(out, null, 2));
    process.exit(1);
  }
  console.log('Workflow updated:', out.name);
  console.log(
    'Actions:',
    out.nodes.find((n) => n.name === 'FORM — Projects Hub').parameters.formFields.values[0]
      .fieldOptions.values
  );
  console.log(
    'Has CREATE Reservations:',
    out.nodes.some((n) => n.name === 'CREATE — Reservations')
  );
  console.log(
    'Has Release path:',
    out.nodes.some((n) => n.name === 'FORM — Release Equipment')
  );
  console.log(
    'Has Auto schedule:',
    out.nodes.some((n) => n.name === 'SCHEDULE — Auto Release')
  );
  console.log(
    'Process has equipment_requests:',
    out.nodes
      .find((n) => n.name === 'Process Project Logic')
      .parameters.jsCode.includes('equipment_requests')
  );
})();
