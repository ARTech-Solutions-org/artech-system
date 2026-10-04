const key = process.env.N8N_API_KEY;
const id = 'CucijOQolo68IGMR';

const REMOVE_NODES = new Set([
  'Prepare Reservation Rows',
  'CREATE — Reservations',
  'IF — Has Reservations?',
  'Prepare Notification Rows',
  'CREATE — Notifications',
  'IF — Has Notifications?',
]);

(async () => {
  const r = await fetch(`http://localhost:5678/api/v1/workflows/${id}`, {
    headers: { 'X-N8N-API-KEY': key },
  });
  const wf = await r.json();

  // Remove reservation/notification writer nodes
  wf.nodes = wf.nodes.filter((n) => !REMOVE_NODES.has(n.name));

  // Update SETUP note
  const setup = wf.nodes.find((n) => n.name === 'SETUP');
  if (setup) {
    setup.parameters.content = `## [Studio OS] 01 - New Project

1. Create Google Sheet **Studio_OS**
2. Import CSVs from \`C:\\\\n8n\\\\studio-os\\\\sheet-templates\`
3. Connect **Google Sheets OAuth2** on every Sheets node
4. Replace Sheet ID in all Sheets nodes
5. Test via Form (do not activate until validated)

This version creates the Project, updates Equipment + Team.
Reservation writes and Notification writes are disabled.`;
  }

  // Soften Process Project Logic: keep availability checks, but stop producing reservation/notification rows
  const logic = wf.nodes.find((n) => n.name === 'Process Project Logic');
  if (logic && logic.parameters.jsCode) {
    let code = logic.parameters.jsCode;

    // Force empty write arrays at the end return for non-duplicate path
    // Safer: after building arrays, clear reservation_rows and notification_rows before return
    if (!code.includes('// RESERVATIONS_NOTIFICATIONS_DISABLED')) {
      code = code.replace(
        /return \[\{\s*json: \{\s*is_duplicate: false,/,
        `// RESERVATIONS_NOTIFICATIONS_DISABLED
reservationRows.length = 0;
notificationRows.length = 0;

return [{
  json: {
    is_duplicate: false,`
      );
      logic.parameters.jsCode = code;
    }
  }

  // Rebuild connections without removed nodes
  const connections = {
    'FORM — New Project': {
      main: [[{ node: 'Normalize Form Input', type: 'main', index: 0 }]],
    },
    'Normalize Form Input': {
      main: [[{ node: 'READ — Projects', type: 'main', index: 0 }]],
    },
    'READ — Projects': {
      main: [[{ node: 'READ — Equipment', type: 'main', index: 0 }]],
    },
    'READ — Equipment': {
      main: [[{ node: 'READ — Reservations', type: 'main', index: 0 }]],
    },
    'READ — Reservations': {
      main: [[{ node: 'READ — Team', type: 'main', index: 0 }]],
    },
    'READ — Team': {
      main: [[{ node: 'Process Project Logic', type: 'main', index: 0 }]],
    },
    'Process Project Logic': {
      main: [[{ node: 'IF — Duplicate Submission?', type: 'main', index: 0 }]],
    },
    'IF — Duplicate Submission?': {
      main: [
        [{ node: 'Summary — Duplicate', type: 'main', index: 0 }],
        [{ node: 'Prepare Project Row', type: 'main', index: 0 }],
      ],
    },
    'Prepare Project Row': {
      main: [[{ node: 'CREATE — Project', type: 'main', index: 0 }]],
    },
    'CREATE — Project': {
      main: [[{ node: 'Prepare Equipment Rows', type: 'main', index: 0 }]],
    },
    'Prepare Equipment Rows': {
      main: [[{ node: 'IF — Has Equipment Updates?', type: 'main', index: 0 }]],
    },
    'IF — Has Equipment Updates?': {
      main: [
        [{ node: 'UPDATE — Equipment', type: 'main', index: 0 }],
        [{ node: 'Prepare Team Rows', type: 'main', index: 0 }],
      ],
    },
    'UPDATE — Equipment': {
      main: [[{ node: 'Prepare Team Rows', type: 'main', index: 0 }]],
    },
    'Prepare Team Rows': {
      main: [[{ node: 'IF — Has Team Updates?', type: 'main', index: 0 }]],
    },
    'IF — Has Team Updates?': {
      main: [
        [{ node: 'UPDATE — Team', type: 'main', index: 0 }],
        [{ node: 'Summary — Project Created', type: 'main', index: 0 }],
      ],
    },
    'UPDATE — Team': {
      main: [[{ node: 'Summary — Project Created', type: 'main', index: 0 }]],
    },
  };

  const payload = {
    name: wf.name,
    nodes: wf.nodes,
    connections,
    settings: wf.settings,
  };

  const put = await fetch(`http://localhost:5678/api/v1/workflows/${id}`, {
    method: 'PUT',
    headers: {
      'X-N8N-API-KEY': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await put.text();
  if (!put.ok) {
    console.error('FAIL', put.status, text.slice(0, 500));
    process.exit(1);
  }
  const updated = JSON.parse(text);
  console.log('OK', updated.name, 'nodes=', updated.nodes.length);
  console.log(
    'remaining:',
    updated.nodes.map((n) => n.name).join(' | ')
  );
})();
