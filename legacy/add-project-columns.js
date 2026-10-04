/**
 * Ensure Projects sheet has Website_Link, Testing_Instructions, etc. headers.
 */
const key = process.env.N8N_API_KEY;
if (!key) {
  console.error('Set N8N_API_KEY');
  process.exit(1);
}

const DOC = '1KXfojWoFoRfeOsfwV3wwX48_kPqn3lD0seQjaGnqFVc';
const NEEDED = [
  'Website_Link',
  'Testing_Instructions',
  'Installation_Instructions',
  'Last_Submitted_By',
  'Last_Update_Notes',
];

const nodes = [
  {
    id: 'wh',
    name: 'Webhook',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [0, 300],
    webhookId: 'studio-os-add-project-cols',
    parameters: {
      httpMethod: 'POST',
      path: 'studio-os-add-project-cols',
      responseMode: 'lastNode',
      options: {},
    },
  },
  {
    id: 'get',
    name: 'GET Header Row',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [240, 300],
    parameters: {
      method: 'GET',
      url: `=https://sheets.googleapis.com/v4/spreadsheets/${DOC}/values/Projects!1:1`,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleSheetsOAuth2Api',
      options: {},
    },
    credentials: {
      googleSheetsOAuth2Api: {
        id: 'hPGaEBv6Ym0uVjSh',
        name: 'Google Sheets account',
      },
    },
  },
  {
    id: 'prep',
    name: 'Prepare Headers',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [480, 300],
    parameters: {
      jsCode: `const needed = ${JSON.stringify(NEEDED)};
const row = ($json.values && $json.values[0]) ? $json.values[0].map(String) : [];
const missing = needed.filter(h => !row.includes(h));
const next = row.concat(missing);
return [{
  json: {
    missing,
    added: missing.length,
    range: 'Projects!1:1',
    values: [next],
    skip: missing.length === 0,
  }
}];`,
    },
  },
  {
    id: 'if',
    name: 'IF — Need Update?',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [720, 300],
    parameters: {
      conditions: {
        options: {
          caseSensitive: true,
          leftValue: '',
          typeValidation: 'loose',
          version: 2,
        },
        conditions: [
          {
            id: 'c1',
            leftValue: '={{ $json.skip }}',
            rightValue: false,
            operator: { type: 'boolean', operation: 'equals' },
          },
        ],
        combinator: 'and',
      },
      options: {},
    },
  },
  {
    id: 'put',
    name: 'PUT Headers',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [960, 200],
    parameters: {
      method: 'PUT',
      url: `=https://sheets.googleapis.com/v4/spreadsheets/${DOC}/values/{{ $json.range }}?valueInputOption=RAW`,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleSheetsOAuth2Api',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ { range: $json.range, majorDimension: "ROWS", values: $json.values } }}',
      options: {},
    },
    credentials: {
      googleSheetsOAuth2Api: {
        id: 'hPGaEBv6Ym0uVjSh',
        name: 'Google Sheets account',
      },
    },
  },
  {
    id: 'ok',
    name: 'Summary',
    type: 'n8n-nodes-base.set',
    typeVersion: 3.4,
    position: [1200, 300],
    parameters: {
      assignments: {
        assignments: [
          {
            id: '1',
            name: 'result',
            value: '={{ $json.updatedCells ? ("updated " + $json.updatedCells) : ("skipped, missing=" + JSON.stringify($("Prepare Headers").first().json.missing)) }}',
            type: 'string',
          },
          {
            id: '2',
            name: 'missing',
            value: '={{ $("Prepare Headers").first().json.missing }}',
            type: 'array',
          },
        ],
      },
      options: {},
    },
  },
];

const connections = {
  Webhook: { main: [[{ node: 'GET Header Row', type: 'main', index: 0 }]] },
  'GET Header Row': { main: [[{ node: 'Prepare Headers', type: 'main', index: 0 }]] },
  'Prepare Headers': { main: [[{ node: 'IF — Need Update?', type: 'main', index: 0 }]] },
  'IF — Need Update?': {
    main: [
      [{ node: 'PUT Headers', type: 'main', index: 0 }],
      [{ node: 'Summary', type: 'main', index: 0 }],
    ],
  },
  'PUT Headers': { main: [[{ node: 'Summary', type: 'main', index: 0 }]] },
};

(async () => {
  // create or reuse
  const list = await (
    await fetch('http://localhost:5678/api/v1/workflows', {
      headers: { 'X-N8N-API-KEY': key },
    })
  ).json();
  let id = (list.data || list).find?.(
    (w) => w.name === '[Studio OS] Setup - Add Project Columns'
  )?.id;
  // list format may be {data:[]}
  const workflows = list.data || list;
  const existing = Array.isArray(workflows)
    ? workflows.find((w) => w.name === '[Studio OS] Setup - Add Project Columns')
    : null;
  id = existing?.id;

  const body = {
    name: '[Studio OS] Setup - Add Project Columns',
    nodes,
    connections,
    settings: { executionOrder: 'v1' },
  };

  let wf;
  if (id) {
    const put = await fetch(`http://localhost:5678/api/v1/workflows/${id}`, {
      method: 'PUT',
      headers: {
        'X-N8N-API-KEY': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    wf = await put.json();
    if (!put.ok) throw new Error(JSON.stringify(wf));
  } else {
    const post = await fetch('http://localhost:5678/api/v1/workflows', {
      method: 'POST',
      headers: {
        'X-N8N-API-KEY': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    wf = await post.json();
    if (!post.ok) throw new Error(JSON.stringify(wf));
    id = wf.id;
  }

  await fetch(`http://localhost:5678/api/v1/workflows/${id}/activate`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': key },
  });

  const res = await fetch(
    'http://localhost:5678/webhook/studio-os-add-project-cols',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
  );
  const text = await res.text();
  console.log('webhook status', res.status, text);

  await fetch(`http://localhost:5678/api/v1/workflows/${id}/deactivate`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': key },
  });
  console.log('deactivated setup wf', id);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
