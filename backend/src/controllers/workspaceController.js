const Workspace = require('../models/Workspace');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Role = require('../models/Role');
const asyncHandler = require('../middlewares/asyncHandler');
const EmailService = require('../services/emailService');
const { USER_ROLES, SUBSCRIPTION_PLANS, PLAN_LIMITS } = require('../constants/roles');
const { ensureDefaultRoles } = require('./roleController');

// @desc    Get all workspaces the current user is a member of
// @route   GET /api/v1/workspaces
// @access  Private
const getMyWorkspaces = asyncHandler(async (req, res) => {
  const workspaces = await Workspace.find({
    'members.userId': req.user._id,
    isArchived: false
  })
    .populate('ownerId', 'name email avatar')
    .populate('members.userId', 'name email avatar role')
    .populate('subscriptionId')
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    data: workspaces
  });
});

// @desc    Create a new workspace
// @route   POST /api/v1/workspaces
// @access  Private
const createWorkspace = asyncHandler(async (req, res) => {
  const { name, description } = req.body;

  if (!name) {
    return res.status(400).json({ success: false, error: 'Please provide workspace name' });
  }

  const slug = `${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString().slice(-4)}`;

  const Role = require('../models/Role');
  const { getDefaultAdminPermissions, getDefaultMemberPermissions } = require('../constants/permissions');

  const workspace = await Workspace.create({
    name,
    slug,
    description: description || '',
    ownerId: req.user._id,
    members: [{ userId: req.user._id, role: USER_ROLES.ORG_ADMIN }]
  });

  // Seed default roles for this new organization (Levels 1 to 5)
  await ensureDefaultRoles(workspace._id, req.user._id);
  const adminRole = await Role.findOne({ workspaceId: workspace._id, key: 'ORG_ADMIN' });
  if (adminRole) {
    workspace.members[0].customRoleId = adminRole._id;
  }

  const subscription = await Subscription.create({
    workspaceId: workspace._id,
    planType: SUBSCRIPTION_PLANS.FREE,
    limits: PLAN_LIMITS.FREE
  });

  workspace.subscriptionId = subscription._id;
  await workspace.save();

  // Set user current workspace
  req.user.currentWorkspace = workspace._id;
  await req.user.save();

  res.status(201).json({
    success: true,
    message: 'Workspace created successfully',
    data: workspace
  });
});

// @desc    Invite a user to workspace
// @route   POST /api/v1/workspaces/:workspaceId/invite
// @access  Private (OrgAdmin or SuperAdmin)
const inviteMember = asyncHandler(async (req, res) => {
  const { workspaceId } = req.params;
  const { email, role = USER_ROLES.MEMBER } = req.body;

  const workspace = await Workspace.findById(workspaceId).populate('subscriptionId');
  if (!workspace) {
    return res.status(404).json({ success: false, error: 'Workspace not found' });
  }

  // Subscription check (Commented out for later use)
  /*
  if (workspace.subscriptionId && workspace.members.length >= workspace.subscriptionId.limits.maxMembers) {
    return res.status(403).json({
      success: false,
      error: `Workspace member limit reached.`
    });
  }
  */


  let user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    // Create invited stub user
    user = await User.create({
      name: email.split('@')[0],
      email: email.toLowerCase(),
      password: Math.random().toString(36).slice(-8), // Temp random password
      role: USER_ROLES.MEMBER,
      status: 'INVITED'
    });
  }

  const alreadyMember = workspace.members.some(
    (m) => m.userId.toString() === user._id.toString()
  );

  if (alreadyMember) {
    return res.status(400).json({ success: false, error: 'User is already a member of this workspace' });
  }

  workspace.members.push({ userId: user._id, role });
  await workspace.save();

  EmailService.sendWorkspaceInvite(user.email, workspace.name, req.user.name).catch(() => {});

  res.json({
    success: true,
    message: `Invitation sent to ${email}`,
    data: workspace
  });
});

// @desc    Switch active workspace
// @route   POST /api/v1/workspaces/switch/:workspaceId
// @access  Private
const switchWorkspace = asyncHandler(async (req, res) => {
  const { workspaceId } = req.params;
  const workspace = await Workspace.findOne({
    _id: workspaceId,
    'members.userId': req.user._id
  });

  if (!workspace) {
    return res.status(404).json({ success: false, error: 'Workspace not found or you are not a member' });
  }

  req.user.currentWorkspace = workspace._id;
  await req.user.save();

  res.json({
    success: true,
    message: `Switched active workspace to ${workspace.name}`,
    data: workspace
  });
});

