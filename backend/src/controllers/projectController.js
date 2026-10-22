const Project = require('../models/Project');
const Workspace = require('../models/Workspace');
const Subscription = require('../models/Subscription');
const Task = require('../models/Task');
const Activity = require('../models/Activity');
const Sprint = require('../models/Sprint');
const Team = require('../models/Team');
const Request = require('../models/Request');
const asyncHandler = require('../middlewares/asyncHandler');
const CacheService = require('../services/cacheService');
const { emitToProject, emitGlobal } = require('../config/socket');

// @desc    Get all projects in a workspace (Filtered by user membership for regular members, or all for admins)
// @route   GET /api/v1/projects
// @access  Private
const getProjects = asyncHandler(async (req, res) => {
  const { workspaceId } = req.query;
  const targetWorkspaceId = workspaceId || req.user.currentWorkspace;

  if (!targetWorkspaceId) {
    return res.status(400).json({ success: false, error: 'Workspace ID is required' });
  }

  const workspace = await Workspace.findById(targetWorkspaceId);
  if (!workspace) {
    return res.status(404).json({ success: false, error: 'Workspace not found' });
  }

  const isOrgAdmin = req.user.role === 'SUPER_ADMIN' || req.user.role === 'ORG_ADMIN';
  const isOwner = workspace.ownerId && workspace.ownerId.toString() === req.user._id.toString();
  const isWorkspaceAdmin = workspace.members && workspace.members.some(
    (m) => m.userId && (m.userId._id || m.userId).toString() === req.user._id.toString() && (m.role === 'ORG_ADMIN' || m.role === 'SUPER_ADMIN')
  );

  const { getEffectiveUserLevel } = require('../middlewares/rbac');
  let userLevel = 5;
  try {
    userLevel = await getEffectiveUserLevel(req.user, req);
  } catch (_) {}
  const isOrgLevelAdmin = isOrgAdmin || isOwner || isWorkspaceAdmin || userLevel === 1;

  const filter = {
    workspaceId: targetWorkspaceId,
    isArchived: false,
    isDeleted: { $ne: true }
  };

  // If user is NOT Level 1 Org Admin, return ONLY their related projects
  if (!isOrgLevelAdmin) {
    filter.$or = [
      { leadId: req.user._id },
      { 'members.userId': req.user._id },
      { 'teams.members': req.user._id },
      { 'teams.leadId': req.user._id },
      { createdBy: req.user._id }
    ];
  }

  const projects = await Project.find(filter)
    .populate('leadId', 'name email avatar')
    .populate('members.userId', 'name email avatar')
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    count: projects.length,
    data: projects
  });
});

