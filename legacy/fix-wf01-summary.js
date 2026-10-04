const key = process.env.N8N_API_KEY;
const id = 'CucijOQolo68IGMR';

(async () => {
  const r = await fetch('http://localhost:5678/api/v1/workflows/' + id, {
    headers: { 'X-N8N-API-KEY': key },
  });
  const wf = await r.json();
  const ifName = 'IF — Has Notifications?';
  const summary = 'Summary — Project Created';
  const createNtf = 'CREATE — Notifications';

  if (!wf.connections[ifName]) wf.connections[ifName] = { main: [[], []] };
  if (!wf.connections[ifName].main[0]) wf.connections[ifName].main[0] = [];
  if (!wf.connections[ifName].main[1]) wf.connections[ifName].main[1] = [];

  // true -> create notifications
  wf.connections[ifName].main[0] = [{ node: createNtf, type: 'main', index: 0 }];
  // false -> summary directly
  wf.connections[ifName].main[1] = [{ node: summary, type: 'main', index: 0 }];
  wf.connections[createNtf] = {
    main: [[{ node: summary, type: 'main', index: 0 }]],
  };

  const payload = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings,
  };

  const put = await fetch('http://localhost:5678/api/v1/workflows/' + id, {
    method: 'PUT',
    headers: {
      'X-N8N-API-KEY': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await put.text();
  console.log('status', put.status);
  if (!put.ok) console.log(body.slice(0, 400));
  else console.log('WF01 summary path fixed');
})();
