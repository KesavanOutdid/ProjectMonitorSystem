const mongoose = require('mongoose');
const Task = require('../models/Task');
const Project = require('../models/Project');
const Sprint = require('../models/Sprint');
const Workspace = require('../models/Workspace');
const Activity = require('../models/Activity');
const Comment = require('../models/Comment');
const User = require('../models/User');
const Team = require('../models/Team');
const Request = require('../models/Request');
const { getEffectiveUserLevel } = require('../middlewares/rbac');
const asyncHandler = require('../middlewares/asyncHandler');
const CacheService = require('../services/cacheService');
const EmailService = require('../services/emailService');
const { getStorageProvider } = require('../storage');
const { emitToProject, emitToTask, emitGlobal } = require('../config/socket');
const { generateMnemonicTaskCode, extractTaskMnemonic } = require('../utils/taskCodeGenerator');


/**
 * Check task operation permissions based on Levels 1 - 5
 */
const checkTaskPermission = async (user, project, task = null, operation = 'UPDATE', req = null) => {
  if (!user) return { allowed: false, message: 'Not authenticated' };

  let userLevel = 5;
  try {
    userLevel = await getEffectiveUserLevel(user, req || { query: { projectId: project?._id }, body: {} });
  } catch (_) {}

  // Level 1: Full Workspace/Org Admin authority
  const isLevel1 = user.role === 'SUPER_ADMIN' || user.role === 'ORG_ADMIN' || userLevel === 1;
  if (isLevel1) return { allowed: true };

  // Level 5: Read-only guest
  if (userLevel >= 5 || user.role === 'GUEST' || user.role === 'VIEWER') {
    return { allowed: false, message: 'Guests and viewers have read-only access' };
  }

  // Level 2: Project Manager (Lead of project or PM role)
  const isPM = (project?.leadId && (project.leadId._id || project.leadId).toString() === user._id.toString()) ||
    user.role === 'PROJECT_MANAGER' || userLevel === 2;

  if (isPM) {
    return { allowed: true };
  }

  // Find teams where user is Team Lead (from workspace teams and project teams)
  const leadTeams = await Team.find({
    workspaceId: project?.workspaceId,
    leadId: user._id,
    isArchived: false
  }).select('name key leadId members');

  const allLeadTeams = [...leadTeams];
  const leadTeamNames = new Set(
    leadTeams.flatMap((t) => [t.name.toLowerCase().trim(), (t.key || '').toLowerCase().trim()].filter(Boolean))
  );

  if (Array.isArray(project?.teams)) {
    project.teams.forEach((pt) => {
      const ptLeadId = pt.leadId ? (pt.leadId._id || pt.leadId).toString() : null;
      const isLead = ptLeadId === user._id.toString() ||
        leadTeams.some((wt) => (wt.name && pt.name && wt.name.toLowerCase().trim() === pt.name.toLowerCase().trim()) ||
                              (wt.key && pt.key && wt.key.toLowerCase().trim() === pt.key.toLowerCase().trim()));
      if (isLead) {
        if (pt.name) leadTeamNames.add(pt.name.toLowerCase().trim());
        if (pt.key) leadTeamNames.add(pt.key.toLowerCase().trim());
        if (!allLeadTeams.some((alt) => alt.name?.toLowerCase().trim() === pt.name?.toLowerCase().trim())) {
          allLeadTeams.push({
            _id: pt._id,
            name: pt.name,
            key: pt.key,
            leadId: pt.leadId || user._id,
            members: pt.members || []
          });
        }
      }
    });
  }

  const isTeamLead = user.role === 'TEAM_LEAD' || userLevel === 3 || leadTeamNames.size > 0;

  // Level 3: Team Lead
  if (isTeamLead) {
    if (allLeadTeams.length === 0 && leadTeamNames.size === 0) {
      return {
        allowed: false,
        message: 'You are registered as a Team Lead, but you are not assigned as the Leader of any team in this project/workspace. Team Leads can only create and manage tasks for their own assigned team.'
      };
    }

    if (operation === 'CREATE' || operation === 'CREATE_SUBTASK' || operation === 'DELETE_SUBTASK') {
      return { allowed: true, leadTeamNames, leadTeams: allLeadTeams, isTeamLead: true };
    }
    if (task) {
      const taskTeam = (task.team || '').toLowerCase().trim();
      // If task has no team or task team is not one of their lead teams, Team Lead CANNOT touch it!
      if (!taskTeam || (!leadTeamNames.has(taskTeam) && !Array.from(leadTeamNames).some((lt) => taskTeam.includes(lt) || lt.includes(taskTeam)))) {
        return {
          allowed: false,
          message: 'Team Leads can only add and manage tasks for their own assigned team'
        };
      }
      return { allowed: true, leadTeamNames, leadTeams: allLeadTeams, isTeamLead: true };
    }
    return { allowed: true, leadTeamNames, leadTeams: allLeadTeams, isTeamLead: true };
  }

  // Level 4: Member
  // "he can just change stage of and comment of his task only, others task he cant touch"
  if (operation === 'CREATE' || operation === 'DELETE' || operation === 'CREATE_SUBTASK') {
    return {
      allowed: false,
      message: 'Members cannot create or delete tasks. Please contact your Team Lead or Project Manager.'
    };
  }

  if (task) {
    const isAssignee = task.assigneeId && (task.assigneeId._id || task.assigneeId).toString() === user._id.toString();
    if (!isAssignee) {
      return {
        allowed: false,
        message: 'You can only change the status or comment on tasks assigned to you'
      };
    }
    if (operation === 'UPDATE_FIELDS') {
      return {
        allowed: false,
        message: 'Members can only change the status (stage) or comment on their assigned tasks'
      };
    }
    return { allowed: true };
  }

  return { allowed: false, message: 'Permission denied' };
};

/**
 * Retrieve dynamic workflow stages for a project or team (never hardcode stages)
 */
const getWorkflowStagesForTask = (project, taskTeamName = '') => {
  if (!project) return [];
  if (taskTeamName && Array.isArray(project.teams)) {
    const matchedTeam = project.teams.find(
      (t) => t.name && t.name.toLowerCase().trim() === taskTeamName.toLowerCase().trim()
    );
    if (matchedTeam && Array.isArray(matchedTeam.workflowStages) && matchedTeam.workflowStages.length > 0) {
      return matchedTeam.workflowStages;
    }
  }
  if (Array.isArray(project.workflowStages) && project.workflowStages.length > 0) {
    return project.workflowStages;
  }
  return [];
};

/**
 * Dynamically compute parent task status from subtasks and workflow stages.
 * A parent task only progresses to a stage when ALL its subtasks have reached or passed that stage!
 * (i.e. parent stage is determined by the minimum stage reached by all subtasks).
 */
const computeParentTaskStatus = (subtasks, stages, currentTaskStatus) => {
  if (!subtasks || subtasks.length === 0) return currentTaskStatus;
  if (!stages || stages.length === 0) return currentTaskStatus;

  const stageIds = stages.map((s) => s.id);
  const firstStageId = stages[0]?.id;
  const lastStageId = stages[stages.length - 1]?.id;

  // 1. If all subtasks completed or in the final stage -> move to final stage
  const allCompleted = subtasks.every((st) => {
    return st.isCompleted || (lastStageId && st.status === lastStageId);
  });
  if (allCompleted && lastStageId) {
    return lastStageId;
  }

  // 2. Find the minimum stage index among all subtasks.
  // The Main Task only advances to a stage when ALL subtasks have reached or passed that stage!
  let minIdx = stages.length - 1;

  for (const st of subtasks) {
    let idx = -1;
    if (st.isCompleted) {
      idx = stages.length - 1;
    } else if (st.status) {
      idx = stageIds.indexOf(st.status);
      if (idx === -1) {
        idx = stageIds.findIndex((id) => id.toUpperCase() === st.status.toUpperCase());
      }
    }

    // If status is not found or not set, it is at the initial stage (index 0)
    if (idx === -1) {
      idx = 0;
    }

    if (idx < minIdx) {
      minIdx = idx;
    }
  }

  return stageIds[minIdx] || firstStageId || currentTaskStatus;
};

// @desc    Get Tasks with High-Performance Cursor Pagination & Sub-5ms Redis Caching
// @route   GET /api/v1/tasks
// @access  Private
const getTasks = asyncHandler(async (req, res) => {
  const {
    projectId,
    workspaceId,
    status,
    priority,
    assigneeId,
    search,
    cursor,
    limit = 25
  } = req.query;

  const targetProjectId = projectId;
  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);

  // Build Filter Query
  const filter = { isArchived: false, isDeleted: { $ne: true } };
  if (targetProjectId) {
    filter.projectId = targetProjectId;
  } else if (workspaceId) {
    filter.workspaceId = workspaceId;
    
    // For non-admin/non-owner users, restrict workspace feed to their accessible projects
    const isOrgAdmin = req.user.role === 'SUPER_ADMIN' || req.user.role === 'ORG_ADMIN';
    const workspace = await Workspace.findById(workspaceId);
    const isOwner = workspace && workspace.ownerId && workspace.ownerId.toString() === req.user._id.toString();
    const isWorkspaceAdmin = workspace && workspace.members && workspace.members.some(
      (m) => m.userId && m.userId.toString() === req.user._id.toString() && m.role === 'ORG_ADMIN'
    );

    if (!isOrgAdmin && !isOwner && !isWorkspaceAdmin) {
      const userProjects = await Project.find({
        workspaceId,
        isArchived: false,
        isDeleted: { $ne: true },
        $or: [
          { leadId: req.user._id },
          { 'members.userId': req.user._id }
        ]
      }).select('_id');
      const userProjectIds = userProjects.map((p) => p._id);
      filter.projectId = { $in: userProjectIds };
    }
  }

  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (assigneeId) filter.assigneeId = assigneeId;

  // Search Filter: Fast Prefix Match or Full-Text Search
  if (search && search.trim()) {
    const searchTrimmed = search.trim();
    filter.$or = [
      { key: new RegExp(`^${searchTrimmed}`, 'i') },
      { title: { $regex: searchTrimmed, $options: 'i' } }
    ];
  }

  // Cursor Pagination Condition (ObjectId < cursor for descending newest-first)
  if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
    filter._id = { $lt: new mongoose.Types.ObjectId(cursor) };
  }

  // Unique Cache Key for Sub-5ms Reads
  const filterKey = JSON.stringify({ projectId: targetProjectId, status, priority, assigneeId, search, cursor, limit: parsedLimit });
  const cacheKey = `tasks:${targetProjectId || 'all'}:${Buffer.from(filterKey).toString('base64').slice(0, 32)}`;

  const startTime = process.hrtime.bigint();

  const { data: tasks, isCached } = await CacheService.getOrSet(cacheKey, 60, async () => {
    return await Task.find(filter)
      .sort({ _id: -1 }) // Covered Index Scan: { projectId: 1, isArchived: 1, _id: -1 }
      .limit(parsedLimit + 1)
      .populate('assigneeId', 'name email avatar jobTitle')
      .populate('reporterId', 'name email avatar')
      .populate('lockedBy', 'name email avatar jobTitle')
      .populate('subtasks.assigneeId', 'name email avatar')
      .populate('subtasks.lockedBy', 'name email avatar jobTitle')
      .populate('subtasks.minitasks.assigneeId', 'name email avatar')
      .populate('subtasks.minitasks.lockedBy', 'name email avatar jobTitle')
      .populate('subtasks.minitasks.microtasks.assigneeId', 'name email avatar')
      .populate('subtasks.minitasks.microtasks.lockedBy', 'name email avatar jobTitle')
      .lean();
  });

  const endTime = process.hrtime.bigint();
  const executionTimeMs = (Number(endTime - startTime) / 1e6).toFixed(2);

  const hasNextPage = tasks.length > parsedLimit;
  const results = hasNextPage ? tasks.slice(0, parsedLimit) : tasks;
  const nextCursor = hasNextPage && results.length > 0 ? results[results.length - 1]._id : null;

  res.json({
    success: true,
    meta: {
      isCached,
      executionTime: `${executionTimeMs}ms`,
      count: results.length,
      limit: parsedLimit,
      nextCursor,
      hasNextPage
    },
    data: results
  });
});

