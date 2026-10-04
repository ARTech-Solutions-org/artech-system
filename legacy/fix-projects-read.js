/**
 * Fix READ — Projects failures:
 * - Use sheet tab name (not stale gid)
 * - Retry on Google 503
 * - Point Projects/Technician to the same workbook as Team (known working)
 * - Ensure header row exists via optional seed note
 */
const key = process.env.N8N_API_KEY;
if (!key) {
  console.error('Set N8N_API_KEY');
  process.exit(1);
}

const API = process.env.N8N_API_URL || 'http://localhost:5678';
const WF_ID = 'CucijOQolo68IGMR';

// Team workbook reads successfully — Projects tab should live here too
const MAIN_DOC = process.env.MAIN_SHEET_ID || '1GrxxzPg0DilXLxOi4ap8Ar7hwl24k8Gp00sl-RYkeR0';
const EQUIPMENT_DOC = process.env.EQUIPMENT_SHEET_ID || '1Cq9G7E6Ow-ajTc_7MRS8yhTn4yzh7ELgVQSWZLCTmik';

const TAB_DOCS = {
  Projects: MAIN_DOC,
  Team: MAIN_DOC,
  Technician: MAIN_DOC,
  Equipment: EQUIPMENT_DOC,
};

function sheetByName(tab) {
  return { __rl: true, mode: 'name', value: tab };
}

function docId(id) {
  return { __rl: true, mode: 'id', value: id };
}

function tabFromNode(node) {
  const sn = node.parameters?.sheetName;
  if (!sn) return '';
  if (typeof sn === 'string') return sn;
  return sn.cachedResultName || sn.value || '';
}

(async () => {
  const wf = await (
    await fetch(`${API}/api/v1/workflows/${WF_ID}`, {
      headers: { 'X-N8N-API-KEY': key },
    })
  ).json();

  let patched = 0;
  for (const node of wf.nodes) {
    if (node.type !== 'n8n-nodes-base.googleSheets') continue;

    const tab = tabFromNode(node);
    const doc = TAB_DOCS[tab];
    if (doc && node.parameters.documentId) {
      node.parameters.documentId = docId(doc);
    }

    if (tab) {
      node.parameters.sheetName = sheetByName(tab);
    }

    node.retryOnFail = true;
    node.maxTries = 5;
    node.waitBetweenTries = 2000;
    node.alwaysOutputData = true;
    patched += 1;
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

  console.log(`Patched ${patched} Google Sheets nodes.`);
  console.log('Projects/Team/Technician workbook:', MAIN_DOC);
  console.log('Equipment workbook:', EQUIPMENT_DOC);
  console.log('');
  console.log('IMPORTANT: In your main Google Sheet, add a tab named "Projects" with this header row:');
  console.log('Project_Name,Assets,Assigned_Developer,Devices_Needed,Deadline,Build_Link,Video_Link,Status');
  console.log('(Empty data rows are OK — the workflow creates the first project.)');
})();
