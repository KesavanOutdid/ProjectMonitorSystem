const XLSX = require('xlsx');
const path = require('path');

const today = new Date();
const formatDate = (date) => date.toISOString().split('T')[0];
const addDays = (d, days) => new Date(d.getTime() + days * 24 * 60 * 60 * 1000);

// Realistic engineering timeline milestones & phases
const p1Start = new Date(today);
const p1End = addDays(p1Start, 14);

const p2Start = addDays(p1End, 1);
const p2End = addDays(p2Start, 14);

const sampleTimelineRows = [
  // ─── PHASE 1: Architecture & System Specifications ───────────────────────────
  {
    'Phase / Milestone': 'Phase 1: Architecture & System Specifications',
    'Task Type': 'Main Task',
    'Task Key': '', // Leave blank to auto-create key (e.g. PRJ-MT-101), or specify existing key to UPDATE
    'Task Title': 'Power Delivery & Low-Noise Buck Architecture',
    'Task Description': 'Calculate total system power budget, select 3.3V/1.8V buck regulators, and size input capacitance.',
    'Start Date': formatDate(p1Start),
    'End Date': formatDate(addDays(p1Start, 5)),
    'Duration (Days)': 5,
    'Dependencies / Predecessors': '',
    'Priority': 'HIGH',
    'Status': 'DONE',
    'Team': 'Hardware Engineering',
    'Assignee': 'David Miller'
  },
  {
    'Phase / Milestone': 'Phase 1: Architecture & System Specifications',
    'Task Type': 'Subtask', // Automatically belongs to the Main Task above!
    'Task Key': '',
    'Task Title': 'Buck Converter Component Selection & Simulation',
    'Task Description': 'Run SPICE simulations for ripple voltage under 2A pulsed load transients.',
    'Start Date': formatDate(p1Start),
    'End Date': formatDate(addDays(p1Start, 3)),
    'Duration (Days)': 3,
    'Dependencies / Predecessors': '',
    'Priority': 'MEDIUM',
    'Status': 'DONE',
    'Team': 'Hardware Engineering',
    'Assignee': 'David Miller'
  },
  {
    'Phase / Milestone': 'Phase 1: Architecture & System Specifications',
    'Task Type': 'Subtask', // Also belongs to the Main Task above!
    'Task Key': '',
    'Task Title': 'Input Capacitance ESR & Inrush Current Calculation',
    'Task Description': 'Size bulk electrolytic and ceramic decoupling capacitors for minimal voltage droop.',
    'Start Date': formatDate(addDays(p1Start, 2)),
    'End Date': formatDate(addDays(p1Start, 5)),
    'Duration (Days)': 3,
    'Dependencies / Predecessors': '',
    'Priority': 'MEDIUM',
    'Status': 'DONE',
    'Team': 'Hardware Engineering',
    'Assignee': 'David Miller'
  },

  // ─── NEXT MAIN TASK WITH SUBTASKS ──────────────────────────────────────────
  {
    'Phase / Milestone': 'Phase 1: Architecture & System Specifications',
    'Task Type': 'Main Task', // Next Main Task
    'Task Key': '',
    'Task Title': 'Microcontroller Pinout & Clock Calibration',
    'Task Description': 'Map all GPIO multiplexing for Cortex-M4 and route high-accuracy 16MHz crystal traces.',
    'Start Date': formatDate(addDays(p1Start, 6)),
    'End Date': formatDate(addDays(p1Start, 12)),
    'Duration (Days)': 6,
    'Dependencies / Predecessors': 'Power Delivery & Low-Noise Buck Architecture',
    'Priority': 'URGENT',
    'Status': 'IN_PROGRESS',
    'Team': 'Hardware Engineering',
    'Assignee': 'james.wilson@sscorp.com'
  },
  {
    'Phase / Milestone': 'Phase 1: Architecture & System Specifications',
    'Task Type': 'Subtask', // Automatically belongs to Microcontroller Pinout above!
    'Task Key': '',
    'Task Title': 'Oscillator Frequency Measurement on Test Points',
    'Task Description': 'Verify crystal PPM accuracy and load capacitance trimming.',
    'Start Date': formatDate(addDays(p1Start, 6)),
    'End Date': formatDate(addDays(p1Start, 9)),
    'Duration (Days)': 3,
    'Dependencies / Predecessors': '',
    'Priority': 'MEDIUM',
    'Status': 'IN_PROGRESS',
    'Team': 'Hardware Engineering',
    'Assignee': 'james.wilson@sscorp.com'
  },
  {
    'Phase / Milestone': 'Phase 1: Architecture & System Specifications',
    'Task Type': 'Subtask', // Also belongs to Microcontroller Pinout above!
    'Task Key': '',
    'Task Title': 'GPIO Pull-Up Stress Test under 85C Temperature',
    'Task Description': 'Ensure stable logic levels under elevated ambient temperature.',
    'Start Date': formatDate(addDays(p1Start, 9)),
    'End Date': formatDate(addDays(p1Start, 12)),
    'Duration (Days)': 3,
    'Dependencies / Predecessors': '',
    'Priority': 'MEDIUM',
    'Status': 'TODO',
    'Team': 'Hardware Engineering',
    'Assignee': 'David Miller'
  },
  {
    'Phase / Milestone': 'Phase 1: Architecture & System Specifications',
    'Task Type': 'Main Task',
    'Task Key': '',
    'Task Title': 'System Architecture Sign-Off Gate',
    'Task Description': 'Formal peer review of BOM cost, power budget, and transceiver protocols.',
    'Start Date': formatDate(addDays(p1Start, 13)),
    'End Date': formatDate(p1End),
    'Duration (Days)': 2,
    'Dependencies / Predecessors': 'Microcontroller Pinout & Clock Calibration',
    'Priority': 'HIGH',
    'Status': 'TODO',
    'Team': 'Hardware Engineering',
    'Assignee': 'David Miller'
  },

  // ─── PHASE 2: Schematic Capture & Hardware Simulation ────────────────────────
  {
    'Phase / Milestone': 'Phase 2: Schematic Capture & Hardware Simulation',
    'Task Type': 'Main Task',
    'Task Key': '',
    'Task Title': 'High-Speed Differential Impedance Simulation (USB & CAN FD)',
    'Task Description': 'Model 90 Ohm USB differential pair and 120 Ohm CAN FD transmission lines.',
    'Start Date': formatDate(p2Start),
    'End Date': formatDate(addDays(p2Start, 6)),
    'Duration (Days)': 6,
    'Dependencies / Predecessors': 'System Architecture Sign-Off Gate',
    'Priority': 'HIGH',
    'Status': 'TODO',
    'Team': 'Hardware Engineering',
    'Assignee': 'David Miller'
  },
  {
    'Phase / Milestone': 'Phase 2: Schematic Capture & Hardware Simulation',
    'Task Type': 'Subtask', // Belongs to High-Speed Differential Impedance Simulation above!
    'Task Key': '',
    'Task Title': 'S-Parameter Extraction for USB 2.0 Eye Diagram',
    'Task Description': 'Simulate return loss and jitter across frequency sweep.',
    'Start Date': formatDate(p2Start),
    'End Date': formatDate(addDays(p2Start, 3)),
    'Duration (Days)': 3,
    'Dependencies / Predecessors': '',
    'Priority': 'MEDIUM',
    'Status': 'TODO',
    'Team': 'Hardware Engineering',
    'Assignee': 'David Miller'
  },
  {
    'Phase / Milestone': 'Phase 2: Schematic Capture & Hardware Simulation',
    'Task Type': 'Subtask', // Also belongs to High-Speed Differential Impedance Simulation above!
    'Task Key': '',
    'Task Title': 'Common-Mode Choke Filtering & Insertion Loss Analysis',
    'Task Description': 'Verify filter attenuation at 480Mbps harmonic frequencies.',
    'Start Date': formatDate(addDays(p2Start, 3)),
    'End Date': formatDate(addDays(p2Start, 6)),
    'Duration (Days)': 3,
    'Dependencies / Predecessors': '',
    'Priority': 'MEDIUM',
    'Status': 'TODO',
    'Team': 'Hardware Engineering',
    'Assignee': 'David Miller'
  },
  {
    'Phase / Milestone': 'Phase 2: Schematic Capture & Hardware Simulation',
    'Task Type': 'Main Task',
    'Task Key': '',
    'Task Title': 'Schematic Freeze & ERC Audit Gate',
    'Task Description': 'Zero electrical rule check errors, cross-net verification, and netlist export.',
    'Start Date': formatDate(addDays(p2Start, 7)),
    'End Date': formatDate(p2End),
    'Duration (Days)': 7,
    'Dependencies / Predecessors': 'High-Speed Differential Impedance Simulation (USB & CAN FD)',
    'Priority': 'URGENT',
    'Status': 'TODO',
    'Team': 'Hardware Engineering',
    'Assignee': 'Noah Centineo'
  }
];

