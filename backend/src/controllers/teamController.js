const mongoose = require('mongoose');
const Team = require('../models/Team');
const Workspace = require('../models/Workspace');
const Project = require('../models/Project');
const Task = require('../models/Task');
const User = require('../models/User');
const Role = require('../models/Role');
const asyncHandler = require('../middlewares/asyncHandler');
const { USER_ROLES } = require('../constants/roles');

// Helper to verify user permissions (Level 1 Org Admin, Super Admin, Workspace Owner, or Level 2 Project Manager)
const checkTeamManagePermission = async (workspace, user, projectId = null) => {
  if (!user) return false;
  const isSuperAdmin = user.role === USER_ROLES.SUPER_ADMIN;
  const isOrgAdmin = user.role === USER_ROLES.ORG_ADMIN;
  const isProjectManager = user.role === USER_ROLES.PROJECT_MANAGER || user.role === 'PROJECT_MANAGER';
  const isOwner = workspace && workspace.ownerId && workspace.ownerId.toString() === user._id.toString();

  if (isSuperAdmin || isOrgAdmin || isProjectManager || isOwner) return true;

  if (projectId) {
    const project = await Project.findById(projectId);
    if (project) {
      const isLead = project.leadId && project.leadId.toString() === user._id.toString();
      const hasElevatedRole = project.members && project.members.some(
        (m) => m.userId && m.userId.toString() === user._id.toString() && ['PROJECT_MANAGER', 'TEAM_LEAD', 'LEAD', 'ORG_ADMIN'].includes(m.role)
      );
      if (isLead || hasElevatedRole) return true;
    }
  }

  if (workspace && workspace.members) {
    const member = workspace.members.find(
      (m) => m.userId && m.userId.toString() === user._id.toString()
    );
    if (member) {
      if (['ORG_ADMIN', 'SUPER_ADMIN', 'PROJECT_MANAGER'].includes(member.role)) {
        return true;
      }
      if (member.customRoleId) {
        const roleDoc = await Role.findById(member.customRoleId);
        if (roleDoc && (roleDoc.level === 1 || roleDoc.level === 2)) {
          return true;
        }
      }
    }
  }

  return false;
};

// @desc    Get all teams in a workspace / organization
// @route   GET /api/v1/teams
// @access  Private
const getWorkspaceTeams = asyncHandler(async (req, res) => {
  const targetWorkspaceId = req.query.workspaceId || req.user.currentWorkspace;
  const { projectId, search } = req.query;

  if (!targetWorkspaceId) {
    return res.status(400).json({ success: false, error: 'Workspace ID is required' });
  }

  const query = {
    workspaceId: targetWorkspaceId,
    isArchived: false,
    isDeleted: { $ne: true }
  };

  if (projectId) {
    if (projectId === 'ORG_WIDE') {
      query.projectId = null;
    } else {
      query.projectId = projectId;
    }
  }

  if (search && search.trim()) {
    const searchRegex = { $regex: search.trim(), $options: 'i' };
    query.$or = [{ name: searchRegex }, { key: searchRegex }, { department: searchRegex }];
  }

  const teams = await Team.find(query)
    .populate('leadId', 'name email avatar jobTitle role')
    .populate('members', 'name email avatar jobTitle role department')
    .populate('projectId', 'name key color')
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 });

  // Attach task metrics for each team
  const teamsWithMetrics = await Promise.all(
    teams.map(async (team) => {
      const taskQuery = {
        workspaceId: targetWorkspaceId,
        isArchived: false,
        isDeleted: { $ne: true },
        $or: [
          { team: team.name },
          { team: team.key },
          { assigneeId: { $in: team.members.map((m) => m._id) } }
        ]
      };

      const [totalTasks, doneTasks] = await Promise.all([
        Task.countDocuments(taskQuery),
        Task.countDocuments({ ...taskQuery, status: 'DONE' })
      ]);

      return {
        ...team.toObject(),
        memberCount: (team.members || []).length,
        totalTasks,
        completedTasks: doneTasks,
        completionPercent: totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
      };
    })
  );

  res.json({
    success: true,
    count: teamsWithMetrics.length,
    data: teamsWithMetrics
  });
});

