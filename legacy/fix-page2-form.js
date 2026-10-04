const key = process.env.N8N_API_KEY;
const id = 'CucijOQolo68IGMR';

(async () => {
  const wf = await (
    await fetch(`http://localhost:5678/api/v1/workflows/${id}`, {
      headers: { 'X-N8N-API-KEY': key },
    })
  ).json();

  const page2 = wf.nodes.find((n) => n.name === 'FORM — Assign Team & Equipment');
  page2.typeVersion = 2.2;
  page2.parameters = {
    operation: 'page',
    defineForm: 'json',
    jsonOutput: '={{ $json.form_fields }}',
    options: {
      formTitle: 'Assign Team & Equipment',
      formDescription:
        'Select team members and available equipment from Studio OS sheets.',
      buttonLabel: 'Create Project',
    },
  };
  if (!page2.webhookId) page2.webhookId = 'studio-os-assign-team-equipment';

  const trigger = wf.nodes.find((n) => n.name === 'FORM — New Project');
  trigger.parameters.responseMode = 'lastNode';

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
    console.error(put.status, text.slice(0, 600));
    process.exit(1);
  }
  const updated = JSON.parse(text);
  const p2 = updated.nodes.find((n) => n.name === 'FORM — Assign Team & Equipment');
  console.log(JSON.stringify(p2.parameters, null, 2));
})();
