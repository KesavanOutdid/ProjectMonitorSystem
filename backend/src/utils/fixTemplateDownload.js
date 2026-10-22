const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', '..', '..', 'frontend', 'src', 'components', 'ExcelImportModal.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const isCRLF = content.includes('\r\n');
const normalized = content.replace(/\r\n/g, '\n');

const markerStart = '        ];\n        {';
const markerEnd = '    }\n  };\n\n  const handleReset = () => {';

const startIdx = normalized.indexOf(markerStart);
const endIdx = normalized.indexOf(markerEnd);

console.log('startIdx:', startIdx, 'endIdx:', endIdx);

if (startIdx !== -1 && endIdx !== -1) {
  const replacement = `        ];

        const ws = XLSX.utils.json_to_sheet(sampleRows);
        ws['!cols'] = [
          { wch: 28 }, // Phase / Milestone
          { wch: 15 }, // Task Type
          { wch: 14 }, // Task Key
          { wch: 38 }, // Task Title
          { wch: 48 }, // Task Description
          { wch: 15 }, // Start Date
          { wch: 15 }, // End Date
          { wch: 16 }, // Duration (Days)
          { wch: 32 }, // Dependencies / Predecessors
          { wch: 14 }, // Priority
          { wch: 16 }, // Status
          { wch: 24 }, // Team
          { wch: 32 }  // Assignee
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Project Timeline Plan');

        const guideRows = [
          { 'Column': 'Phase / Milestone', 'Required': 'Optional', 'Description': 'Project Sprint or Phase. If empty, uses Board default sprint or Backlog.' },
          { 'Column': 'Task Type', 'Required': 'Yes', 'Description': 'Enter "Main Task" or "Subtask". Any "Subtask" row automatically belongs to the preceding Main Task above it!' },
          { 'Column': 'Task Title', 'Required': 'Yes', 'Description': 'Task title or deliverable summary.' },
          { 'Column': 'Start & End Dates', 'Required': 'Optional', 'Description': 'Dates in YYYY-MM-DD. Auto-calculated using Duration (Days) if one is omitted.' },
          { 'Column': 'Duration (Days)', 'Required': 'Optional', 'Description': 'Estimated working days for the activity.' },
          { 'Column': 'Dependencies / Predecessors', 'Required': 'Optional', 'Description': 'Title or Key of blocking predecessor tasks. Automatically wires into DAG Dependency Graph!' },
          { 'Column': 'Team & Assignee', 'Required': 'Optional', 'Description': 'Discipline and Owner according to your project.' }
        ];
        const wsGuide = XLSX.utils.json_to_sheet(guideRows);
        wsGuide['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 80 }];
        XLSX.utils.book_append_sheet(wb, wsGuide, 'Timeline Guide');

        XLSX.writeFile(wb, \`\${projectKey || 'project'}_timeline_plan_template.xlsx\`);
      } catch (clientErr) {
        window.open('/project_plan_timeline_template.xlsx', '_blank');
      }
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const handleReset = () => {`;

  const newContent = normalized.slice(0, startIdx) + replacement + normalized.slice(endIdx + markerEnd.length);
  fs.writeFileSync(filePath, isCRLF ? newContent.replace(/\n/g, '\r\n') : newContent, 'utf8');
  console.log('SUCCESSFULLY REPLACED handleDownloadTemplate!');
} else {
  console.error('FAILED TO FIND MARKERS');
}
