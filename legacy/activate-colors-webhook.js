const key = process.env.N8N_API_KEY;
const id = 'AZKMe9mlblS8IuEd';

(async () => {
  const wf = await (
    await fetch(`http://localhost:5678/api/v1/workflows/${id}`, {
      headers: { 'X-N8N-API-KEY': key },
    })
  ).json();

  wf.nodes = wf.nodes.map((n) => {
    if (n.name !== 'Manual Trigger') return n;
    return {
      id: 'webhook',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 300],
      webhookId: 'studio-os-sheet-colors',
      parameters: {
        httpMethod: 'POST',
        path: 'studio-os-sheet-colors',
        responseMode: 'lastNode',
        options: {},
      },
    };
  });

  const connections = { ...wf.connections };
  connections.Webhook = connections['Manual Trigger'];
  delete connections['Manual Trigger'];
  wf.connections = connections;

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
  const putText = await put.text();
  console.log('PUT', put.status);
  if (!put.ok) {
    console.log(putText.slice(0, 800));
    process.exit(1);
  }

  const act = await fetch(
    `http://localhost:5678/api/v1/workflows/${id}/activate`,
    {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': key },
    }
  );
  console.log('ACTIVATE', act.status, await act.text());
})();
