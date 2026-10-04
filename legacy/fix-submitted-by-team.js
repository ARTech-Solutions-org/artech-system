/**
 * Update path: Submitted By dropdown from Team sheet
 */
const key = process.env.N8N_API_KEY;
if (!key) {
  console.error('Set N8N_API_KEY');
  process.exit(1);
}

const WF_ID = 'CucijOQolo68IGMR';

const buildUpdateFormCode = `const projects = $('READ — Projects For Update').all().map(i => i.json).filter(r => r.Project_ID || r.Project_Name);
const team = $('READ — Team For Update').all().map(i => i.json).filter(r => r.Name || r.Team_ID);

const options = projects
  .map(p => {
    const id = String(p.Project_ID || '').trim();
    const name = String(p.Project_Name || '').trim();
    const client = String(p.Client || '').trim();
    const status = String(p.Status || '').trim();
    if (!id && !name) return null;
    const label = [id || 'NO-ID', client || 'No client', name || 'Untitled', status ? '(' + status + ')' : '']
      .filter(Boolean)
      .join(' | ');
    return { option: label };
  })
  .filter(Boolean);

if (!options.length) {
  options.push({ option: 'No projects found — create one first' });
}

const teamOptions = [];
const seen = new Set();
for (const t of team) {
  if (String(t.Status || '') === 'Off') continue;
  const name = String(t.Name || '').trim();
  if (!name || seen.has(name.toLowerCase())) continue;
  seen.add(name.toLowerCase());
  teamOptions.push({ option: name });
}
if (!teamOptions.length) {
  teamOptions.push({ option: 'No team members found' });
}

const statusOptions = ["New","Planning","Waiting Assets","Development","Internal Review","Client Review","Changes Required","Approved","Deployment","Completed","Blocked"].map(s => ({ option: s }));

return [{
  json: {
    form_fields: [
      {
        fieldLabel: 'Project',
        fieldType: 'dropdown',
        requiredField: true,
        fieldOptions: { values: options },
      },
      {
        fieldLabel: 'Submitted By',
        fieldType: 'dropdown',
        requiredField: true,
        fieldOptions: { values: teamOptions },
      },
      {
        fieldLabel: 'Status',
        fieldType: 'dropdown',
        requiredField: false,
        fieldOptions: { values: statusOptions },
      },
      {
        fieldLabel: 'Demo Link',
        fieldType: 'text',
        placeholder: 'Video / Loom / Drive demo',
      },
      {
        fieldLabel: 'Build Link',
        fieldType: 'text',
        placeholder: 'Unity build / APK / zip',
      },
      {
        fieldLabel: 'Website Link',
        fieldType: 'text',
        placeholder: 'Staging or live URL',
      },
      {
        fieldLabel: 'Testing Instructions',
        fieldType: 'textarea',
        placeholder: 'How to test this build/demo',
      },
      {
        fieldLabel: 'Installation Instructions',
        fieldType: 'textarea',
        placeholder: 'Install / deploy steps',
      },
      {
        fieldLabel: 'Notes',
        fieldType: 'textarea',
        placeholder: 'What changed / blockers',
      },
    ],
  },
}];`;

(async () => {
  const wf = await (
    await fetch(`http://localhost:5678/api/v1/workflows/${WF_ID}`, {
      headers: { 'X-N8N-API-KEY': key },
    })
  ).json();

  const readTeam = wf.nodes.find((n) => n.name === 'READ — Team');

  const teamNode = {
    id: 'read-team-for-update',
    name: 'READ — Team For Update',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [720, 480],
    parameters: JSON.parse(JSON.stringify(readTeam.parameters)),
    credentials: JSON.parse(JSON.stringify(readTeam.credentials)),
    alwaysOutputData: true,
  };

  const idxTeam = wf.nodes.findIndex((n) => n.name === 'READ — Team For Update');
  if (idxTeam >= 0) wf.nodes[idxTeam] = teamNode;
  else wf.nodes.push(teamNode);

  const build = wf.nodes.find((n) => n.name === 'CODE — Build Update Form');
  build.parameters.jsCode = buildUpdateFormCode;
  build.position = [960, 480];

  const formUpd = wf.nodes.find((n) => n.name === 'FORM — Update Project');
  if (formUpd) formUpd.position = [1200, 480];

  const proc = wf.nodes.find((n) => n.name === 'Process Update Logic');
  if (proc && !proc.parameters.jsCode.includes('No team members found')) {
    proc.parameters.jsCode = proc.parameters.jsCode.replace(
      "if (!submittedBy) throw new Error('Submitted By is required.');",
      "if (!submittedBy || submittedBy === 'No team members found') throw new Error('Submitted By is required — pick a team member.');"
    );
  }

  wf.connections['READ — Projects For Update'] = {
    main: [[{ node: 'READ — Team For Update', type: 'main', index: 0 }]],
  };
  wf.connections['READ — Team For Update'] = {
    main: [[{ node: 'CODE — Build Update Form', type: 'main', index: 0 }]],
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

  const code = out.nodes.find((n) => n.name === 'CODE — Build Update Form').parameters
    .jsCode;
  console.log('Updated Submitted By → Team dropdown');
  console.log(
    'has team read:',
    code.includes("READ — Team For Update")
  );
  console.log(
    'path:',
    out.connections['READ — Projects For Update'].main[0][0].node,
    '→',
    out.connections['READ — Team For Update'].main[0][0].node
  );
})();