const worksheet = XLSX.utils.json_to_sheet(sampleTimelineRows);

worksheet['!cols'] = [
  { wch: 45 }, // Phase / Milestone
  { wch: 15 }, // Task Type (Main Task vs Subtask)
  { wch: 14 }, // Task Key
  { wch: 48 }, // Task Title
  { wch: 65 }, // Task Description
  { wch: 16 }, // Start Date
  { wch: 16 }, // End Date
  { wch: 16 }, // Duration (Days)
  { wch: 45 }, // Dependencies / Predecessors
  { wch: 12 }, // Priority
  { wch: 14 }, // Status
  { wch: 22 }, // Team
  { wch: 26 }  // Assignee
];

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Project Timeline Plan');

// Instructions Sheet
const guideRows = [
  {
    'Column': 'Phase / Milestone',
    'Required': 'Optional',
    'Description': 'Project phase or sprint milestone (e.g. "Phase 1: Architecture"). If left empty, uses Board default sprint or Backlog.'
  },
  {
    'Column': 'Task Type',
    'Required': 'Yes',
    'Description': 'Enter "Main Task" or "Subtask". Any "Subtask" row automatically belongs to the preceding Main Task above it!'
  },
  {
    'Column': 'Task Key',
    'Required': 'Optional',
    'Description': 'Leave blank to auto-create key: PROJECT-TASKTYPE-TEAM-NUMBER (e.g. R-MT-HE-107 or R-MT-GEN-1 for Main Task, and R-ST-HE-107-1 for Subtask), or enter existing key to UPDATE.'
  },
  {
    'Column': 'Task Title',
    'Required': 'Yes',
    'Description': 'Name of the task or subtask activity.'
  },
  {
    'Column': 'Task Description',
    'Required': 'Optional',
    'Description': 'Detailed scope, acceptance criteria, or engineering notes.'
  },
  {
    'Column': 'Start & End Dates',
    'Required': 'Optional',
    'Description': 'Dates in YYYY-MM-DD. Auto-computed using Duration (Days) if one is omitted.'
  },
  {
    'Column': 'Duration (Days)',
    'Required': 'Optional',
    'Description': 'Working duration in days. If Start Date is given, End Date is auto-calculated.'
  },
  {
    'Column': 'Dependencies / Predecessors',
    'Required': 'Optional',
    'Description': 'Title or Key of prerequisite tasks. Automatically wired into Outdid Sync’s DAG dependency graph!'
  },
  {
    'Column': 'Team & Assignee',
    'Required': 'Optional',
    'Description': 'Target discipline and owner. Matches assignee by Name, Email, or "Name <email>".'
  }
];

const guideSheet = XLSX.utils.json_to_sheet(guideRows);
guideSheet['!cols'] = [
  { wch: 28 },
  { wch: 12 },
  { wch: 85 }
];
XLSX.utils.book_append_sheet(workbook, guideSheet, 'Timeline Guide');

// Export to multiple destinations
const destinations = [
  path.join(__dirname, '..', '..', '..', 'sprint_tasks_import_template.xlsx'),
  path.join(__dirname, '..', '..', '..', 'project_plan_timeline_template.xlsx'),
  path.join(__dirname, '..', 'sprint_tasks_import_template.xlsx'),
  path.join(__dirname, '..', '..', '..', 'frontend', 'public', 'sprint_tasks_import_template.xlsx'),
  path.join(__dirname, '..', '..', '..', 'frontend', 'public', 'project_plan_timeline_template.xlsx')
];

destinations.forEach((dest) => {
  try {
    XLSX.writeFile(workbook, dest);
    console.log('Template created at:', dest);
  } catch (e) {
    console.warn('Could not write to:', dest, e.message);
  }
});