// @desc    Get Kanban Column Grouped Tasks
// @route   GET /api/v1/tasks/kanban
// @access  Private
const getKanbanTasks = asyncHandler(async (req, res) => {
  const { projectId, sprintId, sprint } = req.query;

  if (!projectId) {
    return res.status(400).json({ success: false, error: 'Project ID is required' });
  }

  const queryFilter = { projectId, isArchived: false, isDeleted: { $ne: true } };
  let cacheSprintKey = 'ALL';

  if (sprintId && sprintId !== 'ALL') {
    queryFilter.sprintId = sprintId;
    cacheSprintKey = sprintId;
  } else if (sprint && sprint !== 'ALL') {
    queryFilter.$or = [{ sprint }, { sprintId: mongoose.Types.ObjectId.isValid(sprint) ? sprint : null }];
    cacheSprintKey = sprint;
  }

  const cacheKey = `kanban:${projectId}:${cacheSprintKey}`;

  const { data: tasks, isCached } = await CacheService.getOrSet(cacheKey, 60, async () => {
    return await Task.find(queryFilter)
      .sort({ order: 1, updatedAt: -1 })
      .populate('assigneeId', 'name email avatar jobTitle')
      .populate('reporterId', 'name email avatar')
      .populate('lockedBy', 'name email avatar jobTitle')
      .populate('sprintId', 'name status')
      .populate('subtasks.assigneeId', 'name email avatar')
      .populate('subtasks.lockedBy', 'name email avatar jobTitle')
      .populate('subtasks.minitasks.assigneeId', 'name email avatar')
      .populate('subtasks.minitasks.lockedBy', 'name email avatar jobTitle')
      .populate('subtasks.minitasks.microtasks.assigneeId', 'name email avatar')
      .populate('subtasks.minitasks.microtasks.lockedBy', 'name email avatar jobTitle')
      .lean();
  });

  // Get project workflow stages if available (checking team-specific workflow stages if team requested)
  const project = await Project.findById(projectId).select('workflowStages teams').lean();
  let stages = project?.workflowStages || [];

  if (req.query.team && Array.isArray(project?.teams)) {
    const matchedTeam = project.teams.find(
      (t) => t.name && t.name.toLowerCase().trim() === req.query.team.toLowerCase().trim()
    );
    if (matchedTeam && Array.isArray(matchedTeam.workflowStages) && matchedTeam.workflowStages.length > 0) {
      stages = matchedTeam.workflowStages;
    }
  }

  if (!stages || stages.length === 0) {
    stages = [
      { id: 'BACKLOG', label: 'Idea' },
      { id: 'TODO', label: 'To Do' },
      { id: 'IN_PROGRESS', label: 'In Progress' },
      { id: 'IN_REVIEW', label: 'Testing' },
      { id: 'DONE', label: 'Done' }
    ];
  }

  // Group by dynamic status stages
  const columns = {};
  stages.forEach((st) => {
    columns[st.id] = [];
  });

  tasks.forEach((task) => {
    const taskStatus = task.status || (stages.length > 0 ? stages[0].id : 'UNKNOWN');
    if (!columns[taskStatus]) {
      columns[taskStatus] = [];
    }
    columns[taskStatus].push(task);
  });

  res.json({
    success: true,
    meta: { isCached, sprint: cacheSprintKey },
    data: columns
  });
});

// @desc    Create a new Task
// @route   POST /api/v1/tasks
// @access  Private
const createTask = asyncHandler(async (req, res) => {
  const {
    projectId,
    title,
    description,
    issueType,
    priority,
    status,
    assigneeId,
    storyPoints,
    labels,
    startDate,
    dueDate,
    parentTaskId,
    sprintId,
    sprint
  } = req.body;

  if (!projectId || !title) {
    return res.status(400).json({ success: false, error: 'Please provide projectId and task title' });
  }

  // Check project existence
  const existingProject = await Project.findById(projectId);
  if (!existingProject) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  // Permission check based on User Levels 1 to 5
  const perm = await checkTaskPermission(req.user, existingProject, null, 'CREATE', req);
  if (!perm.allowed) {
    return res.status(403).json({ success: false, error: perm.message || 'Permission denied to create tasks' });
  }

  // Team Lead restriction: STRICTLY enforce that Team Leads can ONLY create tasks for their assigned team(s)
  let taskTeam = (req.body.team || '').trim();
  let taskTeamId = req.body.teamId || null;
  let taskTeamLeadId = null;

  if (perm.isTeamLead) {
    if (!perm.leadTeams || perm.leadTeams.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'You are not assigned as Team Lead for any team in this project. Team Leads can only create tasks for their own assigned team.'
      });
    }

    let matchedLeadTeam = null;
    if (taskTeam) {
      const cleanTeam = taskTeam.toLowerCase().trim();
      matchedLeadTeam = perm.leadTeams.find(
        (t) => (t.name || '').toLowerCase().trim() === cleanTeam ||
               (t.key || '').toLowerCase().trim() === cleanTeam ||
               (t._id && t._id.toString() === taskTeam)
      );

      if (!matchedLeadTeam) {
        return res.status(403).json({
          success: false,
          error: 'Team Leads can only create tasks for their own assigned team'
        });
      }

      taskTeam = matchedLeadTeam.name;
      taskTeamId = matchedLeadTeam._id || null;
      taskTeamLeadId = req.user._id;
    } else {
      // Auto-assign to their lead team
      matchedLeadTeam = perm.leadTeams[0];
      taskTeam = matchedLeadTeam.name;
      taskTeamId = matchedLeadTeam._id || null;
      taskTeamLeadId = req.user._id;
    }

    // Verify assignee belongs to this team if provided
    if (assigneeId && mongoose.Types.ObjectId.isValid(assigneeId) && assigneeId.toString() !== req.user._id.toString()) {
      const teamMembers = (matchedLeadTeam?.members || []).map((m) => (m._id || m.userId?._id || m.userId || m).toString());
      if (!teamMembers.includes(assigneeId.toString())) {
        return res.status(400).json({
          success: false,
          error: `Team Leads can only assign tasks to members of their team (${taskTeam})`
        });
      }
    }
  }

  // Atomically increment project task counter
  const project = await Project.findByIdAndUpdate(
    projectId,
    { $inc: { taskCounter: 1 } },
    { new: true, upsert: false }
  );

  let taskNumber = project?.taskCounter;
  if (!taskNumber || isNaN(taskNumber) || taskNumber < 1) {
    const highestTask = await Task.findOne({ projectId }).sort({ taskNumber: -1 }).select('taskNumber').lean();
    taskNumber = (highestTask?.taskNumber || 0) + 1;
    await Project.findByIdAndUpdate(projectId, { taskCounter: taskNumber });
  }

  const projKey = existingProject.key || project?.key || 'TASK';

  // Determine team code if task is assigned to a team (e.g. Hardware Engineering -> HE)
  let teamCode = '';
  const chosenTeam = taskTeam || req.body.team || '';
  if (chosenTeam) {
    const foundTeam = existingProject.teams?.find(
      (t) => (t.name || '').toLowerCase().trim() === chosenTeam.toLowerCase().trim() ||
             (t.key || '').toLowerCase().trim() === chosenTeam.toLowerCase().trim()
    );
    if (foundTeam?.key) {
      teamCode = foundTeam.key.toUpperCase().trim();
    } else {
      teamCode = chosenTeam
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 4);
    }
  }

  if (!teamCode) {
    teamCode = 'GEN';
  }

  // Retrieve existing task keys to guarantee uniqueness of mnemonic code
  const existingTeamTasks = await Task.find({ projectId }).select('key').lean();
  const usedKeysAndCodes = new Set(existingTeamTasks.map((t) => t.key).filter(Boolean));

  let taskCode = req.body.taskCode || '';
  if (!taskCode) {
    taskCode = generateMnemonicTaskCode(title, usedKeysAndCodes);
  }
  const key = req.body.key && req.body.key.trim() ? req.body.key.trim().toUpperCase() : `${projKey}-MT-${teamCode}-${taskCode}`;

  // Sanitize ObjectIds to prevent BSON casting errors
  const safeAssigneeId = assigneeId && mongoose.Types.ObjectId.isValid(assigneeId) ? assigneeId : null;
  let safeSprintId = sprintId && mongoose.Types.ObjectId.isValid(sprintId) ? sprintId : null;
  const safeParentTaskId = parentTaskId && mongoose.Types.ObjectId.isValid(parentTaskId) ? parentTaskId : null;

  let sprintName = sprint || 'Sprint 1';
  if (!safeSprintId) {
    const activeSprint = await Sprint.findOne({ projectId, status: 'ACTIVE' });
    if (activeSprint) {
      safeSprintId = activeSprint._id;
      sprintName = activeSprint.name;
    }
  } else if (!sprint) {
    const sp = await Sprint.findById(safeSprintId);
    if (sp) sprintName = sp.name;
  }

  const stages = getWorkflowStagesForTask(existingProject, taskTeam || req.body.team || '');
  const firstStageId = stages && stages.length > 0 ? stages[0].id : (status || null);
  const lastStageId = stages && stages.length > 0 ? stages[stages.length - 1].id : null;

  const formattedSubtasks = [];
  if (Array.isArray(req.body.subtasks) && req.body.subtasks.length > 0) {
    req.body.subtasks.forEach((st, idx) => {
      if (st && st.title && st.title.trim()) {
        const subtaskIndex = idx + 1;
        const subtaskKey = `${projKey}-ST-${teamCode}-${taskCode}-${subtaskIndex}`;
        const safeSubAssignee = st.assigneeId && mongoose.Types.ObjectId.isValid(st.assigneeId) ? st.assigneeId : null;
        const subStatus = st.status || status || firstStageId;

        const formattedMinitasks = [];
        const rawMinitasks = Array.isArray(st.minitasks) && st.minitasks.length > 0
          ? st.minitasks
          : (Array.isArray(st.microtasks) && st.microtasks.length > 0 ? st.microtasks : []);

        if (rawMinitasks.length > 0) {
          rawMinitasks.forEach((min, mIdx) => {
            if (min && min.title && min.title.trim()) {
              const minIndex = mIdx + 1;
              const minKey = `${projKey}-MIN-${teamCode}-${taskCode}-${subtaskIndex}-${minIndex}`;
              const safeMinAssignee = min.assigneeId && mongoose.Types.ObjectId.isValid(min.assigneeId) ? min.assigneeId : null;
              const formattedMicrotasks = [];
              if (Array.isArray(min.microtasks) && min.microtasks.length > 0) {
                min.microtasks.forEach((mic, micIdx) => {
                  if (mic && mic.title && mic.title.trim()) {
                    const micIndex = micIdx + 1;
                    const micKey = `${projKey}-MIC-${teamCode}-${taskCode}-${subtaskIndex}-${minIndex}-${micIndex}`;

                    const safeMicAssignee = mic.assigneeId && mongoose.Types.ObjectId.isValid(mic.assigneeId) ? mic.assigneeId : null;
                    formattedMicrotasks.push({
                      key: micKey,
                      title: mic.title.trim(),
                      description: mic.description ? mic.description.trim() : '',
                      status: mic.status || 'TODO',
                      isCompleted: mic.isCompleted || mic.status === 'DONE' || false,
                      assigneeId: safeMicAssignee,
                      startDate: mic.startDate ? new Date(mic.startDate) : null,
                      dueDate: mic.dueDate ? new Date(mic.dueDate) : null,
                      createdBy: req.user._id,
                      createdAt: new Date()
                    });
                  }
                });
              }

              const finalMinAssignee = formattedMicrotasks.length > 0 ? null : safeMinAssignee;
              formattedMinitasks.push({
                key: minKey,
                title: min.title.trim(),
                description: min.description ? min.description.trim() : '',
                status: min.status || 'TODO',
                isCompleted: min.isCompleted || min.status === 'DONE' || false,
                assigneeId: finalMinAssignee,
                startDate: min.startDate ? new Date(min.startDate) : null,
                dueDate: min.dueDate ? new Date(min.dueDate) : null,
                microtasks: formattedMicrotasks,
                createdBy: req.user._id,
                createdAt: new Date()
              });
            }
          });
        }

        // If subtask has minitasks, subtask assignee is blank/unassigned (managed via minitasks)
        const finalSubAssignee = formattedMinitasks.length > 0 ? null : safeSubAssignee;

        formattedSubtasks.push({
          key: subtaskKey,
          title: st.title.trim(),
          description: st.description ? st.description.trim() : '',
          status: subStatus,
          isCompleted: (lastStageId && subStatus === lastStageId) || false,
          startDate: st.startDate ? new Date(st.startDate) : null,
          dueDate: st.dueDate ? new Date(st.dueDate) : null,
          assigneeId: finalSubAssignee,
          minitasks: formattedMinitasks,
          createdBy: req.user._id,
          createdAt: new Date()
        });
      }
    });
  }

  let computedStatus = status || firstStageId;
  if (formattedSubtasks.length > 0) {
    computedStatus = computeParentTaskStatus(formattedSubtasks, stages, computedStatus);
  }

  // Auto-fill or expand parent task date range based on subtask dates
  let taskStartDate = startDate ? new Date(startDate) : null;
  let taskDueDate = dueDate ? new Date(dueDate) : null;

  if (formattedSubtasks.length > 0) {
    formattedSubtasks.forEach((st) => {
      if (st.startDate) {
        if (!taskStartDate || st.startDate < taskStartDate) {
          taskStartDate = st.startDate;
        }
      }
      if (st.dueDate) {
        if (!taskDueDate || st.dueDate > taskDueDate) {
          taskDueDate = st.dueDate;
        }
      }
    });
  }

  // If task has subtasks, main task assignee must be blank/unassigned (managed via subtasks/microtasks)
  const finalMainAssigneeId = formattedSubtasks.length > 0 ? null : safeAssigneeId;

  const task = await Task.create({
    key,
    taskNumber: Number(taskNumber),
    title,
    description: description || '',
    issueType: issueType || 'TASK',
    priority: priority || 'MEDIUM',
    status: computedStatus,
    storyPoints: Number(storyPoints) || 0,
    projectId,
    workspaceId: existingProject.workspaceId,
    assigneeId: finalMainAssigneeId,
    reporterId: req.user._id,
    parentTaskId: safeParentTaskId,
    sprintId: safeSprintId,
    sprint: sprintName,
    team: taskTeam || req.body.team || '',
    teamId: taskTeamId || null,
    teamLeadId: taskTeamLeadId || null,
    labels: labels || [],
    startDate: taskStartDate,
    dueDate: taskDueDate,
    subtasks: formattedSubtasks
  });

  // Record audit activity
  await Activity.create({
    taskId: task._id,
    projectId: task.projectId,
    userId: req.user._id,
    action: 'CREATED',
    newValue: task.title
  });

  // Invalidate Redis caches for this project
  await CacheService.invalidateProject(projectId);
  await CacheService.invalidatePattern(`kanban:${projectId}*`);

  // Send assignment email if assigned
  if (assigneeId) {
    const assignee = await User.findById(assigneeId);
    if (assignee) {
      EmailService.sendTaskAssignedEmail(assignee, task, req.user).catch(() => {});
    }
  }

  const populatedTask = await Task.findById(task._id)
    .populate('assigneeId', 'name email avatar')
    .populate('reporterId', 'name email avatar')
    .populate('subtasks.assigneeId', 'name email avatar');

  // Real-time WebSocket event
  emitToProject(projectId, 'task:created', populatedTask);

  res.status(201).json({
    success: true,
    message: 'Task created successfully',
    data: populatedTask
  });
});

