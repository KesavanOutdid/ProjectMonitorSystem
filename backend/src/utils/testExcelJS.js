const ExcelJS = require('exceljs');

async function test() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Project Timeline Plan');
  const lookupWs = wb.addWorksheet('Lists');

  // Populate Lists
  lookupWs.getCell('A1').value = 'Sprints';
  lookupWs.getCell('A2').value = 'Sprint 1';
  lookupWs.getCell('A3').value = 'Sprint 2';

  lookupWs.getCell('B1').value = 'Teams';
  lookupWs.getCell('B2').value = 'Hardware Engineering';
  lookupWs.getCell('B3').value = 'Firmware Development';

  lookupWs.getCell('C1').value = 'Members';
  lookupWs.getCell('C2').value = 'David Miller <david.miller@sscorp.com>';
  lookupWs.getCell('C3').value = 'James Wilson <james.wilson@sscorp.com>';

  // Setup headers on main worksheet
  ws.columns = [
    { header: 'Phase / Milestone', key: 'phase', width: 25 },
    { header: 'Task Type', key: 'type', width: 15 },
    { header: 'Task Key', key: 'key', width: 14 },
    { header: 'Task Title', key: 'title', width: 35 },
    { header: 'Task Description', key: 'desc', width: 45 },
    { header: 'Start Date', key: 'startDate', width: 15 },
    { header: 'End Date', key: 'endDate', width: 15 },
    { header: 'Duration (Days)', key: 'duration', width: 16 },
    { header: 'Dependencies / Predecessors', key: 'dep', width: 30 },
    { header: 'Priority', key: 'priority', width: 14 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Team', key: 'team', width: 24 },
    { header: 'Assignee', key: 'assignee', width: 32 }
  ];

  // Add sample rows
  ws.addRow({
    phase: 'Sprint 1',
    type: 'Main Task',
    key: '',
    title: 'Power Delivery & Low-Noise Buck',
    desc: 'Calculate total system power budget',
    startDate: '2026-10-21',
    endDate: '2026-10-26',
    duration: 5,
    dep: '',
    priority: 'HIGH',
    status: 'DONE',
    team: 'Hardware Engineering',
    assignee: 'David Miller <david.miller@sscorp.com>'
  });

  // Data Validation
  for (let r = 2; r <= 100; r++) {
    // Phase / Sprint dropdown
    ws.getCell(`A${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['Lists!$A$2:$A$10']
    };

    // Task Type dropdown
    ws.getCell(`B${r}`).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"Main Task,Subtask"']
    };

    // Priority dropdown
    ws.getCell(`J${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"LOW,MEDIUM,HIGH,URGENT"']
    };

    // Status dropdown
    ws.getCell(`K${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"TODO,IN_PROGRESS,IN_REVIEW,DONE,BACKLOG"']
    };

    // Team dropdown
    ws.getCell(`L${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['Lists!$B$2:$B$10']
    };

    // Assignee dropdown
    ws.getCell(`M${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['Lists!$C$2:$C$20']
    };
  }

  await wb.xlsx.writeFile('test_exceljs.xlsx');
  console.log('SUCCESS: test_exceljs.xlsx generated with full interactive dropdowns!');
}

test().catch(console.error);
