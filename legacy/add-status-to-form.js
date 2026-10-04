/**
 * Add Status dropdown to [Studio OS] 01 - New Project form
 * and wire it through normalize + process logic.
 */
const key = process.env.N8N_API_KEY;
if (!key) {
  console.error('Set N8N_API_KEY');
  process.exit(1);
}

const WF_ID = 'CucijOQolo68IGMR';
const statuses = [
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

(async () => {
  const wf = await (
    await fetch(`http://localhost:5678/api/v1/workflows/${WF_ID}`, {
      headers: { 'X-N8N-API-KEY': key },
    })
  ).json();

  const form = wf.nodes.find((n) => n.name === 'FORM — New Project');
  const fields = form.parameters.formFields.values;

  if (!fields.some((f) => f.fieldLabel === 'Status')) {
    const priIdx = fields.findIndex((f) => f.fieldLabel === 'Priority');
    const statusField = {
      fieldLabel: 'Status',
      fieldType: 'dropdown',
      requiredField: false,
      fieldOptions: { values: statuses.map((option) => ({ option })) },
    };
    fields.splice(priIdx >= 0 ? priIdx + 1 : fields.length, 0, statusField);
  }

  const norm = wf.nodes.find((n) => n.name === 'Normalize Form Input');
  if (!norm.parameters.jsCode.includes("status: String(page1.Status")) {
    norm.parameters.jsCode = norm.parameters.jsCode.replace(
      "priority: String(page1.Priority || 'Medium').trim() || 'Medium',",
      "priority: String(page1.Priority || 'Medium').trim() || 'Medium',\n    status: String(page1.Status || 'New').trim() || 'New',"
    );
  }

  const logic = wf.nodes.find((n) => n.name === 'Process Project Logic');
  const oldBlock = `let status = 'Planning';
if (unavailable.length && availableEquipment.length === 0 && requested.length > 0) status = 'Blocked';
else if (unavailable.length) status = 'Blocked';
else status = 'Planning';

if (String(input.client_assets_status).toLowerCase().includes('waiting')) {
  // keep planning/blocked but note assets
}`;

  const newBlock = `const allowedStatuses = new Set([
  'New','Planning','Waiting Assets','Development','Internal Review',
  'Client Review','Changes Required','Approved','Deployment','Completed','Blocked'
]);
let status = String(input.status || 'New').trim() || 'New';
if (!allowedStatuses.has(status)) status = 'New';

// Auto-block only when equipment conflicts and user left default New
if (unavailable.length && status === 'New') status = 'Blocked';`;

  if (!logic.parameters.jsCode.includes('allowedStatuses')) {
    if (!logic.parameters.jsCode.includes(oldBlock)) {
      console.error('Could not find status block to replace');
      process.exit(1);
    }
    logic.parameters.jsCode = logic.parameters.jsCode.replace(oldBlock, newBlock);
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
      connections: wf.connections,
      settings: wf.settings,
    }),
  });

  const out = await put.json();
  if (!put.ok) {
    console.error(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const f2 = out.nodes.find((n) => n.name === 'FORM — New Project').parameters
    .formFields.values;
  console.log(
    'Form fields:',
    f2
      .map((x) => x.fieldLabel + (x.fieldType ? ` (${x.fieldType})` : ''))
      .join(' | ')
  );
  console.log(
    'normalize has status:',
    out.nodes
      .find((n) => n.name === 'Normalize Form Input')
      .parameters.jsCode.includes("status: String(page1.Status")
  );
  console.log(
    'process uses form status:',
    out.nodes
      .find((n) => n.name === 'Process Project Logic')
      .parameters.jsCode.includes('allowedStatuses')
  );
})();
