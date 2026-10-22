const XLSX = require('xlsx');
const path = require('path');

const today = new Date();
const formatDate = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const s1Start = new Date(today);
const s1End = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);

const s2Start = new Date(s1End.getTime() + 1 * 24 * 60 * 60 * 1000);
const s2End = new Date(s2Start.getTime() + 14 * 24 * 60 * 60 * 1000);

const testRows = [
  // ─── TASK 1: MAIN TASK (R-101) ─────────────────────────────────────────────
  {
    'Sprint Name': 'Sprint 1',
    'Sprint Start Date': formatDate(s1Start),
    'Sprint End Date': formatDate(s1End),
    'Sprint Goal': 'Hardware Architecture & Schematic Verification',
    'Task Type': 'Main Task',
    'Task Key': 'R-101', // Explicit key -> Demonstrates ↺ UPDATE of existing task!
    'Task Title': 'Microcontroller Pinout & Clock Calibration',
    'Task Description': 'Updated PLL clock timings and Cortex-M4 crystal oscillator routing for high stability.',
    'Priority': 'URGENT',
    'Status': 'IN_PROGRESS',
    'Story Points': 8,
    'Team': 'Hardware Engineering',
    'Assignee': 'David Miller', // Matched by Name (Lead)
    'Task Start Date': formatDate(s1Start),
    'Task Due Date': formatDate(new Date(s1Start.getTime() + 6 * 24 * 60 * 60 * 1000))
  },

  // ─── SUBTASK 1A: Automatically belongs to R-101 above ──────────────────────
  {
    'Sprint Name': 'Sprint 1',
    'Sprint Start Date': formatDate(s1Start),
    'Sprint End Date': formatDate(s1End),
    'Sprint Goal': 'Hardware Architecture & Schematic Verification',
    'Task Type': 'Subtask', // Subtask belongs to Microcontroller Pinout above!
    'Task Key': '',
    'Task Title': 'Select Cortex-M4 Crystal Oscillator',
    'Task Description': 'Choose 16MHz ultra-low jitter SMD quartz crystal with 8pF load capacitance.',
    'Priority': 'HIGH',
    'Status': 'DONE',
    'Story Points': 3,
    'Team': 'Hardware Engineering',
    'Assignee': 'james.wilson@sscorp.com', // Matched by Email (Team Member)
    'Task Start Date': formatDate(s1Start),
    'Task Due Date': formatDate(new Date(s1Start.getTime() + 3 * 24 * 60 * 60 * 1000))
  },

  // ─── SUBTASK 1B: Also belongs to R-101 above ───────────────────────────────
  {
    'Sprint Name': 'Sprint 1',
    'Sprint Start Date': formatDate(s1Start),
    'Sprint End Date': formatDate(s1End),
    'Sprint Goal': 'Hardware Architecture & Schematic Verification',
    'Task Type': 'Subtask', // Also belongs to Microcontroller Pinout above!
    'Task Key': '',
    'Task Title': 'Calibrate PLL Clock Multiplier',
    'Task Description': 'Measure output clock on test pin with 500MHz oscilloscope to verify phase lock.',
    'Priority': 'MEDIUM',
    'Status': 'TODO',
    'Story Points': 2,
    'Team': 'Hardware Engineering',
    'Assignee': 'Noah Centineo', // Matched by Name (Team Member)
    'Task Start Date': formatDate(s1Start),
    'Task Due Date': formatDate(new Date(s1Start.getTime() + 5 * 24 * 60 * 60 * 1000))
  },

  // ─── TASK 2: NEXT MAIN TASK ────────────────────────────────────────────────
  {
    'Sprint Name': 'Sprint 1',
    'Sprint Start Date': formatDate(s1Start),
    'Sprint End Date': formatDate(s1End),
    'Sprint Goal': 'Hardware Architecture & Schematic Verification',
    'Task Type': 'Main Task',
    'Task Key': '',
    'Task Title': 'Power Delivery & Buck Converter Thermal Testing',
    'Task Description': 'Measure ripple voltage and thermal rise under maximum 3.3V load current on Prototype Board v1.',
    'Priority': 'URGENT',
    'Status': 'TODO',
    'Story Points': 5,
    'Team': 'Hardware Engineering',
    'Assignee': 'james.wilson@sscorp.com',
    'Task Start Date': formatDate(s1Start),
    'Task Due Date': '' // Auto-fills to Sprint 1 End Date!
  },

  // ─── SUBTASK 2A: Belongs to Power Delivery above ───────────────────────────
  {
    'Sprint Name': 'Sprint 1',
    'Sprint Start Date': formatDate(s1Start),
    'Sprint End Date': formatDate(s1End),
    'Sprint Goal': 'Hardware Architecture & Schematic Verification',
    'Task Type': 'Subtask',
    'Task Key': '',
    'Task Title': 'Measure Ripple Voltage Transients',
    'Task Description': 'Capture oscilloscope waveforms under step load from 100mA to 2A.',
    'Priority': 'HIGH',
    'Status': 'TODO',
    'Story Points': 2,
    'Team': 'Hardware Engineering',
    'Assignee': 'David Miller',
    'Task Start Date': formatDate(s1Start),
    'Task Due Date': formatDate(new Date(s1Start.getTime() + 4 * 24 * 60 * 60 * 1000))
  },

  // ─── TASK 3: HARDWARE NOISE COUPLING FIX ──────────────────────────────────
  {
    'Sprint Name': 'Sprint 1',
    'Sprint Start Date': formatDate(s1Start),
    'Sprint End Date': formatDate(s1End),
    'Sprint Goal': 'Hardware Architecture & Schematic Verification',
    'Task Type': 'Main Task',
    'Task Key': '',
    'Task Title': 'Fix 5V LDO ground plane noise coupling',
    'Task Description': 'Reroute high current switching loops away from sensitive analog ADC reference pins.',
    'Priority': 'HIGH',
    'Status': 'TODO',
    'Story Points': 3,
    'Team': 'Hardware Engineering',
    'Assignee': 'Noah Centineo',
    'Task Start Date': '',
    'Task Due Date': ''
  },

  // ─── TASK 4: UART DEBUG HEADER ─────────────────────────────────────────────
  {
    'Sprint Name': 'Sprint 1',
    'Sprint Start Date': formatDate(s1Start),
    'Sprint End Date': formatDate(s1End),
    'Sprint Goal': 'Hardware Architecture & Schematic Verification',
    'Task Type': 'Main Task',
    'Task Key': '',
    'Task Title': 'UART Debug Header Soldering & Continuity Check',
    'Task Description': 'Verify pin connections for FTDI serial console logging before initial firmware flashing.',
    'Priority': 'MEDIUM',
    'Status': 'DONE',
    'Story Points': 2,
    'Team': 'Hardware Engineering',
    'Assignee': 'Benjamin Franklin', // In Team
    'Task Start Date': formatDate(s1Start),
    'Task Due Date': formatDate(new Date(s1Start.getTime() + 3 * 24 * 60 * 60 * 1000))
  },

  // ─── TASK 5: CROSS-TEAM ASSIGNEE ───────────────────────────────────────────
  {
    'Sprint Name': 'Sprint 1',
    'Sprint Start Date': formatDate(s1Start),
    'Sprint End Date': formatDate(s1End),
    'Sprint Goal': 'Hardware Architecture & Schematic Verification',
    'Task Type': 'Main Task',
    'Task Key': '',
    'Task Title': 'Cross-Team Firmware SPI Bus Handshake',
    'Task Description': 'Coordinate SPI peripheral timings between hardware schematic and firmware DMA drivers.',
    'Priority': 'HIGH',
    'Status': 'TODO',
    'Story Points': 5,
    'Team': 'Hardware Engineering',
    'Assignee': 'sebastian.stan@sscorp.com',
    'Task Start Date': '',
    'Task Due Date': ''
  },

  // ─── SPRINT 2 (High-Speed Signal Integrity) ───────────────────────────────
  {
    'Sprint Name': 'Sprint 2',
    'Sprint Start Date': formatDate(s2Start),
    'Sprint End Date': formatDate(s2End),
    'Sprint Goal': 'EMC Compliance & High-Speed Signal Integrity',
    'Task Type': 'Main Task',
    'Task Key': '',
    'Task Title': 'Differential Pair Impedance Simulation (USB 2.0)',
    'Task Description': 'Calculate 90 Ohm differential traces with stackup constraints on 4-layer FR4 PCB.',
    'Priority': 'HIGH',
    'Status': 'TODO',
    'Story Points': 8,
    'Team': 'Hardware Engineering',
    'Assignee': 'David Miller',
    'Task Start Date': formatDate(s2Start),
    'Task Due Date': formatDate(new Date(s2Start.getTime() + 7 * 24 * 60 * 60 * 1000))
  },
  {
    'Sprint Name': 'Sprint 2',
    'Sprint Start Date': formatDate(s2Start),
    'Sprint End Date': formatDate(s2End),
    'Sprint Goal': 'EMC Compliance & High-Speed Signal Integrity',
    'Task Type': 'Main Task',
    'Task Key': '',
    'Task Title': 'EMI Shielding Can Footprint Placement',
    'Task Description': 'Add mechanical keepouts and ground stitching vias for RF isolation shielding.',
    'Priority': 'MEDIUM',
    'Status': 'TODO',
    'Story Points': 5,
    'Team': 'Hardware Engineering',
    'Assignee': 'james.wilson@sscorp.com',
    'Task Start Date': formatDate(s2Start),
    'Task Due Date': ''
  },
  {
    'Sprint Name': 'Sprint 2',
    'Sprint Start Date': formatDate(s2Start),
    'Sprint End Date': formatDate(s2End),
    'Sprint Goal': 'EMC Compliance & High-Speed Signal Integrity',
    'Task Type': 'Main Task',
    'Task Key': '',
    'Task Title': 'ESD Protection Diode Clamp Breakdown Voltage Test',
    'Task Description': 'Subject external I/O connectors to 8kV contact discharge IEC 61000-4-2 standard test.',
    'Priority': 'LOW',
    'Status': 'TODO',
    'Story Points': 3,
    'Team': 'Hardware Engineering',
    'Assignee': 'Noah Centineo',
    'Task Start Date': '',
    'Task Due Date': ''
  },

  // ─── PROJECT BACKLOG ───────────────────────────────────────────────────────
  {
    'Sprint Name': '', // Blank sprint -> automatically goes to Project Backlog!
    'Sprint Start Date': '',
    'Sprint End Date': '',
    'Sprint Goal': '',
    'Task Type': 'Main Task',
    'Task Key': '',
    'Task Title': 'BOM Cost Optimization for High-Volume Production (10k units)',
    'Task Description': 'Identify second-source component alternatives to reduce unit cost by 15%.',
    'Priority': 'LOW',
    'Status': 'TODO',
    'Story Points': 13,
    'Team': 'Hardware Engineering',
    'Assignee': 'David Miller',
    'Task Start Date': '',
    'Task Due Date': ''
  }
];