// @desc    Create a new Project
// @route   POST /api/v1/projects
// @access  Private
const createProject = asyncHandler(async (req, res) => {
  const { name, key, description, category, color, icon, teams, leadId } = req.body;
  const workspaceId = req.body.workspaceId || req.user.currentWorkspace;

  if (!name || !key || !workspaceId) {
    return res.status(400).json({ success: false, error: 'Please provide project name, key, and workspace ID' });
  }

  const workspace = await Workspace.findById(workspaceId).populate('subscriptionId');
  if (!workspace) {
    return res.status(404).json({ success: false, error: 'Workspace not found' });
  }

  // Permission Check: Only Level 1 (Org Admin / Super Admin / Owner) and Level 2 (Project Manager) can create projects!
  const wsMember = workspace.members?.find((m) => (m.userId?._id || m.userId)?.toString() === req.user._id.toString());
  const isLevel1 =
    req.user.role === 'SUPER_ADMIN' ||
    req.user.role === 'ORG_ADMIN' ||
    workspace.ownerId?.toString() === req.user._id.toString() ||
    wsMember?.role === 'ORG_ADMIN';
  const isLevel2 =
    req.user.role === 'PROJECT_MANAGER' ||
    wsMember?.role === 'PROJECT_MANAGER';

  if (!isLevel1 && !isLevel2) {
    return res.status(403).json({
      success: false,
      error: 'Permission denied: Only Level 1 (Org Admin) and Level 2 (Project Manager) can create projects.'
    });
  }

  const formattedKey = key.trim().toUpperCase();

  const existingKey = await Project.findOne({ workspaceId, key: formattedKey });
  if (existingKey) {
    return res.status(400).json({ success: false, error: `Project key '${formattedKey}' already exists in this workspace` });
  }

  const assignedLeadId = leadId || req.user._id;

  // Parse initial teams if provided
  let initialTeams = [];
  const allTeamMemberIds = new Set();

  if (Array.isArray(teams) && teams.length > 0) {
    const workspaceTeams = await Team.find({ workspaceId }).lean();

    initialTeams = teams.map((t) => {
      const explicitMembers = Array.isArray(t.members) ? t.members.filter(Boolean) : [];
      const teamName = (t.name || t).toString();
      const teamKey = (t.key || (typeof t === 'string' ? t.slice(0, 3).toUpperCase() : 'TEAM')).toString();

      // Find matching workspace team
      const matchedGlobal = workspaceTeams.find(
        (wt) =>
          (wt.name && wt.name.trim().toLowerCase() === teamName.trim().toLowerCase()) ||
          (wt.key && wt.key.trim().toUpperCase() === teamKey.trim().toUpperCase())
      );

      const resolvedLeadId = t.leadId || matchedGlobal?.leadId || assignedLeadId;

      const teamMemberList = Array.from(
        new Set([
          resolvedLeadId.toString(),
          ...(matchedGlobal?.members || []).map((m) => (m._id || m).toString()),
          ...explicitMembers.map((m) => (m._id || m).toString())
        ])
      );

      teamMemberList.forEach((id) => allTeamMemberIds.add(id));

      return {
        name: teamName,
        key: teamKey,
        color: t.color || matchedGlobal?.color || '#3B82F6',
        description: t.description || matchedGlobal?.description || '',
        leadId: resolvedLeadId,
        members: teamMemberList
      };
    });
  }

  const projectMembers = [{ userId: assignedLeadId, role: 'PROJECT_MANAGER' }];
  if (assignedLeadId.toString() !== req.user._id.toString()) {
    projectMembers.push({ userId: req.user._id, role: 'ORG_ADMIN' });
  }

  // Automatically enroll all selected team members into the project
  allTeamMemberIds.forEach((uid) => {
    if (!projectMembers.some((m) => m.userId.toString() === uid)) {
      projectMembers.push({
        userId: uid,
        role: 'MEMBER'
      });
    }
  });

  const project = await Project.create({
    name,
    key: formattedKey,
    description: description || '',
    category: category || 'Engineering',
    color: color || '#1E3E62',
    icon: icon || 'FolderKanban',
    workspaceId,
    leadId: assignedLeadId,
    members: projectMembers,
    teams: initialTeams
  });

  res.status(201).json({
    success: true,
    message: 'Project created successfully',
    data: project
  });
});

// @desc    Get single project details
// @route   GET /api/v1/projects/:projectId
// @access  Private
const getProjectById = asyncHandler(async (req, res) => {
  const { projectId } = req.params;

  const project = await Project.findById(projectId)
    .populate('leadId', 'name email avatar')
    .populate('members.userId', 'name email avatar');

  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  const workspace = await Workspace.findById(project.workspaceId);
  const isOrgAdmin = req.user.role === 'SUPER_ADMIN' || req.user.role === 'ORG_ADMIN';
  const isOwner = workspace && workspace.ownerId && workspace.ownerId.toString() === req.user._id.toString();
  const isWorkspaceAdmin = workspace && workspace.members && workspace.members.some(
    (m) => m.userId && (m.userId._id || m.userId).toString() === req.user._id.toString() && m.role === 'ORG_ADMIN'
  );

  const isLead = project.leadId && (project.leadId._id || project.leadId).toString() === req.user._id.toString();
  const isMember = project.members && project.members.some(
    (m) => m.userId && (m.userId._id || m.userId).toString() === req.user._id.toString()
  );
  const isTeamMember = project.teams && project.teams.some(
    (t) => (t.leadId && (t.leadId._id || t.leadId).toString() === req.user._id.toString()) ||
           (t.members && t.members.some((tm) => (tm._id || tm).toString() === req.user._id.toString()))
  );

  if (!isOrgAdmin && !isOwner && !isWorkspaceAdmin && !isLead && !isMember && !isTeamMember) {
    return res.status(403).json({ success: false, error: 'Access denied: You are not assigned to this project' });
  }

  res.json({
    success: true,
    data: project
  });
});