/**
 * Helper to sync linked Request documents when a Task status transitions
 */
const syncLinkedRequestsOnTaskStatus = async (task, newStatus, user) => {
  try {
    const normalizedStatus = String(newStatus || task.status).toUpperCase();
    const isDone = ['DONE', 'COMPLETED', 'RESOLVED', 'CLOSED'].includes(normalizedStatus);
    const isInProgress = ['IN_PROGRESS', 'IN PROGRESS', 'DEVELOPMENT', 'DOING'].includes(normalizedStatus);

    // 1. If this board task originated from a request
    if (task.originRequestId && isDone) {
      const originReq = await Request.findById(task.originRequestId);
      if (originReq && originReq.requestStatus !== 'COMPLETED') {
        originReq.requestStatus = 'COMPLETED';
        await originReq.save();

        await Comment.create({
          requestId: originReq._id,
          userId: user?._id,
          content: `🏁 Board task [${task.key}] reached final stage (${newStatus || task.status}). Request #${originReq.key} automatically marked as COMPLETED.`
        });

        emitToProject(originReq.projectId.toString(), 'request:updated', { request: originReq });
        emitToProject(originReq.projectId.toString(), 'task:updated', { task: originReq });
      }
    }

    // 2. Linked requests referencing this task as relatedTaskId
    const linkedRequests = await Request.find({
      relatedTaskId: task._id,
      requestStatus: { $nin: ['REJECTED'] }
    });

    for (const linkedReq of linkedRequests) {
      if (isDone && linkedReq.requestStatus !== 'COMPLETED') {
        linkedReq.requestStatus = 'COMPLETED';
        await linkedReq.save();

        await Comment.create({
          requestId: linkedReq._id,
          userId: user?._id,
          content: `🏁 Linked task [${task.key}] reached final stage (${newStatus || task.status}). Request automatically marked as COMPLETED.`
        });

        await Activity.create({
          workspaceId: linkedReq.workspaceId,
          projectId: linkedReq.projectId,
          requestId: linkedReq._id,
          userId: user?._id,
          action: 'STATUS_UPDATED',
          details: {
            oldStatus: linkedReq.requestStatus,
            newStatus: 'COMPLETED',
            requestKey: linkedReq.key,
            reason: `Linked task ${task.key} completed`
          }
        });

        emitToProject(linkedReq.projectId.toString(), 'request:updated', { request: linkedReq });
        emitToProject(linkedReq.projectId.toString(), 'task:updated', { task: linkedReq });
      } else if (isInProgress && linkedReq.requestStatus === 'ACCEPTED') {
        linkedReq.requestStatus = 'IN_PROGRESS';
        await linkedReq.save();

        await Comment.create({
          requestId: linkedReq._id,
          userId: user?._id,
          content: `🚀 Linked task [${task.key}] moved to ${newStatus || task.status}. Request is now IN_PROGRESS.`
        });

        await Activity.create({
          workspaceId: linkedReq.workspaceId,
          projectId: linkedReq.projectId,
          requestId: linkedReq._id,
          userId: user?._id,
          action: 'STATUS_UPDATED',
          details: {
            oldStatus: 'ACCEPTED',
            newStatus: 'IN_PROGRESS',
            requestKey: linkedReq.key,
            reason: `Linked task ${task.key} in progress`
          }
        });

        emitToProject(linkedReq.projectId.toString(), 'request:updated', { request: linkedReq });
        emitToProject(linkedReq.projectId.toString(), 'task:updated', { task: linkedReq });
      }
    }
  } catch (syncErr) {
    console.error('Failed to sync linked requests on task status change:', syncErr);
  }
};

// @desc    Update task status & order (Drag-and-Drop)
// @route   PATCH /api/v1/tasks/:taskId/reorder
// @access  Private
const reorderTask = asyncHandler(async (req, res) => {
  const { taskId } = req.params;
  const { status, order } = req.body;

  const task = await Task.findById(taskId);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }

  const project = await Project.findById(task.projectId);
  const perm = await checkTaskPermission(req.user, project, task, 'REORDER', req);
  if (!perm.allowed) {
    return res.status(403).json({ success: false, error: perm.message || 'Permission denied to move this task' });
  }

  // Tasks with subtasks cannot be moved directly across columns
  if (task.subtasks && task.subtasks.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Tasks with subtasks cannot be moved directly. Complete or update subtasks to update stage.'
    });
  }

  const oldStatus = task.status;
  task.status = status || task.status;
  task.order = order !== undefined ? order : task.order;
  await task.save();

  if (oldStatus !== status) {
    await Activity.create({
      taskId: task._id,
      projectId: task.projectId,
      userId: req.user._id,
      action: 'STATUS_CHANGED',
      field: 'status',
      oldValue: oldStatus,
      newValue: status
    });

    await syncLinkedRequestsOnTaskStatus(task, status, req.user);
  }

  // Fast Invalidation
  await CacheService.invalidateProject(task.projectId);
  await CacheService.invalidatePattern(`kanban:${task.projectId}*`);

  // Real-time WebSocket event
  emitToProject(task.projectId, 'task:reordered', { taskId, status: task.status, order: task.order });

  res.json({
    success: true,
    data: task
  });
});

// @desc    Get single Task by ID with full relations
// @route   GET /api/v1/tasks/:taskId
// @access  Private
const getTaskById = asyncHandler(async (req, res) => {
  const { taskId } = req.params;

  const task = await Task.findById(taskId)
    .populate('assigneeId', 'name email avatar jobTitle')
    .populate('reporterId', 'name email avatar jobTitle')
    .populate('lockedBy', 'name email avatar jobTitle')
    .populate('createdBy', 'name email avatar jobTitle')
    .populate('updatedBy', 'name email avatar jobTitle')
    .populate('sprintId', 'name status')
    .populate('parentTaskId', 'key title issueType')
    .populate('linkedIssues.targetTaskId', 'key title status issueType priority')
    .populate('workLogs.userId', 'name email avatar')
    .populate('subtasks.createdBy', 'name email')
    .populate('subtasks.assigneeId', 'name email avatar')
    .populate('subtasks.lockedBy', 'name email avatar jobTitle')
    .populate('subtasks.minitasks.assigneeId', 'name email avatar')
    .populate('subtasks.minitasks.lockedBy', 'name email avatar jobTitle')
    .populate('subtasks.minitasks.microtasks.assigneeId', 'name email avatar')
    .populate('subtasks.minitasks.microtasks.lockedBy', 'name email avatar jobTitle')
    .populate('watchers', 'name email avatar')
    .populate('originRequestId', 'key title requestStatus requestType')
    .lean();

  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }

  res.json({
    success: true,
    data: task
  });
});

// @desc    Get Task Activities / History Trail
// @route   GET /api/v1/tasks/:taskId/activities
// @access  Private
const getTaskActivities = asyncHandler(async (req, res) => {
  const { taskId } = req.params;

  const activities = await Activity.find({ taskId })
    .sort({ createdAt: -1 })
    .populate('userId', 'name email avatar jobTitle')
    .lean();

  res.json({
    success: true,
    count: activities.length,
    data: activities
  });
});

// @desc    Update general task fields with automatic audit history logging
// @route   PUT /api/v1/tasks/:taskId
// @access  Private
const updateTask = asyncHandler(async (req, res) => {
  const { taskId } = req.params;
  const updates = req.body;

  const task = await Task.findById(taskId);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }

  const project = await Project.findById(task.projectId);
  const updateKeys = Object.keys(updates).filter((k) => !['updatedAt', 'updatedBy', '_id'].includes(k));
  const isOnlyStatus = updateKeys.length === 1 && updateKeys[0] === 'status';

  const perm = await checkTaskPermission(req.user, project, task, isOnlyStatus ? 'REORDER' : 'UPDATE_FIELDS', req);
  if (!perm.allowed) {
    return res.status(403).json({ success: false, error: perm.message || 'Permission denied to update this task' });
  }

  // If user is a Team Lead, verify they are not changing team to another team they don't lead
  if (perm.isTeamLead && updates.team !== undefined) {
    const newTeam = (updates.team || '').trim();
    if (!newTeam) {
      return res.status(403).json({
        success: false,
        error: 'Team Leads cannot remove the team assignment from this task'
      });
    }
    const cleanNewTeam = newTeam.toLowerCase().trim();
    const matchesLead = perm.leadTeamNames && (
      perm.leadTeamNames.has(cleanNewTeam) ||
      Array.from(perm.leadTeamNames).some((lt) => cleanNewTeam.includes(lt) || lt.includes(cleanNewTeam))
    );
    if (!matchesLead) {
      return res.status(403).json({
        success: false,
        error: 'Team Leads can only assign tasks to their own assigned team'
      });
    }
  }

  // If user is a Team Lead, verify assignee belongs to the team
  if (perm.isTeamLead && updates.assigneeId && mongoose.Types.ObjectId.isValid(updates.assigneeId)) {
    if (updates.assigneeId.toString() !== req.user._id.toString()) {
      const taskTeamObj = (perm.leadTeams || []).find(
        (t) => (t.name || '').toLowerCase().trim() === (task.team || '').toLowerCase().trim()
      );
      if (taskTeamObj) {
        const teamMembers = (taskTeamObj.members || []).map((m) => (m._id || m.userId?._id || m.userId || m).toString());
        if (!teamMembers.includes(updates.assigneeId.toString())) {
          return res.status(400).json({
            success: false,
            error: `Team Leads can only assign tasks to members of their team (${task.team})`
          });
        }
      }
    }
  }

  // Sanitize ObjectIds
  if (updates.assigneeId !== undefined) {
    updates.assigneeId = updates.assigneeId && mongoose.Types.ObjectId.isValid(updates.assigneeId) ? updates.assigneeId : null;
  }
  // If task has subtasks, main task assignee must remain blank/unassigned
  if (task.subtasks && task.subtasks.length > 0) {
    updates.assigneeId = null;
    task.assigneeId = null;
  }
  if (updates.sprintId !== undefined) {
    updates.sprintId = updates.sprintId && mongoose.Types.ObjectId.isValid(updates.sprintId) ? updates.sprintId : null;
  }
  if (updates.parentTaskId !== undefined) {
    updates.parentTaskId = updates.parentTaskId && mongoose.Types.ObjectId.isValid(updates.parentTaskId) ? updates.parentTaskId : null;
  }

  const oldAssignee = task.assigneeId ? task.assigneeId.toString() : null;
  const oldStatus = task.status;
  const oldPriority = task.priority;
  const oldStoryPoints = task.storyPoints;
  const oldTitle = task.title;

  Object.assign(task, updates);
  task.updatedBy = req.user._id;
  await task.save();

  // Audit activity logs for key fields
  if (updates.assigneeId !== undefined && (updates.assigneeId?.toString() || null) !== oldAssignee) {
    const newAssigneeUser = updates.assigneeId ? await User.findById(updates.assigneeId).select('name').lean() : null;
    const oldAssigneeUser = oldAssignee ? await User.findById(oldAssignee).select('name').lean() : null;
    await Activity.create({
      taskId: task._id,
      projectId: task.projectId,
      userId: req.user._id,
      action: 'ASSIGNED',
      field: 'assignee',
      oldValue: oldAssigneeUser?.name || 'Unassigned',
      newValue: newAssigneeUser?.name || 'Unassigned'
    });
  }

  if (updates.status !== undefined && updates.status !== oldStatus) {
    await Activity.create({
      taskId: task._id,
      projectId: task.projectId,
      userId: req.user._id,
      action: 'STATUS_CHANGED',
      field: 'status',
      oldValue: oldStatus,
      newValue: updates.status
    });

    // Synchronize linked requests when task moves through stages
    await syncLinkedRequestsOnTaskStatus(task, updates.status, req.user);
  }

  if (updates.priority !== undefined && updates.priority !== oldPriority) {
    await Activity.create({
      taskId: task._id,
      projectId: task.projectId,
      userId: req.user._id,
      action: 'PRIORITY_CHANGED',
      field: 'priority',
      oldValue: oldPriority,
      newValue: updates.priority
    });
  }

  if (updates.storyPoints !== undefined && updates.storyPoints !== oldStoryPoints) {
    await Activity.create({
      taskId: task._id,
      projectId: task.projectId,
      userId: req.user._id,
      action: 'ESTIMATE_CHANGED',
      field: 'storyPoints',
      oldValue: oldStoryPoints,
      newValue: updates.storyPoints
    });
  }

  await CacheService.invalidateProject(task.projectId);
  await CacheService.invalidatePattern(`kanban:${task.projectId}*`);

  const updatedTask = await Task.findById(taskId)
    .populate('assigneeId', 'name email avatar jobTitle')
    .populate('reporterId', 'name email avatar jobTitle')
    .populate('createdBy', 'name email avatar')
    .populate('updatedBy', 'name email avatar')
    .populate('sprintId', 'name status')
    .populate('linkedIssues.targetTaskId', 'key title status issueType priority')
    .populate('workLogs.userId', 'name email avatar');

  // Real-time WebSocket broadcast
  emitToProject(task.projectId, 'task:updated', updatedTask);
  emitToTask(taskId, 'task:updated', updatedTask);

  res.json({
    success: true,
    message: 'Task updated',
    data: updatedTask
  });
});

