const key = process.env.N8N_API_KEY;
const WF_ID = 'CucijOQolo68IGMR';

(async () => {
  const wf = await (
    await fetch(`http://localhost:5678/api/v1/workflows/${WF_ID}`, {
      headers: { 'X-N8N-API-KEY': key },
    })
  ).json();

  const assign = wf.nodes.find((n) => n.name === 'FORM — Assign Team & Equipment');
  assign.parameters = {
    operation: 'page',
    formTitle: 'Assign Team & Equipment',
    formDescription:
      'Pick team members and available equipment with reservation dates. Only in-stock items are listed.',
    defineForm: 'json',
    jsonOutput: '={{ $json.form_fields }}',
    options: {},
  };
  if (!assign.webhookId) assign.webhookId = 'studio-os-assign-team-equipment';

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
  console.log(
    JSON.stringify(
      out.nodes.find((n) => n.name === 'FORM — Assign Team & Equipment').parameters,
      null,
      2
    )
  );
})();