// @desc    Get workspace-level dashboard metrics (all projects overview)
// @route   GET /api/v1/workspaces/:workspaceId/dashboard
// @access  Private
const getWorkspaceDashboard = asyncHandler(async (req, res) => {
  const { workspaceId } = req.params;
  const Project = require('../models/Project');
  const Task = require('../models/Task');
  const Activity = require('../models/Activity');
  const Sprint = require('../models/Sprint');
  const Team = require('../models/Team');
  const { getEffectiveUserLevel } = require('../middlewares/rbac');

  const workspace = await Workspace.findById(workspaceId)
    .populate('members.userId', 'name email avatar role jobTitle');

  if (!workspace) {
    return res.status(404).json({ success: false, error: 'Workspace not found' });
  }

  const isOrgAdmin = req.user.role === 'SUPER_ADMIN' || req.user.role === 'ORG_ADMIN';
  const isOwner = workspace.ownerId && workspace.ownerId.toString() === req.user._id.toString();
  const isWorkspaceAdmin = workspace.members && workspace.members.some(
    (m) => m.userId && (m.userId._id || m.userId).toString() === req.user._id.toString() && m.role === 'ORG_ADMIN'
  );

  let userLevel = 5;
  try {
    userLevel = await getEffectiveUserLevel(req.user, req);
  } catch (_) {}
  const isLevel1 = isOrgAdmin || isOwner || isWorkspaceAdmin || userLevel === 1;

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // 1. Projects in workspace (Only Level 1 Org Admins/Owners see all projects; Level 2 PMs and below see only their related projects)
  const projectFilter = { workspaceId, isArchived: false, isDeleted: { $ne: true } };
  if (!isLevel1) {
    projectFilter.$or = [
      { leadId: req.user._id },
      { 'members.userId': req.user._id },
      { 'teams.members': req.user._id },
      { 'teams.leadId': req.user._id },
      { createdBy: req.user._id }
    ];
  }

  const allProjects = await Project.find(projectFilter)
    .populate('leadId', 'name email avatar')
    .populate('teams.leadId', 'name email avatar')
    .lean();

  // 2. All tasks across workspace
  const projectIds = allProjects.map(p => p._id);
  const allTasks = await Task.find({
    projectId: { $in: projectIds },
    isArchived: false,
    isDeleted: { $ne: true }
  })
    .populate('assigneeId', 'name email avatar')
    .populate('sprintId', 'name status startDate endDate')
    .lean();

  // 3. Overall status breakdown
  const statusOverview = { BACKLOG: 0, TODO: 0, IN_PROGRESS: 0, IN_REVIEW: 0, DONE: 0 };
  allTasks.forEach(t => {
    if (statusOverview[t.status] !== undefined) statusOverview[t.status]++;
    else statusOverview.TODO++;
  });

  // 4. Priority breakdown
  const priorityBreakdown = { URGENT: 0, HIGH: 0, MEDIUM: 0, LOW: 0, LOWEST: 0 };
  allTasks.forEach(t => {
    if (priorityBreakdown[t.priority] !== undefined) priorityBreakdown[t.priority]++;
    else priorityBreakdown.MEDIUM++;
  });

  // 5. Issue type breakdown
  const typeBreakdown = { TASK: 0, BUG: 0, STORY: 0, EPIC: 0, SUBTASK: 0 };
  allTasks.forEach(t => {
    if (typeBreakdown[t.issueType] !== undefined) typeBreakdown[t.issueType]++;
    else typeBreakdown.TASK++;
  });

  // 6. Multi-tier KPI metrics (Main Tasks, Subtasks, Microtasks)
  const totalTasks = allTasks.length;
  const completedTasks = allTasks.filter(t => t.status === 'DONE').length;
  const inProgressTasks = allTasks.filter(t => t.status === 'IN_PROGRESS').length;
  const overdueTasks = allTasks.filter(t =>
    t.dueDate && t.status !== 'DONE' && new Date(t.dueDate) < now
  ).length;
  const createdLast7Days = allTasks.filter(t => new Date(t.createdAt) >= sevenDaysAgo).length;
  const completedLast7Days = allTasks.filter(t =>
    t.status === 'DONE' && new Date(t.updatedAt) >= sevenDaysAgo
  ).length;

  let totalSubtasks = 0;
  let completedSubtasks = 0;
  let inProgressSubtasks = 0;
  let overdueSubtasks = 0;

  let totalMicrotasks = 0;
  let completedMicrotasks = 0;
  let inProgressMicrotasks = 0;
  let overdueMicrotasks = 0;

  let totalMinitasks = 0;
  let completedMinitasks = 0;
  let inProgressMinitasks = 0;
  let overdueMinitasks = 0;

  const combinedStatusOverview = { ...statusOverview };

  allTasks.forEach(t => {
    if (Array.isArray(t.subtasks)) {
      totalSubtasks += t.subtasks.length;
      t.subtasks.forEach(st => {
        const isDone = st.isCompleted || st.status === 'DONE';
        const isInProg = !isDone && (st.status === 'IN_PROGRESS' || st.status === 'IN_REVIEW');
        if (isDone) completedSubtasks++;
        else if (isInProg) inProgressSubtasks++;

        if (st.dueDate && !isDone && new Date(st.dueDate) < now) overdueSubtasks++;

        if (isDone) combinedStatusOverview.DONE = (combinedStatusOverview.DONE || 0) + 1;
        else if (isInProg) combinedStatusOverview.IN_PROGRESS = (combinedStatusOverview.IN_PROGRESS || 0) + 1;
        else combinedStatusOverview.TODO = (combinedStatusOverview.TODO || 0) + 1;

        // Check minitasks (Subtask -> Minitasks -> Microtasks)
        if (Array.isArray(st.minitasks)) {
          totalMinitasks += st.minitasks.length;
          st.minitasks.forEach(min => {
            const isMinDone = min.isCompleted || min.status === 'DONE';
            const isMinInProg = !isMinDone && (min.status === 'IN_PROGRESS' || min.status === 'IN_REVIEW');
            if (isMinDone) completedMinitasks++;
            else if (isMinInProg) inProgressMinitasks++;

            if (min.dueDate && !isMinDone && new Date(min.dueDate) < now) overdueMinitasks++;

            if (isMinDone) combinedStatusOverview.DONE = (combinedStatusOverview.DONE || 0) + 1;
            else if (isMinInProg) combinedStatusOverview.IN_PROGRESS = (combinedStatusOverview.IN_PROGRESS || 0) + 1;
            else combinedStatusOverview.TODO = (combinedStatusOverview.TODO || 0) + 1;

            if (Array.isArray(min.microtasks)) {
              totalMicrotasks += min.microtasks.length;
              min.microtasks.forEach(mic => {
                const isMicDone = mic.isCompleted || mic.status === 'DONE';
                const isMicInProg = !isMicDone && (mic.status === 'IN_PROGRESS' || mic.status === 'IN_REVIEW');
                if (isMicDone) completedMicrotasks++;
                else if (isMicInProg) inProgressMicrotasks++;

                if (mic.dueDate && !isMicDone && new Date(mic.dueDate) < now) overdueMicrotasks++;

                if (isMicDone) combinedStatusOverview.DONE = (combinedStatusOverview.DONE || 0) + 1;
                else if (isMicInProg) combinedStatusOverview.IN_PROGRESS = (combinedStatusOverview.IN_PROGRESS || 0) + 1;
                else combinedStatusOverview.TODO = (combinedStatusOverview.TODO || 0) + 1;
              });
            }
          });
        }

        // Also check if subtask has legacy direct microtasks
        if (Array.isArray(st.microtasks)) {
          totalMicrotasks += st.microtasks.length;
          st.microtasks.forEach(mic => {
            const isMicDone = mic.isCompleted || mic.status === 'DONE';
            const isMicInProg = !isMicDone && (mic.status === 'IN_PROGRESS' || mic.status === 'IN_REVIEW');
            if (isMicDone) completedMicrotasks++;
            else if (isMicInProg) inProgressMicrotasks++;

            if (mic.dueDate && !isMicDone && new Date(mic.dueDate) < now) overdueMicrotasks++;

            if (isMicDone) combinedStatusOverview.DONE = (combinedStatusOverview.DONE || 0) + 1;
            else if (isMicInProg) combinedStatusOverview.IN_PROGRESS = (combinedStatusOverview.IN_PROGRESS || 0) + 1;
            else combinedStatusOverview.TODO = (combinedStatusOverview.TODO || 0) + 1;
          });
        }
      });
    }
  });

  const totalAllItems = totalTasks + totalSubtasks + totalMicrotasks + totalMinitasks;
  const totalCompletedAll = completedTasks + completedSubtasks + completedMicrotasks + completedMinitasks;
  const totalInProgressAll = inProgressTasks + inProgressSubtasks + inProgressMicrotasks + inProgressMinitasks;
  const totalOverdueAll = overdueTasks + overdueSubtasks + overdueMicrotasks + overdueMinitasks;

  // 11. All sprints across projects
  const allSprints = await Sprint.find({
    projectId: { $in: projectIds }
  })
    .populate('projectId', 'name key color')
    .lean();

  // 11b. Dynamic Workspace Teams & Capacity
  const allWorkspaceTeams = await Team.find({ workspaceId, isArchived: false })
    .populate('leadId', 'name email avatar')
    .populate('members', 'name email avatar')
    .lean();

  const teamsSummary = allWorkspaceTeams.map((tm) => {
    const tmNameLower = (tm.name || '').toLowerCase();
    const tmKeyLower = (tm.key || '').toLowerCase();
    const memberIds = (tm.members || []).map((m) => (m._id || m).toString());

    // Helper to test if an item belongs to this team
    const itemMatchesTeam = (item, parentTeam) => {
      const itemTeam = (item.team || parentTeam || '').trim().toLowerCase();
      if (itemTeam) {
        return itemTeam === tmNameLower || (tmKeyLower && itemTeam === tmKeyLower);
      }
      if (tmKeyLower && item.key) {
        const parts = item.key.toLowerCase().split('-');
        if (parts.includes(tmKeyLower)) return true;
      }
      if (item.assigneeId) {
        const aId = (item.assigneeId._id || item.assigneeId).toString();
        if (memberIds.includes(aId)) return true;
      }
      return false;
    };

    let total = 0;
    let done = 0;
    let inProgress = 0;
    let overdue = 0;

    allTasks.forEach(t => {
      if (itemMatchesTeam(t, '')) {
        total++;
        if (t.status === 'DONE') done++;
        else if (t.status === 'IN_PROGRESS' || t.status === 'IN_REVIEW') inProgress++;
        if (t.dueDate && t.status !== 'DONE' && new Date(t.dueDate) < now) overdue++;
      }

      if (Array.isArray(t.subtasks)) {
        t.subtasks.forEach(st => {
          if (itemMatchesTeam(st, t.team)) {
            total++;
            const isStDone = st.isCompleted || st.status === 'DONE';
            if (isStDone) done++;
            else if (st.status === 'IN_PROGRESS' || st.status === 'IN_REVIEW') inProgress++;
            if (st.dueDate && !isStDone && new Date(st.dueDate) < now) overdue++;
          }

          if (Array.isArray(st.minitasks)) {
            st.minitasks.forEach(min => {
              if (itemMatchesTeam(min, st.team || t.team)) {
                total++;
                const isMinDone = min.isCompleted || min.status === 'DONE';
                if (isMinDone) done++;
                else if (min.status === 'IN_PROGRESS' || min.status === 'IN_REVIEW') inProgress++;
                if (min.dueDate && !isMinDone && new Date(min.dueDate) < now) overdue++;
              }

              if (Array.isArray(min.microtasks)) {
                min.microtasks.forEach(mic => {
                  if (itemMatchesTeam(mic, min.team || st.team || t.team)) {
                    total++;
                    const isMicDone = mic.isCompleted || mic.status === 'DONE';
                    if (isMicDone) done++;
                    else if (mic.status === 'IN_PROGRESS' || mic.status === 'IN_REVIEW') inProgress++;
                    if (mic.dueDate && !isMicDone && new Date(mic.dueDate) < now) overdue++;
                  }
                });
              }
            });
          }

          if (Array.isArray(st.microtasks)) {
            st.microtasks.forEach(mic => {
              if (itemMatchesTeam(mic, st.team || t.team)) {
                total++;
                const isMicDone = mic.isCompleted || mic.status === 'DONE';
                if (isMicDone) done++;
                else if (mic.status === 'IN_PROGRESS' || mic.status === 'IN_REVIEW') inProgress++;
                if (mic.dueDate && !isMicDone && new Date(mic.dueDate) < now) overdue++;
              }
            });
          }
        });
      }
    });

    return {
      _id: tm._id,
      name: tm.name,
      key: tm.key || '',
      color: tm.color || '#3B82F6',
      icon: tm.icon || '👥',
      department: tm.department || 'Engineering',
      lead: tm.leadId,
      membersCount: (tm.members || []).length,
      totalTasks: total,
      completedTasks: done,
      inProgressTasks: inProgress,
      overdueTasks: overdue,
      completionPercent: total > 0 ? Math.round((done / total) * 100) : 0
    };
  });

  // 7. Per-project comprehensive health & status matrix
  const projectHealth = allProjects.map(proj => {
    const projTasks = allTasks.filter(t => t.projectId.toString() === proj._id.toString());
    const stages = proj.workflowStages || [];
    const isDone = (status) => {
      if (stages && stages.length >= 2) {
        const lastId = stages[stages.length - 1]?.id || stages[stages.length - 1];
        return status === lastId || status === 'DONE';
      }
      return status === 'DONE';
    };
    const isTodo = (status) => {
      if (stages && stages.length >= 2) {
        const firstId = stages[0]?.id || stages[0];
        return !isDone(status) && (status === firstId || status === 'TODO' || status === 'BACKLOG');
      }
      return status === 'TODO' || status === 'BACKLOG';
    };
    const isWIP = (status) => !isDone(status) && !isTodo(status);

    let mainTasksCount = projTasks.length;
    let completedMainTasks = 0;
    let inProgressMainTasks = 0;
    let todoMainTasks = 0;
    let overdueMainTasks = 0;

    let subtasksCount = 0;
    let completedSubtasks = 0;
    let inProgressSubtasks = 0;
    let todoSubtasks = 0;
    let overdueSubtasks = 0;

    let minitasksCount = 0;
    let completedMinitasks = 0;
    let inProgressMinitasks = 0;
    let todoMinitasks = 0;
    let overdueMinitasks = 0;

    let microtasksCount = 0;
    let completedMicrotasks = 0;
    let inProgressMicrotasks = 0;
    let todoMicrotasks = 0;
    let overdueMicrotasks = 0;

    const evalStatus = (status, isCompleted, dueDate) => {
      const done = isCompleted || isDone(status);
      const inProg = !done && (isWIP(status) || status === 'IN_PROGRESS' || status === 'IN_REVIEW');
      const todo = !done && !inProg;
      const overdue = dueDate && !done && new Date(dueDate) < now;
      return { done, inProg, todo, overdue };
    };

    projTasks.forEach(t => {
      const s = evalStatus(t.status, t.status === 'DONE', t.dueDate);
      if (s.done) completedMainTasks++;
      else if (s.inProg) inProgressMainTasks++;
      else todoMainTasks++;
      if (s.overdue) overdueMainTasks++;

      if (Array.isArray(t.subtasks)) {
        subtasksCount += t.subtasks.length;
        t.subtasks.forEach(st => {
          const ss = evalStatus(st.status, st.isCompleted, st.dueDate);
          if (ss.done) completedSubtasks++;
          else if (ss.inProg) inProgressSubtasks++;
          else todoSubtasks++;
          if (ss.overdue) overdueSubtasks++;

          if (Array.isArray(st.minitasks)) {
            minitasksCount += st.minitasks.length;
            st.minitasks.forEach(min => {
              const sm = evalStatus(min.status, min.isCompleted, min.dueDate);
              if (sm.done) completedMinitasks++;
              else if (sm.inProg) inProgressMinitasks++;
              else todoMinitasks++;
              if (sm.overdue) overdueMinitasks++;

              if (Array.isArray(min.microtasks)) {
                microtasksCount += min.microtasks.length;
                min.microtasks.forEach(mic => {
                  const sc = evalStatus(mic.status, mic.isCompleted, mic.dueDate);
                  if (sc.done) completedMicrotasks++;
                  else if (sc.inProg) inProgressMicrotasks++;
                  else todoMicrotasks++;
                  if (sc.overdue) overdueMicrotasks++;
                });
              }
            });
          }

          if (Array.isArray(st.microtasks)) {
            microtasksCount += st.microtasks.length;
            st.microtasks.forEach(mic => {
              const sc = evalStatus(mic.status, mic.isCompleted, mic.dueDate);
              if (sc.done) completedMicrotasks++;
              else if (sc.inProg) inProgressMicrotasks++;
              else todoMicrotasks++;
              if (sc.overdue) overdueMicrotasks++;
            });
          }
        });
      }
    });

    const totalDeliverables = mainTasksCount + subtasksCount + minitasksCount + microtasksCount;
    const completedDeliverables = completedMainTasks + completedSubtasks + completedMinitasks + completedMicrotasks;
    const inProgressDeliverables = inProgressMainTasks + inProgressSubtasks + inProgressMinitasks + inProgressMicrotasks;
    const todoDeliverables = todoMainTasks + todoSubtasks + todoMinitasks + todoMicrotasks;
    const overdueDeliverables = overdueMainTasks + overdueSubtasks + overdueMinitasks + overdueMicrotasks;
    const completionPercent = totalDeliverables > 0 ? Math.round((completedDeliverables / totalDeliverables) * 100) : 0;

    // Sprints for this project
    const projSprints = allSprints.filter(s => s.projectId?._id?.toString() === proj._id.toString() || s.projectId?.toString() === proj._id.toString());
    const completedSprintsCount = projSprints.filter(s => s.status === 'COMPLETED').length;
    const activeSprintDoc = projSprints.find(s => s.status === 'ACTIVE') || null;

    let activeSprint = null;
    if (activeSprintDoc) {
      const sprintTasks = projTasks.filter(t =>
        (t.sprintId && t.sprintId.toString() === activeSprintDoc._id.toString()) ||
        t.sprint === activeSprintDoc.name
      );

      let spTotal = 0;
      let spDone = 0;
      let spInProgress = 0;

      sprintTasks.forEach(t => {
        spTotal++;
        if (t.status === 'DONE') spDone++;
        else if (t.status === 'IN_PROGRESS' || t.status === 'IN_REVIEW') spInProgress++;

        if (Array.isArray(t.subtasks)) {
          t.subtasks.forEach(st => {
            spTotal++;
            const isStDone = st.isCompleted || st.status === 'DONE';
            if (isStDone) spDone++;
            else if (st.status === 'IN_PROGRESS' || st.status === 'IN_REVIEW') spInProgress++;

            if (Array.isArray(st.minitasks)) {
              st.minitasks.forEach(min => {
                spTotal++;
                const isMinDone = min.isCompleted || min.status === 'DONE';
                if (isMinDone) spDone++;
                else if (min.status === 'IN_PROGRESS' || min.status === 'IN_REVIEW') spInProgress++;

                if (Array.isArray(min.microtasks)) {
                  min.microtasks.forEach(mic => {
                    spTotal++;
                    const isMicDone = mic.isCompleted || mic.status === 'DONE';
                    if (isMicDone) spDone++;
                    else if (mic.status === 'IN_PROGRESS' || mic.status === 'IN_REVIEW') spInProgress++;
                  });
                }
              });
            }

            if (Array.isArray(st.microtasks)) {
              st.microtasks.forEach(mic => {
                spTotal++;
                const isMicDone = mic.isCompleted || mic.status === 'DONE';
                if (isMicDone) spDone++;
                else if (mic.status === 'IN_PROGRESS' || mic.status === 'IN_REVIEW') spInProgress++;
              });
            }
          });
        }
      });

      const daysRemaining = activeSprintDoc.endDate
        ? Math.max(0, Math.ceil((new Date(activeSprintDoc.endDate) - now) / (1000 * 60 * 60 * 24)))
        : 0;

      activeSprint = {
        _id: activeSprintDoc._id,
        name: activeSprintDoc.name,
        goal: activeSprintDoc.goal || '',
        startDate: activeSprintDoc.startDate,
        endDate: activeSprintDoc.endDate,
        daysRemaining,
        mainTasksCount: sprintTasks.length,
        completedMainTasks: sprintTasks.filter(t => t.status === 'DONE').length,
        totalTasks: spTotal,
        completedTasks: spDone,
        inProgressTasks: spInProgress,
        completionPercent: spTotal > 0 ? Math.round((spDone / spTotal) * 100) : 0
      };
    }

    // Workflow stages breakdown across all project deliverables
    const defaultStages = [
      { id: 'BACKLOG', label: 'Idea', color: 'bg-slate-500' },
      { id: 'TODO', label: 'To Do', color: 'bg-blue-500' },
      { id: 'IN_PROGRESS', label: 'In Progress', color: 'bg-amber-500' },
      { id: 'IN_REVIEW', label: 'Testing', color: 'bg-purple-500' },
      { id: 'DONE', label: 'Done', color: 'bg-emerald-500' }
    ];
    const projectStages = (proj.workflowStages && proj.workflowStages.length > 0)
      ? proj.workflowStages
      : defaultStages;

    const stagesBreakdown = projectStages.map(stg => {
      let count = 0;
      projTasks.forEach(t => {
        if (t.status === stg.id) count++;
        if (Array.isArray(t.subtasks)) {
          t.subtasks.forEach(st => {
            const stStatus = st.isCompleted ? 'DONE' : (st.status || 'TODO');
            if (stStatus === stg.id) count++;
            if (Array.isArray(st.minitasks)) {
              st.minitasks.forEach(min => {
                const minStatus = min.isCompleted ? 'DONE' : (min.status || 'TODO');
                if (minStatus === stg.id) count++;
                if (Array.isArray(min.microtasks)) {
                  min.microtasks.forEach(mic => {
                    const micStatus = mic.isCompleted ? 'DONE' : (mic.status || 'TODO');
                    if (micStatus === stg.id) count++;
                  });
                }
              });
            }
            if (Array.isArray(st.microtasks)) {
              st.microtasks.forEach(mic => {
                const micStatus = mic.isCompleted ? 'DONE' : (mic.status || 'TODO');
                if (micStatus === stg.id) count++;
              });
            }
          });
        }
      });
      const percent = totalDeliverables > 0 ? Math.round((count / totalDeliverables) * 100) : 0;
      return {
        id: stg.id,
        label: stg.label,
        color: stg.color,
        count,
        percent
      };
    });

    // Teams progress breakdown
    const rawTeams = proj.teams || [];
    const projectTeamNames = new Set(rawTeams.map(t => (t.name || '').toLowerCase()));
    
    // Also include any workspace dynamic team that has tasks or members in this project
    const relevantWorkspaceTeams = allWorkspaceTeams.filter(wt => {
      const wtNameLower = (wt.name || '').toLowerCase();
      const wtKeyLower = (wt.key || '').toLowerCase();
      const memberIds = (wt.members || []).map((m) => (m._id || m).toString());
      return !projectTeamNames.has(wtNameLower) && projTasks.some(t => {
        const tTeam = (t.team || '').trim().toLowerCase();
        if (tTeam) {
          return tTeam === wtNameLower || (wtKeyLower && tTeam === wtKeyLower);
        }
        return t.assigneeId && memberIds.includes((t.assigneeId._id || t.assigneeId).toString());
      });
    });

    const combinedTeams = [
      ...rawTeams,
      ...relevantWorkspaceTeams.map(wt => ({
        _id: wt._id,
        name: wt.name,
        key: wt.key,
        color: wt.color || '#3B82F6',
        description: wt.description || '',
        members: wt.members || []
      }))
    ];

    const teamsProgress = combinedTeams.map(tm => {
      const tmNameLower = (tm.name || '').toLowerCase().trim();
      const tmKeyLower = (tm.key || '').toLowerCase().trim();
      const memberIds = (tm.members || []).map((m) => (m._id || m).toString());

      const itemMatchesThisTeam = (item, parentTeam) => {
        const itemTeam = (item.team || parentTeam || '').trim().toLowerCase();
        if (itemTeam) {
          return itemTeam === tmNameLower || (tmKeyLower && itemTeam === tmKeyLower);
        }
        if (tmKeyLower && item.key) {
          const parts = item.key.toLowerCase().split('-');
          if (parts.includes(tmKeyLower)) return true;
        }
        if (item.assigneeId) {
          const aId = (item.assigneeId._id || item.assigneeId).toString();
          if (memberIds.includes(aId)) return true;
        }
        return false;
      };

      let tmTotal = 0;
      let tmDone = 0;
      let tmInProgress = 0;
      let tmOverdue = 0;

      projTasks.forEach(t => {
        if (itemMatchesThisTeam(t, '')) {
          tmTotal++;
          if (t.status === 'DONE') tmDone++;
          else if (t.status === 'IN_PROGRESS' || t.status === 'IN_REVIEW') tmInProgress++;
          if (t.dueDate && t.status !== 'DONE' && new Date(t.dueDate) < now) tmOverdue++;
        }

        if (Array.isArray(t.subtasks)) {
          t.subtasks.forEach(st => {
            if (itemMatchesThisTeam(st, t.team)) {
              tmTotal++;
              const isDone = st.isCompleted || st.status === 'DONE';
              if (isDone) tmDone++;
              else if (st.status === 'IN_PROGRESS' || st.status === 'IN_REVIEW') tmInProgress++;
              if (st.dueDate && !isDone && new Date(st.dueDate) < now) tmOverdue++;
            }

            if (Array.isArray(st.minitasks)) {
              st.minitasks.forEach(min => {
                if (itemMatchesThisTeam(min, st.team || t.team)) {
                  tmTotal++;
                  const isDone = min.isCompleted || min.status === 'DONE';
                  if (isDone) tmDone++;
                  else if (min.status === 'IN_PROGRESS' || min.status === 'IN_REVIEW') tmInProgress++;
                  if (min.dueDate && !isDone && new Date(min.dueDate) < now) tmOverdue++;
                }

                if (Array.isArray(min.microtasks)) {
                  min.microtasks.forEach(mic => {
                    if (itemMatchesThisTeam(mic, min.team || st.team || t.team)) {
                      tmTotal++;
                      const isDone = mic.isCompleted || mic.status === 'DONE';
                      if (isDone) tmDone++;
                      else if (mic.status === 'IN_PROGRESS' || mic.status === 'IN_REVIEW') tmInProgress++;
                      if (mic.dueDate && !isDone && new Date(mic.dueDate) < now) tmOverdue++;
                    }
                  });
                }
              });
            }

            if (Array.isArray(st.microtasks)) {
              st.microtasks.forEach(mic => {
                if (itemMatchesThisTeam(mic, st.team || t.team)) {
                  tmTotal++;
                  const isDone = mic.isCompleted || mic.status === 'DONE';
                  if (isDone) tmDone++;
                  else if (mic.status === 'IN_PROGRESS' || mic.status === 'IN_REVIEW') tmInProgress++;
                  if (mic.dueDate && !isDone && new Date(mic.dueDate) < now) tmOverdue++;
                }
              });
            }
          });
        }
      });

      return {
        _id: tm._id,
        name: tm.name,
        key: tm.key,
        color: tm.color || '#3B82F6',
        description: tm.description || '',
        membersCount: (tm.members || []).length,
        totalTasks: tmTotal,
        completedTasks: tmDone,
        inProgressTasks: tmInProgress,
        overdueTasks: tmOverdue,
        completionPercent: tmTotal > 0 ? Math.round((tmDone / tmTotal) * 100) : 0
      };
    });

    // Health calculation
    const healthStatus = overdueDeliverables > 1 ? 'BEHIND' : overdueDeliverables > 0 ? 'AT_RISK' : 'ON_TRACK';

    return {
      _id: proj._id,
      name: proj.name,
      key: proj.key,
      color: proj.color,
      category: proj.category || 'Engineering',
      description: proj.description || '',
      lead: proj.leadId,

      // Multi-tier hierarchy breakdown
      mainTasksCount,
      completedMainTasks,
      inProgressMainTasks,
      todoMainTasks,
      overdueMainTasks,

      subtasksCount,
      completedSubtasks,
      inProgressSubtasks,
      todoSubtasks,
      overdueSubtasks,

      minitasksCount,
      completedMinitasks,
      inProgressMinitasks,
      todoMinitasks,
      overdueMinitasks,

      microtasksCount,
      completedMicrotasks,
      inProgressMicrotasks,
      todoMicrotasks,
      overdueMicrotasks,

      totalDeliverables,
      completedDeliverables,
      inProgressDeliverables,
      todoDeliverables,
      overdueDeliverables,

      // Seamless backward-compatible aliases
      totalTasks: totalDeliverables,
      completedTasks: completedDeliverables,
      inProgressTasks: inProgressDeliverables,
      inReviewTasks: 0,
      todoTasks: todoDeliverables,
      backlogTasks: 0,
      overdueTasks: overdueDeliverables,
      completionPercent,
      health: healthStatus,
      totalSprints: projSprints.length,
      completedSprints: completedSprintsCount,
      activeSprint,
      stages: stagesBreakdown,
      teams: teamsProgress
    };
  });

  // 8. Member workload (top 10 by assigned open tasks)
  const memberWorkloadMap = {};
  allTasks
    .filter(t => t.status !== 'DONE' && t.assigneeId)
    .forEach(t => {
      const assigneeId = (t.assigneeId._id || t.assigneeId).toString();
      const projId = (t.projectId?._id || t.projectId).toString();
      if (!memberWorkloadMap[assigneeId]) {
        memberWorkloadMap[assigneeId] = {
          _id: assigneeId,
          name: t.assigneeId.name || 'Unknown',
          email: t.assigneeId.email || '',
          avatar: t.assigneeId.avatar || '',
          openTasks: 0,
          inProgress: 0,
          highPriority: 0,
          projectIds: []
        };
      }
      memberWorkloadMap[assigneeId].openTasks++;
      if (t.status === 'IN_PROGRESS') memberWorkloadMap[assigneeId].inProgress++;
      if (t.priority === 'HIGH' || t.priority === 'URGENT') memberWorkloadMap[assigneeId].highPriority++;
      if (!memberWorkloadMap[assigneeId].projectIds.includes(projId)) {
        memberWorkloadMap[assigneeId].projectIds.push(projId);
      }
    });

  const memberWorkload = Object.values(memberWorkloadMap)
    .sort((a, b) => b.openTasks - a.openTasks)
    .slice(0, 10);

  // 9. Task creation trend (last 30 days, grouped by day)
  const creationTrend = [];
  for (let i = 29; i >= 0; i--) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);
    const count = allTasks.filter(t => {
      const d = new Date(t.createdAt);
      return d >= dayStart && d <= dayEnd;
    }).length;
    creationTrend.push({
      date: dayStart.toISOString().split('T')[0],
      day: dayStart.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      count
    });
  }

  // 10. Recent activities across workspace
  const recentActivities = await Activity.find({ projectId: { $in: projectIds } })
    .sort({ createdAt: -1 })
    .limit(15)
    .populate('userId', 'name email avatar')
    .populate('taskId', 'key title status issueType')
    .populate('projectId', 'name key color')
    .lean();

  // 11. Active sprints across projects
  const activeSprints = await Sprint.find({
    projectId: { $in: projectIds },
    status: 'ACTIVE'
  })
    .populate('projectId', 'name key color')
    .lean();

  const sprintSummaries = activeSprints.map(sprint => {
    const sprintTasks = allTasks.filter(t =>
      t.sprintId && t.sprintId.toString() === sprint._id.toString()
    );
    const total = sprintTasks.length;
    const done = sprintTasks.filter(t => t.status === 'DONE').length;
    const daysRemaining = sprint.endDate
      ? Math.max(0, Math.ceil((new Date(sprint.endDate) - now) / (1000 * 60 * 60 * 24)))
      : 0;

    return {
      _id: sprint._id,
      name: sprint.name,
      project: sprint.projectId,
      totalTasks: total,
      completedTasks: done,
      completionPercent: total > 0 ? Math.round((done / total) * 100) : 0,
      daysRemaining,
      startDate: sprint.startDate,
      endDate: sprint.endDate
    };
  });

  // 12. Personal Dashboard data for req.user
  const currentUserId = req.user._id.toString();
  const myTasks = allTasks.filter(t => 
    t.assigneeId && (t.assigneeId._id || t.assigneeId).toString() === currentUserId
  );
  const myOpenTasks = myTasks.filter(t => t.status !== 'DONE');
  const myCompletedTasks = myTasks.filter(t => t.status === 'DONE');
  const myInProgressTasks = myTasks.filter(t => t.status === 'IN_PROGRESS');
  const myOverdueTasks = myTasks.filter(t =>
    t.dueDate && t.status !== 'DONE' && new Date(t.dueDate) < now
  );
  const myDueSoonTasks = myTasks.filter(t => {
    if (!t.dueDate || t.status === 'DONE') return false;
    const due = new Date(t.dueDate);
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return due >= now && due <= next7Days;
  });

  // Attach project, sprint, team & lead info to tasks
  const sprintMap = {};
  allSprints.forEach(s => {
    sprintMap[s._id.toString()] = {
      _id: s._id,
      name: s.name,
      status: s.status,
      startDate: s.startDate,
      endDate: s.endDate
    };
  });

  const teamLeadMap = {};
  allWorkspaceTeams.forEach(tm => {
    if (tm.name && tm.leadId) {
      teamLeadMap[tm.name.toLowerCase().trim()] = {
        _id: tm.leadId._id,
        name: tm.leadId.name,
        email: tm.leadId.email,
        avatar: tm.leadId.avatar
      };
    }
  });

  const projectMap = {};
  allProjects.forEach(p => {
    projectMap[p._id.toString()] = {
      _id: p._id,
      name: p.name,
      key: p.key,
      color: p.color,
      lead: p.leadId ? { _id: p.leadId._id, name: p.leadId.name, email: p.leadId.email, avatar: p.leadId.avatar } : null,
      teams: p.teams || []
    };
  });

  const enrichedWorkspaceTasks = allTasks.map(t => {
    const proj = projectMap[t.projectId?.toString()] || null;
    const projectLead = proj?.lead || null;

    let teamName = (t.team || '').trim();
    let teamLead = null;
    if (teamName) {
      teamLead = teamLeadMap[teamName.toLowerCase()] || null;
      if (!teamLead && proj && Array.isArray(proj.teams)) {
        const ptMatch = proj.teams.find(pt => (pt.name || '').toLowerCase().trim() === teamName.toLowerCase());
        if (ptMatch && ptMatch.leadId) {
          teamLead = ptMatch.leadId.name ? ptMatch.leadId : ptMatch.leadId;
        }
      }
    }

    const sprintDetail = (t.sprintId && t.sprintId.name) ? t.sprintId : (sprintMap[t.sprintId?.toString()] || null);
    const sprintName = sprintDetail?.name || t.sprint || 'Sprint 1';

    return {
      ...t,
      project: proj,
      projectLead,
      team: teamName || 'General',
      teamLead,
      sprint: sprintName,
      sprintDetail
    };
  });

  const myEnrichedTasks = myTasks.map(t => ({
    ...t,
    project: projectMap[t.projectId?.toString()] || null
  }));

  const myRecentActivities = recentActivities.filter(a =>
    a.userId && (a.userId._id || a.userId).toString() === currentUserId
  );

  res.json({
    success: true,
    data: {
      overview: {
        totalProjects: allProjects.length,
        totalMembers: workspace.members?.length || 0,
        totalTasks, // Main tasks
        completedTasks,
        inProgressTasks,
        overdueTasks,
        createdLast7Days,
        completedLast7Days,
        completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,

        // Combined multi-tier metrics
        totalWorkItems: totalAllItems,
        totalCompletedItems: totalCompletedAll,
        totalInProgressItems: totalInProgressAll,
        totalOverdueItems: totalOverdueAll,
        combinedCompletionRate: totalAllItems > 0 ? Math.round((totalCompletedAll / totalAllItems) * 100) : 0,

        mainTasks: {
          total: totalTasks,
          completed: completedTasks,
          inProgress: inProgressTasks,
          overdue: overdueTasks,
          completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
        },
        subtasks: {
          total: totalSubtasks,
          completed: completedSubtasks,
          inProgress: inProgressSubtasks,
          overdue: overdueSubtasks,
          completionRate: totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0
        },
        microtasks: {
          total: totalMicrotasks,
          completed: completedMicrotasks,
          inProgress: inProgressMicrotasks,
          overdue: overdueMicrotasks,
          completionRate: totalMicrotasks > 0 ? Math.round((completedMicrotasks / totalMicrotasks) * 100) : 0
        },
        minitasks: {
          total: totalMinitasks,
          completed: completedMinitasks,
          inProgress: inProgressMinitasks,
          overdue: overdueMinitasks,
          completionRate: totalMinitasks > 0 ? Math.round((completedMinitasks / totalMinitasks) * 100) : 0
        }
      },
      combinedStatusOverview,
      statusOverview,
      priorityBreakdown,
      typeBreakdown,
      projectHealth,
      teams: teamsSummary,
      memberWorkload,
      creationTrend,
      recentActivities,
      activeSprints: sprintSummaries,
      tasks: enrichedWorkspaceTasks,
      members: (workspace.members || []).map(m => m.userId).filter(Boolean),
      personal: {
        totalTasks: myTasks.length,
        openTasks: myOpenTasks.length,
        completedTasks: myCompletedTasks.length,
        inProgressTasks: myInProgressTasks.length,
        overdueTasks: myOverdueTasks.length,
        dueSoonTasks: myDueSoonTasks.length,
        completionRate: myTasks.length > 0 ? Math.round((myCompletedTasks.length / myTasks.length) * 100) : 0,
        tasks: myEnrichedTasks,
        recentActivities: myRecentActivities
      }
    }
  });
});

