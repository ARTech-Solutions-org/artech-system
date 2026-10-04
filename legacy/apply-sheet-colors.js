const key = process.env.N8N_API_KEY;

function rgb(hex) {
  const h = hex.replace('#', '');
  return {
    red: parseInt(h.slice(0, 2), 16) / 255,
    green: parseInt(h.slice(2, 4), 16) / 255,
    blue: parseInt(h.slice(4, 6), 16) / 255,
  };
}

function statusRules(sheetId, statusColIndex, statuses) {
  // Apply to Status column rows 2..1000
  const requests = [];
  for (const [text, color] of Object.entries(statuses)) {
    requests.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [
            {
              sheetId,
              startRowIndex: 1,
              endRowIndex: 1000,
              startColumnIndex: statusColIndex,
              endColumnIndex: statusColIndex + 1,
            },
          ],
          booleanRule: {
            condition: {
              type: 'TEXT_EQ',
              values: [{ userEnteredValue: text }],
            },
            format: {
              backgroundColor: rgb(color),
            },
          },
        },
        index: 0,
      },
    });
  }
  return requests;
}

function headerFormat(sheetId, colCount) {
  return {
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: colCount,
      },
      cell: {
        userEnteredFormat: {
          backgroundColor: rgb('#2C3E50'),
          textFormat: {
            foregroundColor: rgb('#FFFFFF'),
            bold: true,
          },
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat)',
    },
  };
}

function tabColor(sheetId, colorHex) {
  return {
    updateSheetProperties: {
      properties: {
        sheetId,
        tabColorStyle: { rgbColor: rgb(colorHex) },
      },
      fields: 'tabColorStyle',
    },
  };
}

const SHEETS = [
  {
    name: 'Projects',
    doc: '1KXfojWoFoRfeOsfwV3wwX48_kPqn3lD0seQjaGnqFVc',
    gid: 1778111496,
    tab: '#4A90D9',
    statusCol: 9, // J
    cols: 21,
    statuses: {
      New: '#D6EAF8',
      Planning: '#E8DAEF',
      'Waiting Assets': '#FCF3CF',
      Development: '#AED6F1',
      'Internal Review': '#D1F2EB',
      'Client Review': '#FDEBD0',
      'Changes Required': '#FCE4D6',
      Approved: '#D5F5E3',
      Deployment: '#D2B4DE',
      Completed: '#ABEBC6',
      Blocked: '#F5B7B1',
    },
  },
  {
    name: 'Team',
    doc: '1zzIknZ261MrcqmxWKLlbQ3FMKq5YM7xafmWCJAADZFo',
    gid: 1001668082,
    tab: '#34A853',
    statusCol: 5, // F
    cols: 9,
    statuses: {
      Available: '#ABEBC6',
      Working: '#AED6F1',
      Waiting: '#FCF3CF',
      Blocked: '#F5B7B1',
      Off: '#D5D8DC',
    },
  },
  {
    name: 'Equipment',
    doc: '1SOpTC6zINBOVdJW8rp7k1o00Dlx8Tl9Pw-2FC8Aqx6I',
    gid: 1243002609,
    tab: '#F4A261',
    statusCol: 3, // D
    cols: 7,
    statuses: {
      Available: '#ABEBC6',
      Reserved: '#FDEBD0',
      Installed: '#AED6F1',
      Maintenance: '#FCF3CF',
      Broken: '#F5B7B1',
    },
  },
  {
    name: 'Reservations',
    doc: '1NqirW6xNUJHzMUu8JNlnxaV2jNxpAugZTn3tJJu07hA',
    gid: 103464818,
    tab: '#9B59B6',
    statusCol: 8, // I
    cols: 11,
    statuses: {
      Reserved: '#FDEBD0',
      Active: '#AED6F1',
      Returned: '#ABEBC6',
      Cancelled: '#D5D8DC',
    },
  },
];

function buildBody(sheet) {
  // Clear existing conditional format rules first by getting spreadsheet - we can't easily list without GET.
  // Adding rules is fine; duplicates may stack. Use deleteConditionalFormatRule in a loop is hard without knowing count.
  // Strategy: GET spreadsheet first in workflow, then delete all rules, then add.
  return {
    sheet: sheet.name,
    doc: sheet.doc,
    requests: [
      tabColor(sheet.gid, sheet.tab),
      headerFormat(sheet.gid, sheet.cols),
      ...statusRules(sheet.gid, sheet.statusCol, sheet.statuses),
    ],
  };
}