// @desc    Add Subtask to Task
// @route   POST /api/v1/tasks/:taskId/subtasks
// @access  Private
const addSubtask = asyncHandler(async (req, res) => {
  const { taskId } = req.params;
  const { title, assigneeId, description, startDate, dueDate, status } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ success: false, error: 'Subtask title is required' });
  }

  const task = await Task.findById(taskId);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }

  const project = await Project.findById(task.projectId);
  const isAssignee = task.assigneeId && (task.assigneeId._id || task.assigneeId).toString() === req.user._id.toString();
  const perm = await checkTaskPermission(req.user, project, task, 'CREATE_SUBTASK', req);
  if (!perm.allowed && !isAssignee) {
    return res.status(403).json({ success: false, error: perm.message || 'Permission denied to add subtask' });
  }

  const safeAssigneeId = assigneeId && mongoose.Types.ObjectId.isValid(assigneeId) ? assigneeId : null;

  const projKey = project.key || 'TASK';
  const subtaskIndex = (task.subtasks.length || 0) + 1;
  const mtCode = extractTaskMnemonic(task.key, task.taskNumber || 1);

  let teamCode = '';
  if (task.team) {
    const foundTeam = project.teams?.find(
      (t) => (t.name || '').toLowerCase().trim() === task.team.toLowerCase().trim() ||
             (t.key || '').toLowerCase().trim() === task.team.toLowerCase().trim()
    );
    if (foundTeam?.key) {
      teamCode = foundTeam.key.toUpperCase().trim();
    } else {
      teamCode = task.team.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 4);
    }
  } else {
    const match = task.key ? task.key.match(/^[^-]+-MT-([A-Z0-9]+)/) : null;
    if (match) {
      teamCode = match[1];
    }
  }
  if (!teamCode) {
    teamCode = 'GEN';
  }

  const subtaskKey = `${projKey}-ST-${teamCode}-${mtCode}-${subtaskIndex}`;

  const stages = getWorkflowStagesForTask(project, task.team);
  const firstStageId = stages && stages.length > 0 ? stages[0].id : (status || task.status);
  const lastStageId = stages && stages.length > 0 ? stages[stages.length - 1].id : null;
  const subStatus = status || firstStageId;

  const newSubtaskObj = {
    key: subtaskKey,
    title: title.trim(),
    description: description ? description.trim() : '',
    startDate: startDate ? new Date(startDate) : null,
    dueDate: dueDate ? new Date(dueDate) : null,
    status: subStatus,
    isCompleted: (lastStageId && subStatus === lastStageId) || false,
    assigneeId: safeAssigneeId,
    createdBy: req.user._id,
    createdAt: new Date()
  };

  task.subtasks.push(newSubtaskObj);

  // If subtask is created, parent main task assignee must be blank/unassigned
  task.assigneeId = null;

  // Automatically sync / expand parent task date envelope
  if (newSubtaskObj.startDate) {
    if (!task.startDate || newSubtaskObj.startDate < new Date(task.startDate)) {
      task.startDate = newSubtaskObj.startDate;
    }
  }
  if (newSubtaskObj.dueDate) {
    if (!task.dueDate || newSubtaskObj.dueDate > new Date(task.dueDate)) {
      task.dueDate = newSubtaskObj.dueDate;
    }
  }

  task.status = computeParentTaskStatus(task.subtasks, stages, task.status);

  task.updatedBy = req.user._id;
  await task.save();

  const createdSub = task.subtasks[task.subtasks.length - 1];

  await Activity.create({
    taskId: task._id,
    projectId: task.projectId,
    userId: req.user._id,
    action: 'SUBTASK_ADDED',
    field: 'subtasks',
    newValue: title.trim(),
    metadata: {
      subtaskId: createdSub._id,
      subtaskKey,
      title: title.trim(),
      status: subStatus,
      description: newSubtaskObj.description,
      startDate: newSubtaskObj.startDate,
      dueDate: newSubtaskObj.dueDate
    }
  });

  await CacheService.invalidateProject(task.projectId);
  await CacheService.invalidatePattern(`kanban:${task.projectId}*`);

  const populatedTask = await Task.findById(taskId)
    .populate('subtasks.assigneeId', 'name email avatar')
    .populate('subtasks.createdBy', 'name email');

  emitToProject(task.projectId, 'task:updated', populatedTask);
  emitToTask(taskId, 'task:updated', populatedTask);

  res.status(201).json({
    success: true,
    data: populatedTask.subtasks,
    taskStatus: task.status
  });
});

// @desc    Update Subtask (Title, Description, Dates, Status, Assignee, Completion)
// @route   PATCH /api/v1/tasks/:taskId/subtasks/:subtaskId
// @access  Private
const toggleSubtask = asyncHandler(async (req, res) => {
  const { taskId, subtaskId } = req.params;
  const { isCompleted, title, description, startDate, dueDate, assigneeId, status } = req.body;

  const task = await Task.findById(taskId);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }

  const subtask = task.subtasks.id(subtaskId);
  if (!subtask) {
    return res.status(404).json({ success: false, error: 'Subtask not found' });
  }

  const project = await Project.findById(task.projectId);
  const isTaskAssignee = task.assigneeId && (task.assigneeId._id || task.assigneeId).toString() === req.user._id.toString();
  const isSubtaskAssignee = subtask.assigneeId && (subtask.assigneeId._id || subtask.assigneeId).toString() === req.user._id.toString();
  const perm = await checkTaskPermission(req.user, project, task, 'UPDATE', req);

  if (req.user.role === 'GUEST' || req.user.role === 'VIEWER') {
    return res.status(403).json({ success: false, error: 'Guests have read-only access' });
  }

  if (!perm.allowed && !isTaskAssignee && !isSubtaskAssignee) {
    return res.status(403).json({
      success: false,
      error: 'You can only update or modify subtasks assigned to you'
    });
  }

  const stages = getWorkflowStagesForTask(project, task.team);
  const firstStageId = stages && stages.length > 0 ? stages[0].id : (task.status || null);
  const lastStageId = stages && stages.length > 0 ? stages[stages.length - 1].id : null;

  const oldStatus = subtask.status;
  const oldTitle = subtask.title;
  const oldDescription = subtask.description || '';
  const oldAssigneeId = subtask.assigneeId ? subtask.assigneeId.toString() : null;
  const oldStartDate = subtask.startDate ? new Date(subtask.startDate).toISOString() : null;
  const oldDueDate = subtask.dueDate ? new Date(subtask.dueDate).toISOString() : null;

  if (status !== undefined) {
    subtask.status = status;
    if (lastStageId && status === lastStageId) {
      subtask.isCompleted = true;
      subtask.completedAt = new Date();
    } else {
      subtask.isCompleted = false;
      subtask.completedAt = null;
    }
  } else if (isCompleted !== undefined) {
    subtask.isCompleted = isCompleted;
    subtask.completedAt = isCompleted ? new Date() : null;
    if (lastStageId) {
      subtask.status = isCompleted ? lastStageId : (subtask.status === lastStageId ? (stages[1]?.id || firstStageId) : subtask.status || firstStageId);
    }
  }

  if (title !== undefined) {
    subtask.title = title.trim();
  }
  if (description !== undefined) {
    subtask.description = description ? description.trim() : '';
  }
  if (startDate !== undefined) {
    subtask.startDate = startDate ? new Date(startDate) : null;
  }
  if (dueDate !== undefined) {
    subtask.dueDate = dueDate ? new Date(dueDate) : null;
  }
  if (assigneeId !== undefined && perm.allowed) {
    if (subtask.microtasks && subtask.microtasks.length > 0) {
      subtask.assigneeId = null;
    } else {
      subtask.assigneeId = assigneeId && mongoose.Types.ObjectId.isValid(assigneeId) ? assigneeId : null;
    }
  }

  // Task has subtasks, so main task assignee must remain null
  task.assigneeId = null;

  // Automatically sync / expand parent task date envelope against all subtasks
  let minSubStartDate = null;
  let maxSubDueDate = null;
  task.subtasks.forEach((s) => {
    if (s.startDate) {
      const sDate = new Date(s.startDate);
      if (!minSubStartDate || sDate < minSubStartDate) minSubStartDate = sDate;
    }
    if (s.dueDate) {
      const dDate = new Date(s.dueDate);
      if (!maxSubDueDate || dDate > maxSubDueDate) maxSubDueDate = dDate;
    }
  });

  if (minSubStartDate && (!task.startDate || minSubStartDate < new Date(task.startDate))) {
    task.startDate = minSubStartDate;
  }
  if (maxSubDueDate && (!task.dueDate || maxSubDueDate > new Date(task.dueDate))) {
    task.dueDate = maxSubDueDate;
  }

  const oldParentStatus = task.status;
  // Dynamic Parent Task Stage Progression using project/team workflow stages:
  task.status = computeParentTaskStatus(task.subtasks, stages, task.status);

  task.updatedBy = req.user._id;
  await task.save();

  if (oldParentStatus !== task.status) {
    await syncLinkedRequestsOnTaskStatus(task, task.status, req.user);
  }

  // Audit activity logging for subtask updates
  if (status !== undefined && status !== oldStatus) {
    await Activity.create({
      taskId: task._id,
      projectId: task.projectId,
      userId: req.user._id,
      action: 'SUBTASK_STATUS_CHANGED',
      field: 'status',
      oldValue: oldStatus,
      newValue: subtask.status,
      metadata: {
        subtaskId: subtask._id,
        subtaskKey: subtask.key,
        title: subtask.title
      }
    });
  }

  if (assigneeId !== undefined) {
    const newAssigneeStr = subtask.assigneeId ? subtask.assigneeId.toString() : null;
    if (newAssigneeStr !== oldAssigneeId) {
      const newAssigneeUser = subtask.assigneeId ? await User.findById(subtask.assigneeId).select('name').lean() : null;
      const oldAssigneeUser = oldAssigneeId ? await User.findById(oldAssigneeId).select('name').lean() : null;
      await Activity.create({
        taskId: task._id,
        projectId: task.projectId,
        userId: req.user._id,
        action: 'SUBTASK_ASSIGNED',
        field: 'assignee',
        oldValue: oldAssigneeUser?.name || 'Unassigned',
        newValue: newAssigneeUser?.name || 'Unassigned',
        metadata: {
          subtaskId: subtask._id,
          subtaskKey: subtask.key,
          title: subtask.title
        }
      });
    }
  }

  if (title !== undefined && subtask.title !== oldTitle) {
    await Activity.create({
      taskId: task._id,
      projectId: task.projectId,
      userId: req.user._id,
      action: 'SUBTASK_UPDATED',
      field: 'title',
      oldValue: oldTitle,
      newValue: subtask.title,
      metadata: {
        subtaskId: subtask._id,
        subtaskKey: subtask.key,
        subtaskField: 'title'
      }
    });
  }

  const newStartDateStr = subtask.startDate ? new Date(subtask.startDate).toISOString() : null;
  const newDueDateStr = subtask.dueDate ? new Date(subtask.dueDate).toISOString() : null;
  if ((startDate !== undefined && newStartDateStr !== oldStartDate) || (dueDate !== undefined && newDueDateStr !== oldDueDate)) {
    await Activity.create({
      taskId: task._id,
      projectId: task.projectId,
      userId: req.user._id,
      action: 'SUBTASK_UPDATED',
      field: 'dates',
      oldValue: `${oldStartDate ? oldStartDate.slice(0, 10) : 'None'} - ${oldDueDate ? oldDueDate.slice(0, 10) : 'None'}`,
      newValue: `${newStartDateStr ? newStartDateStr.slice(0, 10) : 'None'} - ${newDueDateStr ? newDueDateStr.slice(0, 10) : 'None'}`,
      metadata: {
        subtaskId: subtask._id,
        subtaskKey: subtask.key,
        subtaskField: 'dates',
        startDate: subtask.startDate,
        dueDate: subtask.dueDate
      }
    });
  }

  if (description !== undefined && subtask.description !== oldDescription) {
    await Activity.create({
      taskId: task._id,
      projectId: task.projectId,
      userId: req.user._id,
      action: 'SUBTASK_UPDATED',
      field: 'description',
      oldValue: oldDescription ? 'Updated description' : 'No description',
      newValue: subtask.description ? 'Updated description' : 'Cleared description',
      metadata: {
        subtaskId: subtask._id,
        subtaskKey: subtask.key,
        subtaskField: 'description'
      }
    });
  }

  await CacheService.invalidateProject(task.projectId);
  await CacheService.invalidatePattern(`kanban:${task.projectId}*`);

  const populatedTask = await Task.findById(taskId)
    .populate('subtasks.assigneeId', 'name email avatar')
    .populate('subtasks.createdBy', 'name email');

  emitToProject(task.projectId, 'task:updated', populatedTask);
  emitToTask(taskId, 'task:updated', populatedTask);

  res.json({
    success: true,
    data: populatedTask.subtasks,
    taskStatus: task.status
  });
});

