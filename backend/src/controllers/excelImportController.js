const mongoose = require('mongoose');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const Project = require('../models/Project');
const Sprint = require('../models/Sprint');
const Task = require('../models/Task');
const User = require('../models/User');
const Team = require('../models/Team');
const Workspace = require('../models/Workspace');
const Activity = require('../models/Activity');
const asyncHandler = require('../middlewares/asyncHandler');
const CacheService = require('../services/cacheService');
const { emitToProject } = require('../config/socket');

const normalizeHeader = (str) => {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, '-') // en-dash, em-dash to standard hyphen
    .replace(/[^a-z0-9]/g, ''); // strip spaces, punctuation
};

/**
 * Helper to get value using multiple flexible column aliases (for missing/custom column tolerance)
 */
const getRowValue = (row, aliases, defaultValue = '') => {
  if (!row || typeof row !== 'object') return defaultValue;

  // 1. Direct key match
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== null && String(row[alias]).trim() !== '') {
      return row[alias];
    }
  }

  // 2. Normalized key match (stripping spaces, en-dash, case)
  const rowKeys = Object.keys(row);
  const normalizedKeyMap = new Map();
  for (const k of rowKeys) {
    normalizedKeyMap.set(normalizeHeader(k), k);
  }

  for (const alias of aliases) {
    const normAlias = normalizeHeader(alias);
    if (normalizedKeyMap.has(normAlias)) {
      const actualKey = normalizedKeyMap.get(normAlias);
      const val = row[actualKey];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        return val;
      }
    }
  }

  return defaultValue;
};

/**
 * Format Date safely (Supports standard dates, Excel serial timestamps, and DD/MM/YYYY)
 */
const parseCleanDate = (val) => {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val;
  }
  // Check if val is an Excel numeric date code (e.g. 45581 = Oct 16, 2026)
  if (typeof val === 'number' && val > 30000 && val < 60000) {
    const epochMs = (val - 25569) * 86400 * 1000;
    const d = new Date(epochMs);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d{5}$/.test(trimmed)) {
      const num = parseInt(trimmed, 10);
      if (num > 30000 && num < 60000) {
        const epochMs = (num - 25569) * 86400 * 1000;
        const d = new Date(epochMs);
        if (!isNaN(d.getTime())) return d;
      }
    }
    // Handle DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10) - 1;
      const year = parseInt(dmyMatch[3], 10);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) return d;
    }
  }
  const parsed = new Date(val);
  return isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Resolves uppercase team code for task IDs (e.g. Hardware Engineering -> HE, fallback -> GEN)
 * Enforces strict project team validation:
 * - If team is empty, blank, or 'ALL'/'GENERAL', returns 'GEN' (valid)
 * - If team matches an existing team in project.teams or workspaceTeams, returns matched uppercase key (valid)
 * - If team does NOT match any team in the project, returns null (invalid team!)
 */
const resolveTeamCode = (teamName, projectTeams = [], workspaceTeams = []) => {
  if (!teamName || typeof teamName !== 'string' || !teamName.trim() || teamName.trim().toUpperCase() === 'ALL' || teamName.trim().toUpperCase() === 'GENERAL') {
    return 'GEN';
  }
  const clean = teamName.trim();
  const allTeams = [...(projectTeams || []), ...(workspaceTeams || [])];

  // If project has no defined teams at all, allow team name and derive code or fallback to GEN
  if (allTeams.length === 0) {
    const words = clean.split(/[\s_\-\/]+/).filter(Boolean);
    if (words.length > 1) {
      return words.map((w) => w[0]).join('').toUpperCase().slice(0, 4);
    }
    return clean.slice(0, 3).toUpperCase() || 'GEN';
  }

  const pTeam = allTeams.find(
    (t) => (t.name || '').toLowerCase().trim() === clean.toLowerCase() ||
           (t.key || '').toLowerCase().trim() === clean.toLowerCase()
  );

  if (pTeam?.key && pTeam.key.trim()) {
    return pTeam.key.toUpperCase().trim();
  }
  if (pTeam?.name && pTeam.name.trim()) {
    const words = pTeam.name.split(/[\s_\-\/]+/).filter(Boolean);
    if (words.length > 1) {
      return words.map((w) => w[0]).join('').toUpperCase().slice(0, 4);
    }
    return pTeam.name.slice(0, 3).toUpperCase();
  }

  // Not a valid team in this project!
  return null;
};

/**
 * Parse Excel file buffer or JSON rows
 * Prioritizes Project Timeline Plan, Timeline Plan, Sprints & Tasks sheets,
 * or automatically scans for sheets with Level or Task columns.
 * Supports single-row header and dual-row headers (Category + Level).
 */
const parseSpreadsheetData = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) return [];

  const targetSheetNames = [
    'Project Timeline Plan',
    'Timeline Plan',
    'Timeline',
    'Sprints & Tasks',
    'Tasks & Sprints',
    'Tasks',
    'Plan'
  ];

  // 1. Choose the best sheet (prioritizing target sheets, or any sheet with Level/Task columns)
  let bestSheetName = null;
  let maxRows = -1;

  for (const name of workbook.SheetNames) {
    if (name.startsWith('Project_Dropdown') || name.startsWith('Lookup') || name.startsWith('Import Instructions')) {
      continue;
    }
    const ws = workbook.Sheets[name];
    if (!ws) continue;
    const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!rawData || rawData.length === 0) continue;

    const hasKnownHeaders = rawData.slice(0, 5).some(row =>
      Array.isArray(row) && row.some(cell => {
        const str = String(cell).toLowerCase().trim();
        return str.includes('level') || str.includes('task') || str.includes('s.no') || str.includes('sprint');
      })
    );

    if (targetSheetNames.includes(name)) {
      bestSheetName = name;
      break;
    }

    if (hasKnownHeaders && rawData.length > maxRows) {
      bestSheetName = name;
      maxRows = rawData.length;
    } else if (!bestSheetName && rawData.length > maxRows) {
      bestSheetName = name;
      maxRows = rawData.length;
    }
  }

  if (!bestSheetName) bestSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[bestSheetName];
  if (!worksheet) return [];

  const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (!rawRows || rawRows.length === 0) return [];

  // 2. Locate the header row(s) (supports single header row or dual header rows as in Image 2)
  let headerRowIndex = 0;
  let secondaryHeaderRowIndex = -1;

  for (let i = 0; i < Math.min(rawRows.length, 6); i++) {
    const row = rawRows[i];
    if (!Array.isArray(row)) continue;
    const countMatches = row.filter(cell => {
      const s = String(cell).toLowerCase().trim();
      return (
        s.includes('level 1') || s.includes('level 2') || s.includes('level 3') ||
        s.includes('level 4') || s.includes('level 5') || s.includes('s.no') ||
        s.includes('task title') || s.includes('task key') || s.includes('task type') ||
        s.includes('phase') || s.includes('sprint') || s.includes('project name')
      );
    }).length;

    if (countMatches >= 2) {
      headerRowIndex = i;
      if (i > 0) {
        secondaryHeaderRowIndex = i - 1; // row directly above contained categories (Image 2)
      }
      break;
    }
  }

  const primaryHeaders = rawRows[headerRowIndex] || [];
  const secondaryHeaders = secondaryHeaderRowIndex >= 0 ? (rawRows[secondaryHeaderRowIndex] || []) : [];

  const resultRows = [];
  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const rowArr = rawRows[r];
    if (!Array.isArray(rowArr) || rowArr.every(c => c === '' || c === null || c === undefined)) {
      continue;
    }

    const rowObj = {};
    for (let c = 0; c < Math.max(primaryHeaders.length, rowArr.length); c++) {
      const val = rowArr[c] !== undefined ? rowArr[c] : '';
      const primaryKey = primaryHeaders[c] ? String(primaryHeaders[c]).trim() : '';
      const secondaryKey = secondaryHeaders[c] ? String(secondaryHeaders[c]).trim() : '';

      if (primaryKey) {
        rowObj[primaryKey] = val;
      }
      if (secondaryKey && secondaryKey !== primaryKey && !rowObj[secondaryKey]) {
        rowObj[secondaryKey] = val;
      }
    }

    // Skip completely empty rows
    const hasSomeValue = Object.values(rowObj).some(v => v !== '' && v !== null && v !== undefined);
    if (hasSomeValue) {
      resultRows.push(rowObj);
    }
  }

  return resultRows;
};

/**
 * Comprehensive Processing Engine:
 * - Natural Row Order Hierarchy: Main Task -> Subtask 1, Subtask 2, Subtask 3 -> Main Task 2 -> Subtask...
 * - Subtasks automatically bind to the upper Main Task if no parent is explicitly specified
 * - Timeline Project Plan support: Phases/Milestones, Start & End Dates, Duration in Days, Predecessors/Dependencies
 * - Smart Assignee matching (by Email, Full Name, Name <email>, and Partial Name)
 * - Team & Board context inheritance (defaults to Board's selected Sprint & Team if empty)
 * - Smart Upsert: updates existing tasks/subtasks by Key or Title, creates new ones
 */
