const mongoose = require('mongoose');
const path = require('path');

// Simulate the logic in processImportRows for hierarchy detection
const testRows = [
  {
    'Task Type': 'Main',
    'Task Title': 'Main Task 1: Microcontroller System',
    'Assignee': 'David Miller',
    'Team': 'Hardware Engineering'
  },
  {
    'Task Type': 'Sub',
    'Task Title': 'Subtask 1.1: Crystal Oscillator Routing',
    'Assignee': 'David Miller'
  },
  {
    'Task Type': 'Sub',
    'Task Title': 'Subtask 1.2: Decoupling Capacitors Placement',
    'Assignee': 'David Miller'
  },
  {
    'Task Type': 'Sub',
    'Task Title': 'Subtask 1.3: Reset Circuit Debounce',
    'Assignee': 'David Miller'
  },
  {
    'Task Type': 'Main',
    'Task Title': 'Main Task 2: Power Regulation Architecture',
    'Assignee': 'james.wilson@sscorp.com',
    'Team': 'Hardware Engineering'
  },
  {
    'Task Type': 'Sub',
    'Task Title': 'Subtask 2.1: Buck Inductor Selection',
    'Assignee': 'james.wilson@sscorp.com'
  }
];

let lastMainTask = null;
const mainTasks = [];

testRows.forEach((row, i) => {
  const typeVal = String(row['Task Type'] || '').toUpperCase().trim();
  const title = row['Task Title'];
  const isSubtask = ['SUB', 'SUBTASK', 'SUB-TASK', 'CHILD', 'YES', 'TRUE', '2'].includes(typeVal);
  const isMain = ['MAIN', 'MAIN TASK', 'PARENT'].includes(typeVal);

  if (isSubtask) {
    if (lastMainTask) {
      lastMainTask.subtasks.push({
        title,
        parentTitle: lastMainTask.title
      });
      console.log(`[Row ${i + 1}] SUBTASK: "${title}" -> bound to upper main task: "${lastMainTask.title}"`);
    } else {
      console.log(`[Row ${i + 1}] WARNING: No upper main task found for subtask "${title}"`);
    }
  } else {
    const mainObj = {
      title,
      subtasks: []
    };
    lastMainTask = mainObj;
    mainTasks.push(mainObj);
    console.log(`[Row ${i + 1}] MAIN TASK: "${title}" (registered as active upper main)`);
  }
});

console.log('\n=== RESULT HIERARCHY ===');
mainTasks.forEach((m, idx) => {
  console.log(`\nMain Task ${idx + 1}: ${m.title}`);
  m.subtasks.forEach((s, sIdx) => {
    console.log(`  └─ Subtask ${idx + 1}.${sIdx + 1}: ${s.title}`);
  });
});