// @desc    Create a new team
// @route   POST /api/v1/teams
// @access  Private (Org Admin, Project Manager, Workspace Owner)
const createTeam = asyncHandler(async (req, res) => {
  const {
    name,
    key,
    description = '',
    color = '#2563EB',
    icon = '👥',
    leadId = null,
    members = [],
    projectId = null,
    department = 'Engineering',
    workspaceId
  } = req.body;

  const targetWorkspaceId = workspaceId || req.user.currentWorkspace;
  if (!targetWorkspaceId) {
    return res.status(400).json({ success: false, error: 'Workspace ID is required' });
  }

  const workspace = await Workspace.findById(targetWorkspaceId);
  if (!workspace) {
    return res.status(404).json({ success: false, error: 'Workspace not found' });
  }

  if (!(await checkTeamManagePermission(workspace, req.user))) {
    return res.status(403).json({
      success: false,
      error: 'Permission denied: Only Organization Admins and Project Managers can create teams'
    });
  }

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Team name is required' });
  }

  const cleanName = name.trim();
  const cleanKey = key && key.trim() ? key.trim().toUpperCase() : cleanName.slice(0, 3).toUpperCase();

  // Check uniqueness within workspace
  const existingTeam = await Team.findOne({
    workspaceId: targetWorkspaceId,
    name: { $regex: `^${cleanName}$`, $options: 'i' },
    isArchived: false
  });

  if (existingTeam) {
    return res.status(400).json({
      success: false,
      error: `A team named '${cleanName}' already exists in this organization`
    });
  }

  // Deduplicate members and include lead if provided
  const memberSet = new Set(Array.isArray(members) ? members.map((m) => m.toString()) : []);
  if (leadId) {
    memberSet.add(leadId.toString());
  }

  const team = await Team.create({
    name: cleanName,
    key: cleanKey,
    description: description.trim(),
    color,
    icon,
    leadId: leadId || null,
    members: Array.from(memberSet),
    projectId: projectId || null,
    department: department.trim(),
    workspaceId: targetWorkspaceId,
    createdBy: req.user._id,
    updatedBy: req.user._id
  });

  // If associated with a project, sync to Project.teams
  if (projectId) {
    try {
      const project = await Project.findById(projectId);
      if (project) {
        if (!project.teams) project.teams = [];
        const existsInProj = project.teams.some((t) => t.name.toLowerCase() === cleanName.toLowerCase());
        if (!existsInProj) {
          project.teams.push({
            name: cleanName,
            key: cleanKey,
            color,
            icon,
            description,
            leadId: leadId || null,
            members: Array.from(memberSet)
          });
          await project.save();
        }
      }
    } catch (err) {
      console.error('[Sync Team to Project Error]:', err.message);
    }
  }

  const populated = await Team.findById(team._id)
    .populate('leadId', 'name email avatar jobTitle role')
    .populate('members', 'name email avatar jobTitle role department')
    .populate('projectId', 'name key color')
    .populate('createdBy', 'name email');

  res.status(201).json({
    success: true,
    message: `Team '${cleanName}' created successfully`,
    data: populated
  });
});

// @desc    Update team details
// @route   PUT /api/v1/teams/:teamId
// @access  Private (Org Admin, Project Manager, Team Lead)
const updateTeam = asyncHandler(async (req, res) => {
  const { teamId } = req.params;
  const {
    name,
    key,
    description,
    color,
    icon,
    leadId,
    members,
    projectId,
    department
  } = req.body;

  const team = await Team.findById(teamId);
  if (!team) {
    return res.status(404).json({ success: false, error: 'Team not found' });
  }

  const workspace = await Workspace.findById(team.workspaceId);
  const isLead = team.leadId && team.leadId.toString() === req.user._id.toString();

  if (!(await checkTeamManagePermission(workspace, req.user)) && !isLead) {
    return res.status(403).json({
      success: false,
      error: 'Permission denied: You do not have permission to edit this team'
    });
  }

  if (name && name.trim()) team.name = name.trim();
  if (key && key.trim()) team.key = key.trim().toUpperCase();
  if (description !== undefined) team.description = description.trim();
  if (color) team.color = color;
  if (icon) team.icon = icon;
  if (department) team.department = department.trim();
  if (projectId !== undefined) team.projectId = projectId || null;
  if (leadId !== undefined) team.leadId = leadId || null;

  if (members !== undefined && Array.isArray(members)) {
    const memberSet = new Set(members.map((m) => m.toString()));
    if (team.leadId) memberSet.add(team.leadId.toString());
    team.members = Array.from(memberSet);
  }

  team.updatedBy = req.user._id;
  await team.save();

  const populated = await Team.findById(team._id)
    .populate('leadId', 'name email avatar jobTitle role')
    .populate('members', 'name email avatar jobTitle role department')
    .populate('projectId', 'name key color')
    .populate('createdBy', 'name email');

  res.json({
    success: true,
    message: `Team '${team.name}' updated successfully`,
    data: populated
  });
});