// @desc    Delete Subtask
// @route   DELETE /api/v1/tasks/:taskId/subtasks/:subtaskId
// @access  Private
const deleteSubtask = asyncHandler(async (req, res) => {
  const { taskId, subtaskId } = req.params;

  const task = await Task.findById(taskId);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }

  if (task.isLocked) {
    let lockerName = 'a Team Lead/Admin';
    if (task.lockedBy) {
      try {
        const locker = await User.findById(task.lockedBy).select('name');
        if (locker?.name) lockerName = locker.name;
      } catch (_) {}
    }
    return res.status(403).json({
      success: false,
      error: `This parent task is locked by ${lockerName} and cannot be deleted. Child subtasks cannot be deleted while locked.`
    });
  }

  const subtask = task.subtasks.id(subtaskId);
  if (!subtask) {
    return res.status(404).json({ success: false, error: 'Subtask not found' });
  }

  if (subtask.isLocked) {
    let lockerName = 'a Team Lead/Admin';
    if (subtask.lockedBy) {
      try {
        const locker = await User.findById(subtask.lockedBy).select('name');
        if (locker?.name) lockerName = locker.name;
      } catch (_) {}
    }
    return res.status(403).json({
      success: false,
      error: `This subtask is locked by ${lockerName} and cannot be deleted. Only ${lockerName} can unlock it.`
    });
  }

  const project = await Project.findById(task.projectId);
  const isTaskAssignee = task.assigneeId && (task.assigneeId._id || task.assigneeId).toString() === req.user._id.toString();
  const isSubtaskAssignee = subtask?.assigneeId && (subtask.assigneeId._id || subtask.assigneeId).toString() === req.user._id.toString();
  const perm = await checkTaskPermission(req.user, project, task, 'DELETE_SUBTASK', req);

  if (!perm.allowed && !isTaskAssignee && !isSubtaskAssignee) {
    return res.status(403).json({ success: false, error: 'Permission denied to delete subtask' });
  }
  const deletedTitle = subtask ? subtask.title : '';
  const deletedKey = subtask ? subtask.key : '';

  task.subtasks = task.subtasks.filter((s) => s._id.toString() !== subtaskId);
  const stages = getWorkflowStagesForTask(project, task.team);
  task.status = computeParentTaskStatus(task.subtasks, stages, task.status);

  task.updatedBy = req.user._id;
  await task.save();

  if (deletedTitle) {
    await Activity.create({
      taskId: task._id,
      projectId: task.projectId,
      userId: req.user._id,
      action: 'SUBTASK_DELETED',
      field: 'subtasks',
      oldValue: deletedTitle,
      newValue: null,
      metadata: {
        subtaskId,
        subtaskKey: deletedKey
      }
    });
  }

  await CacheService.invalidateProject(task.projectId);
  await CacheService.invalidatePattern(`kanban:${task.projectId}*`);

  const populatedTask = await Task.findById(taskId)
    .populate('subtasks.assigneeId', 'name email avatar')
    .populate('subtasks.createdBy', 'name email');

  emitToProject(task.projectId, 'task:updated', populatedTask);
  emitToTask(taskId, 'task:updated', populatedTask);

  res.json({
    success: true,
    data: populatedTask.subtasks,
    taskStatus: task.status
  });
});

// @desc    Add Minitask to Subtask (Level 3)
// @route   POST /api/v1/tasks/:taskId/subtasks/:subtaskId/minitasks
// @access  Private
const addMinitask = asyncHandler(async (req, res) => {
  const { taskId, subtaskId } = req.params;
  const { title, description, startDate, dueDate, assigneeId, status } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ success: false, error: 'Mini-task title is required' });
  }

  const task = await Task.findById(taskId);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }

  const subtask = task.subtasks.id(subtaskId);
  if (!subtask) {
    return res.status(404).json({ success: false, error: 'Subtask not found' });
  }

  const project = await Project.findById(task.projectId);
  const isMainAssignee = task.assigneeId && (task.assigneeId._id || task.assigneeId).toString() === req.user._id.toString();
  const isSubtaskAssignee = subtask.assigneeId && (subtask.assigneeId._id || subtask.assigneeId).toString() === req.user._id.toString();
  const perm = await checkTaskPermission(req.user, project, task, 'CREATE_SUBTASK', req);

  if (!perm.allowed && !isMainAssignee && !isSubtaskAssignee) {
    return res.status(403).json({ success: false, error: 'Permission denied to add mini-task' });
  }

  if (!subtask.minitasks) {
    subtask.minitasks = [];
  }

  const miniIndex = subtask.minitasks.length + 1;
  let miniKey = '';
  if (subtask.key) {
    miniKey = subtask.key.replace('-ST-', '-MIN-') + `-${miniIndex}`;
  } else {
    miniKey = `${task.key || 'TASK'}-MIN-${miniIndex}`;
  }

  let safeAssigneeId = assigneeId && mongoose.Types.ObjectId.isValid(assigneeId) ? assigneeId : null;
  if (!perm.allowed) {
    safeAssigneeId = req.user._id;
  }

  const newMinitask = {
    key: miniKey,
    title: title.trim(),
    description: description ? description.trim() : '',
    startDate: startDate ? new Date(startDate) : null,
    dueDate: dueDate ? new Date(dueDate) : null,
    status: status || 'TODO',
    isCompleted: status === 'DONE',
    assigneeId: safeAssigneeId,
    createdBy: req.user._id,
    createdAt: new Date(),
    microtasks: []
  };

  subtask.minitasks.push(newMinitask);

  // Automatically sync / expand subtask and main task dates
  if (newMinitask.startDate) {
    if (!subtask.startDate || newMinitask.startDate < new Date(subtask.startDate)) {
      subtask.startDate = newMinitask.startDate;
    }
    if (!task.startDate || newMinitask.startDate < new Date(task.startDate)) {
      task.startDate = newMinitask.startDate;
    }
  }
  if (newMinitask.dueDate) {
    if (!subtask.dueDate || newMinitask.dueDate > new Date(subtask.dueDate)) {
      subtask.dueDate = newMinitask.dueDate;
    }
    if (!task.dueDate || newMinitask.dueDate > new Date(task.dueDate)) {
      task.dueDate = newMinitask.dueDate;
    }
  }

  task.updatedBy = req.user._id;
  await task.save();

  await Activity.create({
    taskId: task._id,
    projectId: task.projectId,
    userId: req.user._id,
    action: 'MINITASK_ADDED',
    field: 'minitasks',
    newValue: title.trim(),
    metadata: {
      subtaskId,
      minitaskId: newMinitask._id,
      minitaskKey: miniKey,
      title: title.trim()
    }
  });

  await CacheService.invalidateProject(task.projectId);
  await CacheService.invalidatePattern(`kanban:${task.projectId}*`);

  const populatedTask = await Task.findById(taskId)
    .populate('subtasks.assigneeId', 'name email avatar')
    .populate('subtasks.createdBy', 'name email')
    .populate('subtasks.minitasks.assigneeId', 'name email avatar')
    .populate('subtasks.minitasks.createdBy', 'name email')
    .populate('subtasks.minitasks.microtasks.assigneeId', 'name email avatar')
    .populate('subtasks.minitasks.microtasks.createdBy', 'name email');

  emitToProject(task.projectId, 'task:updated', populatedTask);
  emitToTask(taskId, 'task:updated', populatedTask);

  res.status(201).json({
    success: true,
    data: populatedTask.subtasks,
    taskStatus: task.status
  });
});

// @desc    Update Minitask (Level 3)
// @route   PATCH /api/v1/tasks/:taskId/subtasks/:subtaskId/minitasks/:minitaskId
// @access  Private
const updateMinitask = asyncHandler(async (req, res) => {
  const { taskId, subtaskId, minitaskId } = req.params;
  const { title, description, startDate, dueDate, assigneeId, status, isCompleted } = req.body;

  const task = await Task.findById(taskId);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }

  const subtask = task.subtasks.id(subtaskId);
  if (!subtask) {
    return res.status(404).json({ success: false, error: 'Subtask not found' });
  }

  const minitask = subtask.minitasks.id(minitaskId);
  if (!minitask) {
    return res.status(404).json({ success: false, error: 'Mini-task not found' });
  }

  const project = await Project.findById(task.projectId);
  const isMainAssignee = task.assigneeId && (task.assigneeId._id || task.assigneeId).toString() === req.user._id.toString();
  const isSubtaskAssignee = subtask.assigneeId && (subtask.assigneeId._id || subtask.assigneeId).toString() === req.user._id.toString();
  const isMiniAssignee = minitask.assigneeId && (minitask.assigneeId._id || minitask.assigneeId).toString() === req.user._id.toString();
  const perm = await checkTaskPermission(req.user, project, task, 'UPDATE', req);

  if (!perm.allowed && !isMainAssignee && !isSubtaskAssignee && !isMiniAssignee) {
    return res.status(403).json({ success: false, error: 'Permission denied to update mini-task' });
  }

  if (title !== undefined) minitask.title = title.trim();
  if (description !== undefined) minitask.description = description ? description.trim() : '';
  if (startDate !== undefined) minitask.startDate = startDate ? new Date(startDate) : null;
  if (dueDate !== undefined) minitask.dueDate = dueDate ? new Date(dueDate) : null;
  if (assigneeId !== undefined && perm.allowed) {
    minitask.assigneeId = assigneeId && mongoose.Types.ObjectId.isValid(assigneeId) ? assigneeId : null;
  }
  if (status !== undefined) {
    minitask.status = status;
    if (status === 'DONE') {
      minitask.isCompleted = true;
      minitask.completedAt = new Date();
    } else {
      minitask.isCompleted = false;
      minitask.completedAt = null;
    }
  }
  if (isCompleted !== undefined) {
    minitask.isCompleted = Boolean(isCompleted);
    if (minitask.isCompleted) {
      minitask.status = 'DONE';
      minitask.completedAt = new Date();
    } else {
      if (minitask.status === 'DONE') minitask.status = 'TODO';
      minitask.completedAt = null;
    }
  }

  const stages = getWorkflowStagesForTask(project, task.team);

  // Roll-up: Subtask stage is dynamically computed from its mini-tasks!
  if (Array.isArray(subtask.minitasks) && subtask.minitasks.length > 0) {
    subtask.status = computeParentTaskStatus(subtask.minitasks, stages, subtask.status);
    const lastStageId = stages && stages.length > 0 ? stages[stages.length - 1].id : null;
    const allMinisDone = subtask.minitasks.every((m) => m.isCompleted || (lastStageId && m.status === lastStageId) || m.status === 'DONE');
    if (allMinisDone) {
      subtask.isCompleted = true;
      subtask.completedAt = subtask.completedAt || new Date();
    } else {
      subtask.isCompleted = false;
      subtask.completedAt = null;
    }
  }

  // Roll-up: Main Task stage is dynamically computed from its subtasks!
  task.status = computeParentTaskStatus(task.subtasks, stages, task.status);

  task.updatedBy = req.user._id;
  await task.save();

  await CacheService.invalidateProject(task.projectId);
  await CacheService.invalidatePattern(`kanban:${task.projectId}*`);

  const populatedTask = await Task.findById(taskId)
    .populate('subtasks.assigneeId', 'name email avatar')
    .populate('subtasks.createdBy', 'name email')
    .populate('subtasks.minitasks.assigneeId', 'name email avatar')
    .populate('subtasks.minitasks.createdBy', 'name email')
    .populate('subtasks.minitasks.microtasks.assigneeId', 'name email avatar')
    .populate('subtasks.minitasks.microtasks.createdBy', 'name email');

  emitToProject(task.projectId, 'task:updated', populatedTask);
  emitToTask(taskId, 'task:updated', populatedTask);

  res.json({
    success: true,
    data: populatedTask.subtasks,
    taskStatus: task.status
  });
});

// @desc    Delete Minitask (Level 3)
// @route   DELETE /api/v1/tasks/:taskId/subtasks/:subtaskId/minitasks/:minitaskId
// @access  Private
const deleteMinitask = asyncHandler(async (req, res) => {
  const { taskId, subtaskId, minitaskId } = req.params;

  const task = await Task.findById(taskId);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }

  if (task.isLocked) {
    let lockerName = 'a Team Lead/Admin';
    if (task.lockedBy) {
      try {
        const locker = await User.findById(task.lockedBy).select('name');
        if (locker?.name) lockerName = locker.name;
      } catch (_) {}
    }
    return res.status(403).json({
      success: false,
      error: `Parent task is locked by ${lockerName}. Child mini-tasks cannot be deleted while locked.`
    });
  }

  const subtask = task.subtasks.id(subtaskId);
  if (!subtask) {
    return res.status(404).json({ success: false, error: 'Subtask not found' });
  }

  if (subtask.isLocked) {
    let lockerName = 'a Team Lead/Admin';
    if (subtask.lockedBy) {
      try {
        const locker = await User.findById(subtask.lockedBy).select('name');
        if (locker?.name) lockerName = locker.name;
      } catch (_) {}
    }
    return res.status(403).json({
      success: false,
      error: `Parent subtask is locked by ${lockerName}. Child mini-tasks cannot be deleted while locked.`
    });
  }

  const minitask = subtask.minitasks ? subtask.minitasks.id(minitaskId) : null;
  if (!minitask) {
    return res.status(404).json({ success: false, error: 'Mini-task not found' });
  }

  if (minitask.isLocked) {
    let lockerName = 'a Team Lead/Admin';
    if (minitask.lockedBy) {
      try {
        const locker = await User.findById(minitask.lockedBy).select('name');
        if (locker?.name) lockerName = locker.name;
      } catch (_) {}
    }
    return res.status(403).json({
      success: false,
      error: `This mini-task is locked by ${lockerName} and cannot be deleted. Only ${lockerName} can unlock it.`
    });
  }

  const project = await Project.findById(task.projectId);
  const isMainAssignee = task.assigneeId && (task.assigneeId._id || task.assigneeId).toString() === req.user._id.toString();
  const isSubtaskAssignee = subtask.assigneeId && (subtask.assigneeId._id || subtask.assigneeId).toString() === req.user._id.toString();
  const perm = await checkTaskPermission(req.user, project, task, 'DELETE_SUBTASK', req);

  const isMiniAssignee = minitask?.assigneeId && (minitask.assigneeId._id || minitask.assigneeId).toString() === req.user._id.toString();

  if (!perm.allowed && !isMainAssignee && !isSubtaskAssignee && !isMiniAssignee) {
    return res.status(403).json({ success: false, error: 'Permission denied to delete mini-task' });
  }

  subtask.minitasks = (subtask.minitasks || []).filter((m) => m._id.toString() !== minitaskId);

  const stages = getWorkflowStagesForTask(project, task.team);
  if (Array.isArray(subtask.minitasks) && subtask.minitasks.length > 0) {
    subtask.status = computeParentTaskStatus(subtask.minitasks, stages, subtask.status);
  }
  task.status = computeParentTaskStatus(task.subtasks, stages, task.status);

  task.updatedBy = req.user._id;
  await task.save();

  await CacheService.invalidateProject(task.projectId);
  await CacheService.invalidatePattern(`kanban:${task.projectId}*`);

  const populatedTask = await Task.findById(taskId)
    .populate('subtasks.assigneeId', 'name email avatar')
    .populate('subtasks.createdBy', 'name email')
    .populate('subtasks.minitasks.assigneeId', 'name email avatar')
    .populate('subtasks.minitasks.createdBy', 'name email')
    .populate('subtasks.minitasks.microtasks.assigneeId', 'name email avatar')
    .populate('subtasks.minitasks.microtasks.createdBy', 'name email');

  emitToProject(task.projectId, 'task:updated', populatedTask);
  emitToTask(taskId, 'task:updated', populatedTask);

  res.json({
    success: true,
    data: populatedTask.subtasks,
    taskStatus: task.status
  });
});