(async () => {
  const jobs = SHEETS.map(buildBody);

  const nodes = [
    {
      id: 'manual',
      name: 'Manual Trigger',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [0, 300],
      parameters: {},
    },
    {
      id: 'jobs',
      name: 'Build Color Jobs',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [220, 300],
      parameters: {
        language: 'javaScript',
        mode: 'runOnceForAllItems',
        jsCode: `return ${JSON.stringify(jobs)}.map(j => ({ json: j }));`,
      },
    },
    {
      id: 'getMeta',
      name: 'GET Spreadsheet Meta',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [440, 300],
      parameters: {
        method: 'GET',
        url: '=https://sheets.googleapis.com/v4/spreadsheets/{{ $json.doc }}?fields=sheets.properties,sheets.conditionalFormats',
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
      name: 'Prepare Batch Update',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [660, 300],
      parameters: {
        language: 'javaScript',
        mode: 'runOnceForEachItem',
        jsCode: `const job = $('Build Color Jobs').item.json;
const meta = $json;
const sheets = meta.sheets || [];
const target = sheets.find(s => String(s.properties?.sheetId) === String(job.requests[0]?.updateSheetProperties?.properties?.sheetId)) || sheets[0] || {};
const props = target.properties || {};
const sheetId = props.sheetId;

const deleteReqs = [];
const ruleCount = Array.isArray(target.conditionalFormats) ? target.conditionalFormats.length : 0;
for (let i = ruleCount - 1; i >= 0; i--) {
  deleteReqs.push({ deleteConditionalFormatRule: { sheetId, index: i } });
}

const requests = [
  ...deleteReqs,
  ...job.requests.map(r => {
    const copy = JSON.parse(JSON.stringify(r));
    if (copy.updateSheetProperties) copy.updateSheetProperties.properties.sheetId = sheetId;
    if (copy.repeatCell) copy.repeatCell.range.sheetId = sheetId;
    if (copy.addConditionalFormatRule) copy.addConditionalFormatRule.rule.ranges[0].sheetId = sheetId;
    return copy;
  }),
];

return {
  json: {
    sheet: job.sheet,
    doc: job.doc,
    body: { requests },
  },
};`,
      },
    },
    {
      id: 'apply',
      name: 'APPLY Colors',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [900, 300],
      parameters: {
        method: 'POST',
        url: '=https://sheets.googleapis.com/v4/spreadsheets/{{ $json.doc }}:batchUpdate',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'googleSheetsOAuth2Api',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ $json.body }}',
        options: {
          response: {
            response: {
              neverError: true,
            },
          },
        },
      },
      credentials: {
        googleSheetsOAuth2Api: {
          id: 'hPGaEBv6Ym0uVjSh',
          name: 'Google Sheets account',
        },
      },
      onError: 'continueRegularOutput',
    },
    {
      id: 'summary',
      name: 'Summary',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1120, 300],
      parameters: {
        language: 'javaScript',
        mode: 'runOnceForAllItems',
        jsCode: `const rows = $input.all().map((i, idx) => {
  const prep = $('Prepare Batch Update').all()[idx]?.json || {};
  return {
    json: {
      sheet: prep.sheet,
      doc: prep.doc,
      ok: !(i.json.error),
      error: i.json.error || null,
      replies: Array.isArray(i.json.replies) ? i.json.replies.length : 0,
    }
  };
});
return rows;`,
      },
    },
  ];

  const connections = {
    'Manual Trigger': {
      main: [[{ node: 'Build Color Jobs', type: 'main', index: 0 }]],
    },
    'Build Color Jobs': {
      main: [[{ node: 'GET Spreadsheet Meta', type: 'main', index: 0 }]],
    },
    'GET Spreadsheet Meta': {
      main: [[{ node: 'Prepare Batch Update', type: 'main', index: 0 }]],
    },
    'Prepare Batch Update': {
      main: [[{ node: 'APPLY Colors', type: 'main', index: 0 }]],
    },
    'APPLY Colors': {
      main: [[{ node: 'Summary', type: 'main', index: 0 }]],
    },
  };

  // upsert workflow
  const list = await (
    await fetch('http://localhost:5678/api/v1/workflows', {
      headers: { 'X-N8N-API-KEY': key },
    })
  ).json();
  const existing = (list.data || []).find(
    (w) => w.name === '[Studio OS] Setup - Sheet Colors'
  );

  const payload = {
    name: '[Studio OS] Setup - Sheet Colors',
    nodes,
    connections,
    settings: { executionOrder: 'v1', timezone: 'Africa/Cairo' },
  };

  let wf;
  if (existing) {
    const put = await fetch(
      `http://localhost:5678/api/v1/workflows/${existing.id}`,
      {
        method: 'PUT',
        headers: {
          'X-N8N-API-KEY': key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );
    wf = await put.json();
    if (!put.ok) throw new Error(JSON.stringify(wf));
  } else {
    const post = await fetch('http://localhost:5678/api/v1/workflows', {
      method: 'POST',
      headers: {
        'X-N8N-API-KEY': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    wf = await post.json();
    if (!post.ok) throw new Error(JSON.stringify(wf));
  }

  console.log('Workflow ready:', wf.id);
  console.log('EXECUTE_ID=' + wf.id);
})();