// @desc    Get all assignable members for a project (Project + Workspace members)
// @route   GET /api/v1/projects/:projectId/members
// @access  Private
const getProjectMembers = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const User = require('../models/User');

  const project = await Project.findById(projectId);
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  const workspace = await Workspace.findById(project.workspaceId);

  // Map to hold roles by user string ID
  const roleMap = new Map();
  const userIds = new Set();

  // 1. Workspace Owner
  if (workspace?.ownerId) {
    const ownerIdStr = workspace.ownerId.toString();
    userIds.add(ownerIdStr);
    roleMap.set(ownerIdStr, 'OWNER');
  }

  // 2. Workspace Members
  if (workspace?.members) {
    workspace.members.forEach((m) => {
      if (m.userId) {
        const uid = (m.userId._id || m.userId).toString();
        userIds.add(uid);
        if (!roleMap.has(uid)) roleMap.set(uid, m.role || 'MEMBER');
      }
    });
  }

  // 3. Project Lead
  if (project.leadId) {
    const leadIdStr = (project.leadId._id || project.leadId).toString();
    userIds.add(leadIdStr);
    roleMap.set(leadIdStr, 'LEAD');
  }

  // 4. Project Members
  if (project.members) {
    project.members.forEach((m) => {
      if (m.userId) {
        const uid = (m.userId._id || m.userId).toString();
        userIds.add(uid);
        roleMap.set(uid, m.role || 'MEMBER');
      }
    });
  }

  // 5. Team Leads in Project Teams
  if (project.teams) {
    project.teams.forEach((t) => {
      if (t.leadId) {
        const tLeadStr = (t.leadId._id || t.leadId).toString();
        userIds.add(tLeadStr);
        if (!roleMap.has(tLeadStr) || roleMap.get(tLeadStr) === 'MEMBER') {
          roleMap.set(tLeadStr, 'TEAM_LEAD');
        }
      }
    });
  }

  // Fetch all user records from DB
  const users = await User.find({ _id: { $in: Array.from(userIds) } })
    .select('_id name email avatar jobTitle department role')
    .lean();

  const membersList = users.map((u) => {
    const assignedRole = roleMap.get(u._id.toString());
    const finalRole = assignedRole && assignedRole !== 'MEMBER' 
      ? assignedRole 
      : (u.role || u.jobTitle || 'MEMBER');

    return {
      _id: u._id.toString(),
      userId: u._id.toString(),
      name: u.name || u.email.split('@')[0],
      email: u.email,
      avatar: u.avatar || '',
      jobTitle: u.jobTitle || '',
      systemRole: u.role || 'MEMBER',
      role: finalRole
    };
  });

  res.json({
    success: true,
    count: membersList.length,
    data: membersList
  });
});