// @desc    Add Microtask to Minitask (Level 4)
// @route   POST /api/v1/tasks/:taskId/subtasks/:subtaskId/minitasks/:minitaskId/microtasks
// @access  Private
const addMicrotask = asyncHandler(async (req, res) => {
  const { taskId, subtaskId, minitaskId } = req.params;
  const { title, description, startDate, dueDate, assigneeId, status } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ success: false, error: 'Microtask title is required' });
  }

  const task = await Task.findById(taskId);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }

  const subtask = task.subtasks.id(subtaskId);
  if (!subtask) {
    return res.status(404).json({ success: false, error: 'Subtask not found' });
  }

  const minitask = subtask.minitasks ? subtask.minitasks.id(minitaskId) : null;
  if (!minitask) {
    return res.status(404).json({ success: false, error: 'Mini-task not found' });
  }

  const project = await Project.findById(task.projectId);
  const isMainAssignee = task.assigneeId && (task.assigneeId._id || task.assigneeId).toString() === req.user._id.toString();
  const isSubtaskAssignee = subtask.assigneeId && (subtask.assigneeId._id || subtask.assigneeId).toString() === req.user._id.toString();
  const isMiniAssignee = minitask.assigneeId && (minitask.assigneeId._id || minitask.assigneeId).toString() === req.user._id.toString();
  const perm = await checkTaskPermission(req.user, project, task, 'CREATE_SUBTASK', req);

  if (!perm.allowed && !isMainAssignee && !isSubtaskAssignee && !isMiniAssignee) {
    return res.status(403).json({ success: false, error: 'Permission denied to add micro-task' });
  }

  if (!minitask.microtasks) {
    minitask.microtasks = [];
  }

  const microIndex = minitask.microtasks.length + 1;
  let microKey = '';
  if (minitask.key) {
    microKey = minitask.key.replace('-MIN-', '-MIC-') + `-${microIndex}`;
  } else {
    microKey = `${subtask.key || task.key || 'TASK'}-MIC-${microIndex}`;
  }

  let safeAssigneeId = assigneeId && mongoose.Types.ObjectId.isValid(assigneeId) ? assigneeId : null;
  // If user is Level 4 (normal member, !perm.allowed): auto-assign to self!
  if (!perm.allowed) {
    safeAssigneeId = req.user._id;
  }

  const newMicrotask = {
    key: microKey,
    title: title.trim(),
    description: description ? description.trim() : '',
    startDate: startDate ? new Date(startDate) : null,
    dueDate: dueDate ? new Date(dueDate) : null,
    status: status || 'TODO',
    isCompleted: status === 'DONE',
    assigneeId: safeAssigneeId,
    createdBy: req.user._id,
    createdAt: new Date()
  };

  minitask.microtasks.push(newMicrotask);

  // Automatically sync / expand dates upwards
  if (newMicrotask.startDate) {
    if (!minitask.startDate || newMicrotask.startDate < new Date(minitask.startDate)) {
      minitask.startDate = newMicrotask.startDate;
    }
    if (!subtask.startDate || newMicrotask.startDate < new Date(subtask.startDate)) {
      subtask.startDate = newMicrotask.startDate;
    }
    if (!task.startDate || newMicrotask.startDate < new Date(task.startDate)) {
      task.startDate = newMicrotask.startDate;
    }
  }
  if (newMicrotask.dueDate) {
    if (!minitask.dueDate || newMicrotask.dueDate > new Date(minitask.dueDate)) {
      minitask.dueDate = newMicrotask.dueDate;
    }
    if (!subtask.dueDate || newMicrotask.dueDate > new Date(subtask.dueDate)) {
      subtask.dueDate = newMicrotask.dueDate;
    }
    if (!task.dueDate || newMicrotask.dueDate > new Date(task.dueDate)) {
      task.dueDate = newMicrotask.dueDate;
    }
  }

  task.updatedBy = req.user._id;
  await task.save();

  await Activity.create({
    taskId: task._id,
    projectId: task.projectId,
    userId: req.user._id,
    action: 'MICROTASK_ADDED',
    field: 'microtasks',
    newValue: title.trim(),
    metadata: {
      subtaskId,
      minitaskId,
      microtaskId: newMicrotask._id,
      microtaskKey: microKey,
      title: title.trim()
    }
  });

  await CacheService.invalidateProject(task.projectId);
  await CacheService.invalidatePattern(`kanban:${task.projectId}*`);

  const populatedTask = await Task.findById(taskId)
    .populate('subtasks.assigneeId', 'name email avatar')
    .populate('subtasks.createdBy', 'name email')
    .populate('subtasks.minitasks.assigneeId', 'name email avatar')
    .populate('subtasks.minitasks.createdBy', 'name email')
    .populate('subtasks.minitasks.microtasks.assigneeId', 'name email avatar')
    .populate('subtasks.minitasks.microtasks.createdBy', 'name email');

  emitToProject(task.projectId, 'task:updated', populatedTask);
  emitToTask(taskId, 'task:updated', populatedTask);

  res.status(201).json({
    success: true,
    data: populatedTask.subtasks,
    taskStatus: task.status
  });
});

// @desc    Update Microtask (Title, Description, Dates, Status, Assignee, Completion) (Level 4)
// @route   PATCH /api/v1/tasks/:taskId/subtasks/:subtaskId/minitasks/:minitaskId/microtasks/:microtaskId
// @access  Private
const updateMicrotask = asyncHandler(async (req, res) => {
  const { taskId, subtaskId, minitaskId, microtaskId } = req.params;
  const { title, description, startDate, dueDate, assigneeId, status, isCompleted } = req.body;

  const task = await Task.findById(taskId);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }

  const subtask = task.subtasks.id(subtaskId);
  if (!subtask) {
    return res.status(404).json({ success: false, error: 'Subtask not found' });
  }

  const minitask = subtask.minitasks ? subtask.minitasks.id(minitaskId) : null;
  if (!minitask) {
    return res.status(404).json({ success: false, error: 'Mini-task not found' });
  }

  const microtask = minitask.microtasks ? minitask.microtasks.id(microtaskId) : null;
  if (!microtask) {
    return res.status(404).json({ success: false, error: 'Microtask not found' });
  }

  const project = await Project.findById(task.projectId);
  const isMainAssignee = task.assigneeId && (task.assigneeId._id || task.assigneeId).toString() === req.user._id.toString();
  const isSubtaskAssignee = subtask.assigneeId && (subtask.assigneeId._id || subtask.assigneeId).toString() === req.user._id.toString();
  const isMiniAssignee = minitask.assigneeId && (minitask.assigneeId._id || minitask.assigneeId).toString() === req.user._id.toString();
  const isMicroAssignee = microtask.assigneeId && (microtask.assigneeId._id || microtask.assigneeId).toString() === req.user._id.toString();
  const perm = await checkTaskPermission(req.user, project, task, 'UPDATE', req);

  if (!perm.allowed && !isMainAssignee && !isSubtaskAssignee && !isMiniAssignee && !isMicroAssignee) {
    return res.status(403).json({ success: false, error: 'Permission denied to update micro-task' });
  }

  if (title !== undefined) microtask.title = title.trim();
  if (description !== undefined) microtask.description = description ? description.trim() : '';
  if (startDate !== undefined) microtask.startDate = startDate ? new Date(startDate) : null;
  if (dueDate !== undefined) microtask.dueDate = dueDate ? new Date(dueDate) : null;
  if (assigneeId !== undefined && perm.allowed) {
    microtask.assigneeId = assigneeId && mongoose.Types.ObjectId.isValid(assigneeId) ? assigneeId : null;
  }
  if (status !== undefined) {
    microtask.status = status;
    if (status === 'DONE') {
      microtask.isCompleted = true;
      microtask.completedAt = new Date();
    } else {
      microtask.isCompleted = false;
      microtask.completedAt = null;
    }
  }
  if (isCompleted !== undefined) {
    microtask.isCompleted = Boolean(isCompleted);
    if (microtask.isCompleted) {
      microtask.status = 'DONE';
      microtask.completedAt = new Date();
    } else {
      if (microtask.status === 'DONE') microtask.status = 'TODO';
      microtask.completedAt = null;
    }
  }

  const stages = getWorkflowStagesForTask(project, task.team);

  // 1. Roll-up Microtasks -> Minitask!
  if (Array.isArray(minitask.microtasks) && minitask.microtasks.length > 0) {
    minitask.status = computeParentTaskStatus(minitask.microtasks, stages, minitask.status);
    const lastStageId = stages && stages.length > 0 ? stages[stages.length - 1].id : null;
    const allMicrosDone = minitask.microtasks.every((m) => m.isCompleted || (lastStageId && m.status === lastStageId) || m.status === 'DONE');
    if (allMicrosDone) {
      minitask.isCompleted = true;
      minitask.completedAt = minitask.completedAt || new Date();
    } else {
      minitask.isCompleted = false;
      minitask.completedAt = null;
    }
  }

  // 2. Roll-up Minitasks -> Subtask!
  if (Array.isArray(subtask.minitasks) && subtask.minitasks.length > 0) {
    subtask.status = computeParentTaskStatus(subtask.minitasks, stages, subtask.status);
    const lastStageId = stages && stages.length > 0 ? stages[stages.length - 1].id : null;
    const allMinisDone = subtask.minitasks.every((m) => m.isCompleted || (lastStageId && m.status === lastStageId) || m.status === 'DONE');
    if (allMinisDone) {
      subtask.isCompleted = true;
      subtask.completedAt = subtask.completedAt || new Date();
    } else {
      subtask.isCompleted = false;
      subtask.completedAt = null;
    }
  }

  // 3. Roll-up Subtasks -> Main Task!
  task.status = computeParentTaskStatus(task.subtasks, stages, task.status);

  task.updatedBy = req.user._id;
  await task.save();

  await CacheService.invalidateProject(task.projectId);
  await CacheService.invalidatePattern(`kanban:${task.projectId}*`);

  const populatedTask = await Task.findById(taskId)
    .populate('subtasks.assigneeId', 'name email avatar')
    .populate('subtasks.createdBy', 'name email')
    .populate('subtasks.minitasks.assigneeId', 'name email avatar')
    .populate('subtasks.minitasks.createdBy', 'name email')
    .populate('subtasks.minitasks.microtasks.assigneeId', 'name email avatar')
    .populate('subtasks.minitasks.microtasks.createdBy', 'name email');

  emitToProject(task.projectId, 'task:updated', populatedTask);
  emitToTask(taskId, 'task:updated', populatedTask);

  res.json({
    success: true,
    data: populatedTask.subtasks,
    taskStatus: task.status
  });
});