// @desc    Add member(s) to a team
// @route   POST /api/v1/teams/:teamId/members
// @access  Private (Org Admin, Project Manager, Team Lead)
const addTeamMembers = asyncHandler(async (req, res) => {
  const { teamId } = req.params;
  const { userId, userIds } = req.body;

  const team = await Team.findById(teamId);
  if (!team) {
    return res.status(404).json({ success: false, error: 'Team not found' });
  }

  const workspace = await Workspace.findById(team.workspaceId);
  const isLead = team.leadId && team.leadId.toString() === req.user._id.toString();

  if (!(await checkTeamManagePermission(workspace, req.user)) && !isLead) {
    return res.status(403).json({
      success: false,
      error: 'Permission denied: Cannot add members to this team'
    });
  }

  const toAdd = userIds && Array.isArray(userIds) ? userIds : userId ? [userId] : [];
  if (toAdd.length === 0) {
    return res.status(400).json({ success: false, error: 'No user ID provided to add' });
  }

  const currentMembers = new Set(team.members.map((m) => m.toString()));
  toAdd.forEach((id) => currentMembers.add(id.toString()));

  team.members = Array.from(currentMembers);
  team.updatedBy = req.user._id;
  await team.save();

  const populated = await Team.findById(team._id)
    .populate('leadId', 'name email avatar jobTitle role')
    .populate('members', 'name email avatar jobTitle role department')
    .populate('projectId', 'name key color');

  res.json({
    success: true,
    message: 'Members added to team successfully',
    data: populated
  });
});

// @desc    Remove a member from a team
// @route   DELETE /api/v1/teams/:teamId/members/:userId
// @access  Private (Org Admin, Project Manager, Team Lead)
const removeTeamMember = asyncHandler(async (req, res) => {
  const { teamId, userId } = req.params;

  const team = await Team.findById(teamId);
  if (!team) {
    return res.status(404).json({ success: false, error: 'Team not found' });
  }

  const workspace = await Workspace.findById(team.workspaceId);
  const isLead = team.leadId && team.leadId.toString() === req.user._id.toString();

  if (!(await checkTeamManagePermission(workspace, req.user)) && !isLead) {
    return res.status(403).json({
      success: false,
      error: 'Permission denied: Cannot remove member from this team'
    });
  }

  team.members = team.members.filter((m) => m.toString() !== userId.toString());
  if (team.leadId && team.leadId.toString() === userId.toString()) {
    team.leadId = null;
  }

  team.updatedBy = req.user._id;
  await team.save();

  const populated = await Team.findById(team._id)
    .populate('leadId', 'name email avatar jobTitle role')
    .populate('members', 'name email avatar jobTitle role department')
    .populate('projectId', 'name key color');

  res.json({
    success: true,
    message: 'Member removed from team successfully',
    data: populated
  });
});

// @desc    Delete / Archive a team
// @route   DELETE /api/v1/teams/:teamId
// @access  Private (Org Admin, Project Manager)
const deleteTeam = asyncHandler(async (req, res) => {
  const { teamId } = req.params;

  const team = await Team.findById(teamId);
  if (!team) {
    return res.status(404).json({ success: false, error: 'Team not found' });
  }

  const workspace = await Workspace.findById(team.workspaceId);
  if (!(await checkTeamManagePermission(workspace, req.user))) {
    return res.status(403).json({
      success: false,
      error: 'Permission denied: Only Organization Admins and Project Managers can delete teams'
    });
  }

  // Soft delete to Recycle Bin with 30-day retention
  team.isDeleted = true;
  team.deletedAt = new Date();
  team.deletedBy = req.user._id;
  team.purgeAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  team.deleteContext = { cascadeFrom: null };
  await team.save();

  res.json({
    success: true,
    message: `Team '${team.name}' moved to Recycle Bin (retained for 30 days)`,
    data: { _id: team._id }
  });
});

module.exports = {
  getWorkspaceTeams,
  createTeam,
  updateTeam,
  addTeamMembers,
  removeTeamMember,
  deleteTeam
};