// @desc    Get Jira-Grade Project Summary Metrics & Activity Stream
// @route   GET /api/v1/projects/:projectId/summary
// @access  Private
const getProjectSummary = asyncHandler(async (req, res) => {
  const { projectId } = req.params;

  const project = await Project.findById(projectId).populate('leadId', 'name email avatar');
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const allTasks = await Task.find({ projectId, isArchived: false })
    .populate('assigneeId', 'name email avatar')
    .lean();

  const totalTasks = allTasks.length;

  const stages = project.workflowStages || [];
  const isTaskDone = (status) => {
    if (stages && stages.length >= 2) {
      const lastId = stages[stages.length - 1]?.id || stages[stages.length - 1];
      return status === lastId || status === 'DONE';
    }
    return status === 'DONE';
  };

  // 1. 4 Metric Cards
  const completedLast7Days = allTasks.filter(
    (t) => isTaskDone(t.status) && new Date(t.updatedAt) >= sevenDaysAgo
  ).length;

  const updatedLast7Days = allTasks.filter(
    (t) => new Date(t.updatedAt) >= sevenDaysAgo
  ).length;

  const createdLast7Days = allTasks.filter(
    (t) => new Date(t.createdAt) >= sevenDaysAgo
  ).length;

  const dueSoonNext7Days = allTasks.filter(
    (t) =>
      t.dueDate &&
      !isTaskDone(t.status) &&
      new Date(t.dueDate) >= now &&
      new Date(t.dueDate) <= sevenDaysAhead
  ).length;

  // 2. Status Overview Breakdown
  const statusCounts = {
    BACKLOG: 0,
    TODO: 0,
    IN_PROGRESS: 0,
    IN_REVIEW: 0,
    DONE: 0
  };

  allTasks.forEach((t) => {
    if (statusCounts[t.status] !== undefined) {
      statusCounts[t.status]++;
    } else {
      statusCounts.TODO++;
    }
  });

  // 3. Priority Breakdown
  const priorityCounts = {
    URGENT: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    LOWEST: 0
  };

  allTasks.forEach((t) => {
    if (priorityCounts[t.priority] !== undefined) {
      priorityCounts[t.priority]++;
    } else {
      priorityCounts.MEDIUM++;
    }
  });

  // 4. Types of Work Breakdown
  const typeCounts = {
    TASK: 0,
    BUG: 0,
    STORY: 0,
    EPIC: 0
  };

  allTasks.forEach((t) => {
    if (typeCounts[t.issueType] !== undefined) {
      typeCounts[t.issueType]++;
    } else {
      typeCounts.TASK++;
    }
  });

  // 5. Recent Activities
  const recentActivities = await Activity.find({ projectId })
    .sort({ createdAt: -1 })
    .limit(20)
    .populate('userId', 'name email avatar')
    .populate('taskId', 'key title status issueType')
    .lean();

  res.json({
    success: true,
    data: {
      metrics: {
        completedLast7Days,
        updatedLast7Days,
        createdLast7Days,
        dueSoonNext7Days,
        totalTasks
      },
      statusOverview: statusCounts,
      priorityBreakdown: priorityCounts,
      typesOfWork: typeCounts,
      recentActivities,
      tasks: allTasks
    }
  });
});

// @desc    Get Project Activities Feed
// @route   GET /api/v1/projects/:projectId/activities
// @access  Private
const getProjectActivities = asyncHandler(async (req, res) => {
  const { projectId } = req.params;

  const activities = await Activity.find({ projectId })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('userId', 'name email avatar')
    .populate('taskId', 'key title status issueType')
    .lean();

  res.json({
    success: true,
    count: activities.length,
    data: activities
  });
});

// @desc    Update Project Workflow Stages / Columns
// @route   PUT /api/v1/projects/:projectId/stages
// @access  Private
const updateProjectWorkflowStages = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { stages } = req.body;

  if (!stages || !Array.isArray(stages) || stages.length === 0) {
    return res.status(400).json({ success: false, error: 'Valid stages array is required' });
  }

  const project = await Project.findByIdAndUpdate(
    projectId,
    { workflowStages: stages },
    { new: true, runValidators: true }
  );

  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  // Invalidate kanban & summary cache
  await CacheService.delPattern(`kanban:${projectId}:*`);
  await CacheService.del(`summary:${projectId}`);

  res.json({
    success: true,
    message: 'Workflow stages updated successfully',
    data: project.workflowStages
  });
});

// @desc    Add member directly to project
// @route   POST /api/v1/projects/:projectId/members
// @access  Private
const addProjectMember = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { userId, role = 'MEMBER' } = req.body;

  if (!userId) {
    return res.status(400).json({ success: false, error: 'User ID is required' });
  }

  const project = await Project.findById(projectId);
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  const existingMember = project.members.find(
    (m) => m.userId && m.userId.toString() === userId.toString()
  );

  if (existingMember) {
    existingMember.role = role;
  } else {
    project.members.push({ userId, role });
  }

  await project.save();

  // Also ensure user is in workspace.members
  const Workspace = require('../models/Workspace');
  const workspace = await Workspace.findById(project.workspaceId);
  if (workspace) {
    const isWsMember = workspace.members.some(
      (m) => m.userId && m.userId.toString() === userId.toString()
    );
    if (!isWsMember) {
      workspace.members.push({ userId, role: 'MEMBER' });
      await workspace.save();
    }
  }

  // Invalidate cache
  await CacheService.delPattern(`members:${projectId}*`);

  // Record assignment notification for the user to see upon login
  try {
    // Avoid duplicate notice for same project
    await User.updateOne(
      { _id: userId },
      {
        $pull: { unreadProjectAssignments: { projectId: project._id } }
      }
    );
    await User.updateOne(
      { _id: userId },
      {
        $push: {
          unreadProjectAssignments: {
            projectId: project._id,
            projectName: project.name,
            projectKey: project.key,
            assignedBy: req.user?.name || 'Organization Admin',
            assignedAt: new Date()
          }
        }
      }
    );
  } catch (notifyErr) {
    console.error('Failed to save project assignment notification:', notifyErr);
  }

  res.json({
    success: true,
    message: 'Member added to project successfully',
    data: project.members
  });
});