// @desc    Delete Microtask (Level 4)
// @route   DELETE /api/v1/tasks/:taskId/subtasks/:subtaskId/minitasks/:minitaskId/microtasks/:microtaskId
// @access  Private
const deleteMicrotask = asyncHandler(async (req, res) => {
  const { taskId, subtaskId, minitaskId, microtaskId } = req.params;

  const task = await Task.findById(taskId);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }

  if (task.isLocked) {
    let lockerName = 'a Team Lead/Admin';
    if (task.lockedBy) {
      try {
        const locker = await User.findById(task.lockedBy).select('name');
        if (locker?.name) lockerName = locker.name;
      } catch (_) {}
    }
    return res.status(403).json({
      success: false,
      error: `Parent task is locked by ${lockerName}. Child micro-tasks cannot be deleted while locked.`
    });
  }

  const subtask = task.subtasks.id(subtaskId);
  if (!subtask) {
    return res.status(404).json({ success: false, error: 'Subtask not found' });
  }

  if (subtask.isLocked) {
    let lockerName = 'a Team Lead/Admin';
    if (subtask.lockedBy) {
      try {
        const locker = await User.findById(subtask.lockedBy).select('name');
        if (locker?.name) lockerName = locker.name;
      } catch (_) {}
    }
    return res.status(403).json({
      success: false,
      error: `Parent subtask is locked by ${lockerName}. Child micro-tasks cannot be deleted while locked.`
    });
  }

  const minitask = subtask.minitasks ? subtask.minitasks.id(minitaskId) : null;
  if (!minitask) {
    return res.status(404).json({ success: false, error: 'Mini-task not found' });
  }

  if (minitask.isLocked) {
    let lockerName = 'a Team Lead/Admin';
    if (minitask.lockedBy) {
      try {
        const locker = await User.findById(minitask.lockedBy).select('name');
        if (locker?.name) lockerName = locker.name;
      } catch (_) {}
    }
    return res.status(403).json({
      success: false,
      error: `Parent mini-task is locked by ${lockerName}. Child micro-tasks cannot be deleted while locked.`
    });
  }

  const microtask = minitask.microtasks ? minitask.microtasks.id(microtaskId) : null;
  if (!microtask) {
    return res.status(404).json({ success: false, error: 'Microtask not found' });
  }

  if (microtask.isLocked) {
    let lockerName = 'a Team Lead/Admin';
    if (microtask.lockedBy) {
      try {
        const locker = await User.findById(microtask.lockedBy).select('name');
        if (locker?.name) lockerName = locker.name;
      } catch (_) {}
    }
    return res.status(403).json({
      success: false,
      error: `This micro-task is locked by ${lockerName} and cannot be deleted. Only ${lockerName} can unlock it.`
    });
  }

  const project = await Project.findById(task.projectId);
  const isMainAssignee = task.assigneeId && (task.assigneeId._id || task.assigneeId).toString() === req.user._id.toString();
  const isSubtaskAssignee = subtask.assigneeId && (subtask.assigneeId._id || subtask.assigneeId).toString() === req.user._id.toString();
  const isMiniAssignee = minitask.assigneeId && (minitask.assigneeId._id || minitask.assigneeId).toString() === req.user._id.toString();
  const perm = await checkTaskPermission(req.user, project, task, 'DELETE_SUBTASK', req);

  const isMicroAssignee = microtask?.assigneeId && (microtask.assigneeId._id || microtask.assigneeId).toString() === req.user._id.toString();

  if (!perm.allowed && !isMainAssignee && !isSubtaskAssignee && !isMiniAssignee && !isMicroAssignee) {
    return res.status(403).json({ success: false, error: 'Permission denied to delete micro-task' });
  }

  minitask.microtasks = (minitask.microtasks || []).filter((m) => m._id.toString() !== microtaskId);

  const stages = getWorkflowStagesForTask(project, task.team);
  if (Array.isArray(minitask.microtasks) && minitask.microtasks.length > 0) {
    minitask.status = computeParentTaskStatus(minitask.microtasks, stages, minitask.status);
  }
  if (Array.isArray(subtask.minitasks) && subtask.minitasks.length > 0) {
    subtask.status = computeParentTaskStatus(subtask.minitasks, stages, subtask.status);
  }
  task.status = computeParentTaskStatus(task.subtasks, stages, task.status);

  task.updatedBy = req.user._id;
  await task.save();

  await CacheService.invalidateProject(task.projectId);
  await CacheService.invalidatePattern(`kanban:${task.projectId}*`);

  const populatedTask = await Task.findById(taskId)
    .populate('subtasks.assigneeId', 'name email avatar')
    .populate('subtasks.createdBy', 'name email')
    .populate('subtasks.minitasks.assigneeId', 'name email avatar')
    .populate('subtasks.minitasks.createdBy', 'name email')
    .populate('subtasks.minitasks.microtasks.assigneeId', 'name email avatar')
    .populate('subtasks.minitasks.microtasks.createdBy', 'name email');

  emitToProject(task.projectId, 'task:updated', populatedTask);
  emitToTask(taskId, 'task:updated', populatedTask);

  res.json({
    success: true,
    data: populatedTask.subtasks,
    taskStatus: task.status
  });
});

// @desc    Log Work Time on Task
// @route   POST /api/v1/tasks/:taskId/worklogs
// @access  Private
const logWork = asyncHandler(async (req, res) => {
  const { taskId } = req.params;
  const { timeSpentMinutes, description, startedAt } = req.body;

  if (!timeSpentMinutes || isNaN(timeSpentMinutes) || Number(timeSpentMinutes) <= 0) {
    return res.status(400).json({ success: false, error: 'Please provide valid time spent in minutes' });
  }

  const task = await Task.findById(taskId);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }

  const minutes = Number(timeSpentMinutes);
  task.workLogs.push({
    timeSpentMinutes: minutes,
    description: description || '',
    startedAt: startedAt ? new Date(startedAt) : new Date(),
    userId: req.user._id,
    createdAt: new Date()
  });

  task.timeSpent = (task.timeSpent || 0) + minutes;
  task.updatedBy = req.user._id;
  await task.save();

  await Activity.create({
    taskId: task._id,
    projectId: task.projectId,
    userId: req.user._id,
    action: 'WORKLOG_ADDED',
    newValue: `${minutes}m logged: ${description || 'Work logged'}`
  });

  await CacheService.invalidateProject(task.projectId);

  emitToProject(task.projectId, 'task:updated', task);
  emitToTask(taskId, 'task:updated', task);

  res.status(201).json({
    success: true,
    data: task.workLogs,
    totalTimeSpent: task.timeSpent
  });
});

// @desc    Link an Issue to another Task (Blocks, Relates to, etc.)
// @route   POST /api/v1/tasks/:taskId/links
// @access  Private
const linkTask = asyncHandler(async (req, res) => {
  const { taskId } = req.params;
  const { type = 'relates_to', targetTaskId } = req.body;

  if (!targetTaskId) {
    return res.status(400).json({ success: false, error: 'Target task ID is required' });
  }

  const task = await Task.findById(taskId);
  const targetTask = await Task.findById(targetTaskId);

  if (!task || !targetTask) {
    return res.status(404).json({ success: false, error: 'One or both tasks not found' });
  }

  task.linkedIssues.push({
    type,
    targetTaskId,
    createdAt: new Date()
  });
  task.updatedBy = req.user._id;
  await task.save();

  // Create reverse link if block relationship
  if (type === 'blocks') {
    targetTask.linkedIssues.push({
      type: 'is_blocked_by',
      targetTaskId: task._id,
      createdAt: new Date()
    });
    await targetTask.save();
  }

  await Activity.create({
    taskId: task._id,
    projectId: task.projectId,
    userId: req.user._id,
    action: 'ISSUE_LINKED',
    newValue: `${type.replace('_', ' ')} ${targetTask.key}`
  });

  emitToProject(task.projectId, 'task:updated', task);
  emitToTask(taskId, 'task:updated', task);

  const populatedTask = await Task.findById(taskId)
    .populate('linkedIssues.targetTaskId', 'key title status issueType priority');

  res.status(201).json({
    success: true,
    data: populatedTask.linkedIssues
  });
});

// @desc    Remove Link from Task
// @route   DELETE /api/v1/tasks/:taskId/links/:linkId
// @access  Private
const unlinkTask = asyncHandler(async (req, res) => {
  const { taskId, linkId } = req.params;

  const task = await Task.findById(taskId);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }

  task.linkedIssues = task.linkedIssues.filter((l) => l._id.toString() !== linkId);
  task.updatedBy = req.user._id;
  await task.save();

  emitToProject(task.projectId, 'task:updated', task);
  emitToTask(taskId, 'task:updated', task);

  res.json({
    success: true,
    data: task.linkedIssues
  });
});

// @desc    Get Project Dependency Graph (DAG) for all linked issues
// @route   GET /api/v1/projects/:projectId/dependency-graph
// @desc    Get Project Dependency Graph & Hierarchy Tree Data (Teams -> Sprints -> Tasks & DAG)
// @route   GET /api/v1/projects/:projectId/dependency-graph
// @access  Private
const getProjectDependencyGraph = asyncHandler(async (req, res) => {
  const { projectId } = req.params;

  const [project, sprints, tasks] = await Promise.all([
    Project.findById(projectId).select('name key teams color icon description').lean(),
    Sprint.find({ projectId }).select('_id name status startDate endDate goal').sort({ createdAt: 1 }).lean(),
    Task.find({ projectId, isArchived: { $ne: true } })
      .select('_id key title status priority issueType storyPoints linkedIssues assigneeId team sprintId sprint dueDate')
      .populate('assigneeId', 'name email avatar jobTitle')
      .lean()
  ]);

  const nodes = tasks.map((t) => ({
    id: t._id.toString(),
    _id: t._id.toString(),
    key: t.key,
    title: t.title,
    status: t.status,
    priority: t.priority,
    issueType: t.issueType,
    storyPoints: t.storyPoints || 0,
    team: t.team || '',
    sprintId: t.sprintId ? t.sprintId.toString() : null,
    sprint: t.sprint || '',
    dueDate: t.dueDate,
    assignee: t.assigneeId ? { _id: t.assigneeId._id, name: t.assigneeId.name, email: t.assigneeId.email, avatar: t.assigneeId.avatar } : null
  }));

  const edges = [];
  tasks.forEach((t) => {
    if (t.linkedIssues && t.linkedIssues.length > 0) {
      t.linkedIssues.forEach((link) => {
        if (link.targetTaskId) {
          edges.push({
            id: `${t._id}-${link.targetTaskId}-${link.type}`,
            source: t._id.toString(),
            target: typeof link.targetTaskId === 'object' ? link.targetTaskId._id.toString() : link.targetTaskId.toString(),
            type: link.type || 'relates_to'
          });
        }
      });
    }
  });

  res.json({
    success: true,
    data: {
      project: project || { name: 'Project', teams: [] },
      teams: project?.teams || [],
      sprints: sprints || [],
      nodes,
      edges
    }
  });
});

// @desc    Delete Attachment from Task
// @route   DELETE /api/v1/tasks/:taskId/attachments/:attachmentId
// @access  Private (Org Admin, PM, Team Lead, or Uploader)
const deleteAttachment = asyncHandler(async (req, res) => {
  const { taskId, attachmentId } = req.params;

  const task = await Task.findById(taskId);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }

  const attachment = task.attachments.id(attachmentId);
  if (!attachment) {
    return res.status(404).json({ success: false, error: 'Attachment not found' });
  }

  const project = await Project.findById(task.projectId);
  const userIdStr = req.user._id.toString();

  const isUploader = attachment.uploadedBy && attachment.uploadedBy.toString() === userIdStr;
  const isOrgAdmin = req.user.role === 'SUPER_ADMIN' || req.user.role === 'ORG_ADMIN';
  const isPM = (project?.leadId && (project.leadId._id || project.leadId).toString() === userIdStr) ||
    req.user.role === 'PROJECT_MANAGER';
  let isTeamLead = req.user.role === 'TEAM_LEAD';
  if (!isTeamLead) {
    const leadTeamCount = await Team.countDocuments({
      workspaceId: project?.workspaceId,
      leadId: req.user._id,
      isArchived: false
    });
    if (leadTeamCount > 0) isTeamLead = true;
  }

  if (!isUploader && !isOrgAdmin && !isPM && !isTeamLead) {
    return res.status(403).json({
      success: false,
      error: 'Permission denied: Cannot delete this attachment'
    });
  }

  const originalName = attachment.originalName;

  // Attempt storage file removal
  try {
    const storage = getStorageProvider();
    if (storage && typeof storage.deleteFile === 'function') {
      await storage.deleteFile(attachment.key || attachment.url);
    }
  } catch (err) {
    console.error('Failed to delete file from storage:', err.message);
  }

  task.attachments.pull({ _id: attachmentId });
  task.updatedBy = req.user._id;
  await task.save();

  await Activity.create({
    taskId: task._id,
    projectId: task.projectId,
    userId: req.user._id,
    action: 'ATTACHMENT_REMOVED',
    oldValue: originalName
  });

  await CacheService.invalidateProject(task.projectId);

  emitToProject(task.projectId, 'task:updated', task);
  emitToTask(taskId, 'task:updated', task);

  res.json({
    success: true,
    message: 'Attachment deleted successfully',
    data: task.attachments
  });
});

// @desc    Upload file attachment to task (Local or S3, max 200 KB)
// @route   POST /api/v1/tasks/:taskId/attachments
// @access  Private (Org Admin, PM, Team Lead, MT/ST/Micro Assignees, Reporter)
const uploadAttachment = asyncHandler(async (req, res) => {
  const { taskId } = req.params;

  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }

  // Strict 200 KB limit validation per user requirements
  const MAX_ATTACHMENT_SIZE = 200 * 1024; // 200 KB
  if (req.file.size > MAX_ATTACHMENT_SIZE) {
    return res.status(400).json({
      success: false,
      error: `File size exceeds 200 KB limit (File size: ${(req.file.size / 1024).toFixed(1)} KB)`
    });
  }

  const task = await Task.findById(taskId);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }

  const project = await Project.findById(task.projectId);
  const userIdStr = req.user._id.toString();

  // Permitted uploaders check:
  // 1. Org Admin / Workspace Owner
  const isOrgAdmin = req.user.role === 'SUPER_ADMIN' || req.user.role === 'ORG_ADMIN';

  // 2. Project Manager
  const isPM = (project?.leadId && (project.leadId._id || project.leadId).toString() === userIdStr) ||
    req.user.role === 'PROJECT_MANAGER';

  // 3. Team Leader (by role or assigned lead of any team)
  let isTeamLead = req.user.role === 'TEAM_LEAD';
  if (!isTeamLead) {
    const leadTeamCount = await Team.countDocuments({
      workspaceId: project?.workspaceId,
      leadId: req.user._id,
      isArchived: false
    });
    if (leadTeamCount > 0) isTeamLead = true;
    if (Array.isArray(project?.teams)) {
      if (project.teams.some(pt => pt.leadId && (pt.leadId._id || pt.leadId).toString() === userIdStr)) {
        isTeamLead = true;
      }
    }
  }

  // 4. Assigned person of Main Task (MT)
  const isMTAssignee = task.assigneeId && (task.assigneeId._id || task.assigneeId).toString() === userIdStr;

  // 5. Assigned person of any Subtask (ST)
  const isSTAssignee = Array.isArray(task.subtasks) && task.subtasks.some(
    (st) => st.assigneeId && (st.assigneeId._id || st.assigneeId).toString() === userIdStr
  );

  // 6. Assigned person of any Microtask (Micro)
  const isMicroAssignee = Array.isArray(task.subtasks) && task.subtasks.some(
    (st) => Array.isArray(st.microtasks) && st.microtasks.some(
      (mt) => mt.assigneeId && (mt.assigneeId._id || mt.assigneeId).toString() === userIdStr
    )
  );

  // 7. Task Reporter
  const isReporter = task.reporterId && (task.reporterId._id || task.reporterId).toString() === userIdStr;

  if (!isOrgAdmin && !isPM && !isTeamLead && !isMTAssignee && !isSTAssignee && !isMicroAssignee && !isReporter) {
    return res.status(403).json({
      success: false,
      error: 'Permission denied: Only Org Admins, Project Managers, Team Leads, and assigned members of this task/subtask/microtask can upload attachments'
    });
  }

  const storage = getStorageProvider();
  const uploadResult = await storage.uploadFile(req.file, `tasks/${task._id}`);

  const attachment = {
    ...uploadResult,
    uploadedBy: req.user._id,
    uploadedAt: new Date()
  };

  task.attachments.push(attachment);
  task.updatedBy = req.user._id;
  await task.save();

  await Activity.create({
    taskId: task._id,
    projectId: task.projectId,
    userId: req.user._id,
    action: 'ATTACHMENT_ADDED',
    newValue: attachment.originalName
  });

  await CacheService.invalidateProject(task.projectId);

  emitToProject(task.projectId, 'task:updated', task);
  emitToTask(taskId, 'task:updated', task);

  res.status(201).json({
    success: true,
    message: 'Attachment uploaded successfully',
    data: attachment
  });
});