// @desc    Get all members of a workspace
// @route   GET /api/v1/workspaces/:workspaceId/members
// @access  Private
const getWorkspaceMembers = asyncHandler(async (req, res) => {
  const { workspaceId } = req.params;
  const workspace = await Workspace.findById(workspaceId)
    .populate('ownerId', 'name email avatar role jobTitle department')
    .populate('members.userId', 'name email avatar role jobTitle department');

  if (!workspace) {
    return res.status(404).json({ success: false, error: 'Workspace not found' });
  }

  const memberMap = new Map();

  if (workspace.ownerId) {
    const u = workspace.ownerId;
    memberMap.set(u._id.toString(), {
      _id: u._id,
      name: u.name || u.email.split('@')[0],
      email: u.email,
      avatar: u.avatar || '',
      role: 'ORG_ADMIN',
      jobTitle: u.jobTitle || 'Workspace Owner',
      department: u.department || 'Executive'
    });
  }

  if (workspace.members) {
    workspace.members.forEach((m) => {
      if (m.userId) {
        const u = m.userId;
        const uid = u._id.toString();
        if (!memberMap.has(uid)) {
          memberMap.set(uid, {
            _id: u._id,
            name: u.name || u.email.split('@')[0],
            email: u.email,
            avatar: u.avatar || '',
            role: m.role || u.role || 'MEMBER',
            jobTitle: u.jobTitle || '',
            department: u.department || ''
          });
        }
      }
    });
  }

  // Also include any users who have currentWorkspace set to this workspace
  const orgUsers = await User.find({ currentWorkspace: workspaceId })
    .select('name email avatar role jobTitle department')
    .lean();

  orgUsers.forEach((u) => {
    const uid = u._id.toString();
    if (!memberMap.has(uid)) {
      memberMap.set(uid, {
        _id: u._id,
        name: u.name || u.email.split('@')[0],
        email: u.email,
        avatar: u.avatar || '',
        role: u.role || 'MEMBER',
        jobTitle: u.jobTitle || '',
        department: u.department || ''
      });
    }
  });

  res.json({
    success: true,
    count: memberMap.size,
    data: Array.from(memberMap.values())
  });
});

module.exports = {
  getMyWorkspaces,
  createWorkspace,
  inviteMember,
  switchWorkspace,
  getWorkspaceDashboard,
  getWorkspaceMembers
};