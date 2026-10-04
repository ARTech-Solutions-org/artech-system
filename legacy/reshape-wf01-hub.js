/**
 * Reshape [Studio OS] 01 into Create vs Update hub.
 * Same Projects sheet. Same workflow. Action branch on form page 1.
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

const PROJECT_DOC = {
  __rl: true,
  value: '1KXfojWoFoRfeOsfwV3wwX48_kPqn3lD0seQjaGnqFVc',
  mode: 'id',
};
const PROJECT_SHEET = {
  __rl: true,
  value: 1778111496,
  mode: 'list',
  cachedResultName: 'Projects',
  cachedResultUrl:
    'https://docs.google.com/spreadsheets/d/1KXfojWoFoRfeOsfwV3wwX48_kPqn3lD0seQjaGnqFVc/edit#gid=1778111496',
};

const STATUSES = [
  'New',
  'Planning',
  'Waiting Assets',
  'Development',
  'Internal Review',
  'Client Review',
  'Changes Required',
  'Approved',
  'Deployment',
  'Completed',
  'Blocked',
];

const createDetailFields = [
  { fieldLabel: 'Project Name', requiredField: true },
  { fieldLabel: 'Client', requiredField: true },
  {
    fieldLabel: 'Project Type',
    placeholder: 'Activation / XR / Demo',
  },
  { fieldLabel: 'Description', fieldType: 'textarea' },
  {
    fieldLabel: 'Technology',
    placeholder: 'Unity / Unreal / Web',
  },
  { fieldLabel: 'Start Date', fieldType: 'date' },
  { fieldLabel: 'Deadline', fieldType: 'date' },
  {
    fieldLabel: 'Priority',
    fieldType: 'dropdown',
    fieldOptions: {
      values: [
        { option: 'Low' },
        { option: 'Medium' },
        { option: 'High' },
        { option: 'Critical' },
      ],
    },
  },
  {
    fieldLabel: 'Status',
    fieldType: 'dropdown',
    fieldOptions: { values: STATUSES.map((option) => ({ option })) },
  },
  { fieldLabel: 'Location' },
  {
    fieldLabel: 'Client Assets',
    placeholder: 'Waiting / Received / Partial',
  },
  { fieldLabel: 'Notes', fieldType: 'textarea' },
];

function ifActionCreate() {
  return {
    id: 'if-action-create',
    name: 'IF — Create Project?',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [240, 304],
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
            id: 'cond-create',
            leftValue: "={{ $json.Action }}",
            rightValue: 'Create New Project',
            operator: {
              type: 'string',
              operation: 'equals',
            },
          },
        ],
        combinator: 'and',
      },
      options: {},
    },
  };
}

function formCreateDetails() {
  return {
    id: 'form-create-details',
    name: 'FORM — Create Details',
    type: 'n8n-nodes-base.form',
    typeVersion: 2.2,
    position: [480, 160],
    parameters: {
      operation: 'page',
      formTitle: 'Create New Project',
      formDescription: 'Enter project details. Next page: assign team & equipment.',
      defineForm: 'fields',
      formFields: { values: createDetailFields },
      options: {},
    },
  };
}

function buildUpdateFormCode() {
  return `const projects = $input.all().map(i => i.json).filter(r => r.Project_ID || r.Project_Name);

const options = projects
  .map(p => {
    const id = String(p.Project_ID || '').trim();
    const name = String(p.Project_Name || '').trim();
    const client = String(p.Client || '').trim();
    const status = String(p.Status || '').trim();
    if (!id && !name) return null;
    const label = [id || 'NO-ID', client || 'No client', name || 'Untitled', status ? '(' + status + ')' : '']
      .filter(Boolean)
      .join(' | ');
    return { option: label };
  })
  .filter(Boolean);

if (!options.length) {
  options.push({ option: 'No projects found — create one first' });
}

const statusOptions = ${JSON.stringify(STATUSES)}.map(s => ({ option: s }));

return [{
  json: {
    form_fields: [
      {
        fieldLabel: 'Project',
        fieldType: 'dropdown',
        requiredField: true,
        fieldOptions: { values: options },
      },
      {
        fieldLabel: 'Submitted By',
        fieldType: 'text',
        requiredField: true,
      },
      {
        fieldLabel: 'Status',
        fieldType: 'dropdown',
        requiredField: false,
        fieldOptions: { values: statusOptions },
      },
      {
        fieldLabel: 'Demo Link',
        fieldType: 'text',
        placeholder: 'Video / Loom / Drive demo',
      },
      {
        fieldLabel: 'Build Link',
        fieldType: 'text',
        placeholder: 'Unity build / APK / zip',
      },
      {
        fieldLabel: 'Website Link',
        fieldType: 'text',
        placeholder: 'Staging or live URL',
      },
      {
        fieldLabel: 'Testing Instructions',
        fieldType: 'textarea',
        placeholder: 'How to test this build/demo',
      },
      {
        fieldLabel: 'Installation Instructions',
        fieldType: 'textarea',
        placeholder: 'Install / deploy steps',
      },
      {
        fieldLabel: 'Notes',
        fieldType: 'textarea',
        placeholder: 'What changed / blockers',
      },
    ],
  },
}];`;
}

function processUpdateCode() {
  return `const page = $('FORM — Update Project').first().json;
const projects = $('READ — Projects For Update').all().map(i => i.json).filter(r => r.Project_ID || r.Project_Name);

const projectLabel = String(page.Project || '').trim();
if (!projectLabel || projectLabel.startsWith('No projects found')) {
  throw new Error('Select a valid project to update.');
}

const projectId = projectLabel.split('|')[0].trim();
const existing = projects.find(p => String(p.Project_ID || '').trim() === projectId);
if (!existing) {
  throw new Error('Project not found: ' + projectId);
}

const submittedBy = String(page['Submitted By'] || '').trim();
if (!submittedBy) throw new Error('Submitted By is required.');

const now = new Date().toISOString();
const pick = (label, fallbackKey) => {
  const v = String(page[label] ?? '').trim();
  if (v) return v;
  return existing[fallbackKey] ?? '';
};

const statusRaw = String(page.Status || '').trim();
const allowed = new Set(${JSON.stringify(STATUSES)});
let status = statusRaw || String(existing.Status || 'Development');
if (statusRaw && !allowed.has(statusRaw)) status = String(existing.Status || 'Development');

const row = {
  Project_ID: existing.Project_ID,
  Project_Name: existing.Project_Name || '',
  Client: existing.Client || '',
  Project_Type: existing.Project_Type || '',
  Description: existing.Description || '',
  Technology: existing.Technology || '',
  Start_Date: existing.Start_Date || '',
  Deadline: existing.Deadline || '',
  Priority: existing.Priority || '',
  Status: status,
  Developer: existing.Developer || '',
  Designer: existing.Designer || '',
  Installer: existing.Installer || '',
  Location: existing.Location || '',
  Client_Assets_Status: existing.Client_Assets_Status || '',
  Demo_Link: pick('Demo Link', 'Demo_Link'),
  Build_Link: pick('Build Link', 'Build_Link'),
  Website_Link: pick('Website Link', 'Website_Link'),
  Testing_Instructions: pick('Testing Instructions', 'Testing_Instructions'),
  Installation_Instructions: pick('Installation Instructions', 'Installation_Instructions'),
  Current_Blocker: existing.Current_Blocker || '',
  Created_At: existing.Created_At || '',
  Updated_At: now,
  Submission_Key: existing.Submission_Key || '',
  Last_Submitted_By: submittedBy,
  Last_Update_Notes: String(page.Notes || '').trim() || (existing.Last_Update_Notes || ''),
};

return [{
  json: {
    project_row: row,
    summary: {
      action: 'update',
      project_id: row.Project_ID,
      project_name: row.Project_Name,
      status: row.Status,
      submitted_by: submittedBy,
      demo_link: row.Demo_Link,
      build_link: row.Build_Link,
      website_link: row.Website_Link,
    },
  },
}];`;
}

function projectSchema() {
  const cols = [
    'Project_ID',
    'Project_Name',
    'Client',
    'Project_Type',
    'Description',
    'Technology',
    'Start_Date',
    'Deadline',
    'Priority',
    'Status',
    'Developer',
    'Designer',
    'Installer',
    'Location',
    'Client_Assets_Status',
    'Demo_Link',
    'Build_Link',
    'Website_Link',
    'Testing_Instructions',
    'Installation_Instructions',
    'Current_Blocker',
    'Created_At',
    'Updated_At',
    'Submission_Key',
    'Last_Submitted_By',
    'Last_Update_Notes',
  ];
  return cols.map((id, i) => ({
    id,
    displayName: id,
    required: false,
    defaultMatch: id === 'Project_ID',
    display: true,
    type: 'string',
    canBeUsedToMatch: true,
    removed: false,
  }));
}

(async () => {
  const wf = await (
    await fetch(`http://localhost:5678/api/v1/workflows/${WF_ID}`, {
      headers: { 'X-N8N-API-KEY': key },
    })
  ).json();

  // --- Form trigger = Action only ---
  const trigger = wf.nodes.find((n) => n.name === 'FORM — New Project');
  trigger.name = 'FORM — Projects Hub';
  trigger.parameters.formTitle = 'Studio OS — Projects';
  trigger.parameters.formDescription =
    'Create a new project, or update an existing one (status, demo/build/website links, testing & installation instructions).';
  trigger.parameters.formFields = {
    values: [
      {
        fieldLabel: 'Action',
        fieldType: 'dropdown',
        requiredField: true,
        fieldOptions: {
          values: [
            { option: 'Create New Project' },
            { option: 'Update Existing Project' },
          ],
        },
      },
    ],
  };

  // Rename sticky
  const sticky = wf.nodes.find((n) => n.name === 'SETUP');
  if (sticky) {
    sticky.parameters.content = `## [Studio OS] 01 — Projects Hub

**Same form URL for everyone**
1. Action = Create New Project → details → team/equipment → new Projects row
2. Action = Update Existing Project → pick project → status + links + instructions → update same Projects row

**Projects sheet columns to keep/add**
\`Website_Link\`, \`Testing_Instructions\`, \`Installation_Instructions\`, \`Last_Submitted_By\`, \`Last_Update_Notes\`

Credential: Google Sheets OAuth2 already connected.`;
  }

  // Fix Normalize to use Create Details page
  const norm = wf.nodes.find((n) => n.name === 'Normalize Form Input');
  norm.parameters.jsCode = norm.parameters.jsCode.replace(
    "const page1 = $('FORM — New Project').first().json;",
    "const page1 = $('FORM — Create Details').first().json;"
  );

  // Enrich create project_row with new columns if process builds projectRow object
  const logic = wf.nodes.find((n) => n.name === 'Process Project Logic');
  if (!logic.parameters.jsCode.includes('Website_Link')) {
    logic.parameters.jsCode = logic.parameters.jsCode.replace(
      "Demo_Link: '',\n  Build_Link: '',",
      "Demo_Link: '',\n  Build_Link: '',\n  Website_Link: '',\n  Testing_Instructions: '',\n  Installation_Instructions: '',\n  Last_Submitted_By: '',\n  Last_Update_Notes: input.notes || '',"
    );
  }

  // Summary create text
  const sumCreate = wf.nodes.find((n) => n.name === 'Summary — Project Created');
  if (sumCreate) {
    sumCreate.parameters = {
      mode: 'manual',
      duplicateItem: false,
      assignments: {
        assignments: [
          { id: 'a1', name: 'action', value: 'create', type: 'string' },
          {
            id: 'a2',
            name: 'summary',
            value: '={{ JSON.stringify($("Process Project Logic").first().json.summary) }}',
            type: 'string',
          },
        ],
      },
      options: {},
    };
  }

  // Remove old trigger connections; rebuild graph edges for hub
  // Keep all existing create-path nodes; insert new ones.

  const newNodes = [
    ifActionCreate(),
    formCreateDetails(),
    {
      id: 'read-projects-update',
      name: 'READ — Projects For Update',
      type: 'n8n-nodes-base.googleSheets',
      typeVersion: 4.5,
      position: [480, 480],
      parameters: {
        documentId: PROJECT_DOC,
        sheetName: PROJECT_SHEET,
        options: {},
      },
      credentials: CRED,
      alwaysOutputData: true,
    },
    {
      id: 'code-build-update-form',
      name: 'CODE — Build Update Form',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [720, 480],
      parameters: { jsCode: buildUpdateFormCode() },
    },
    {
      id: 'form-update-project',
      name: 'FORM — Update Project',
      type: 'n8n-nodes-base.form',
      typeVersion: 2.2,
      position: [960, 480],
      parameters: {
        operation: 'page',
        formTitle: 'Update Project',
        formDescription:
          'Change status and add demo/build/website links plus testing & installation instructions. Empty link fields keep existing values.',
        defineForm: 'json',
        jsonOutput: '={{ $json.form_fields }}',
        options: {},
      },
    },
    {
      id: 'code-process-update',
      name: 'Process Update Logic',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1200, 480],
      parameters: { jsCode: processUpdateCode() },
    },
    {
      id: 'prep-update-row',
      name: 'Prepare Update Row',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1440, 480],
      parameters: {
        jsCode:
          "const r = $input.first().json.project_row; if (!r) return []; return [{ json: r }];",
      },
    },
    {
      id: 'update-project',
      name: 'UPDATE — Project',
      type: 'n8n-nodes-base.googleSheets',
      typeVersion: 4.5,
      position: [1680, 480],
      parameters: {
        operation: 'appendOrUpdate',
        documentId: PROJECT_DOC,
        sheetName: PROJECT_SHEET,
        columns: {
          mappingMode: 'autoMapInputData',
          value: {},
          matchingColumns: ['Project_ID'],
          schema: projectSchema(),
        },
        options: {},
      },
      credentials: CRED,
    },
    {
      id: 'sum-update',
      name: 'Summary — Project Updated',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.4,
      position: [1920, 480],
      parameters: {
        mode: 'manual',
        duplicateItem: false,
        assignments: {
          assignments: [
            { id: 'u1', name: 'action', value: 'update', type: 'string' },
            {
              id: 'u2',
              name: 'summary',
              value: '={{ JSON.stringify($("Process Update Logic").first().json.summary) }}',
              type: 'string',
            },
          ],
        },
        options: {},
      },
    },
  ];

  // Avoid duplicate inserts on re-run
  const existingNames = new Set(wf.nodes.map((n) => n.name));
  for (const n of newNodes) {
    if (existingNames.has(n.name)) {
      const idx = wf.nodes.findIndex((x) => x.name === n.name);
      wf.nodes[idx] = n;
    } else {
      wf.nodes.push(n);
    }
  }

  // Reposition create path start slightly
  const readTeam = wf.nodes.find((n) => n.name === 'READ — Team');
  if (readTeam) readTeam.position = [720, 160];
  const readEq = wf.nodes.find((n) => n.name === 'READ — Equipment');
  if (readEq) readEq.position = [960, 160];
  const buildAssign = wf.nodes.find((n) => n.name === 'CODE — Build Assignment Form');
  if (buildAssign) buildAssign.position = [1200, 160];
  const formAssign = wf.nodes.find((n) => n.name === 'FORM — Assign Team & Equipment');
  if (formAssign) formAssign.position = [1440, 160];

  // Connections
  const c = wf.connections;

  // Fix renamed trigger key
  if (c['FORM — New Project']) {
    c['FORM — Projects Hub'] = c['FORM — New Project'];
    delete c['FORM — New Project'];
  }

  c['FORM — Projects Hub'] = {
    main: [[{ node: 'IF — Create Project?', type: 'main', index: 0 }]],
  };

  c['IF — Create Project?'] = {
    main: [
      [{ node: 'FORM — Create Details', type: 'main', index: 0 }],
      [{ node: 'READ — Projects For Update', type: 'main', index: 0 }],
    ],
  };

  c['FORM — Create Details'] = {
    main: [[{ node: 'READ — Team', type: 'main', index: 0 }]],
  };

  c['READ — Projects For Update'] = {
    main: [[{ node: 'CODE — Build Update Form', type: 'main', index: 0 }]],
  };
  c['CODE — Build Update Form'] = {
    main: [[{ node: 'FORM — Update Project', type: 'main', index: 0 }]],
  };
  c['FORM — Update Project'] = {
    main: [[{ node: 'Process Update Logic', type: 'main', index: 0 }]],
  };
  c['Process Update Logic'] = {
    main: [[{ node: 'Prepare Update Row', type: 'main', index: 0 }]],
  };
  c['Prepare Update Row'] = {
    main: [[{ node: 'UPDATE — Project', type: 'main', index: 0 }]],
  };
  c['UPDATE — Project'] = {
    main: [[{ node: 'Summary — Project Updated', type: 'main', index: 0 }]],
  };

  // Ensure create path still starts from READ — Team (already connected downstream)
  // Remove any stale connection from form hub directly to READ Team if present elsewhere

  const payload = {
    name: '[Studio OS] 01 - Projects Hub',
    nodes: wf.nodes,
    connections: c,
    settings: wf.settings,
  };

  const put = await fetch(`http://localhost:5678/api/v1/workflows/${WF_ID}`, {
    method: 'PUT',
    headers: {
      'X-N8N-API-KEY': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const out = await put.json();
  if (!put.ok) {
    console.error(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  console.log('Updated:', out.name, 'id=', out.id);
  console.log(
    'Nodes:',
    out.nodes.map((n) => n.name).join(' | ')
  );
  console.log(
    'Hub form fields:',
    out.nodes.find((n) => n.name === 'FORM — Projects Hub').parameters.formFields.values
  );
  console.log('Create branch from IF:', out.connections['IF — Create Project?'].main[0]);
  console.log('Update branch from IF:', out.connections['IF — Create Project?'].main[1]);
})();