// @desc    Remove member from project
// @route   DELETE /api/v1/projects/:projectId/members/:userId
// @access  Private
const removeProjectMember = asyncHandler(async (req, res) => {
  const { projectId, userId } = req.params;

  const project = await Project.findById(projectId);
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  project.members = project.members.filter(
    (m) => m.userId && m.userId.toString() !== userId.toString()
  );
  await project.save();

  // Invalidate cache
  await CacheService.delPattern(`members:${projectId}*`);

  res.json({
    success: true,
    message: 'Member removed from project successfully'
  });
});

// @desc    Get all teams in a project
// @route   GET /api/v1/projects/:projectId/teams
// @access  Private
const getProjectTeams = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const project = await Project.findById(projectId)
    .populate('teams.leadId', 'name email avatar jobTitle role')
    .populate('teams.members', 'name email avatar jobTitle role');

  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  // Fallback / auto-heal: if any team in project has no lead or was defaulted to PM, match against workspace teams
  const workspaceTeams = await Team.find({ workspaceId: project.workspaceId })
    .populate('leadId', 'name email avatar jobTitle role')
    .populate('members', 'name email avatar jobTitle role')
    .lean();

  const enrichedTeams = (project.teams || []).map((t) => {
    const tObj = t.toObject ? t.toObject() : { ...t };
    const matched = workspaceTeams.find(
      (wt) =>
        (wt.name && tObj.name && wt.name.trim().toLowerCase() === tObj.name.trim().toLowerCase()) ||
        (wt.key && tObj.key && wt.key.trim().toUpperCase() === tObj.key.trim().toUpperCase())
    );

    if (matched && matched.leadId) {
      const pmId = project.leadId ? (project.leadId._id || project.leadId).toString() : null;
      const currentLeadId = tObj.leadId ? (tObj.leadId._id || tObj.leadId).toString() : null;
      if (!currentLeadId || (pmId && currentLeadId === pmId && matched.leadId._id.toString() !== pmId)) {
        tObj.leadId = matched.leadId;
      }
    }
    return tObj;
  });

  res.json({
    success: true,
    data: enrichedTeams
  });
});

// @desc    Create / Add a team to a project
// @route   POST /api/v1/projects/:projectId/teams
// @access  Private
const createProjectTeam = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { name, key, color = '#3B82F6', icon = '👥', description = '', leadId = null, members = [], workflowStages = [] } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Team name is required' });
  }

  const project = await Project.findById(projectId);
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  const cleanName = name.trim();
  const cleanKey = key ? key.trim().toUpperCase() : cleanName.slice(0, 3).toUpperCase();

  const existingTeam = project.teams && project.teams.some(
    (t) => t.name.toLowerCase() === cleanName.toLowerCase()
  );

  if (existingTeam) {
    return res.status(400).json({ success: false, error: `Team '${cleanName}' already exists in this project` });
  }

  const newTeam = {
    name: cleanName,
    key: cleanKey,
    color,
    icon,
    description,
    leadId: leadId || null,
    members: Array.isArray(members) ? members : [],
    workflowStages: Array.isArray(workflowStages) && workflowStages.length > 0 ? workflowStages : [
      { id: 'BACKLOG', label: 'Backlog', color: 'bg-slate-500' },
      { id: 'TODO', label: 'To Do', color: 'bg-blue-500' },
      { id: 'IN_PROGRESS', label: 'In Progress', color: 'bg-amber-500' },
      { id: 'IN_REVIEW', label: 'Testing / Review', color: 'bg-purple-500' },
      { id: 'DONE', label: 'Done', color: 'bg-emerald-500' }
    ]
  };

  if (!project.teams) project.teams = [];
  project.teams.push(newTeam);

  // If a lead is assigned, grant TEAM_LEAD role in project members
  if (leadId) {
    const leadIdStr = leadId.toString();
    const existingMember = project.members.find(m => m.userId && m.userId.toString() === leadIdStr);
    if (existingMember) {
      if (!existingMember.role || existingMember.role === 'MEMBER') {
        existingMember.role = 'TEAM_LEAD';
      }
    } else {
      project.members.push({ userId: leadId, role: 'TEAM_LEAD' });
    }
  }

  await project.save();

  const updatedProject = await Project.findById(projectId)
    .populate('teams.leadId', 'name email avatar jobTitle role')
    .populate('teams.members', 'name email avatar jobTitle role');

  const createdTeam = updatedProject.teams[updatedProject.teams.length - 1];

  res.status(201).json({
    success: true,
    message: `Team '${cleanName}' created successfully`,
    data: createdTeam
  });
});

