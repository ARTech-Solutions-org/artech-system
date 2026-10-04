/**
 * Add Amount/Available to Equipment and Qty to Reservations; seed Amount/Available.
 */
const key = process.env.N8N_API_KEY;
if (!key) {
  console.error('Set N8N_API_KEY');
  process.exit(1);
}

const EQUIP_DOC = '1SOpTC6zINBOVdJW8rp7k1o00Dlx8Tl9Pw-2FC8Aqx6I';
const RES_DOC = '1NqirW6xNUJHzMUu8JNlnxaV2jNxpAugZTn3tJJu07hA';

const nodes = [
  {
    id: 'wh',
    name: 'Webhook',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [0, 300],
    webhookId: 'studio-os-equip-cols',
    parameters: {
      httpMethod: 'POST',
      path: 'studio-os-equip-cols',
      responseMode: 'lastNode',
      options: {},
    },
  },
  {
    id: 'getEq',
    name: 'GET Equipment',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [220, 200],
    parameters: {
      method: 'GET',
      url: `=https://sheets.googleapis.com/v4/spreadsheets/${EQUIP_DOC}/values/Equipment`,
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
    id: 'prepEq',
    name: 'Prepare Equipment Values',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [440, 200],
    parameters: {
      jsCode: `const values = $json.values || [];
if (!values.length) throw new Error('Equipment sheet empty');
const header = values[0].map(String);
const need = ['Amount', 'Available'];
for (const h of need) if (!header.includes(h)) header.push(h);
const amountIdx = header.indexOf('Amount');
const availableIdx = header.indexOf('Available');
const statusIdx = header.indexOf('Status');

const rows = [header];
for (let i = 1; i < values.length; i++) {
  const row = [...values[i]];
  while (row.length < header.length) row.push('');
  const status = String(row[statusIdx] || 'Available');
  let amount = Number(row[amountIdx]);
  if (!Number.isFinite(amount) || amount <= 0) amount = 1;
  row[amountIdx] = String(amount);
  let available = Number(row[availableIdx]);
  if (!Number.isFinite(available) || String(values[i][availableIdx] || '').trim() === '') {
    available = ['Broken', 'Maintenance', 'Installed', 'Reserved'].includes(status) ? 0 : amount;
  }
  row[availableIdx] = String(Math.max(0, Math.min(amount, available)));
  rows.push(row);
}
return [{ json: { range: 'Equipment', values: rows, rows: rows.length } }];`,
    },
  },
  {
    id: 'putEq',
    name: 'PUT Equipment',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [660, 200],
    parameters: {
      method: 'PUT',
      url: `=https://sheets.googleapis.com/v4/spreadsheets/${EQUIP_DOC}/values/{{ $json.range }}?valueInputOption=RAW`,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleSheetsOAuth2Api',
      sendBody: true,
      specifyBody: 'json',
      jsonBody:
        '={{ { range: $json.range, majorDimension: "ROWS", values: $json.values } }}',
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
    id: 'getRes',
    name: 'GET Reservations Header',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [220, 420],
    parameters: {
      method: 'GET',
      url: `=https://sheets.googleapis.com/v4/spreadsheets/${RES_DOC}/values/Reservations!1:1`,
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
    id: 'prepRes',
    name: 'Prepare Reservations Header',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [440, 420],
    parameters: {
      jsCode: `const row = ($json.values && $json.values[0]) ? $json.values[0].map(String) : [];
const need = ['Qty'];
const missing = need.filter(h => !row.includes(h));
// Insert Qty after End_Date if possible
let next = row.slice();
if (missing.includes('Qty') && !next.includes('Qty')) {
  const endIdx = next.indexOf('End_Date');
  if (endIdx >= 0) next.splice(endIdx + 1, 0, 'Qty');
  else next.push('Qty');
}
return [{ json: { missing, range: 'Reservations!1:1', values: [next] } }];`,
    },
  },
  {
    id: 'putRes',
    name: 'PUT Reservations Header',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [660, 420],
    parameters: {
      method: 'PUT',
      url: `=https://sheets.googleapis.com/v4/spreadsheets/${RES_DOC}/values/{{ $json.range }}?valueInputOption=RAW`,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleSheetsOAuth2Api',
      sendBody: true,
      specifyBody: 'json',
      jsonBody:
        '={{ { range: $json.range, majorDimension: "ROWS", values: $json.values } }}',
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
    id: 'merge',
    name: 'Merge',
    type: 'n8n-nodes-base.merge',
    typeVersion: 3,
    position: [880, 300],
    parameters: { mode: 'combine', combineBy: 'combineAll', options: {} },
  },
  {
    id: 'sum',
    name: 'Summary',
    type: 'n8n-nodes-base.set',
    typeVersion: 3.4,
    position: [1100, 300],
    parameters: {
      assignments: {
        assignments: [
          {
            id: '1',
            name: 'equipment',
            value: '={{ $("PUT Equipment").first().json.updatedCells || $("PUT Equipment").first().json }}',
            type: 'string',
          },
          {
            id: '2',
            name: 'reservations',
            value: '={{ $("PUT Reservations Header").first().json.updatedCells || $("PUT Reservations Header").first().json }}',
            type: 'string',
          },
        ],
      },
      options: {},
    },
  },
];

const connections = {
  Webhook: {
    main: [
      [
        { node: 'GET Equipment', type: 'main', index: 0 },
        { node: 'GET Reservations Header', type: 'main', index: 0 },
      ],
    ],
  },
  'GET Equipment': { main: [[{ node: 'Prepare Equipment Values', type: 'main', index: 0 }]] },
  'Prepare Equipment Values': { main: [[{ node: 'PUT Equipment', type: 'main', index: 0 }]] },
  'PUT Equipment': { main: [[{ node: 'Merge', type: 'main', index: 0 }]] },
  'GET Reservations Header': {
    main: [[{ node: 'Prepare Reservations Header', type: 'main', index: 0 }]],
  },
  'Prepare Reservations Header': {
    main: [[{ node: 'PUT Reservations Header', type: 'main', index: 0 }]],
  },
  'PUT Reservations Header': { main: [[{ node: 'Merge', type: 'main', index: 1 }]] },
  Merge: { main: [[{ node: 'Summary', type: 'main', index: 0 }]] },
};

(async () => {
  const list = await (
    await fetch('http://localhost:5678/api/v1/workflows', {
      headers: { 'X-N8N-API-KEY': key },
    })
  ).json();
  const workflows = list.data || list;
  const existing = Array.isArray(workflows)
    ? workflows.find((w) => w.name === '[Studio OS] Setup - Equipment Columns')
    : null;

  const body = {
    name: '[Studio OS] Setup - Equipment Columns',
    nodes,
    connections,
    settings: { executionOrder: 'v1' },
  };

  let id = existing?.id;
  if (id) {
    const put = await fetch(`http://localhost:5678/api/v1/workflows/${id}`, {
      method: 'PUT',
      headers: {
        'X-N8N-API-KEY': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const wf = await put.json();
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
    const wf = await post.json();
    if (!post.ok) throw new Error(JSON.stringify(wf));
    id = wf.id;
  }

  await fetch(`http://localhost:5678/api/v1/workflows/${id}/activate`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': key },
  });

  const res = await fetch('http://localhost:5678/webhook/studio-os-equip-cols', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  console.log('status', res.status, await res.text());

  await fetch(`http://localhost:5678/api/v1/workflows/${id}/deactivate`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': key },
  });
  console.log('done', id);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
