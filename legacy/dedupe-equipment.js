/**
 * Deduplicate Equipment sheet by Equipment_ID (keep one row each).
 */
const key = process.env.N8N_API_KEY;
const DOC = '1SOpTC6zINBOVdJW8rp7k1o00Dlx8Tl9Pw-2FC8Aqx6I';

const nodes = [
  {
    id: 'wh',
    name: 'Webhook',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [0, 300],
    webhookId: 'studio-os-dedupe-equip',
    parameters: {
      httpMethod: 'POST',
      path: 'studio-os-dedupe-equip',
      responseMode: 'lastNode',
      options: {},
    },
  },
  {
    id: 'get',
    name: 'GET Equipment',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [220, 300],
    parameters: {
      method: 'GET',
      url: `=https://sheets.googleapis.com/v4/spreadsheets/${DOC}/values/Equipment`,
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
    name: 'Dedupe',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [440, 300],
    parameters: {
      jsCode: `const values = $json.values || [];
const header = (values[0] || []).map(String);
const idIdx = header.indexOf('Equipment_ID');
const amountIdx = header.indexOf('Amount');
const availableIdx = header.indexOf('Available');
const statusIdx = header.indexOf('Status');
if (idIdx < 0) throw new Error('Equipment_ID column missing');

const map = new Map();
for (let i = 1; i < values.length; i++) {
  const row = [...values[i]];
  while (row.length < header.length) row.push('');
  const id = String(row[idIdx] || '').trim();
  if (!id) continue;
  // keep last non-empty occurrence (most recently written)
  map.set(id, row);
}

const rows = [header];
for (const row of map.values()) {
  let amount = Number(row[amountIdx]);
  if (!Number.isFinite(amount) || amount <= 0) amount = 1;
  row[amountIdx] = String(amount);
  let available = Number(row[availableIdx]);
  const status = String(row[statusIdx] || 'Available');
  if (!Number.isFinite(available)) {
    available = ['Reserved', 'Broken', 'Maintenance', 'Installed'].includes(status) ? 0 : amount;
  }
  available = Math.max(0, Math.min(amount, available));
  row[availableIdx] = String(available);
  if (available > 0) row[statusIdx] = 'Available';
  else if (!['Broken', 'Maintenance', 'Installed'].includes(status)) row[statusIdx] = 'Reserved';
  rows.push(row);
}

return [{
  json: {
    before: values.length - 1,
    after: rows.length - 1,
    range: 'Equipment',
    values: rows,
  }
}];`,
    },
  },
  {
    id: 'clear',
    name: 'Clear Sheet',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [660, 300],
    parameters: {
      method: 'POST',
      url: `=https://sheets.googleapis.com/v4/spreadsheets/${DOC}/values/Equipment:clear`,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleSheetsOAuth2Api',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ {} }}',
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
    id: 'put',
    name: 'PUT Equipment',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [880, 300],
    parameters: {
      method: 'PUT',
      url: `=https://sheets.googleapis.com/v4/spreadsheets/${DOC}/values/Equipment?valueInputOption=RAW`,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleSheetsOAuth2Api',
      sendBody: true,
      specifyBody: 'json',
      jsonBody:
        '={{ { range: "Equipment", majorDimension: "ROWS", values: $("Dedupe").first().json.values } }}',
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
            name: 'before',
            value: '={{ $("Dedupe").first().json.before }}',
            type: 'number',
          },
          {
            id: '2',
            name: 'after',
            value: '={{ $("Dedupe").first().json.after }}',
            type: 'number',
          },
          {
            id: '3',
            name: 'updatedCells',
            value: '={{ $json.updatedCells }}',
            type: 'number',
          },
        ],
      },
      options: {},
    },
  },
];

const connections = {
  Webhook: { main: [[{ node: 'GET Equipment', type: 'main', index: 0 }]] },
  'GET Equipment': { main: [[{ node: 'Dedupe', type: 'main', index: 0 }]] },
  Dedupe: { main: [[{ node: 'Clear Sheet', type: 'main', index: 0 }]] },
  'Clear Sheet': { main: [[{ node: 'PUT Equipment', type: 'main', index: 0 }]] },
  'PUT Equipment': { main: [[{ node: 'Summary', type: 'main', index: 0 }]] },
};

(async () => {
  const list = await (
    await fetch('http://localhost:5678/api/v1/workflows', {
      headers: { 'X-N8N-API-KEY': key },
    })
  ).json();
  const workflows = list.data || list;
  const existing = workflows.find((w) => w.name === '[Studio OS] Setup - Dedupe Equipment');
  const body = {
    name: '[Studio OS] Setup - Dedupe Equipment',
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
    if (!put.ok) throw new Error(await put.text());
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
  const res = await fetch('http://localhost:5678/webhook/studio-os-dedupe-equip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  console.log(await res.text());
  await fetch(`http://localhost:5678/api/v1/workflows/${id}/deactivate`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': key },
  });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