// @desc    Update a team in a project
// @route   PUT /api/v1/projects/:projectId/teams/:teamId
// @access  Private
const updateProjectTeam = asyncHandler(async (req, res) => {
  const { projectId, teamId } = req.params;
  const { name, key, color, icon, description, leadId, members, workflowStages } = req.body;

  const project = await Project.findById(projectId);
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  const team = project.teams && project.teams.id(teamId);
  if (!team) {
    return res.status(404).json({ success: false, error: 'Team not found in this project' });
  }

  if (name) team.name = name.trim();
  if (key) team.key = key.trim().toUpperCase();
  if (color) team.color = color;
  if (icon) team.icon = icon;
  if (description !== undefined) team.description = description;
  if (leadId !== undefined) {
    team.leadId = leadId || null;
    if (leadId) {
      const leadIdStr = leadId.toString();
      const existingMember = project.members.find(m => m.userId && m.userId.toString() === leadIdStr);
      if (existingMember) {
        if (!existingMember.role || existingMember.role === 'MEMBER') {
          existingMember.role = 'TEAM_LEAD';
        }
      } else {
        project.members.push({ userId: leadId, role: 'TEAM_LEAD' });
      }
    }
  }
  if (members !== undefined) team.members = Array.isArray(members) ? members : [];
  if (workflowStages !== undefined) team.workflowStages = Array.isArray(workflowStages) ? workflowStages : team.workflowStages;

  await project.save();

  const updatedProject = await Project.findById(projectId)
    .populate('teams.leadId', 'name email avatar jobTitle role')
    .populate('teams.members', 'name email avatar jobTitle role');

  const updatedTeam = updatedProject.teams.id(teamId);

  res.json({
    success: true,
    message: 'Team updated successfully',
    data: updatedTeam
  });
});

// @desc    Update a specific team's workflow stages
// @route   PUT /api/v1/projects/:projectId/teams/:teamId/stages
// @access  Private
const updateTeamWorkflowStages = asyncHandler(async (req, res) => {
  const { projectId, teamId } = req.params;
  const { stages } = req.body;

  if (!Array.isArray(stages) || stages.length === 0) {
    return res.status(400).json({ success: false, error: 'Stages must be a non-empty array' });
  }

  const project = await Project.findById(projectId);
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  const team = project.teams && project.teams.id(teamId);
  if (!team) {
    return res.status(404).json({ success: false, error: 'Team not found in this project' });
  }

  team.workflowStages = stages;
  await project.save();

  await CacheService.delPattern(`kanban:${projectId}*`);

  res.json({
    success: true,
    message: `Workflow stages for team '${team.name}' updated successfully`,
    data: team.workflowStages
  });
});

