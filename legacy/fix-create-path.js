/**
 * Fix create path: add missing READ — Equipment (Logic) + wire chain to Process Create Logic.
 */
const key = process.env.N8N_API_KEY;
if (!key) {
  console.error('Set N8N_API_KEY');
  process.exit(1);
}

const API = process.env.N8N_API_URL || 'http://localhost:5678';
const WF_ID = 'CucijOQolo68IGMR';
const EQUIPMENT_DOC = process.env.EQUIPMENT_SHEET_ID || '1Cq9G7E6Ow-ajTc_7MRS8yhTn4yzh7ELgVQSWZLCTmik';

(async () => {
  const wf = await (
    await fetch(`${API}/api/v1/workflows/${WF_ID}`, {
      headers: { 'X-N8N-API-KEY': key },
    })
  ).json();

  let equipLogic = wf.nodes.find((n) => n.name === 'READ — Equipment (Logic)');
  if (!equipLogic) {
    const formEquip = wf.nodes.find((n) => n.name === 'READ — Equipment (Form)');
    equipLogic = {
      id: 'read-equip-logic',
      name: 'READ — Equipment (Logic)',
      type: 'n8n-nodes-base.googleSheets',
      typeVersion: 4.5,
      position: formEquip?.position ? [formEquip.position[0], formEquip.position[1] + 140] : [1984, 200],
      parameters: {
        documentId: { __rl: true, mode: 'id', value: EQUIPMENT_DOC },
        sheetName: { __rl: true, mode: 'name', value: 'Equipment' },
        options: {},
      },
      credentials: formEquip?.credentials || {
        googleSheetsOAuth2Api: { id: 'hPGaEBv6Ym0uVjSh', name: 'Google Sheets account' },
      },
      alwaysOutputData: true,
    };
    wf.nodes.push(equipLogic);
    console.log('Added missing node: READ — Equipment (Logic)');
  } else {
    equipLogic.parameters.documentId = { __rl: true, mode: 'id', value: EQUIPMENT_DOC };
    console.log('Found existing node: READ — Equipment (Logic)');
  }

  // Ensure Process Create Logic references the logic equipment read
  const process = wf.nodes.find((n) => n.name === 'Process Create Logic');
  if (process?.parameters?.jsCode) {
    process.parameters.jsCode = process.parameters.jsCode.replace(
      "$('READ — Equipment (Form)')",
      "$('READ — Equipment (Logic)')"
    );
    if (!process.parameters.jsCode.includes("$('READ — Equipment (Logic)')")) {
      process.parameters.jsCode = process.parameters.jsCode.replace(
        /\$\('READ — Equipment'\)/g,
        "$('READ — Equipment (Logic)')"
      );
    }
  }

  // Chain: Normalize → Projects → Equipment (Logic) → Team (Logic) → Process Create
  wf.connections['Normalize Create Input'] = {
    main: [[{ node: 'READ — Projects', type: 'main', index: 0 }]],
  };
  wf.connections['READ — Projects'] = {
    main: [[{ node: 'READ — Equipment (Logic)', type: 'main', index: 0 }]],
  };
  wf.connections['READ — Equipment (Logic)'] = {
    main: [[{ node: 'READ — Team (Logic)', type: 'main', index: 0 }]],
  };
  wf.connections['READ — Team (Logic)'] = {
    main: [[{ node: 'Process Create Logic', type: 'main', index: 0 }]],
  };

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

  console.log('Create path fixed. Chain: Projects → Equipment (Logic) → Team (Logic) → Process Create → Sheets');
  console.log('Test at: http://localhost:5678/form/studio-os-new-project');
})();
