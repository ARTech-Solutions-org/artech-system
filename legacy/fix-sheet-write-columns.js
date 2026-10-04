/**
 * Fix Google Sheets write nodes — add columns.schema + autoMapInputData.
 */
const key = process.env.N8N_API_KEY;
if (!key) {
  console.error('Set N8N_API_KEY');
  process.exit(1);
}

const API = process.env.N8N_API_URL || 'http://localhost:5678';
const WF_ID = 'CucijOQolo68IGMR';

const SCHEMAS = {
  projects: ['Project_Name', 'Assets', 'Assigned_Developer', 'Devices_Needed', 'Deadline', 'Build_Link', 'Video_Link', 'Status'],
  equipment: ['Equipment_ID', 'Equipment_Name', 'Category', 'Amount', 'Available', 'Status', 'Location', 'Date_Needed_Until', 'Notes'],
  team: ['Team_ID', 'Name', 'Role', 'Email', 'Phone', 'Status', 'Current_Project', 'Available_From', 'Notes'],
  technician: ['Technician_ID', 'Project_Name', 'Technician', 'Equipment_Needed', 'Installation_Date', 'Status', 'Notes'],
};

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

const NODE_COLUMNS = {
  'CREATE — Project': { cols: SCHEMAS.projects, match: null },
  'UPDATE — Project': { cols: SCHEMAS.projects, match: 'Project_Name' },
  'UPDATE — Equipment': { cols: SCHEMAS.equipment, match: 'Equipment_ID' },
  'UPDATE — Release Equipment': { cols: SCHEMAS.equipment, match: 'Equipment_ID' },
  'UPDATE — Auto Release': { cols: SCHEMAS.equipment, match: 'Equipment_ID' },
  'UPDATE — Team': { cols: SCHEMAS.team, match: 'Team_ID' },
  'CREATE — Technician': { cols: SCHEMAS.technician, match: null },
};

(async () => {
  const wf = await (
    await fetch(`${API}/api/v1/workflows/${WF_ID}`, {
      headers: { 'X-N8N-API-KEY': key },
    })
  ).json();

  let fixed = 0;
  for (const node of wf.nodes) {
    const spec = NODE_COLUMNS[node.name];
    if (!spec) continue;
    node.parameters.columns = makeColumns(spec.cols, spec.match);
    fixed += 1;
    console.log('Fixed columns:', node.name);
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

  await fetch(`${API}/api/v1/workflows/${WF_ID}/activate`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': key },
  });

  console.log(`Done — ${fixed} write nodes patched.`);
})();
