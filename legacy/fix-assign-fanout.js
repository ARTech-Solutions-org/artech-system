/**
 * Fix Team→Equipment fan-out (equipment read once) + harden assign form.
 */
const key = process.env.N8N_API_KEY;
const WF_ID = 'CucijOQolo68IGMR';

const buildAssignCode = `const teamRaw = $('READ — Team').all().map(i => i.json).filter(r => r.Name || r.Team_ID);
const equipmentRaw = $('READ — Equipment').all().map(i => i.json).filter(r => r.Equipment_ID || r.Equipment_Name);

// Dedupe in case Sheets nodes fan-out
const team = [];
const teamSeen = new Set();
for (const t of teamRaw) {
  const k = String(t.Team_ID || t.Name).toLowerCase();
  if (teamSeen.has(k)) continue;
  teamSeen.add(k);
  team.push(t);
}

const equipment = [];
const eqSeen = new Set();
for (const e of equipmentRaw) {
  const k = String(e.Equipment_ID || e.Equipment_Name).toLowerCase();
  if (eqSeen.has(k)) continue;
  eqSeen.add(k);
  equipment.push(e);
}

const teamOptions = team
  .filter(t => String(t.Status || '') !== 'Off')
  .map(t => ({ option: String(t.Name).trim() }))
  .filter(o => o.option);

const uniqueTeam = [];
const seen = new Set();
for (const o of teamOptions) {
  const key = o.option.toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);
  uniqueTeam.push(o);
}

function stockByName(rows) {
  const map = new Map();
  for (const e of rows) {
    const name = String(e.Equipment_Name || '').trim();
    if (!name) continue;
    const amount = Number(e.Amount);
    const availCol = e.Available;
    let available;
    if (availCol !== undefined && availCol !== null && String(availCol).trim() !== '') {
      available = Number(availCol);
      if (!Number.isFinite(available)) available = 0;
    } else {
      const status = String(e.Status || 'Available');
      available = ['Broken', 'Maintenance', 'Installed', 'Reserved'].includes(status) ? 0 : (Number.isFinite(amount) && amount > 0 ? amount : 1);
    }
    const totalAmount = Number.isFinite(amount) && amount > 0 ? amount : Math.max(available, 1);
    const cur = map.get(name.toLowerCase()) || { name, available: 0, amount: 0, rows: [] };
    cur.available += Math.max(0, available);
    cur.amount += totalAmount;
    cur.rows.push(e);
    map.set(name.toLowerCase(), cur);
  }
  return [...map.values()].filter(g => g.available > 0);
}

const groups = stockByName(equipment);
const eqOptions = [];
for (const g of groups) {
  for (let q = 1; q <= g.available; q++) {
    eqOptions.push({
      option: g.name + ' | qty ' + q + ' (' + g.available + ' available)',
    });
  }
}

const none = [{ option: '(None)' }];
const form_fields = [
  {
    fieldLabel: 'Developer',
    fieldType: 'dropdown',
    requiredField: false,
    fieldOptions: { values: none.concat(uniqueTeam) },
  },
  {
    fieldLabel: 'Designer',
    fieldType: 'dropdown',
    requiredField: false,
    fieldOptions: { values: none.concat(uniqueTeam) },
  },
  {
    fieldLabel: 'Installer',
    fieldType: 'dropdown',
    requiredField: false,
    fieldOptions: { values: none.concat(uniqueTeam) },
  },
  {
    fieldLabel: 'Required Equipment',
    fieldType: 'dropdown',
    requiredField: false,
    fieldOptions: {
      values: eqOptions.length ? [{ option: '(None)' }].concat(eqOptions) : [{ option: '(No available equipment)' }],
    },
  },
  {
    fieldLabel: 'More Equipment',
    fieldType: 'dropdown',
    requiredField: false,
    fieldOptions: {
      values: eqOptions.length ? [{ option: '(None)' }].concat(eqOptions) : [{ option: '(No available equipment)' }],
    },
  },
  {
    fieldLabel: 'Reserve From',
    fieldType: 'date',
    requiredField: false,
  },
  {
    fieldLabel: 'Reserve Until',
    fieldType: 'date',
    requiredField: false,
  },
];

if (!uniqueTeam.length) {
  // still show form, with empty team note
  form_fields.unshift({
    fieldLabel: 'Warning',
    fieldType: 'html',
    html: '<p style="color:#b00">No team members found in Team sheet (or all are Off).</p>',
  });
}

return [{ json: { form_fields, _debug: { team: uniqueTeam.length, equipmentGroups: groups.length, equipmentRows: equipment.length } } }];`;

(async () => {
  const wf = await (
    await fetch(`http://localhost:5678/api/v1/workflows/${WF_ID}`, {
      headers: { 'X-N8N-API-KEY': key },
    })
  ).json();

  // Ensure assign form params
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

  wf.nodes.find((n) => n.name === 'CODE — Build Assignment Form').parameters.jsCode =
    buildAssignCode;

  // Insert collapse node after READ Team so Equipment runs once
  const collapse = {
    id: 'collapse-team',
    name: 'Collapse Team Rows',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [840, 160],
    parameters: {
      jsCode: `// Force a single item so READ — Equipment does not fan-out
const rows = $input.all().map(i => i.json);
return [{ json: { team_count: rows.length, _ok: true } }];`,
    },
  };
  const idx = wf.nodes.findIndex((n) => n.name === 'Collapse Team Rows');
  if (idx >= 0) wf.nodes[idx] = collapse;
  else wf.nodes.push(collapse);

  wf.connections['READ — Team'] = {
    main: [[{ node: 'Collapse Team Rows', type: 'main', index: 0 }]],
  };
  wf.connections['Collapse Team Rows'] = {
    main: [[{ node: 'READ — Equipment', type: 'main', index: 0 }]],
  };

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
    'assign params ok:',
    out.nodes.find((n) => n.name === 'FORM — Assign Team & Equipment').parameters
      .jsonOutput
  );
  console.log(
    'collapse wired:',
    out.connections['READ — Team'].main[0][0].node,
    '→',
    out.connections['Collapse Team Rows'].main[0][0].node
  );
})();