// @desc    Delete a team from a project
// @route   DELETE /api/v1/projects/:projectId/teams/:teamId
// @access  Private
const deleteProjectTeam = asyncHandler(async (req, res) => {
  const { projectId, teamId } = req.params;

  const project = await Project.findById(projectId);
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  if (!project.teams) {
    return res.status(404).json({ success: false, error: 'Team not found' });
  }

  const teamToDelete = project.teams.id(teamId);
  const teamName = teamToDelete ? teamToDelete.name : '';

  project.teams = project.teams.filter((t) => t._id.toString() !== teamId.toString());
  await project.save();

  // Clear team field on tasks if needed
  if (teamName) {
    await Task.updateMany(
      { projectId, team: teamName },
      { $set: { team: '' } }
    );
  }

  res.json({
    success: true,
    message: 'Team deleted successfully',
    data: project.teams
  });
});

// @desc    Get detailed Teams Progress & Milestone Intelligence for Project Managers and Team Leads
// @route   GET /api/v1/projects/:projectId/teams-progress
// @access  Private
const getProjectTeamsProgress = asyncHandler(async (req, res) => {
  const { projectId } = req.params;

  const project = await Project.findById(projectId)
    .populate('leadId', 'name email avatar jobTitle role')
    .populate('teams.leadId', 'name email avatar jobTitle role')
    .populate('teams.members', 'name email avatar jobTitle role');

  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  const tasks = await Task.find({ projectId, isArchived: false })
    .populate('assigneeId', 'name email avatar')
    .sort({ createdAt: -1 })
    .lean();

  // Helper to dynamically classify task status by stage position:
  // - Index 0: Idea / Backlog (Not Started)
  // - Index Length - 1: Completed / Done
  // - Indices 1..Length-2: WIP (Work In Progress)
  const classifyTaskStatus = (taskStatus, stages) => {
    const activeStages = (stages && Array.isArray(stages) && stages.length >= 2)
      ? stages
      : (project.workflowStages && Array.isArray(project.workflowStages) && project.workflowStages.length >= 2)
      ? project.workflowStages
      : null;

    if (activeStages && activeStages.length >= 2) {
      const firstId = activeStages[0]?.id || activeStages[0];
      const lastId = activeStages[activeStages.length - 1]?.id || activeStages[activeStages.length - 1];

      if (taskStatus === lastId || taskStatus === 'DONE') {
        return 'DONE';
      }
      if (taskStatus === firstId || taskStatus === 'BACKLOG' || taskStatus === 'TODO') {
        return 'TODO';
      }
      // Any intermediate position stage is WIP!
      return 'IN_PROGRESS';
    }

    if (taskStatus === 'DONE') return 'DONE';
    if (taskStatus === 'BACKLOG' || taskStatus === 'TODO') return 'TODO';
    return 'IN_PROGRESS';
  };

  const now = new Date();
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => classifyTaskStatus(t.status, project.workflowStages) === 'DONE').length;
  const inProgressTasks = tasks.filter((t) => classifyTaskStatus(t.status, project.workflowStages) === 'IN_PROGRESS').length;

  const overallCompletionPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Build progress breakdown for each defined team in the project
  const projectTeams = project.teams || [];

  const teamProgressList = projectTeams.map((team) => {
    const teamNameLower = team.name.toLowerCase();
    const teamTasks = tasks.filter((t) => {
      const taskTeam = (t.team || '').toLowerCase();
      const taskTeamId = t.teamId ? t.teamId.toString() : '';
      return taskTeam === teamNameLower || taskTeamId === team._id.toString();
    });

    const teamStages = (team.workflowStages && team.workflowStages.length >= 2)
      ? team.workflowStages
      : project.workflowStages;

    const teamTotal = teamTasks.length;
    const teamDone = teamTasks.filter((t) => classifyTaskStatus(t.status, teamStages) === 'DONE').length;
    const teamInProgress = teamTasks.filter((t) => classifyTaskStatus(t.status, teamStages) === 'IN_PROGRESS').length;
    const teamTodo = teamTasks.filter((t) => classifyTaskStatus(t.status, teamStages) === 'TODO').length;
    const teamReview = teamTasks.filter((t) => t.status === 'IN_REVIEW').length;
    const teamOverdue = teamTasks.filter(
      (t) => t.dueDate && classifyTaskStatus(t.status, teamStages) !== 'DONE' && new Date(t.dueDate) < now
    ).length;

    const completionPercent = teamTotal > 0 ? Math.round((teamDone / teamTotal) * 100) : 0;

    return {
      _id: team._id,
      name: team.name,
      key: team.key,
      color: team.color || '#3B82F6',
      description: team.description || '',
      lead: team.leadId,
      members: team.members || [],
      totalTasks: teamTotal,
      completedTasks: teamDone,
      inProgressTasks: teamInProgress,
      todoTasks: teamTodo,
      reviewTasks: teamReview,
      overdueTasks: teamOverdue,
      completionPercent,
      recentTasks: teamTasks.slice(0, 5)
    };
  });

  // Calculate unassigned tasks
  const definedTeamNames = new Set(projectTeams.map((t) => t.name.toLowerCase()));
  const unassignedTasks = tasks.filter((t) => !t.team || !definedTeamNames.has(t.team.toLowerCase()));

  res.json({
    success: true,
    data: {
      project: {
        _id: project._id,
        name: project.name,
        key: project.key,
        color: project.color,
        lead: project.leadId,
        workflowStages: project.workflowStages || []
      },
      overview: {
        totalTasks,
        completedTasks,
        inProgressTasks,
        overallCompletionPercent,
        totalTeams: projectTeams.length,
        unassignedTasksCount: unassignedTasks.length
      },
      teams: teamProgressList,
      unassignedTasks: unassignedTasks.slice(0, 5)
    }
  });
});

