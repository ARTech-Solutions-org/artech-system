const key = process.env.N8N_API_KEY;
const id = 'CucijOQolo68IGMR';

(async () => {
  const wf = await (
    await fetch(`http://localhost:5678/api/v1/workflows/${id}`, {
      headers: { 'X-N8N-API-KEY': key },
    })
  ).json();

  const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));

  // 1) Trim first form fields (remove free-text team/equipment)
  const formTrigger = byName['FORM — New Project'];
  formTrigger.parameters.formDescription =
    'Enter project details. On the next page you will pick team and equipment from Studio OS sheets.';
  formTrigger.parameters.responseMode = 'lastNode';
  formTrigger.parameters.formFields = {
    values: [
      { fieldLabel: 'Project Name', fieldType: 'text', requiredField: true },
      { fieldLabel: 'Client', fieldType: 'text', requiredField: true },
      {
        fieldLabel: 'Project Type',
        fieldType: 'text',
        requiredField: false,
        placeholder: 'Activation / XR / Demo',
      },
      { fieldLabel: 'Description', fieldType: 'textarea', requiredField: false },
      {
        fieldLabel: 'Technology',
        fieldType: 'text',
        requiredField: false,
        placeholder: 'Unity / Unreal / Web',
      },
      { fieldLabel: 'Start Date', fieldType: 'date', requiredField: false },
      { fieldLabel: 'Deadline', fieldType: 'date', requiredField: false },
      {
        fieldLabel: 'Priority',
        fieldType: 'dropdown',
        requiredField: false,
        fieldOptions: {
          values: [
            { option: 'Low' },
            { option: 'Medium' },
            { option: 'High' },
            { option: 'Critical' },
          ],
        },
      },
      { fieldLabel: 'Location', fieldType: 'text', requiredField: false },
      {
        fieldLabel: 'Client Assets',
        fieldType: 'text',
        requiredField: false,
        placeholder: 'Waiting / Received / Partial',
      },
      { fieldLabel: 'Notes', fieldType: 'textarea', requiredField: false },
    ],
  };

  // 2) Add / update builder + assignment form nodes
  const buildCode = `const team = $('READ — Team').all().map(i => i.json).filter(r => r.Name || r.Team_ID);
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

const none = [{ option: '(None)' }];
const availableEq = equipment.filter(e => {
  const s = String(e.Status || 'Available');
  return s === 'Available' || s === '';
});

const eqOptions = availableEq.map(e => ({
  option: String(e.Equipment_ID) + ' | ' + String(e.Equipment_Name) + (e.Location ? ' (' + e.Location + ')' : ''),
}));

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
    fieldType: 'checkbox',
    requiredField: false,
    fieldOptions: {
      values: eqOptions.length ? eqOptions : [{ option: '(No available equipment)' }],
    },
  },
];

if (!uniqueTeam.length) {
  throw new Error('No team members found in Team sheet. Add rows first.');
}

return [{ json: { form_fields } }];`;

  let buildNode = byName['CODE — Build Assignment Form'];
  if (!buildNode) {
    buildNode = {
      id: 'build-assign-form',
      name: 'CODE — Build Assignment Form',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [720, 304],
      parameters: {
        language: 'javaScript',
        mode: 'runOnceForAllItems',
        jsCode: buildCode,
      },
    };
    wf.nodes.push(buildNode);
  } else {
    buildNode.parameters.jsCode = buildCode;
  }

  let assignForm = byName['FORM — Assign Team & Equipment'];
  if (!assignForm) {
    assignForm = {
      id: 'form-assign',
      name: 'FORM — Assign Team & Equipment',
      type: 'n8n-nodes-base.form',
      typeVersion: 2.2,
      position: [960, 304],
      webhookId: 'studio-os-assign-team-equipment',
      parameters: {
        operation: 'page',
        defineForm: 'json',
        jsonOutput: '={{ $json.form_fields }}',
        options: {
          formTitle: 'Assign Team & Equipment',
          formDescription:
            'Choices are loaded live from your Team and Equipment sheets (Available equipment only).',
          buttonLabel: 'Create Project',
        },
      },
    };
    wf.nodes.push(assignForm);
  } else {
    assignForm.parameters = {
      operation: 'page',
      defineForm: 'json',
      jsonOutput: '={{ $json.form_fields }}',
      options: {
        formTitle: 'Assign Team & Equipment',
        formDescription:
          'Choices are loaded live from your Team and Equipment sheets (Available equipment only).',
        buttonLabel: 'Create Project',
      },
    };
  }

  // 3) Replace Normalize Form Input to merge both pages + selected equipment IDs
  const normalize = byName['Normalize Form Input'];
  normalize.parameters.jsCode = `const page1 = $('FORM — New Project').first().json;
const page2 = $('FORM — Assign Team & Equipment').first().json;

const projectName = String(page1['Project Name'] || '').trim();
const client = String(page1.Client || '').trim();
if (!projectName || !client) throw new Error('Project Name and Client are required.');

function cleanPerson(v) {
  const s = String(v || '').trim();
  if (!s || s === '(None)') return '';
  return s;
}

function parseEquipmentSelections(raw) {
  let values = [];
  if (Array.isArray(raw)) values = raw;
  else if (raw && typeof raw === 'object') {
    values = Object.values(raw).flatMap(v => Array.isArray(v) ? v : [v]);
  } else if (typeof raw === 'string' && raw.trim()) {
    values = raw.split(/,|\\n/).map(s => s.trim());
  }

  return values
    .map(v => String(v || '').trim())
    .filter(v => v && !v.includes('No available equipment'))
    .map(v => {
      const parts = v.split('|');
      const id = (parts[0] || '').trim();
      const rest = (parts.slice(1).join('|') || '').trim();
      const name = rest.replace(/\\(.*\\)$/, '').trim();
      return { id, name, label: v };
    })
    .filter(v => v.id);
}

const selectedEquipment = parseEquipmentSelections(page2['Required Equipment']);
const developer = cleanPerson(page2.Developer);
const designer = cleanPerson(page2.Designer);
const installer = cleanPerson(page2.Installer);
const startDate = String(page1['Start Date'] || '').trim();
const deadline = String(page1.Deadline || '').trim();
const requiredEquipment = selectedEquipment.map(e => e.label).join('\\n');

const submissionKey = [
  projectName.toLowerCase(),
  client.toLowerCase(),
  startDate,
  deadline,
  selectedEquipment.map(e => e.id).sort().join(','),
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
    priority: String(page1.Priority || 'Medium').trim() || 'Medium',
    developer,
    designer,
    installer,
    location: String(page1.Location || '').trim(),
    required_equipment_raw: requiredEquipment,
    selected_equipment_ids: selectedEquipment.map(e => e.id),
    client_assets_status: String(page1['Client Assets'] || 'Unknown').trim() || 'Unknown',
    notes: String(page1.Notes || '').trim(),
    submission_key: submissionKey,
    now: new Date().toISOString(),
  }
}];`;

  // 4) Patch Process Project Logic to prefer selected equipment IDs
  const logic = byName['Process Project Logic'];
  let code = logic.parameters.jsCode;
  if (!code.includes('SELECTED_EQUIPMENT_IDS')) {
    code = code.replace(
      'const requested = parseEquipment(input.required_equipment_raw);',
      `const selectedIds = Array.isArray(input.selected_equipment_ids) ? input.selected_equipment_ids : [];
// SELECTED_EQUIPMENT_IDS
const requested = parseEquipment(input.required_equipment_raw);`
    );

    const oldLoopStart = `for (const req of requested) {
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
}`;

    const newLoop = `if (selectedIds.length) {
  for (const id of selectedIds) {
    const eq = equipment.find(e => String(e.Equipment_ID) === String(id));
    if (!eq) {
      unavailable.push({ name: id, requested: 1, available: 0 });
      continue;
    }
    const status = String(eq.Status || '');
    const conflicting = reservations.some(r =>
      String(r.Equipment_ID) === String(eq.Equipment_ID) &&
      reservedStatuses.has(String(r.Status || '')) &&
      overlaps(input.start_date, input.deadline, r.Start_Date, r.End_Date)
    );
    if (conflicting || ['Broken', 'Maintenance', 'Installed', 'Reserved'].includes(status)) {
      unavailable.push({ name: eq.Equipment_Name + ' (' + eq.Equipment_ID + ')', requested: 1, available: 0 });
      continue;
    }
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
      Notes: 'Selected from form dropdown',
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
} else {
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
}`;

    if (code.includes(oldLoopStart)) {
      code = code.replace(oldLoopStart, newLoop);
    } else {
      console.log('WARN: exact equipment loop not found; ID selection patch may be incomplete');
    }
    logic.parameters.jsCode = code;
  }

  // 5) Update SETUP note
  const setup = byName['SETUP'];
  if (setup) {
    setup.parameters.content = `## [Studio OS] 01 - New Project

Two-page form:
1) Project details
2) Team + Equipment dropdowns loaded from Sheets

Equipment checkboxes show **Available** units only.
Team dropdowns exclude Status = Off.

Reservation/Notification writes are disabled.`;
  }

  // 6) Reposition key nodes for readability
  byName['FORM — New Project'].position = [0, 304];
  byName['READ — Team'].position = [240, 200];
  byName['READ — Equipment'].position = [240, 400];
  buildNode.position = [480, 304];
  assignForm.position = [720, 304];
  normalize.position = [960, 304];
  byName['READ — Projects'].position = [1200, 200];
  byName['READ — Reservations'].position = [1200, 400];
  byName['Process Project Logic'].position = [1440, 304];

  // 7) Rewire connections
  wf.connections = {
    'FORM — New Project': {
      main: [[{ node: 'READ — Team', type: 'main', index: 0 }]],
    },
    'READ — Team': {
      main: [[{ node: 'READ — Equipment', type: 'main', index: 0 }]],
    },
    'READ — Equipment': {
      main: [[{ node: 'CODE — Build Assignment Form', type: 'main', index: 0 }]],
    },
    'CODE — Build Assignment Form': {
      main: [[{ node: 'FORM — Assign Team & Equipment', type: 'main', index: 0 }]],
    },
    'FORM — Assign Team & Equipment': {
      main: [[{ node: 'Normalize Form Input', type: 'main', index: 0 }]],
    },
    'Normalize Form Input': {
      main: [[{ node: 'READ — Projects', type: 'main', index: 0 }]],
    },
    'READ — Projects': {
      main: [[{ node: 'READ — Reservations', type: 'main', index: 0 }]],
    },
    'READ — Reservations': {
      main: [[{ node: 'Process Project Logic', type: 'main', index: 0 }]],
    },
    'Process Project Logic': {
      main: [[{ node: 'IF — Duplicate Submission?', type: 'main', index: 0 }]],
    },
    'IF — Duplicate Submission?': {
      main: [
        [{ node: 'Summary — Duplicate', type: 'main', index: 0 }],
        [{ node: 'Prepare Project Row', type: 'main', index: 0 }],
      ],
    },
    'Prepare Project Row': {
      main: [[{ node: 'CREATE — Project', type: 'main', index: 0 }]],
    },
    'CREATE — Project': {
      main: [[{ node: 'Prepare Equipment Rows', type: 'main', index: 0 }]],
    },
    'Prepare Equipment Rows': {
      main: [[{ node: 'IF — Has Equipment Updates?', type: 'main', index: 0 }]],
    },
    'IF — Has Equipment Updates?': {
      main: [
        [{ node: 'UPDATE — Equipment', type: 'main', index: 0 }],
        [{ node: 'Prepare Team Rows', type: 'main', index: 0 }],
      ],
    },
    'UPDATE — Equipment': {
      main: [[{ node: 'Prepare Team Rows', type: 'main', index: 0 }]],
    },
    'Prepare Team Rows': {
      main: [[{ node: 'IF — Has Team Updates?', type: 'main', index: 0 }]],
    },
    'IF — Has Team Updates?': {
      main: [
        [{ node: 'UPDATE — Team', type: 'main', index: 0 }],
        [{ node: 'Summary — Project Created', type: 'main', index: 0 }],
      ],
    },
    'UPDATE — Team': {
      main: [[{ node: 'Summary — Project Created', type: 'main', index: 0 }]],
    },
  };

  const payload = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings,
  };

  const put = await fetch(`http://localhost:5678/api/v1/workflows/${id}`, {
    method: 'PUT',
    headers: {
      'X-N8N-API-KEY': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await put.text();
  if (!put.ok) {
    console.error('FAIL', put.status, text.slice(0, 800));
    process.exit(1);
  }
  const updated = JSON.parse(text);
  console.log('OK', updated.name, 'nodes=', updated.nodes.length);
  console.log(updated.nodes.map((n) => n.name).join(' | '));
})();