// @desc    Soft Delete Task to Recycle Bin (30-day retention)
// @route   DELETE /api/v1/tasks/:taskId
// @access  Private (Org Admin, PM, Team Lead, Task Reporter)
const deleteTask = asyncHandler(async (req, res) => {
  const { taskId } = req.params;

  const task = await Task.findById(taskId);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }

  // If task is locked, deletion is completely blocked!
  // "who locke that person only can remove that lock"
  if (task.isLocked) {
    let lockerName = 'a Team Lead/Admin';
    if (task.lockedBy) {
      try {
        const locker = await User.findById(task.lockedBy).select('name');
        if (locker?.name) lockerName = locker.name;
      } catch (_) {}
    }
    return res.status(403).json({
      success: false,
      error: `This task is locked by ${lockerName} and cannot be deleted. Only ${lockerName} can unlock it.`
    });
  }

  const project = await Project.findById(task.projectId);
  const perm = await checkTaskPermission(req.user, project, task, 'DELETE', req);

  const isReporter = task.reporterId && task.reporterId.toString() === req.user._id.toString();
  if (!perm.allowed && !isReporter) {
    return res.status(403).json({
      success: false,
      error: perm.message || 'Permission denied: Cannot delete this task'
    });
  }

  // Soft delete task
  task.isDeleted = true;
  task.deletedAt = new Date();
  task.deletedBy = req.user._id;
  task.purgeAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  task.deleteContext = { cascadeFrom: null };
  await task.save();

  // Audit activity
  await Activity.create({
    taskId: task._id,
    projectId: task.projectId,
    userId: req.user._id,
    action: 'DELETED',
    newValue: 'Task moved to Recycle Bin (30-day retention)'
  });

  // Invalidate Redis caches
  await CacheService.invalidateProject(task.projectId);
  await CacheService.invalidatePattern(`kanban:${task.projectId}*`);

  // Emit real-time events
  emitToProject(task.projectId, 'task:deleted', { taskId: task._id, projectId: task.projectId });
  emitGlobal('task:deleted', { taskId: task._id, projectId: task.projectId, workspaceId: task.workspaceId });
  emitGlobal('recycle-bin:changed', { action: 'DELETE', itemType: 'TASK', itemId: task._id, workspaceId: task.workspaceId });

  res.json({
    success: true,
    message: 'Task moved to Recycle Bin (retained for 30 days)',
    data: { _id: task._id }
  });
});

// @desc    Toggle Watch / Unwatch Issue
// @route   POST /api/v1/tasks/:taskId/watch
// @access  Private
const toggleWatchTask = asyncHandler(async (req, res) => {
  const { taskId } = req.params;

  const task = await Task.findById(taskId);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }

  const userIdStr = req.user._id.toString();
  const existingIdx = task.watchers.findIndex((w) => (w?._id || w).toString() === userIdStr);

  let isWatching = false;
  if (existingIdx > -1) {
    task.watchers.splice(existingIdx, 1);
    isWatching = false;
  } else {
    task.watchers.push(req.user._id);
    isWatching = true;
  }

  await task.save();

  emitToTask(taskId, 'task:updated', task);

  res.json({
    success: true,
    isWatching,
    watchersCount: task.watchers.length,
    watchers: task.watchers
  });
});

// @desc    Toggle Issue Security / Lock Restriction
// @route   POST /api/v1/tasks/:taskId/restrict
// @access  Private
const toggleRestrictTask = asyncHandler(async (req, res) => {
  const { taskId } = req.params;

  const task = await Task.findById(taskId);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }

  task.isRestricted = !task.isRestricted;
  task.updatedBy = req.user._id;
  await task.save();

  await Activity.create({
    taskId: task._id,
    projectId: task.projectId,
    userId: req.user._id,
    action: task.isRestricted ? 'RESTRICTED' : 'UNRESTRICTED',
    newValue: task.isRestricted ? 'Issue restricted to project members' : 'Issue restriction removed'
  });

  emitToTask(taskId, 'task:updated', task);

  res.json({
    success: true,
    isRestricted: task.isRestricted,
    message: task.isRestricted ? 'Issue restricted to project members' : 'Issue restriction removed'
  });
});

// @desc    Toggle Task / Subtask / Mini-task / Microtask Lock (When locked, cannot be deleted; only the person who locked it can unlock)
// @route   POST /api/v1/tasks/:taskId/lock
// @route   POST /api/v1/tasks/:taskId/subtasks/:subtaskId/lock
// @route   POST /api/v1/tasks/:taskId/subtasks/:subtaskId/minitasks/:minitaskId/lock
// @route   POST /api/v1/tasks/:taskId/subtasks/:subtaskId/minitasks/:minitaskId/microtasks/:microtaskId/lock
// @access  Private (Org Admin, PM, Team Lead)
const toggleLockTask = asyncHandler(async (req, res) => {
  const { taskId } = req.params;
  const subtaskId = req.params.subtaskId || req.body?.subtaskId || req.query?.subtaskId;
  const minitaskId = req.params.minitaskId || req.body?.minitaskId || req.query?.minitaskId;
  const microtaskId = req.params.microtaskId || req.body?.microtaskId || req.query?.microtaskId;

  const task = await Task.findById(taskId);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }

  const project = await Project.findById(task.projectId);
  const perm = await checkTaskPermission(req.user, project, task, 'UPDATE', req);

  const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
  const isOrgAdmin = req.user.role === 'ORG_ADMIN' || req.user.userLevel === 1;
  const isPM = (project?.leadId && (project.leadId._id || project.leadId).toString() === req.user._id.toString()) ||
    req.user.role === 'PROJECT_MANAGER' || req.user.userLevel === 2;
  const isTeamLead = perm.isTeamLead;

  // Only Org Admin, PM, or Team Lead can lock/unlock tasks
  if (!isSuperAdmin && !isOrgAdmin && !isPM && !isTeamLead) {
    return res.status(403).json({
      success: false,
      error: 'Permission denied: Only Team Leads, Project Managers, and Organization Admins can lock tasks'
    });
  }

  // Determine target item to lock/unlock:
  let target = task;
  let targetLevel = 'task'; // 'task' | 'subtask' | 'mini-task' | 'micro-task'
  let targetTitle = task.title || task.key;

  let subtask = null;
  let minitask = null;
  let microtask = null;

  if (subtaskId) {
    subtask = task.subtasks.id(subtaskId);
    if (!subtask) {
      return res.status(404).json({ success: false, error: 'Subtask not found' });
    }
    target = subtask;
    targetLevel = 'subtask';
    targetTitle = subtask.title || subtask.key;

    if (minitaskId) {
      minitask = subtask.minitasks ? subtask.minitasks.id(minitaskId) : null;
      if (!minitask) {
        return res.status(404).json({ success: false, error: 'Mini-task not found' });
      }
      target = minitask;
      targetLevel = 'mini-task';
      targetTitle = minitask.title || minitask.key;

      if (microtaskId) {
        microtask = minitask.microtasks ? minitask.microtasks.id(microtaskId) : null;
        if (!microtask) {
          return res.status(404).json({ success: false, error: 'Microtask not found' });
        }
        target = microtask;
        targetLevel = 'micro-task';
        targetTitle = microtask.title || microtask.key;
      }
    }
  }

  // If target is ALREADY locked -> check who is unlocking it!
  // USER REQUIREMENT: "who locke that person only can remove that lock"
  if (target.isLocked) {
    const isLocker = target.lockedBy && target.lockedBy.toString() === req.user._id.toString();
    if (!isLocker && !isSuperAdmin) {
      let lockerName = 'the user who locked it';
      if (target.lockedBy) {
        try {
          const locker = await User.findById(target.lockedBy).select('name');
          if (locker?.name) lockerName = locker.name;
        } catch (_) {}
      }

      return res.status(403).json({
        success: false,
        error: `Only ${lockerName} (who locked this ${targetLevel}) can remove the lock.`
      });
    }

    // Unlock target
    target.isLocked = false;
    target.lockedBy = null;
    target.lockedAt = null;
    task.updatedBy = req.user._id;
    await task.save();

    await Activity.create({
      taskId: task._id,
      projectId: task.projectId,
      userId: req.user._id,
      action: 'UNLOCKED',
      newValue: `${targetLevel.toUpperCase()} "${targetTitle}" unlocked by ${req.user.name || 'user'}. Deletion is now permitted.`
    });

    await CacheService.invalidateProject(task.projectId);
    await CacheService.invalidatePattern(`kanban:${task.projectId}*`);

    const populatedTask = await Task.findById(taskId)
      .populate('assigneeId', 'name email avatar jobTitle')
      .populate('reporterId', 'name email avatar jobTitle')
      .populate('lockedBy', 'name email avatar jobTitle')
      .populate('subtasks.assigneeId', 'name email avatar')
      .populate('subtasks.lockedBy', 'name email avatar jobTitle')
      .populate('subtasks.minitasks.assigneeId', 'name email avatar')
      .populate('subtasks.minitasks.lockedBy', 'name email avatar jobTitle')
      .populate('subtasks.minitasks.microtasks.assigneeId', 'name email avatar')
      .populate('subtasks.minitasks.microtasks.lockedBy', 'name email avatar jobTitle')
      .lean();

    emitToTask(taskId, 'task:updated', populatedTask);
    emitToProject(task.projectId, 'task:updated', populatedTask);

    return res.json({
      success: true,
      isLocked: false,
      targetLevel,
      message: `${targetLevel.charAt(0).toUpperCase() + targetLevel.slice(1)} unlocked successfully. Deletion is now permitted.`,
      data: populatedTask
    });
  }

  // Lock target
  target.isLocked = true;
  target.lockedBy = req.user._id;
  target.lockedAt = new Date();
  task.updatedBy = req.user._id;
  await task.save();

  await Activity.create({
    taskId: task._id,
    projectId: task.projectId,
    userId: req.user._id,
    action: 'LOCKED',
    newValue: `${targetLevel.toUpperCase()} "${targetTitle}" locked by ${req.user.name || 'user'}. Deletion is blocked.`
  });

  await CacheService.invalidateProject(task.projectId);
  await CacheService.invalidatePattern(`kanban:${task.projectId}*`);

  const populatedTask = await Task.findById(taskId)
    .populate('assigneeId', 'name email avatar jobTitle')
    .populate('reporterId', 'name email avatar jobTitle')
    .populate('lockedBy', 'name email avatar jobTitle')
    .populate('subtasks.assigneeId', 'name email avatar')
    .populate('subtasks.lockedBy', 'name email avatar jobTitle')
    .populate('subtasks.minitasks.assigneeId', 'name email avatar')
    .populate('subtasks.minitasks.lockedBy', 'name email avatar jobTitle')
    .populate('subtasks.minitasks.microtasks.assigneeId', 'name email avatar')
    .populate('subtasks.minitasks.microtasks.lockedBy', 'name email avatar jobTitle')
    .lean();

  emitToTask(taskId, 'task:updated', populatedTask);
  emitToProject(task.projectId, 'task:updated', populatedTask);

  res.json({
    success: true,
    isLocked: true,
    targetLevel,
    lockedBy: req.user,
    lockedAt: target.lockedAt,
    message: `${targetLevel.charAt(0).toUpperCase() + targetLevel.slice(1)} locked by ${req.user.name || 'you'}. Deletion is now blocked for all users until you unlock it.`,
    data: populatedTask
  });
});

module.exports = {
  getTasks,
  getTaskById,
  getTaskActivities,
  getKanbanTasks,
  createTask,
  reorderTask,
  updateTask,
  addSubtask,
  toggleSubtask,
  deleteSubtask,
  addMicrotask,
  updateMicrotask,
  deleteMicrotask,
  addMinitask,
  updateMinitask,
  deleteMinitask,
  logWork,
  linkTask,
  unlinkTask,
  getProjectDependencyGraph,
  uploadAttachment,
  deleteAttachment,
  toggleWatchTask,
  toggleRestrictTask,
  toggleLockTask,
  deleteTask
};