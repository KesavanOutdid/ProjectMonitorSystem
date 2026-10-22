const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', '..', '..', 'project_plan_timeline_template.xlsx');
const workbook = XLSX.readFile(filePath);
console.log('Sheets found:', workbook.SheetNames);

const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet);
console.log(`Parsed ${rows.length} rows from sheet "${sheetName}".`);
console.log('Columns found:', Object.keys(rows[0]));
console.log('\n--- Row 0 (Main Task 1) ---');
console.log(rows[0]);
console.log('\n--- Row 1 (Subtask under Main Task 1) ---');
console.log(rows[1]);
console.log('\n--- Row 2 (Task with Predecessor / Dependency) ---');
console.log(rows[2]);