const processImportRows = async (projectId, rows, options = {}, user) => {
  const defaultCycleDays = parseInt(options.defaultCycleDays, 10) || 14;
  const project = await Project.findById(projectId);
  if (!project) throw new Error('Project not found');

  const userId = user._id || user.id;

  // 1. Detect if current user is a Team Lead and identify their lead team(s)
  const workspaceTeams = await Team.find({
    workspaceId: project.workspaceId,
    isArchived: { $ne: true }
  });

  const leadTeamNames = new Set();
  const leadTeamIds = new Set();
  let primaryLeadTeam = null;

  workspaceTeams.forEach((wt) => {
    const leadIdStr = (wt.leadId?._id || wt.leadId)?.toString();
    if (leadIdStr === userId.toString()) {
      if (wt.name) leadTeamNames.add(wt.name.toLowerCase().trim());
      leadTeamIds.add(wt._id.toString());
      if (!primaryLeadTeam) primaryLeadTeam = wt;
    }
  });

  if (Array.isArray(project.teams)) {
    project.teams.forEach((pt) => {
      const ptLeadIdStr = (pt.leadId?._id || pt.leadId)?.toString();
      if (ptLeadIdStr === userId.toString() || (pt.name && leadTeamNames.has(pt.name.toLowerCase().trim()))) {
        if (pt.name) leadTeamNames.add(pt.name.toLowerCase().trim());
        if (!primaryLeadTeam) primaryLeadTeam = pt;
      }
    });
  }

  const isTeamLeadUser = user.role === 'TEAM_LEAD' || leadTeamNames.size > 0;
  const forcedLeadTeamName = primaryLeadTeam ? primaryLeadTeam.name : (options.defaultTeam || null);

  // 2. Fetch workspace and project users for flexible matching (by Email AND Name)
  const users = await User.find({
    $or: [
      { workspaceId: project.workspaceId },
      { _id: { $in: project.members?.map((m) => m.userId || m) || [] } }
    ]
  }).select('_id name email avatar jobTitle');

  const userEmailMap = new Map();
  const userNameMap = new Map();

  users.forEach((u) => {
    if (u.email) userEmailMap.set(u.email.toLowerCase().trim(), u);
    if (u.name) userNameMap.set(u.name.toLowerCase().trim(), u);
  });

  // Team member lookup table
  const teamMembersMap = new Map();
  const indexTeamMembers = (teamName, members, leadId) => {
    if (!teamName) return;
    const cleanName = teamName.toLowerCase().trim();
    if (!teamMembersMap.has(cleanName)) teamMembersMap.set(cleanName, new Set());
    const set = teamMembersMap.get(cleanName);
    if (leadId) set.add((leadId._id || leadId).toString());
    if (Array.isArray(members)) {
      members.forEach((m) => {
        const mId = (m._id || m.userId?._id || m.userId || m)?.toString();
        if (mId) set.add(mId);
      });
    }
  };

  workspaceTeams.forEach((wt) => indexTeamMembers(wt.name, wt.members, wt.leadId));
  if (Array.isArray(project.teams)) {
    project.teams.forEach((pt) => indexTeamMembers(pt.name, pt.members, pt.leadId));
  }

  // Enhanced resolver: matches email, full name, "Name <email>", and partial name
  const resolveAssignee = (rawAssignee) => {
    if (!rawAssignee) return null;
    let clean = String(rawAssignee).trim();
    
    // Check if format is "First Last <email@domain.com>"
    const emailBracketMatch = clean.match(/<([^>]+)>/);
    if (emailBracketMatch) {
      const emailInside = emailBracketMatch[1].toLowerCase().trim();
      if (userEmailMap.has(emailInside)) {
        return userEmailMap.get(emailInside);
      }
      clean = clean.replace(/<[^>]+>/, '').trim();
    }

    const cleanLower = clean.toLowerCase();

    // Direct email match
    if (cleanLower.includes('@') && userEmailMap.has(cleanLower)) {
      return userEmailMap.get(cleanLower);
    }
    // Direct name match
    if (userNameMap.has(cleanLower)) {
      return userNameMap.get(cleanLower);
    }
    // Name map without special characters
    const alphanumericLower = cleanLower.replace(/[^a-z0-9]/g, '');
    for (const [nameKey, u] of userNameMap.entries()) {
      const uAlphanumeric = nameKey.replace(/[^a-z0-9]/g, '');
      if (uAlphanumeric === alphanumericLower) {
        return u;
      }
    }
    // Partial substring match
    for (const [nameKey, u] of userNameMap.entries()) {
      if (nameKey.length >= 3 && cleanLower.length >= 3) {
        if (nameKey.includes(cleanLower) || cleanLower.includes(nameKey)) {
          return u;
        }
      }
    }
    return null;
  };

  // 3. Fetch existing tasks in project for Smart Upsert check
  const existingTasks = await Task.find({
    projectId,
    isArchived: false,
    isDeleted: { $ne: true }
  }).lean();

  const existingTaskByKey = new Map();
  const existingTaskByTitle = new Map();

  existingTasks.forEach((t) => {
    if (t.key) existingTaskByKey.set(t.key.toUpperCase().trim(), t);
    if (t.title) {
      const cleanTitle = t.title.toLowerCase().trim();
      existingTaskByTitle.set(cleanTitle, t);
    }
  });

  // 4. Fetch existing project sprints
  const existingSprints = await Sprint.find({ projectId }).sort({ createdAt: 1 });
  let baseDate = options.defaultStartDate ? new Date(options.defaultStartDate) : new Date();
  if (isNaN(baseDate.getTime())) baseDate = new Date();

  const latestExistingSprint = existingSprints[existingSprints.length - 1];
  if (latestExistingSprint && latestExistingSprint.endDate) {
    const nextDay = new Date(latestExistingSprint.endDate);
    nextDay.setDate(nextDay.getDate() + 1);
    if (nextDay > baseDate) {
      baseDate = nextDay;
    }
  }

  // 5. Pass 1: Discover Sprints / Phases and schedule dates
  const sprintGroups = new Map();

  rows.forEach((row, index) => {
    const hasAnyTaskTitle = Boolean(
      getRowValue(row, [
        'Level 5 – Micro Tasks',
        'Level 5 - Micro Tasks',
        'Level 5 – Micro Task',
        'Level 5 - Micro Task',
        'Level 5',
        'Level5',
        'Micro-Task',
        'Microtask',
        'Micro Task',
        'Level 4 – Development Tasks',
        'Level 4 - Development Tasks',
        'Level 4 – Development Task',
        'Level 4 - Development Task',
        'Level 4',
        'Level4',
        'Development Tasks',
        'Development Task',
        'Subtask',
        'Sub Task',
        'Level 3',
        'Level3',
        'Main Task',
        'Main Task Title',
        'Task Title',
        'Task Name',
        'Task',
        'Activity',
        'Title',
        'Summary',
        'Name',
        'Subject'
      ]).toString().trim()
    );
    if (!hasAnyTaskTitle) return;

    const sprintNameRaw = getRowValue(row, [
      'Level 2',
      'Level2',
      'Sprint',
      'Sprint Name',
      'Phase / Milestone',
      'Phase',
      'Milestone',
      'Stage',
      'Work Package',
      'Cycle'
    ], options.defaultSprintName || '').toString().trim();

    if (sprintNameRaw && sprintNameRaw.toLowerCase() !== 'backlog') {
      if (!sprintGroups.has(sprintNameRaw)) {
        sprintGroups.set(sprintNameRaw, {
          name: sprintNameRaw,
          startDateRaw: getRowValue(row, ['Phase Start Date', 'Milestone Start Date', 'Sprint Start Date', 'Sprint Start', 'Start Date']),
          endDateRaw: getRowValue(row, ['Phase End Date', 'Milestone End Date', 'Sprint End Date', 'Sprint End', 'End Date', 'Due Date']),
          goal: getRowValue(row, ['Milestone Goal', 'Phase Deliverable', 'Sprint Goal', 'Goal', 'Description', 'Phase Description'], ''),
          taskDates: []
        });
      }
      
      const tStart = parseCleanDate(getRowValue(row, ['Start Date', 'Task Start Date', 'Start', 'Planned Start Date']));
      const tEnd = parseCleanDate(getRowValue(row, ['End Date', 'Due Date', 'Task Due Date', 'Deadline', 'Finish']));
      if (tStart) sprintGroups.get(sprintNameRaw).taskDates.push(tStart);
      if (tEnd) sprintGroups.get(sprintNameRaw).taskDates.push(tEnd);
    }
  });

  const preparedSprints = [];
  const sprintMetaByName = new Map();
  let currentSprintStartDate = new Date(baseDate);

  for (const [sprintName, group] of sprintGroups.entries()) {
    let sprintStart = parseCleanDate(group.startDateRaw);
    let sprintEnd = parseCleanDate(group.endDateRaw);

    // If dates not explicitly set on phase header, calculate from earliest and latest tasks
    if (!sprintStart && group.taskDates.length > 0) {
      const minDate = new Date(Math.min(...group.taskDates.map((d) => d.getTime())));
      if (!isNaN(minDate.getTime())) sprintStart = minDate;
    }

    if (!sprintStart) {
      sprintStart = new Date(currentSprintStartDate);
    }

    if (!sprintEnd && group.taskDates.length > 0) {
      const maxDate = new Date(Math.max(...group.taskDates.map((d) => d.getTime())));
      if (!isNaN(maxDate.getTime()) && maxDate >= sprintStart) sprintEnd = maxDate;
    }

    if (!sprintEnd) {
      sprintEnd = new Date(sprintStart.getTime() + defaultCycleDays * 24 * 60 * 60 * 1000);
    }

    currentSprintStartDate = new Date(sprintEnd.getTime() + 1 * 24 * 60 * 60 * 1000);

    const sprintMeta = {
      name: sprintName,
      goal: group.goal || `Milestone deliverables for ${sprintName}`,
      startDate: sprintStart,
      endDate: sprintEnd,
      status: 'PLANNED',
      taskCount: 0,
      storyPoints: 0
    };

    preparedSprints.push(sprintMeta);
    sprintMetaByName.set(sprintName.toLowerCase().trim(), sprintMeta);
  }

  // 6. Pass 2: Natural File Order Processing (Main Tasks -> Upper Main Subtasks -> Microtasks)
  let runningCounter = (project.taskCounter || 0) + 1;
  const projKey = project.key || 'TASK';

  const preparedMainTasks = [];
  const displayTasks = []; // Flattened list for the preview table
  const warnings = [];
  let newTasksCount = 0;
  let updateTasksCount = 0;
  let subtasksCount = 0;
  let microtasksCount = 0;
  let invalidTasksCount = 0;

  const mainTasksByTitle = new Map();
  const mainTasksByKey = new Map();
  let lastMainTask = null; // Upper main task pointer
  let lastSubtask = null; // Upper subtask pointer

  rows.forEach((row, index) => {
    // ─── 0. Level Extractions ──────────────────────────────────────────────
    const level1Val = getRowValue(row, [
      'Level 1',
      'Level1',
      'Project Name',
      'Project',
      'Project Title'
    ]).toString().trim();

    const level2Val = getRowValue(row, [
      'Level 2',
      'Level2',
      'Sprint',
      'Sprint Name',
      'Phase / Milestone',
      'Phase',
      'Milestone',
      'Stage',
      'Work Package',
      'Cycle'
    ]).toString().trim();

    const level3Val = getRowValue(row, [
      'Level 3',
      'Level3',
      'Main Task',
      'Main Task Title',
      'Level 3 - Main Task',
      'Level 3 – Main Task'
    ]).toString().trim();

    const level4Val = getRowValue(row, [
      'Level 4 – Development Tasks',
      'Level 4 - Development Tasks',
      'Level 4 – Development Task',
      'Level 4 - Development Task',
      'Level 4',
      'Level4',
      'Development Tasks',
      'Development Task',
      'Subtask',
      'Sub Task',
      'Subtask Title',
      'Sub-Task'
    ]).toString().trim();

    const level5Val = getRowValue(row, [
      'Level 5 – Micro Tasks',
      'Level 5 - Micro Tasks',
      'Level 5 – Micro Task',
      'Level 5 - Micro Task',
      'Level 5',
      'Level5',
      'Micro-Task',
      'Microtask',
      'Micro Task',
      'Micro Tasks',
      'Microtask Title'
    ]).toString().trim();

    const isLevelFormat = Boolean(level3Val || level4Val || level5Val);
    let title = '';
    let isRowMicrotask = false;
    let isRowSubtask = false;
    let isExplicitMain = false;

    if (isLevelFormat) {
      if (level5Val) {
        title = level5Val;
        isRowMicrotask = true;
      } else if (level4Val) {
        title = level4Val;
        isRowSubtask = true;
      } else if (level3Val) {
        title = level3Val;
        isExplicitMain = true;
      }
    } else {
      title = getRowValue(row, [
        'Task Title',
        'Task Name',
        'Task',
        'Activity',
        'Title',
        'Summary',
        'Name',
        'Subject'
      ]).toString().trim();

      const parentRef = getRowValue(row, [
        'Parent Task',
        'Parent',
        'Main Task',
        'Parent Key',
        'Parent Title',
        'Parent ID',
        'WBS Parent'
      ]).toString().trim();

      const rawTypeVal = getRowValue(row, [
        'Task Type',
        'Type',
        'Is Subtask',
        'Subtask',
        'Level',
        'Task Category',
        'Item Type'
      ]).toString().toUpperCase().trim();

      const isExplicitMicro = rawTypeVal.includes('MIC') || rawTypeVal === '3';
      const isExplicitSub = !isExplicitMicro && (rawTypeVal.includes('SUB') || ['CHILD', 'YES', 'TRUE', '2'].includes(rawTypeVal));
      isExplicitMain = !isExplicitMicro && (rawTypeVal.includes('MAIN') || ['PARENT', 'NO', 'FALSE', '0', '1'].includes(rawTypeVal));
      isRowMicrotask = isExplicitMicro;
      isRowSubtask = !isExplicitMain && !isExplicitMicro && (isExplicitSub || Boolean(parentRef));
    }

    if (!title) return; // Skip empty rows

    const description = getRowValue(row, [
      'Task Description',
      'Description',
      'Details',
      'Notes',
      'Scope',
      'Desc'
    ]).toString().trim();

    const explicitKey = getRowValue(row, [
      'Key',
      'Task Key',
      'Issue Key',
      'ID',
      'Task ID',
      'WBS',
      'Activity ID'
    ]).toString().toUpperCase().trim();

    // Sprint / Phase mapping
    let sprintName = level2Val || getRowValue(row, [
      'Phase / Milestone',
      'Phase',
      'Milestone',
      'Stage',
      'Work Package',
      'Sprint Name',
      'Sprint',
      'Cycle'
    ], '').toString().trim();

    if (!sprintName && (isRowSubtask || isRowMicrotask) && lastMainTask) {
      sprintName = lastMainTask.sprintName;
    }
    if (!sprintName) {
      sprintName = options.defaultSprintName || 'Backlog';
    }

    const sprintMeta = sprintMetaByName.get(sprintName.toLowerCase().trim()) || null;

    // Status Normalization
    let status = getRowValue(row, ['Status', 'Stage', 'State', 'Progress'], 'TODO').toString().toUpperCase().trim().replace(/\s+/g, '_');
    if (!['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BACKLOG'].includes(status)) {
      status = 'TODO';
    }

    // Priority Normalization
    let priority = getRowValue(row, ['Priority', 'Urgency', 'Severity'], 'MEDIUM').toString().toUpperCase().trim();
    if (!['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(priority)) {
      priority = 'MEDIUM';
    }

    const storyPoints = parseInt(getRowValue(row, ['Story Points', 'Points', 'Estimate', 'SP', 'Hours', 'Effort'], 0), 10) || 0;

    // Team Resolution (Auto-defaults to Team Lead's team or Board's selected team)
    let team = getRowValue(row, ['Team', 'Team Name', 'Department', 'Discipline', 'Group']).toString().trim();
    if (!team) {
      if (isRowSubtask && lastMainTask && lastMainTask.team) {
        team = lastMainTask.team;
      } else if (forcedLeadTeamName) {
        team = forcedLeadTeamName;
      } else if (options.defaultTeam && options.defaultTeam !== 'ALL') {
        team = options.defaultTeam;
      }
    } else if (isTeamLeadUser) {
      if (!leadTeamNames.has(team.toLowerCase().trim()) && forcedLeadTeamName) {
        team = forcedLeadTeamName;
      }
    }

    // Assignee Resolution
    const rawAssignee = getRowValue(row, [
      'Assignee',
      'Assignee Name',
      'Assignee Email',
      'Owner',
      'Assigned To',
      'Resource',
      'Member',
      'User',
      'Person'
    ]).toString().trim();

    const matchedAssignee = resolveAssignee(rawAssignee);
    if (rawAssignee && !matchedAssignee) {
      warnings.push(`Row ${index + 2}: Assignee "${rawAssignee}" not found in project. Task will be created as Unassigned (assignee can be added later).`);
    }

    // Team membership check
    let isTeamMember = null;
    if (matchedAssignee && team) {
      const cleanTeam = team.toLowerCase().trim();
      const membersSet = teamMembersMap.get(cleanTeam);
      if (membersSet) {
        isTeamMember = membersSet.has(matchedAssignee._id.toString());
      }
    }

    // Strict project team validation
    const teamCode = resolveTeamCode(team, project.teams, workspaceTeams);
    const isValidTeam = teamCode !== null;
    let teamError = null;

    if (!isValidTeam) {
      const allowedTeamNames = Array.from(new Set([...(project.teams || []), ...(workspaceTeams || [])].map(t => t.name).filter(Boolean)));
      teamError = `Team "${team}" does not exist in this project. Allowed teams: ${allowedTeamNames.join(', ') || 'General'}`;
      warnings.push(`Row ${index + 2}: Team "${team}" does not exist in this project (Allowed: ${allowedTeamNames.join(', ') || 'General'}). No Task ID generated (remaining to be added later).`);
    }

    // ─── Timeline Dates & Duration Calculation ───────────────────────────────
    // Does not strictly require start and end date; defaults computed from duration!
    const rawDuration = parseInt(getRowValue(row, ['Duration (Days)', 'Duration', 'Days', 'Effort Days', 'Duration Days'], 0), 10);
    const defaultDuration = isRowMicrotask ? 1 : (isRowSubtask ? 3 : 7);
    const durationDays = rawDuration > 0 ? rawDuration : defaultDuration;

    let taskStartDate = parseCleanDate(getRowValue(row, ['Start Date', 'Task Start Date', 'Start', 'Planned Start Date', 'Planned Start']));
    let taskDueDate = parseCleanDate(getRowValue(row, ['End Date', 'Due Date', 'Task Due Date', 'Deadline', 'Finish', 'Planned Finish Date', 'Planned End']));

    if (!taskStartDate) {
      taskStartDate = sprintMeta ? new Date(sprintMeta.startDate) : new Date(baseDate);
    }

    if (!taskDueDate) {
      taskDueDate = new Date(taskStartDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
    }

    if (taskDueDate < taskStartDate) {
      taskDueDate = new Date(taskStartDate.getTime() + 1 * 24 * 60 * 60 * 1000);
    }

    const calculatedDuration = Math.max(1, Math.round((taskDueDate.getTime() - taskStartDate.getTime()) / (24 * 60 * 60 * 1000)));

    // Predecessors / Dependencies
    const dependenciesRaw = getRowValue(row, [
      'Dependencies / Predecessors',
      'Dependencies',
      'Predecessors',
      'Depends On',
      'Predecessor',
      'Blocked By',
      'Predecessor Tasks'
    ]).toString().trim();

    // Milestone Flag
    const milestoneFlagRaw = getRowValue(row, [
      'Milestone Deliverable',
      'Is Milestone',
      'Milestone',
      'Deliverable',
      'Milestone Flag'
    ]).toString().toUpperCase().trim();
    const isMilestone = ['YES', 'TRUE', '1', 'MILESTONE'].includes(milestoneFlagRaw);

    // ─────────────────────────────────────────────────────────────────────────
    // CASE A0: THIS ROW IS A MICROTASK
    // ─────────────────────────────────────────────────────────────────────────
    if (isRowMicrotask) {
      const targetMainTitle = level3Val || (lastMainTask ? lastMainTask.title : '');
      const targetSubTitle = level4Val || (lastSubtask ? lastSubtask.title : '');

      let parentMain = lastMainTask;
      if (targetMainTitle) {
        const cleanMT = targetMainTitle.toLowerCase().trim();
        parentMain = mainTasksByTitle.get(cleanMT) || existingTaskByTitle.get(cleanMT) || lastMainTask;
      }

      // If parentMain doesn't exist yet, auto-create it
      if (!parentMain && targetMainTitle) {
        let existingMain = existingTaskByTitle.get(targetMainTitle.toLowerCase().trim());
        const isUpdate = Boolean(existingMain);
        let taskNumber = null;
        let key = '';

        if (isUpdate) {
          updateTasksCount++;
          taskNumber = existingMain.taskNumber;
          key = existingMain.key;
        } else {
          newTasksCount++;
          taskNumber = runningCounter++;
          const mainTeamCode = resolveTeamCode(team || options.defaultTeam, project.teams, workspaceTeams) || 'GEN';
          key = `${projKey}-MT-${mainTeamCode}-${taskNumber}`;
        }

        const effectiveSprint = level2Val || sprintName || (existingMain ? existingMain.sprint : null) || options.defaultSprintName || 'Backlog';

        parentMain = {
          action: isUpdate ? 'UPDATE' : 'CREATE',
          isValidTeam: true,
          existingTaskId: isUpdate ? existingMain._id : null,
          taskNumber,
          key,
          title: targetMainTitle,
          description: existingMain ? existingMain.description : '',
          issueType: 'TASK',
          priority: existingMain ? existingMain.priority : priority,
          status: existingMain ? existingMain.status : 'TODO',
          storyPoints: 0,
          team: existingMain ? existingMain.team : (team || options.defaultTeam || 'General'),
          assigneeId: existingMain ? existingMain.assigneeId : (matchedAssignee ? matchedAssignee._id : null),
          assigneeName: existingMain ? (existingMain.assigneeId?.name || '') : (matchedAssignee ? matchedAssignee.name : ''),
          assigneeEmail: existingMain ? (existingMain.assigneeId?.email || '') : (matchedAssignee ? matchedAssignee.email : ''),
          startDate: taskStartDate,
          dueDate: taskDueDate,
          durationDays: 7,
          dependencies: '',
          isMilestone: false,
          phase: effectiveSprint,
          sprintName: effectiveSprint,
          sprintIndex: effectiveSprint,
          subtasks: existingMain?.subtasks ? [...existingMain.subtasks] : []
        };

        preparedMainTasks.push(parentMain);
        mainTasksByTitle.set(targetMainTitle.toLowerCase().trim(), parentMain);
        if (key) mainTasksByKey.set(key.toUpperCase().trim(), parentMain);

        displayTasks.push({
          action: parentMain.action,
          type: 'Main Task',
          key: parentMain.key,
          title: parentMain.title,
          parentKey: '',
          parentTitle: '',
          team: parentMain.team,
          assignee: parentMain.assigneeName || 'Unassigned',
          phase: parentMain.sprintName,
          sprintName: parentMain.sprintName,
          startDate: parentMain.startDate,
          dueDate: parentMain.dueDate,
          durationDays: parentMain.durationDays,
          priority: parentMain.priority,
          status: parentMain.status,
          subtasksCount: parentMain.subtasks.length
        });
      }

      if (parentMain) {
        lastMainTask = parentMain;
      }

      let parentSubtask = lastSubtask;
      if (parentMain && Array.isArray(parentMain.subtasks)) {
        if (targetSubTitle) {
          const cleanST = targetSubTitle.toLowerCase().trim();
          parentSubtask = parentMain.subtasks.find(st => (st.title && st.title.toLowerCase().trim() === cleanST));
        }
        if (!parentSubtask && parentMain.subtasks.length > 0) {
          parentSubtask = parentMain.subtasks[parentMain.subtasks.length - 1];
        }
      }

      // If parentSubtask still null but targetSubTitle exists, create Subtask under parentMain
      if (!parentSubtask && parentMain && targetSubTitle) {
        const cleanTeamCode = resolveTeamCode(team || parentMain.team, project.teams, workspaceTeams) || 'GEN';
        const subIdx = (parentMain.subtasks?.length || 0) + 1;
        const mtId = parentMain.taskNumber || 1;
        const subKey = `${projKey}-ST-${cleanTeamCode}-${mtId}-${subIdx}`;

        parentSubtask = {
          key: subKey,
          title: targetSubTitle,
          description: '',
          status: 'TODO',
          isCompleted: false,
          startDate: taskStartDate,
          dueDate: taskDueDate,
          assigneeId: matchedAssignee ? matchedAssignee._id : null,
          assigneeName: matchedAssignee ? matchedAssignee.name : null,
          assigneeEmail: matchedAssignee ? matchedAssignee.email : null,
          microtasks: []
        };
        if (!parentMain.subtasks) parentMain.subtasks = [];
        parentMain.subtasks.push(parentSubtask);
        subtasksCount++;
      }

      if (parentSubtask) {
        lastSubtask = parentSubtask;
        if (!parentSubtask.microtasks) parentSubtask.microtasks = [];
        microtasksCount++;

        // If microtask is created under subtask, subtask assignee must be blank/unassigned
        parentSubtask.assigneeId = null;
        parentSubtask.assigneeName = null;
        parentSubtask.assigneeEmail = null;

        // Parent main task assignee must also be blank/unassigned
        if (parentMain) {
          parentMain.assigneeId = null;
          parentMain.assigneeName = null;
          parentMain.assigneeEmail = null;
        }

        const micIndex = parentSubtask.microtasks.length + 1;
        const mtId = parentMain?.taskNumber || 1;
        const subIdx = parentSubtask.key ? (parentSubtask.key.match(/-(\d+)$/)?.[1] || 1) : 1;
        const cleanTeamCode = resolveTeamCode(team || parentMain?.team, project.teams, workspaceTeams) || 'GEN';
        let micKey = explicitKey;
        if (!micKey || !/^[^-]+-MIC-[A-Z0-9]+-\d+-\d+-\d+$/.test(micKey)) {
          micKey = `${projKey}-MIC-${cleanTeamCode}-${mtId}-${subIdx}-${micIndex}`;
        }

        const cleanMicTitle = title.toLowerCase().trim();
        const existingMicIndex = parentSubtask.microtasks.findIndex(
          (m) => (m.title && m.title.toLowerCase().trim() === cleanMicTitle) ||
                 (m.key && explicitKey && m.key.toUpperCase().trim() === explicitKey.toUpperCase().trim())
        );

        let micPayload = null;
        let micAction = 'CREATE';
        if (existingMicIndex >= 0) {
          micAction = 'UPDATE';
          const existingMic = parentSubtask.microtasks[existingMicIndex];
          existingMic.title = title;
          if (description) existingMic.description = description;
          existingMic.status = status;
          existingMic.isCompleted = (status === 'DONE');
          existingMic.startDate = taskStartDate;
          existingMic.dueDate = taskDueDate;
          if (matchedAssignee) {
            existingMic.assigneeId = matchedAssignee._id;
            existingMic.assigneeName = matchedAssignee.name;
            existingMic.assigneeEmail = matchedAssignee.email;
          }
          micPayload = existingMic;
        } else {
          micPayload = {
            _id: new mongoose.Types.ObjectId(),
            key: micKey,
            title,
            description,
            status,
            isCompleted: (status === 'DONE'),
            startDate: taskStartDate,
            dueDate: taskDueDate,
            assigneeId: matchedAssignee ? matchedAssignee._id : null,
            assigneeName: matchedAssignee ? matchedAssignee.name : (rawAssignee || ''),
            assigneeEmail: matchedAssignee ? matchedAssignee.email : '',
            createdBy: userId,
            createdAt: new Date()
          };
          parentSubtask.microtasks.push(micPayload);
        }

        displayTasks.push({
          isMicrotask: true,
          isSubtask: false,
          parentKey: parentSubtask.key,
          parentTitle: parentSubtask.title,
          action: micAction,
          isValidTeam: true,
          key: micKey,
          title,
          description,
          team: team || parentMain?.team || 'General',
          assigneeName: matchedAssignee ? matchedAssignee.name : (rawAssignee || null),
          assigneeEmail: matchedAssignee ? matchedAssignee.email : null,
          isTeamMember,
          phase: parentMain?.phase || sprintName,
          sprintName: parentMain?.sprintName || sprintName,
          startDate: taskStartDate,
          dueDate: taskDueDate,
          durationDays: calculatedDuration,
          dependencies: dependenciesRaw,
          isMilestone,
          priority,
          status,
          storyPoints: 0
        });

        return; // Microtask row processed!
      } else {
        warnings.push(`Row ${index + 2}: No upper Subtask found for microtask "${title}". Created as Subtask.`);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CASE A: THIS ROW IS A SUBTASK
    // ─────────────────────────────────────────────────────────────────────────
    if (isRowSubtask) {
      let parentTask = null;
      const targetMainTitle = level3Val || (lastMainTask ? lastMainTask.title : '');

      if (targetMainTitle) {
        const cleanParent = targetMainTitle.toLowerCase().trim();
        parentTask = mainTasksByTitle.get(cleanParent) ||
                     mainTasksByKey.get(cleanParent.toUpperCase()) ||
                     existingTaskByKey.get(cleanParent.toUpperCase()) ||
                     existingTaskByTitle.get(cleanParent);
      }

      if (!parentTask && lastMainTask) {
        parentTask = lastMainTask;
      }

      // If parentTask does not exist in preparedMainTasks, auto-create/load it!
      if (!parentTask && targetMainTitle) {
        let existingMain = existingTaskByTitle.get(targetMainTitle.toLowerCase().trim());
        const isUpdate = Boolean(existingMain);
        let taskNumber = null;
        let key = '';

        if (isUpdate) {
          updateTasksCount++;
          taskNumber = existingMain.taskNumber;
          key = existingMain.key;
        } else {
          newTasksCount++;
          taskNumber = runningCounter++;
          const mainTeamCode = resolveTeamCode(team || options.defaultTeam, project.teams, workspaceTeams) || 'GEN';
          key = `${projKey}-MT-${mainTeamCode}-${taskNumber}`;
        }

        const effectiveSprint = level2Val || sprintName || (existingMain ? existingMain.sprint : null) || options.defaultSprintName || 'Backlog';

        parentTask = {
          action: isUpdate ? 'UPDATE' : 'CREATE',
          isValidTeam: true,
          existingTaskId: isUpdate ? existingMain._id : null,
          taskNumber,
          key,
          title: targetMainTitle,
          description: existingMain ? (existingMain.description || '') : '',
          issueType: 'TASK',
          priority: existingMain ? existingMain.priority : priority,
          status: existingMain ? existingMain.status : 'TODO',
          storyPoints: 0,
          team: existingMain ? existingMain.team : (team || options.defaultTeam || 'General'),
          assigneeId: existingMain ? existingMain.assigneeId : (matchedAssignee ? matchedAssignee._id : null),
          assigneeName: existingMain ? (existingMain.assigneeId?.name || '') : (matchedAssignee ? matchedAssignee.name : ''),
          assigneeEmail: existingMain ? (existingMain.assigneeId?.email || '') : (matchedAssignee ? matchedAssignee.email : ''),
          startDate: taskStartDate,
          dueDate: taskDueDate,
          durationDays: 7,
          dependencies: '',
          isMilestone: false,
          phase: effectiveSprint,
          sprintName: effectiveSprint,
          sprintIndex: effectiveSprint,
          subtasks: existingMain?.subtasks ? [...existingMain.subtasks] : []
        };

        preparedMainTasks.push(parentTask);
        mainTasksByTitle.set(targetMainTitle.toLowerCase().trim(), parentTask);
        if (key) mainTasksByKey.set(key.toUpperCase().trim(), parentTask);

        displayTasks.push({
          action: parentTask.action,
          type: 'Main Task',
          key: parentTask.key,
          title: parentTask.title,
          parentKey: '',
          parentTitle: '',
          team: parentTask.team,
          assignee: parentTask.assigneeName || 'Unassigned',
          phase: parentTask.sprintName,
          sprintName: parentTask.sprintName,
          startDate: parentTask.startDate,
          dueDate: parentTask.dueDate,
          durationDays: parentTask.durationDays,
          priority: parentTask.priority,
          status: parentTask.status,
          subtasksCount: parentTask.subtasks.length
        });
      }

      if (parentTask) {
        lastMainTask = parentTask;

        // Ensure parentTask is registered in preparedMainTasks if from MongoDB
        if (!parentTask.action) {
          const existingDoc = parentTask;
          parentTask = {
            action: 'UPDATE',
            existingTaskId: existingDoc._id,
            taskNumber: existingDoc.taskNumber,
            key: existingDoc.key,
            title: existingDoc.title,
            description: existingDoc.description || '',
            issueType: 'TASK',
            priority: existingDoc.priority || 'MEDIUM',
            status: existingDoc.status || 'TODO',
            storyPoints: existingDoc.storyPoints || 0,
            team: existingDoc.team || team,
            assigneeId: existingDoc.assigneeId,
            assigneeName: existingDoc.assigneeId?.name || '',
            assigneeEmail: existingDoc.assigneeId?.email || '',
            isTeamMember: null,
            startDate: existingDoc.startDate,
            dueDate: existingDoc.dueDate,
            durationDays: 7,
            dependencies: '',
            isMilestone: false,
            phase: existingDoc.epic || sprintName,
            sprintName: existingDoc.sprint || sprintName,
            sprintIndex: existingDoc.sprint || null,
            subtasks: existingDoc.subtasks ? [...existingDoc.subtasks] : []
          };
          preparedMainTasks.push(parentTask);
          mainTasksByTitle.set(parentTask.title.toLowerCase().trim(), parentTask);
          if (parentTask.key) mainTasksByKey.set(parentTask.key.toUpperCase().trim(), parentTask);
          lastMainTask = parentTask;
          updateTasksCount++;
        }

        if (!parentTask.subtasks) parentTask.subtasks = [];

        // Smart Upsert for Subtasks: check if subtask already exists under this parent
        const cleanSubTitle = title.toLowerCase().trim();
        const existingSubIndex = parentTask.subtasks.findIndex(
          (s) => (s.title && s.title.toLowerCase().trim() === cleanSubTitle) ||
                 (s.key && explicitKey && s.key.toUpperCase().trim() === explicitKey.toUpperCase().trim())
        );

        let isSubValidTeam = (parentTask.isValidTeam !== false) && isValidTeam;
        let subKey = '—';
        if (isSubValidTeam) {
          subtasksCount++;
          const subIndex = parentTask.subtasks.length + 1;
          const mtId = parentTask.taskNumber || (parentTask.key ? parentTask.key.match(/(\d+)$/)?.[1] : subIndex) || subIndex;
          let subTeamCode = teamCode || 'GEN';
          subKey = `${projKey}-ST-${subTeamCode}-${mtId}-${subIndex}`;
        } else {
          invalidTasksCount++;
        }

        let subAction = 'CREATE';
        let subtaskPayload = null;

        if (existingSubIndex >= 0) {
          // UPDATE existing subtask
          subAction = 'UPDATE';
          const existingSub = parentTask.subtasks[existingSubIndex];
          subKey = existingSub.key;
          existingSub.title = title;
          if (description) existingSub.description = description;
          existingSub.status = status;
          existingSub.isCompleted = (status === 'DONE');
          existingSub.startDate = taskStartDate;
          existingSub.dueDate = taskDueDate;
          if (matchedAssignee) {
            existingSub.assigneeId = matchedAssignee._id;
            existingSub.assigneeName = matchedAssignee.name;
            existingSub.assigneeEmail = matchedAssignee.email;
          }
          subtaskPayload = existingSub;
        } else {
          subtaskPayload = {
            _id: new mongoose.Types.ObjectId(),
            key: isSubValidTeam ? subKey : '',
            isValidTeam: isSubValidTeam,
            title,
            description,
            status,
            isCompleted: (status === 'DONE'),
            startDate: taskStartDate,
            dueDate: taskDueDate,
            assigneeId: matchedAssignee ? matchedAssignee._id : null,
            assigneeName: matchedAssignee ? matchedAssignee.name : (rawAssignee || ''),
            assigneeEmail: matchedAssignee ? matchedAssignee.email : '',
            createdBy: userId,
            createdAt: new Date(),
            microtasks: []
          };
          if (isSubValidTeam) {
            parentTask.subtasks.push(subtaskPayload);
            // If subtask is created, parent main task assignee must be blank/unassigned
            parentTask.assigneeId = null;
            parentTask.assigneeName = null;
            parentTask.assigneeEmail = null;
          }
        }

        // Add to flattened visual display table for preview
        displayTasks.push({
          isSubtask: true,
          parentKey: parentTask.key,
          parentTitle: parentTask.title,
          action: !isSubValidTeam ? 'SKIP' : (subAction === 'UPDATE' ? 'UPDATE' : 'CREATE'),
          isValidTeam: isSubValidTeam,
          teamError: !isSubValidTeam ? (teamError || parentTask.teamError || 'Parent Main Task has invalid team') : null,
          key: isSubValidTeam ? subKey : '—',
          title,
          description,
          team: team || parentTask.team || 'General',
          assigneeName: matchedAssignee ? matchedAssignee.name : (rawAssignee || null),
          assigneeEmail: matchedAssignee ? matchedAssignee.email : null,
          isTeamMember,
          phase: parentTask.phase || sprintName,
          sprintName: parentTask.sprintName,
          startDate: taskStartDate,
          dueDate: taskDueDate,
          durationDays: calculatedDuration,
          dependencies: dependenciesRaw,
          isMilestone,
          priority,
          status,
          storyPoints: 0
        });

        lastSubtask = subtaskPayload;
        return; // Subtask row processed!
      } else {
        warnings.push(`Row ${index + 2}: No upper Main Task found for subtask "${title}". Created as standalone Main Task.`);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CASE B: THIS ROW IS A MAIN TASK
    // ─────────────────────────────────────────────────────────────────────────
    const cleanMainTitle = title.toLowerCase().trim();
    const alreadyInBatch = mainTasksByTitle.get(cleanMainTitle);
    if (alreadyInBatch) {
      lastMainTask = alreadyInBatch;
      lastSubtask = null;
      return;
    }

    let existingTask = null;
    if (explicitKey && existingTaskByKey.has(explicitKey)) {
      existingTask = existingTaskByKey.get(explicitKey);
    } else {
      if (existingTaskByTitle.has(cleanMainTitle)) {
        existingTask = existingTaskByTitle.get(cleanMainTitle);
      }
    }

    const isUpdate = !!existingTask;
    let taskNumber = null;
    let key = '';

    if (!isValidTeam) {
      invalidTasksCount++;
    } else if (isUpdate) {
      updateTasksCount++;
      taskNumber = existingTask.taskNumber;
      key = existingTask.key;
    } else {
      newTasksCount++;
      taskNumber = runningCounter++;
      key = `${projKey}-MT-${teamCode}-${taskNumber}`;
    }

    const mainTaskObj = {
      action: !isValidTeam ? 'SKIP' : (isUpdate ? 'UPDATE' : 'CREATE'),
      isValidTeam,
      teamError,
      existingTaskId: isUpdate ? existingTask._id : null,
      taskNumber,
      key: isValidTeam ? key : '—',
      title,
      description,
      issueType: 'TASK',
      priority,
      status,
      storyPoints,
      team: team || 'General',
      assigneeId: matchedAssignee ? matchedAssignee._id : null,
      assigneeName: matchedAssignee ? matchedAssignee.name : (rawAssignee || null),
      assigneeEmail: matchedAssignee ? matchedAssignee.email : null,
      assigneeAvatar: matchedAssignee ? matchedAssignee.avatar : null,
      isTeamMember,
      startDate: taskStartDate,
      dueDate: taskDueDate,
      durationDays: calculatedDuration,
      dependencies: dependenciesRaw,
      isMilestone,
      phase: sprintName,
      sprintName: sprintMeta ? sprintMeta.name : sprintName,
      sprintIndex: sprintMeta ? sprintMeta.name : null,
      subtasks: existingTask?.subtasks ? [...existingTask.subtasks] : []
    };

    // Also check for embedded subtasks in column "Subtasks" (e.g. "Check pinout; Calibrate clock")
    const embeddedSubtasksStr = getRowValue(row, ['Subtasks', 'Sub Task', 'Sub Tasks', 'Checklist']);
    if (embeddedSubtasksStr) {
      const subTitles = embeddedSubtasksStr.toString().split(/[;\n]+/).map((s) => s.trim()).filter(Boolean);
      subTitles.forEach((stTitle) => {
        const cleanSt = stTitle.toLowerCase().trim();
        const alreadyExists = mainTaskObj.subtasks.some((s) => s.title && s.title.toLowerCase().trim() === cleanSt);
        if (alreadyExists) return;

        subtasksCount++;
        const subIndex = mainTaskObj.subtasks.length + 1;
        const mtId = mainTaskObj.taskNumber;
        const subKey = `${projKey}-ST-${teamCode || 'GEN'}-${mtId}-${subIndex}`;

        mainTaskObj.subtasks.push({
          _id: new mongoose.Types.ObjectId(),
          key: subKey,
          title: stTitle,
          status: 'TODO',
          isCompleted: false,
          startDate: mainTaskObj.startDate,
          dueDate: mainTaskObj.dueDate,
          assigneeId: mainTaskObj.assigneeId,
          createdBy: userId,
          createdAt: new Date(),
          microtasks: []
        });

        displayTasks.push({
          isSubtask: true,
          parentKey: mainTaskObj.key,
          parentTitle: mainTaskObj.title,
          action: mainTaskObj.action === 'UPDATE' ? 'UPDATE' : 'CREATE',
          key: subKey,
          title: stTitle,
          team: mainTaskObj.team,
          assigneeName: mainTaskObj.assigneeName,
          assigneeEmail: mainTaskObj.assigneeEmail,
          isTeamMember: mainTaskObj.isTeamMember,
          phase: mainTaskObj.phase,
          sprintName: mainTaskObj.sprintName,
          startDate: mainTaskObj.startDate,
          dueDate: mainTaskObj.dueDate,
          durationDays: mainTaskObj.durationDays,
          dependencies: '',
          isMilestone: false,
          priority: 'MEDIUM',
          status: 'TODO',
          storyPoints: 0
        });
      });
    }

    // Set as the upper main task for any subsequent subtask rows
    lastMainTask = mainTaskObj;
    lastSubtask = null;
    mainTasksByTitle.set(title.toLowerCase().trim(), mainTaskObj);
    if (key) mainTasksByKey.set(key.toUpperCase().trim(), mainTaskObj);

    preparedMainTasks.push(mainTaskObj);
    displayTasks.push(mainTaskObj);

    if (sprintMeta) {
      sprintMeta.taskCount++;
      sprintMeta.storyPoints += storyPoints;
    }
  });

  return {
    project,
    isTeamLeadUser,
    forcedLeadTeamName,
    preparedSprints,
    preparedTasks: displayTasks, // All tasks + subtasks + microtasks with timeline metadata for preview table
    actualMainTasks: preparedMainTasks, // Main tasks with embedded subtasks & microtasks for database write
    summary: {
      totalSprints: preparedSprints.length,
      totalTasks: newTasksCount + updateTasksCount,
      totalSubtasks: subtasksCount,
      totalMicrotasks: microtasksCount,
      newTasksCount,
      updateTasksCount,
      invalidTasksCount,
      validTasksCount: newTasksCount + updateTasksCount + subtasksCount + microtasksCount,
      allowedProjectTeams: Array.from(new Set([...(project.teams || []), ...(workspaceTeams || [])].map(t => t.name).filter(Boolean))),
      defaultCycleDays,
      warnings
    }
  };
};

// @desc    Preview Spreadsheet Import with Subtasks, Smart Upsert & Timeline Engine
// @route   POST /api/v1/projects/:projectId/import-excel/preview
// @access  Private
const previewExcelImport = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  let rows = [];

  if (req.file) {
    rows = parseSpreadsheetData(req.file.buffer);
  } else if (Array.isArray(req.body.items)) {
    rows = req.body.items;
  } else {
    return res.status(400).json({ success: false, error: 'Please upload an Excel/CSV file or provide JSON items' });
  }

  if (rows.length === 0) {
    return res.status(400).json({ success: false, error: 'Spreadsheet has no data or no tasks found' });
  }

  const options = {
    defaultCycleDays: req.body.defaultCycleDays || 14,
    defaultStartDate: req.body.defaultStartDate || null,
    defaultSprintName: req.body.defaultSprintName || null,
    defaultTeam: req.body.defaultTeam || null
  };

  const preview = await processImportRows(projectId, rows, options, req.user);

  res.json({
    success: true,
    data: preview
  });
});

// @desc    Execute Spreadsheet Import with Timeline Hierarchy, Subtasks & Dependencies
// @route   POST /api/v1/projects/:projectId/import-excel/execute
// @access  Private
const executeExcelImport = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  let rows = [];

  if (req.file) {
    rows = parseSpreadsheetData(req.file.buffer);
  } else if (Array.isArray(req.body.items)) {
    rows = req.body.items;
  } else {
    return res.status(400).json({ success: false, error: 'Please upload an Excel/CSV file or provide items array' });
  }

  if (rows.length === 0) {
    return res.status(400).json({ success: false, error: 'No tasks to import' });
  }

  const options = {
    defaultCycleDays: req.body.defaultCycleDays || 14,
    defaultStartDate: req.body.defaultStartDate || null,
    defaultSprintName: req.body.defaultSprintName || null,
    defaultTeam: req.body.defaultTeam || null
  };

  const processed = await processImportRows(projectId, rows, options, req.user);
  const project = processed.project;

  // 1. Create or Find Sprints / Phases
  const sprintRecordMap = new Map();
  const createdSprints = [];

  for (const s of processed.preparedSprints) {
    let existing = await Sprint.findOne({ projectId, name: s.name });
    if (!existing) {
      existing = await Sprint.create({
        name: s.name,
        goal: s.goal,
        status: s.status || 'PLANNED',
        projectId,
        workspaceId: project.workspaceId,
        startDate: s.startDate,
        endDate: s.endDate,
        createdBy: req.user._id,
        history: [
          {
            changedBy: req.user._id,
            action: 'CREATED',
            newStartDate: s.startDate,
            newEndDate: s.endDate,
            reason: 'Imported from Timeline Project Plan spreadsheet',
            createdAt: new Date()
          }
        ]
      });
      createdSprints.push(existing);
    }
    sprintRecordMap.set(s.name, existing);
  }

  // 2. Perform Smart Upsert on Main Tasks with Embedded Subtasks (ONLY VALID TASKS)
  const tasksToInsert = [];
  const updatedTasks = [];
  const activitiesToInsert = [];

  const validMainTasks = processed.actualMainTasks.filter(t => t.isValidTeam !== false && t.action !== 'SKIP');

  for (const taskData of validMainTasks) {
    const sprintDoc = taskData.sprintName ? sprintRecordMap.get(taskData.sprintName) : null;

    if (taskData.action === 'UPDATE' && taskData.existingTaskId) {
      // Update existing task and its subtasks
      const updateFields = {
        title: taskData.title,
        description: taskData.description,
        issueType: 'TASK',
        priority: taskData.priority,
        status: taskData.status,
        storyPoints: taskData.storyPoints,
        team: taskData.team || '',
        epic: taskData.phase || '',
        startDate: taskData.startDate,
        dueDate: taskData.dueDate,
        subtasks: taskData.subtasks || [],
        customFields: {
          durationDays: taskData.durationDays,
          dependenciesText: taskData.dependencies,
          isMilestone: taskData.isMilestone
        },
        updatedBy: req.user._id
      };

      const hasSubtasks = taskData.subtasks && taskData.subtasks.length > 0;
      if (hasSubtasks) {
        updateFields.assigneeId = null;
      } else if (taskData.assigneeId) {
        updateFields.assigneeId = taskData.assigneeId;
      }
      if (sprintDoc) {
        updateFields.sprintId = sprintDoc._id;
        updateFields.sprint = sprintDoc.name;
      }

      // Ensure subtasks with microtasks have no subtask-level assignee
      if (Array.isArray(updateFields.subtasks)) {
        updateFields.subtasks = updateFields.subtasks.map(s => ({
          ...s,
          assigneeId: (s.microtasks && s.microtasks.length > 0) ? null : (s.assigneeId || null)
        }));
      }

      const updated = await Task.findByIdAndUpdate(taskData.existingTaskId, updateFields, { new: true });
      if (updated) {
        updatedTasks.push(updated);
        activitiesToInsert.push({
          taskId: updated._id,
          projectId,
          userId: req.user._id,
          action: 'UPDATED',
          newValue: `Task ${updated.key} updated via Project Plan re-import`
        });
      }
    } else {
      // Create new main task with its subtasks
      const hasSubtasks = taskData.subtasks && taskData.subtasks.length > 0;
      const cleanSubtasks = (taskData.subtasks || [])
        .filter(s => s.isValidTeam !== false)
        .map(s => ({
          ...s,
          assigneeId: (s.microtasks && s.microtasks.length > 0) ? null : (s.assigneeId || null)
        }));

      const taskPayload = {
        key: taskData.key,
        taskNumber: taskData.taskNumber,
        title: taskData.title,
        description: taskData.description,
        issueType: 'TASK',
        priority: taskData.priority,
        status: taskData.status,
        storyPoints: taskData.storyPoints,
        projectId,
        workspaceId: project.workspaceId,
        assigneeId: hasSubtasks ? null : (taskData.assigneeId || null),
        reporterId: req.user._id,
        sprintId: sprintDoc ? sprintDoc._id : null,
        sprint: sprintDoc ? sprintDoc.name : (taskData.sprintName || 'Backlog'),
        epic: taskData.phase || '',
        team: taskData.team || '',
        startDate: taskData.startDate,
        dueDate: taskData.dueDate,
        subtasks: cleanSubtasks,
        customFields: {
          durationDays: taskData.durationDays,
          dependenciesText: taskData.dependencies,
          isMilestone: taskData.isMilestone
        },
        createdBy: req.user._id
      };
      tasksToInsert.push(taskPayload);
    }
  }

  // Update project task counter for newly created tasks
  const maxTaskNumberCreated = tasksToInsert.length > 0
    ? Math.max(...tasksToInsert.map((t) => t.taskNumber))
    : project.taskCounter;

  if (maxTaskNumberCreated > project.taskCounter) {
    await Project.findByIdAndUpdate(projectId, { taskCounter: maxTaskNumberCreated });
  }

  let insertedTasks = [];
  if (tasksToInsert.length > 0) {
    insertedTasks = await Task.insertMany(tasksToInsert);
    insertedTasks.forEach((t) => {
      activitiesToInsert.push({
        taskId: t._id,
        projectId,
        userId: req.user._id,
        action: 'CREATED',
        newValue: `Task ${t.key} with ${t.subtasks?.length || 0} subtasks imported from Project Plan: ${t.title}`
      });
    });
  }

  // 3. Wire Predecessors / Dependencies into Task.linkedIssues (DAG Dependency Graph)
  const allProjectTasks = await Task.find({
    projectId,
    isArchived: false,
    isDeleted: { $ne: true }
  });

  const taskMapByTitle = new Map();
  const taskMapByKey = new Map();

  allProjectTasks.forEach((t) => {
    if (t.title) taskMapByTitle.set(t.title.toLowerCase().trim(), t);
    if (t.key) taskMapByKey.set(t.key.toUpperCase().trim(), t);
  });

  let dependenciesCount = 0;

  for (const taskData of validMainTasks) {
    if (taskData.dependencies && String(taskData.dependencies).trim()) {
      const currentTask = taskMapByKey.get(taskData.key.toUpperCase().trim()) ||
                          taskMapByTitle.get(taskData.title.toLowerCase().trim());

      if (currentTask) {
        const depTokens = String(taskData.dependencies)
          .split(/[;,]+/)
          .map((s) => s.trim())
          .filter(Boolean);

        for (const depToken of depTokens) {
          const targetTask = taskMapByKey.get(depToken.toUpperCase()) ||
                             taskMapByTitle.get(depToken.toLowerCase());

          if (targetTask && targetTask._id.toString() !== currentTask._id.toString()) {
            dependenciesCount++;
            // Link currentTask blocked by targetTask
            await Task.findByIdAndUpdate(currentTask._id, {
              $addToSet: {
                linkedIssues: {
                  type: 'is_blocked_by',
                  targetTaskId: targetTask._id
                }
              }
            });
            // Reverse link targetTask blocks currentTask
            await Task.findByIdAndUpdate(targetTask._id, {
              $addToSet: {
                linkedIssues: {
                  type: 'blocks',
                  targetTaskId: currentTask._id
                }
              }
            });
          }
        }
      }
    }
  }

  if (activitiesToInsert.length > 0) {
    await Activity.insertMany(activitiesToInsert);
  }

  // Invalidate Redis Caches
  try {
    await CacheService.delPattern(`tasks:${projectId}*`);
    await CacheService.delPattern(`kanban:${projectId}*`);
  } catch (_) {}

  const validSubtasksCount = processed.actualSubtasks
    ? processed.actualSubtasks.filter(s => s.isValidTeam !== false).length
    : 0;

  // Socket notification to all project members
  emitToProject(projectId, 'tasks:imported', {
    sprintCount: createdSprints.length,
    insertedCount: insertedTasks.length,
    updatedCount: updatedTasks.length,
    subtasksCount: validSubtasksCount,
    skippedInvalidCount: processed.invalidTasksCount || 0,
    dependenciesCount
  });

  res.status(201).json({
    success: true,
    message: `Processed: ${insertedTasks.length} created, ${updatedTasks.length} updated, ${validSubtasksCount} subtasks, ${dependenciesCount} dependencies across ${createdSprints.length} phases (${processed.invalidTasksCount || 0} skipped due to invalid teams)`,
    data: {
      sprintsCount: createdSprints.length,
      createdCount: insertedTasks.length,
      updatedCount: updatedTasks.length,
      subtasksCount: validSubtasksCount,
      skippedInvalidCount: processed.invalidTasksCount || 0,
      dependenciesCount,
      createdSprints,
      insertedTasks,
      updatedTasks,
      warnings: processed.summary.warnings
    }
  });
});

/**
 * @desc    Generate dynamic project-specific Excel template with interactive dropdowns
 * @route   GET /api/v1/projects/:projectId/import-excel/template
 * @access  Private
 */
const downloadProjectExcelTemplate = asyncHandler(async (req, res) => {
  const { projectId } = req.params;

  const project = await Project.findById(projectId).populate('leadId');
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  // 1. Fetch project sprints
  const sprints = await Sprint.find({ projectId }).sort({ createdAt: 1 }).lean();
  const sprintOptions = [];
  if (sprints && sprints.length > 0) {
    sprints.forEach((s) => {
      if (s.name && !sprintOptions.includes(s.name.trim())) {
        sprintOptions.push(s.name.trim());
      }
    });
  }
  if (!sprintOptions.includes('Backlog')) {
    sprintOptions.push('Backlog');
  }
  if (sprintOptions.length <= 1) {
    sprintOptions.unshift('Sprint 2');
    sprintOptions.unshift('Sprint 1');
  }

  // 2. Fetch project teams (Project-specific teams + Workspace global teams)
  const teamOptions = [];
  if (Array.isArray(project.teams)) {
    project.teams.forEach((t) => {
      const name = t.name ? t.name.trim() : (typeof t === 'string' ? t.trim() : '');
      if (name && !teamOptions.includes(name)) {
        teamOptions.push(name);
      }
    });
  }
  const workspaceTeams = await Team.find({ workspaceId: project.workspaceId }).lean();
  workspaceTeams.forEach((wt) => {
    if (wt.name && !teamOptions.includes(wt.name.trim())) {
      teamOptions.push(wt.name.trim());
    }
  });

  // 3. Fetch project members / assignees
  const userIds = new Set();
  if (project.leadId) {
    userIds.add((project.leadId._id || project.leadId).toString());
  }
  if (Array.isArray(project.members)) {
    project.members.forEach((m) => {
      const uId = (m.userId?._id || m.userId || m)?.toString();
      if (uId) userIds.add(uId);
    });
  }
  if (Array.isArray(project.teams)) {
    project.teams.forEach((t) => {
      if (t.leadId) userIds.add((t.leadId._id || t.leadId).toString());
      if (Array.isArray(t.members)) {
        t.members.forEach((m) => {
          const uId = (m._id || m.userId?._id || m.userId || m)?.toString();
          if (uId) userIds.add(uId);
        });
      }
    });
  }
  const workspace = await Workspace.findById(project.workspaceId).lean();
  if (workspace?.ownerId) userIds.add(workspace.ownerId.toString());
  if (Array.isArray(workspace?.members)) {
    workspace.members.forEach((m) => {
      const uId = (m.userId?._id || m.userId || m)?.toString();
      if (uId) userIds.add(uId);
    });
  }

  const users = await User.find({ _id: { $in: Array.from(userIds) } })
    .select('name email')
    .sort({ name: 1 })
    .lean();

  const assigneeOptions = users.map((u) => {
    return u.name ? `${u.name} <${u.email}>` : u.email;
  });

  // 4. Construct Excel Workbook with ExcelJS
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Outdid Project Monitor System';
  workbook.created = new Date();

  // Primary Sheet: Project Timeline Plan
  const worksheet = workbook.addWorksheet('Project Timeline Plan', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  // Lookup Sheet for dynamic dropdowns (Hidden)
  const lookupSheet = workbook.addWorksheet('Project_Dropdown_Data');
  lookupSheet.state = 'hidden';

  // Fill Lookup Sheet
  lookupSheet.getCell('A1').value = 'Project Sprints';
  sprintOptions.forEach((s, idx) => {
    lookupSheet.getCell(`A${idx + 2}`).value = s;
  });

  lookupSheet.getCell('B1').value = 'Project Teams';
  teamOptions.forEach((t, idx) => {
    lookupSheet.getCell(`B${idx + 2}`).value = t;
  });

  lookupSheet.getCell('C1').value = 'Project Members';
  assigneeOptions.forEach((a, idx) => {
    lookupSheet.getCell(`C${idx + 2}`).value = a;
  });

  // Column headers matching 5-level project hierarchy
  worksheet.columns = [
    { header: 'S.No', key: 'sNo', width: 10 },
    { header: 'Level 1', key: 'level1', width: 22 }, // Project Name
    { header: 'Level 2', key: 'level2', width: 24 }, // Sprint Name
    { header: 'Level 3', key: 'level3', width: 34 }, // Main Task
    { header: 'Level 4 – Development Tasks', key: 'level4', width: 38 }, // Subtask
    { header: 'Level 5 – Micro Tasks', key: 'level5', width: 38 }, // Microtask
    { header: 'Task Description', key: 'desc', width: 44 }, // Right after Micro Tasks
    { header: 'Duration (Days)', key: 'duration', width: 16 },
    { header: 'Priority', key: 'priority', width: 14 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Team', key: 'team', width: 24 },
    { header: 'Assignee', key: 'assignee', width: 34 },
    { header: 'Task Key', key: 'key', width: 20 }
  ];

  // Header style
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' } // Slate 800
  };
  worksheet.getRow(1).height = 24;
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

  // Starter rows tailored to 5-level hierarchy
  const firstSprint = sprintOptions[0] || 'Sprint 1';
  const firstTeam = teamOptions[0] || '';
  const firstAssignee = assigneeOptions[0] || '';

  worksheet.addRow({
    sNo: 1,
    level1: project.name,
    level2: firstSprint,
    level3: 'Admin Login',
    level4: 'Design admin login UI',
    level5: '',
    desc: 'Design responsive login UI',
    duration: 3,
    priority: 'HIGH',
    status: 'TODO',
    team: firstTeam,
    assignee: firstAssignee,
    key: ''
  });

  worksheet.addRow({
    sNo: 2,
    level1: project.name,
    level2: firstSprint,
    level3: 'Admin Login',
    level4: 'Develop login authentication API',
    level5: 'Write unit tests for JWT validator',
    desc: 'Check edge cases and token expiry',
    duration: 1,
    priority: 'MEDIUM',
    status: 'TODO',
    team: firstTeam,
    assignee: firstAssignee,
    key: ''
  });

  worksheet.addRow({
    sNo: 3,
    level1: project.name,
    level2: firstSprint,
    level3: 'Dashboard',
    level4: 'Design dashboard UI and navigation',
    level5: '',
    desc: 'Primary dashboard overview',
    duration: 3,
    priority: 'MEDIUM',
    status: 'TODO',
    team: firstTeam,
    assignee: firstAssignee,
    key: ''
  });

  // Apply interactive Data Validations (Dropdowns) to rows 2 to 500
  const sprintLastRow = Math.max(sprintOptions.length + 1, 2);
  const teamLastRow = Math.max(teamOptions.length + 1, 2);
  const assigneeLastRow = Math.max(assigneeOptions.length + 1, 2);

  for (let r = 2; r <= 500; r++) {
    // 1. Level 2 (Sprint) dropdown from project's real sprints (Col C)
    if (sprintOptions.length > 0) {
      worksheet.getCell(`C${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Project_Dropdown_Data!$A$2:$A$${sprintLastRow}`]
      };
    }

    // 2. Priority dropdown (Col I)
    worksheet.getCell(`I${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"LOW,MEDIUM,HIGH,URGENT"']
    };

    // 3. Status dropdown (Col J)
    worksheet.getCell(`J${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"TODO,IN_PROGRESS,IN_REVIEW,DONE,BACKLOG"']
    };

    // 4. Team dropdown from project's real teams (Col K)
    if (teamOptions.length > 0) {
      worksheet.getCell(`K${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Project_Dropdown_Data!$B$2:$B$${teamLastRow}`]
      };
    }

    // 5. Assignee dropdown from project's real members (Col L)
    if (assigneeOptions.length > 0) {
      worksheet.getCell(`L${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Project_Dropdown_Data!$C$2:$C$${assigneeLastRow}`]
      };
    }
  }

  // Guide Worksheet
  const guideSheet = workbook.addWorksheet('Import Instructions');
  guideSheet.columns = [
    { header: 'Column', key: 'col', width: 28 },
    { header: 'Required', key: 'req', width: 14 },
    { header: 'Description / Project Options', key: 'desc', width: 75 }
  ];
  guideSheet.getRow(1).font = { bold: true };

  guideSheet.addRow({
    col: 'Phase / Milestone',
    req: 'Optional',
    desc: `Select from project sprints dropdown: ${sprintOptions.slice(0, 5).join(', ')}${sprintOptions.length > 5 ? '...' : ''}. If blank, automatically routes to selected Sprint or Backlog.`
  });
  guideSheet.addRow({
    col: 'Task Type',
    req: 'Required',
    desc: 'Select "Main Task", "Subtask", or "Microtask". A Subtask attaches to the Main Task above it. A Microtask attaches to the Subtask above it!'
  });
  guideSheet.addRow({
    col: 'Task Key',
    req: 'Optional',
    desc: 'Format: PROJECT-TASKTYPE-TEAM-NUMBER. Main Task: R-MT-HE-107 or R-MT-GEN-1. Subtask: R-ST-HE-107-1. Leave blank for auto-generation, or specify existing key to UPDATE.'
  });
  guideSheet.addRow({
    col: 'Task Title',
    req: 'Required',
    desc: 'Title or deliverable summary of the activity.'
  });
  guideSheet.addRow({
    col: 'Start & End Dates',
    req: 'Optional',
    desc: 'Dates in YYYY-MM-DD. Auto-calculated using Duration (Days) if one is omitted.'
  });
  guideSheet.addRow({
    col: 'Duration (Days)',
    req: 'Optional',
    desc: 'Working days. If Start Date is given, End Date is auto-calculated.'
  });
  guideSheet.addRow({
    col: 'Dependencies / Predecessors',
    req: 'Optional',
    desc: 'Title or Key of prerequisite tasks. Automatically wired into DAG Dependency Graph!'
  });
  guideSheet.addRow({
    col: 'Priority & Status',
    req: 'Optional',
    desc: 'Select from dropdown (Priority: LOW, MEDIUM, HIGH, URGENT / Status: TODO, IN_PROGRESS, IN_REVIEW, DONE).'
  });
  guideSheet.addRow({
    col: 'Team',
    req: 'Optional',
    desc: `Select from project teams dropdown: ${teamOptions.join(', ') || 'Auto-assigned'}`
  });
  guideSheet.addRow({
    col: 'Assignee',
    req: 'Optional',
    desc: `Select from project members dropdown: ${assigneeOptions.slice(0, 4).join(', ')}${assigneeOptions.length > 4 ? '...' : ''}`
  });

  const safeProjKey = (project.key || project.name || 'project').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const filename = `${safeProjKey}_timeline_import_template.xlsx`;

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename}"`
  );

  await workbook.xlsx.write(res);
  res.end();
});

