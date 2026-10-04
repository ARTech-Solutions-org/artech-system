const key = process.env.N8N_API_KEY;
const id = 'CucijOQolo68IGMR';

(async () => {
  const wf = await (
    await fetch(`http://localhost:5678/api/v1/workflows/${id}`, {
      headers: { 'X-N8N-API-KEY': key },
    })
  ).json();

  const ensureCode = `const items = $input.all();
if (!items.length) {
  return [{ json: { _empty_sheet: true } }];
}
return items;`;

  const names = new Set(wf.nodes.map((n) => n.name));

  if (!names.has('Ensure Projects Continue')) {
    wf.nodes.push({
      id: 'ensure-projects',
      name: 'Ensure Projects Continue',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1320, 200],
      parameters: {
        language: 'javaScript',
        mode: 'runOnceForAllItems',
        jsCode: ensureCode,
      },
    });
  }

  if (!names.has('Ensure Reservations Continue')) {
    wf.nodes.push({
      id: 'ensure-reservations',
      name: 'Ensure Reservations Continue',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1320, 400],
      parameters: {
        language: 'javaScript',
        mode: 'runOnceForAllItems',
        jsCode: ensureCode,
      },
    });
  }

  // Keep Process Project Logic reading from the READ nodes (not ensure nodes)
  wf.connections['READ — Projects'] = {
    main: [[{ node: 'Ensure Projects Continue', type: 'main', index: 0 }]],
  };
  wf.connections['Ensure Projects Continue'] = {
    main: [[{ node: 'READ — Reservations', type: 'main', index: 0 }]],
  };
  wf.connections['READ — Reservations'] = {
    main: [[{ node: 'Ensure Reservations Continue', type: 'main', index: 0 }]],
  };
  wf.connections['Ensure Reservations Continue'] = {
    main: [[{ node: 'Process Project Logic', type: 'main', index: 0 }]],
  };

  const setup = wf.nodes.find((n) => n.name === 'SETUP');
  if (setup) {
    setup.parameters.content += `\n\nNote: empty Projects/Reservations sheets are OK — workflow continues and creates the first row.`;
  }

  const put = await fetch(`http://localhost:5678/api/v1/workflows/${id}`, {
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

  const text = await put.text();
  if (!put.ok) {
    console.error('FAIL', put.status, text.slice(0, 500));
    process.exit(1);
  }
  console.log('OK fixed empty-sheet stop');
})();