// @desc    Soft Delete Project (Cascades to child Tasks and Requests, 30-day retention)
// @route   DELETE /api/v1/projects/:projectId
// @access  Private (Org Admin, Super Admin, Project Lead)
const deleteProject = asyncHandler(async (req, res) => {
  const { projectId } = req.params;

  const project = await Project.findById(projectId);
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  // Verify permission
  const isSuperOrOrgAdmin = req.user.role === 'SUPER_ADMIN' || req.user.role === 'ORG_ADMIN';
  const isProjectLead = project.leadId && project.leadId.toString() === req.user._id.toString();

  const { getEffectiveUserLevel } = require('../middlewares/rbac');
  let userLevel = 5;
  try {
    userLevel = await getEffectiveUserLevel(req.user, req);
  } catch (_) {}

  if (!isSuperOrOrgAdmin && !isProjectLead && userLevel > 2) {
    return res.status(403).json({
      success: false,
      error: 'Permission denied: Only Organization Admins or Project Managers can delete projects'
    });
  }

  const purgeDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  // 1. Soft delete the project
  project.isDeleted = true;
  project.deletedAt = new Date();
  project.deletedBy = req.user._id;
  project.purgeAt = purgeDate;
  await project.save();

  // 2. Cascade soft-delete to all child tasks that are not already deleted
  await Task.updateMany(
    { projectId: project._id, isDeleted: { $ne: true } },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user._id,
        purgeAt: purgeDate,
        deleteContext: { cascadeFrom: 'PROJECT' }
      }
    }
  );

  // 3. Cascade soft-delete to all child requests
  await Request.updateMany(
    { projectId: project._id, isDeleted: { $ne: true } },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user._id,
        purgeAt: purgeDate,
        deleteContext: { cascadeFrom: 'PROJECT' }
      }
    }
  );

  // 4. Invalidate caches
  await CacheService.invalidateProject(projectId);
  await CacheService.invalidatePattern(`kanban:${projectId}*`);

  // 5. Emit socket broadcast
  emitToProject(projectId, 'project:deleted', { projectId: project._id });
  emitGlobal('project:deleted', { projectId: project._id, workspaceId: project.workspaceId });
  emitGlobal('recycle-bin:changed', { action: 'DELETE', itemType: 'PROJECT', itemId: project._id, workspaceId: project.workspaceId });

  res.json({
    success: true,
    message: `Project '${project.name}' and all associated tasks moved to Recycle Bin (30-day retention)`,
    data: { _id: project._id }
  });
});

module.exports = {
  getProjects,
  createProject,
  deleteProject,
  getProjectById,
  getProjectMembers,
  getProjectSummary,
  getProjectActivities,
  updateProjectWorkflowStages,
  addProjectMember,
  removeProjectMember,
  getProjectTeams,
  createProjectTeam,
  updateProjectTeam,
  updateTeamWorkflowStages,
  deleteProjectTeam,
  getProjectTeamsProgress
};