const worksheet = XLSX.utils.json_to_sheet(testRows);

worksheet['!cols'] = [
  { wch: 15 }, // Sprint Name
  { wch: 18 }, // Sprint Start Date
  { wch: 18 }, // Sprint End Date
  { wch: 45 }, // Sprint Goal
  { wch: 14 }, // Task Type (Main Task / Subtask)
  { wch: 14 }, // Task Key
  { wch: 48 }, // Task Title
  { wch: 70 }, // Task Description
  { wch: 12 }, // Priority
  { wch: 14 }, // Status
  { wch: 14 }, // Story Points
  { wch: 22 }, // Team
  { wch: 26 }, // Assignee
  { wch: 16 }, // Task Start Date
  { wch: 16 }  // Task Due Date
];

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Sprints & Tasks');

const guideRows = [
  { 'Feature': 'Task Type Hierarchy', 'Rule': 'Set "Task Type" to "Main Task" or "Subtask". Any row marked "Subtask" automatically belongs to the preceding Main Task above it.' },
  { 'Feature': 'No Parent Task Columns Needed', 'Rule': 'Parent Task, Is Subtask, and Subtasks columns are completely eliminated. Hierarchy is determined naturally by Task Type and row sequence.' },
  { 'Feature': 'Smart Re-Import & Updates', 'Rule': 'Specify "Task Key" (e.g. R-101) or matching task title to UPDATE existing tasks and subtasks without creating duplicates.' },
  { 'Feature': 'Assignee by Name or Email', 'Rule': 'Supports assignee names ("David Miller") and emails ("james.wilson@sscorp.com") with automatic team membership verification.' },
  { 'Feature': 'Automatic Sprint & Due Dates', 'Rule': 'Auto-calculates sprint start/end dates using 14-day cycles and fills missing task due dates.' }
];

const guideSheet = XLSX.utils.json_to_sheet(guideRows);
guideSheet['!cols'] = [{ wch: 30 }, { wch: 80 }];
XLSX.utils.book_append_sheet(workbook, guideSheet, 'Test Guide');

const rootPath = path.join(__dirname, '..', '..', '..', 'test_sprints_and_tasks.xlsx');
const publicPath = path.join(__dirname, '..', '..', '..', 'frontend', 'public', 'test_sprints_and_tasks.xlsx');

XLSX.writeFile(workbook, rootPath);
XLSX.writeFile(workbook, publicPath);

console.log('Test file created at root:', rootPath);
console.log('Test file created at frontend public:', publicPath);