/**
 * @desc    Export all existing project tasks and subtasks into Excel (with Task Keys for Smart Re-import)
 * @route   GET /api/v1/projects/:projectId/export-excel
 * @access  Private
 */
const exportProjectExcel = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { sprintId, sprintName, team, scope, startTaskNumber } = req.query;
  const parsedStart = parseInt(startTaskNumber, 10);
  const startingSerial = !isNaN(parsedStart) && parsedStart > 0 ? parsedStart : 1;

  const project = await Project.findById(projectId).populate('leadId');
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  // 1. Build filter for tasks
  const query = {
    projectId,
    isArchived: false,
    isDeleted: { $ne: true }
  };

  // If scope is not 'all', apply optional sprint or team filter
  if (scope !== 'all') {
    if (sprintId && sprintId !== 'ALL') {
      query.sprintId = sprintId;
    } else if (sprintName && sprintName !== 'ALL') {
      if (sprintName.toLowerCase() === 'backlog') {
        query.$or = [{ sprintId: null }, { sprint: 'Backlog' }, { sprint: '' }, { sprint: null }];
      } else {
        const foundSprint = await Sprint.findOne({ projectId, name: sprintName }).lean();
        if (foundSprint) {
          query.$or = [{ sprintId: foundSprint._id }, { sprint: sprintName }];
        } else {
          query.sprint = sprintName;
        }
      }
    }
    if (team && team !== 'ALL') {
      query.team = team;
    }
  }

  // 2. Fetch all tasks with populated assignees and linked issues
  const tasks = await Task.find(query)
    .populate('assigneeId', 'name email')
    .populate('subtasks.assigneeId', 'name email')
    .populate('subtasks.microtasks.assigneeId', 'name email')
    .populate('linkedIssues.targetTaskId', 'key title')
    .sort({ order: 1, createdAt: 1 })
    .lean();

  // 3. Fetch sprints for name mapping
  const sprints = await Sprint.find({ projectId }).sort({ createdAt: 1 }).lean();
  const sprintMap = new Map();
  const sprintOptions = [];
  sprints.forEach((s) => {
    sprintMap.set(s._id.toString(), s.name);
    if (!sprintOptions.includes(s.name.trim())) {
      sprintOptions.push(s.name.trim());
    }
  });
  if (!sprintOptions.includes('Backlog')) {
    sprintOptions.push('Backlog');
  }

  // 4. Fetch teams
  const teamOptions = [];
  if (Array.isArray(project.teams)) {
    project.teams.forEach((t) => {
      const name = t.name ? t.name.trim() : (typeof t === 'string' ? t.trim() : '');
      if (name && !teamOptions.includes(name)) {
        teamOptions.push(name);
      }
    });
  }
  const workspaceTeams = await Team.find({ workspaceId: project.workspaceId }).lean();
  workspaceTeams.forEach((wt) => {
    if (wt.name && !teamOptions.includes(wt.name.trim())) {
      teamOptions.push(wt.name.trim());
    }
  });

  // 5. Fetch project members
  const userIds = new Set();
  if (project.leadId) userIds.add((project.leadId._id || project.leadId).toString());
  if (Array.isArray(project.members)) {
    project.members.forEach((m) => {
      const uId = (m.userId?._id || m.userId || m)?.toString();
      if (uId) userIds.add(uId);
    });
  }
  if (Array.isArray(project.teams)) {
    project.teams.forEach((t) => {
      if (t.leadId) userIds.add((t.leadId._id || t.leadId).toString());
      if (Array.isArray(t.members)) {
        t.members.forEach((m) => {
          const uId = (m._id || m.userId?._id || m.userId || m)?.toString();
          if (uId) userIds.add(uId);
        });
      }
    });
  }
  const workspace = await Workspace.findById(project.workspaceId).lean();
  if (workspace?.ownerId) userIds.add(workspace.ownerId.toString());
  if (Array.isArray(workspace?.members)) {
    workspace.members.forEach((m) => {
      const uId = (m.userId?._id || m.userId || m)?.toString();
      if (uId) userIds.add(uId);
    });
  }

  const users = await User.find({ _id: { $in: Array.from(userIds) } })
    .select('name email')
    .sort({ name: 1 })
    .lean();

  const assigneeOptions = users.map((u) => {
    return u.name ? `${u.name} <${u.email}>` : u.email;
  });

  const formatAssignee = (u) => {
    if (!u) return '';
    if (typeof u === 'string') return u;
    return u.name ? `${u.name} <${u.email}>` : (u.email || '');
  };

  const formatDate = (d) => {
    if (!d) return '';
    try {
      const dt = new Date(d);
      return !isNaN(dt.getTime()) ? dt.toISOString().split('T')[0] : '';
    } catch {
      return '';
    }
  };

  // 6. Build ExcelJS Workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Outdid Project Monitor System';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Project Timeline Plan', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  const lookupSheet = workbook.addWorksheet('Project_Dropdown_Data');
  lookupSheet.state = 'hidden';

  lookupSheet.getCell('A1').value = 'Project Sprints';
  sprintOptions.forEach((s, idx) => {
    lookupSheet.getCell(`A${idx + 2}`).value = s;
  });

  lookupSheet.getCell('B1').value = 'Project Teams';
  teamOptions.forEach((t, idx) => {
    lookupSheet.getCell(`B${idx + 2}`).value = t;
  });

  lookupSheet.getCell('C1').value = 'Project Members';
  assigneeOptions.forEach((a, idx) => {
    lookupSheet.getCell(`C${idx + 2}`).value = a;
  });

  // Main worksheet column headers matching 5-level project hierarchy
  worksheet.columns = [
    { header: 'S.No', key: 'sNo', width: 10 },
    { header: 'Level 1', key: 'level1', width: 22 }, // Project Name
    { header: 'Level 2', key: 'level2', width: 24 }, // Sprint Name
    { header: 'Level 3', key: 'level3', width: 34 }, // Main Task
    { header: 'Level 4 – Development Tasks', key: 'level4', width: 38 }, // Subtask
    { header: 'Level 5 – Micro Tasks', key: 'level5', width: 38 }, // Microtask
    { header: 'Task Description', key: 'desc', width: 44 }, // Right after Micro Tasks
    { header: 'Duration (Days)', key: 'duration', width: 16 },
    { header: 'Priority', key: 'priority', width: 14 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Team', key: 'team', width: 24 },
    { header: 'Assignee', key: 'assignee', width: 34 },
    { header: 'Task Key', key: 'key', width: 20 }
  ];

  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' } // Slate 800
  };
  worksheet.getRow(1).height = 24;
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

  let totalRowsAdded = 0;
  let currentMainSeq = startingSerial - 1;
  let globalRowSNo = startingSerial;

  tasks.forEach((task) => {
    const phaseName = task.sprintId && sprintMap.has(task.sprintId.toString())
      ? sprintMap.get(task.sprintId.toString())
      : (task.sprint || task.epic || 'Backlog');

    let durationDays = 7;
    if (task.startDate && task.dueDate) {
      const s = new Date(task.startDate);
      const e = new Date(task.dueDate);
      if (!isNaN(s.getTime()) && !isNaN(e.getTime()) && e >= s) {
        durationDays = Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)));
      }
    } else if (task.customFields?.durationDays) {
      durationDays = task.customFields.durationDays;
    }

    const projKey = (project.key || 'TASK').toUpperCase().trim();
    const teamCode = resolveTeamCode(task.team, project.teams) || 'GEN';
    currentMainSeq++;
    const taskNum = currentMainSeq;

    let mainKey = task.key;
    if (!mainKey || !/^[^-]+-MT-[A-Z0-9]+-\d+$/.test(mainKey)) {
      mainKey = `${projKey}-MT-${teamCode}-${taskNum}`;
    }

    const hasSubtasks = Array.isArray(task.subtasks) && task.subtasks.length > 0;

    if (!hasSubtasks) {
      worksheet.addRow({
        sNo: globalRowSNo++,
        level1: project.name,
        level2: phaseName,
        level3: task.title,
        level4: '',
        level5: '',
        desc: task.description || '',
        duration: durationDays,
        priority: task.priority || 'MEDIUM',
        status: task.status || 'TODO',
        team: task.team || '',
        assignee: formatAssignee(task.assigneeId),
        key: mainKey
      });
      totalRowsAdded++;
    } else {
      task.subtasks.forEach((st, sIdx) => {
        let stDuration = 3;
        if (st.startDate && st.dueDate) {
          const s = new Date(st.startDate);
          const e = new Date(st.dueDate);
          if (!isNaN(s.getTime()) && !isNaN(e.getTime()) && e >= s) {
            stDuration = Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)));
          }
        }

        const subtaskIndex = sIdx + 1;
        let subKey = st.key;
        if (!subKey || !/^[^-]+-ST-[A-Z0-9]+-\d+-\d+$/.test(subKey)) {
          subKey = `${projKey}-ST-${teamCode}-${taskNum}-${subtaskIndex}`;
        }

        const hasMicrotasks = Array.isArray(st.microtasks) && st.microtasks.length > 0;

        if (!hasMicrotasks) {
          worksheet.addRow({
            sNo: globalRowSNo++,
            level1: project.name,
            level2: phaseName,
            level3: task.title,
            level4: st.title,
            level5: '',
            desc: st.description || '',
            duration: stDuration,
            priority: st.priority || task.priority || 'MEDIUM',
            status: st.status || (st.isCompleted ? 'DONE' : 'TODO'),
            team: task.team || '',
            assignee: formatAssignee(st.assigneeId) || st.assigneeName || '',
            key: subKey
          });
          totalRowsAdded++;
        } else {
          st.microtasks.forEach((mic, mIdx) => {
            let micDuration = 1;
            if (mic.startDate && mic.dueDate) {
              const ms = new Date(mic.startDate);
              const me = new Date(mic.dueDate);
              if (!isNaN(ms.getTime()) && !isNaN(me.getTime()) && me >= ms) {
                micDuration = Math.max(1, Math.round((me - ms) / (1000 * 60 * 60 * 24)));
              }
            }

            const micIndex = mIdx + 1;
            let micKey = mic.key;
            if (!micKey || !/^[^-]+-MIC-[A-Z0-9]+-\d+-\d+-\d+$/.test(micKey)) {
              micKey = `${projKey}-MIC-${teamCode}-${taskNum}-${subtaskIndex}-${micIndex}`;
            }

            worksheet.addRow({
              sNo: globalRowSNo++,
              level1: project.name,
              level2: phaseName,
              level3: task.title,
              level4: st.title,
              level5: mic.title,
              desc: mic.description || '',
              duration: micDuration,
              priority: mic.priority || task.priority || 'MEDIUM',
              status: mic.status || (mic.isCompleted ? 'DONE' : 'TODO'),
              team: task.team || '',
              assignee: formatAssignee(mic.assigneeId) || '',
              key: micKey
            });
            totalRowsAdded++;
          });
        }
      });
    }
  });

  // Apply interactive Data Validations
  const maxRow = Math.max(totalRowsAdded + 100, 500);
  const sprintLastRow = Math.max(sprintOptions.length + 1, 2);
  const teamLastRow = Math.max(teamOptions.length + 1, 2);
  const assigneeLastRow = Math.max(assigneeOptions.length + 1, 2);

  for (let r = 2; r <= maxRow; r++) {
    // 1. Level 2 (Sprint) dropdown (Col C)
    if (sprintOptions.length > 0) {
      worksheet.getCell(`C${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Project_Dropdown_Data!$A$2:$A$${sprintLastRow}`]
      };
    }
    // 2. Priority dropdown (Col I)
    worksheet.getCell(`I${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"LOW,MEDIUM,HIGH,URGENT"']
    };
    // 3. Status dropdown (Col J)
    worksheet.getCell(`J${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"TODO,IN_PROGRESS,IN_REVIEW,DONE,BACKLOG"']
    };
    // 4. Team dropdown (Col K)
    if (teamOptions.length > 0) {
      worksheet.getCell(`K${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Project_Dropdown_Data!$B$2:$B$${teamLastRow}`]
      };
    }
    // 5. Assignee dropdown (Col L)
    if (assigneeOptions.length > 0) {
      worksheet.getCell(`L${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Project_Dropdown_Data!$C$2:$C$${assigneeLastRow}`]
      };
    }
  }

  // Guide Worksheet
  const guideSheet = workbook.addWorksheet('Export & Edit Instructions');
  guideSheet.columns = [
    { header: 'Feature / Rule', key: 'rule', width: 30 },
    { header: 'Explanation', key: 'desc', width: 80 }
  ];
  guideSheet.getRow(1).font = { bold: true };
  guideSheet.addRow({
    rule: 'Task Key for Re-Import',
    desc: 'Each row includes the Task Key formatted as PROJECT-TASKTYPE-TEAM-NUMBER (e.g. R-MT-HE-107 or R-MT-GEN-1 for Main Tasks, and R-ST-HE-107-1 for Subtasks). When you re-import this file, Outdid Sync updates matching tasks without creating duplicates!'
  });
  guideSheet.addRow({
    rule: 'Subtask Hierarchy',
    desc: 'Any row with Task Type "Subtask" belongs to the preceding "Main Task" row above it.'
  });
  guideSheet.addRow({
    rule: 'Interactive Dropdowns',
    desc: 'Use the embedded in-cell dropdowns for Sprint, Task Type, Priority, Status, Team, and Assignee.'
  });

  const safeProjKey = (project.key || project.name || 'project').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const todayStr = new Date().toISOString().split('T')[0];
  const filename = `${safeProjKey}_tasks_export_${todayStr}.xlsx`;

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename}"`
  );

  await workbook.xlsx.write(res);
  res.end();
});

module.exports = {
  previewExcelImport,
  executeExcelImport,
  downloadProjectExcelTemplate,
  exportProjectExcel
};
