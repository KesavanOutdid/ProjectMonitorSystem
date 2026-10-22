const mongoose = require('mongoose');
const User = require('../models/User');
const Workspace = require('../models/Workspace');
const Project = require('../models/Project');
const Task = require('../models/Task');
const Activity = require('../models/Activity');
const Invitation = require('../models/Invitation');
const Subscription = require('../models/Subscription');
const asyncHandler = require('../middlewares/asyncHandler');
const { USER_ROLES, USER_STATUS } = require('../constants/roles');

// @desc    Get members & invited users for the organization/workspace
// @route   GET /api/v1/admin/users
// @access  Private (SUPER_ADMIN, ORG_ADMIN)
const getAllUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, search, role, status, workspaceId } = req.query;
  const targetWorkspaceId = workspaceId || req.user.currentWorkspace;

  if (!targetWorkspaceId) {
    return res.status(400).json({ success: false, error: 'Workspace ID is required' });
  }

  const workspace = await Workspace.findById(targetWorkspaceId);
  if (!workspace) {
    return res.status(404).json({ success: false, error: 'Workspace not found' });
  }

  const isPM = req.user.role === 'PROJECT_MANAGER';

  // If PM, only fetch projects they manage or are member of
  let projectFilter = { workspaceId: targetWorkspaceId, isArchived: false };
  if (isPM) {
    projectFilter.$or = [
      { leadId: req.user._id },
      { 'members.userId': req.user._id }
    ];
  }

  const projects = await Project.find(projectFilter);
  const myProjectIds = projects.map((p) => p._id);
  
  // Collect all unique user IDs linked to this workspace / these projects
  const memberRoleMap = new Map(); // userId -> { role, projects: [] }

  // 1. Workspace Owner & Workspace Members
  if (workspace.ownerId) {
    const ownerIdStr = workspace.ownerId.toString();
    memberRoleMap.set(ownerIdStr, { role: 'ORG_ADMIN', projects: [] });
  }

  if (workspace.members) {
    workspace.members.forEach((m) => {
      if (m.userId) {
        const uid = m.userId.toString();
        const existing = memberRoleMap.get(uid) || { role: m.role || 'MEMBER', projects: [] };
        memberRoleMap.set(uid, existing);
      }
    });
  }

  // Also include all users set to this current workspace
  const workspaceUsers = await User.find({ currentWorkspace: targetWorkspaceId }).select('_id role').lean();
  workspaceUsers.forEach((u) => {
    const uid = u._id.toString();
    if (!memberRoleMap.has(uid)) {
      memberRoleMap.set(uid, { role: u.role || 'MEMBER', projects: [] });
    }
  });

  // 2. Project Members & Leads (Filtered to relevant projects)
  projects.forEach((proj) => {
    if (proj.leadId) {
      const leadIdStr = proj.leadId.toString();
      const existing = memberRoleMap.get(leadIdStr) || { role: 'PROJECT_MANAGER', projects: [] };
      if (!existing.projects.some((p) => p.id === proj._id.toString())) {
        existing.projects.push({ id: proj._id.toString(), name: proj.name, key: proj.key });
      }
      memberRoleMap.set(leadIdStr, existing);
    }
    if (proj.members) {
      proj.members.forEach((pm) => {
        if (pm.userId) {
          const puid = pm.userId.toString();
          const existing = memberRoleMap.get(puid) || { role: pm.role || 'MEMBER', projects: [] };
          if (!existing.projects.some((p) => p.id === proj._id.toString())) {
            existing.projects.push({ id: proj._id.toString(), name: proj.name, key: proj.key });
          }
          memberRoleMap.set(puid, existing);
        }
      });
    }
  });

  const memberUserIds = Array.from(memberRoleMap.keys());

  // Build filter for active registered users
  const query = {
    _id: { $in: memberUserIds }
  };

  if (role) query.role = role;
  if (status && status !== 'INVITED') query.status = status;
  if (search && search.trim()) {
    const searchRegex = { $regex: search.trim(), $options: 'i' };
    query.$or = [{ name: searchRegex }, { email: searchRegex }];
  }

  // Find registered members
  const registeredUsers = await User.find(query)
    .populate('currentWorkspace', 'name slug')
    .lean();

  const formattedMembers = registeredUsers.map((u) => {
    const meta = memberRoleMap.get(u._id.toString()) || {};
    return {
      _id: u._id,
      name: u.name,
      email: u.email,
      role: u.role || meta.role || 'MEMBER',
      status: u.status || 'ACTIVE',
      workspaceRole: meta.role || 'MEMBER',
      assignedProjects: meta.projects || [],
      currentWorkspace: {
        _id: workspace._id,
        name: workspace.name,
        slug: workspace.slug
      },
      isPendingInvite: false,
      createdAt: u.createdAt
    };
  });

  // Fetch Pending Invitations for this workspace
  let pendingInvitesList = [];
  if (!status || status === 'INVITED' || status === 'PENDING') {
    // Registered member emails should not show up as pending invites
    const registeredEmails = registeredUsers
      .map((u) => (u.email || '').toLowerCase().trim())
      .filter(Boolean);

    if (registeredEmails.length > 0) {
      await Invitation.updateMany(
        {
          workspaceId: targetWorkspaceId,
          status: 'PENDING',
          email: { $in: registeredEmails }
        },
        {
          $set: { status: 'ACCEPTED', acceptedAt: new Date() }
        }
      );
    }

    // Automatically split any legacy batch invites into separate individual records
    const crypto = require('crypto');
    const legacyBatchInvites = await Invitation.find({
      workspaceId: targetWorkspaceId,
      status: 'PENDING',
      isBatch: true,
      'allowedEmails.1': { $exists: true }
    });

    for (const b of legacyBatchInvites) {
      if (Array.isArray(b.allowedEmails)) {
        for (const email of b.allowedEmails) {
          const clean = (email || '').toLowerCase().trim();
          if (!clean || registeredEmails.includes(clean)) continue;
          const exists = await Invitation.findOne({
            workspaceId: targetWorkspaceId,
            email: clean,
            status: 'PENDING',
            isBatch: { $ne: true }
          });
          if (!exists) {
            await Invitation.create({
              email: clean,
              workspaceId: b.workspaceId,
              projectId: b.projectId,
              projectIds: b.projectIds,
              teamId: b.teamId,
              role: b.role,
              token: crypto.randomBytes(32).toString('hex'),
              status: 'PENDING',
              inviterId: b.inviterId,
              expiresAt: b.expiresAt
            });
          }
        }
        b.status = 'ACCEPTED';
        await b.save();
      }
    }

    const inviteQuery = { workspaceId: targetWorkspaceId, status: 'PENDING' };
    if (search && search.trim()) {
      inviteQuery.email = { $regex: search.trim(), $options: 'i' };
    }
    const pendingInvites = await Invitation.find(inviteQuery)
      .populate('projectId', 'name key color')
      .populate('teamId', 'name key color department')
      .populate('inviterId', 'name email avatar')
      .sort({ createdAt: -1 })
      .lean();

    const registeredEmailSet = new Set(registeredEmails);
    pendingInvitesList = [];
    pendingInvites.forEach((inv) => {
      if (inv.isBatch && Array.isArray(inv.allowedEmails) && inv.allowedEmails.length > 0) {
        inv.allowedEmails.forEach((email) => {
          const clean = (email || '').toLowerCase().trim();
          if (!clean || registeredEmailSet.has(clean)) return;
          if (inv.acceptedEmails && inv.acceptedEmails.some((a) => (a.email || '').toLowerCase() === clean)) return;
          pendingInvitesList.push({
            _id: `${inv._id}_${clean}`,
            inviteId: inv._id.toString(),
            name: clean.split('@')[0],
            email: clean,
            role: inv.role || 'MEMBER',
            status: 'INVITED',
            workspaceRole: inv.role || 'MEMBER',
            assignedProjects: inv.projectId ? [{ id: inv.projectId._id, name: inv.projectId.name, key: inv.projectId.key }] : [],
            team: inv.teamId ? { _id: inv.teamId._id, name: inv.teamId.name, key: inv.teamId.key } : null,
            currentWorkspace: {
              _id: workspace._id,
              name: workspace.name,
              slug: workspace.slug
            },
            isPendingInvite: true,
            inviteToken: inv.token,
            invitedBy: inv.inviterId?.name || 'Admin',
            createdAt: inv.createdAt,
            expiresAt: inv.expiresAt
          });
        });
      } else {
        const clean = (inv.email || '').toLowerCase().trim();
        if (clean && !registeredEmailSet.has(clean)) {
          pendingInvitesList.push({
            _id: inv._id.toString(),
            inviteId: inv._id.toString(),
            name: clean.split('@')[0],
            email: clean,
            role: inv.role || 'MEMBER',
            status: 'INVITED',
            workspaceRole: inv.role || 'MEMBER',
            assignedProjects: inv.projectId ? [{ id: inv.projectId._id, name: inv.projectId.name, key: inv.projectId.key }] : [],
            team: inv.teamId ? { _id: inv.teamId._id, name: inv.teamId.name, key: inv.teamId.key } : null,
            currentWorkspace: {
              _id: workspace._id,
              name: workspace.name,
              slug: workspace.slug
            },
            isPendingInvite: true,
            inviteToken: inv.token,
            invitedBy: inv.inviterId?.name || 'Admin',
            createdAt: inv.createdAt,
            expiresAt: inv.expiresAt
          });
        }
      }
    });
  }

  // Combine members and pending invites for backward compatibility
  let allList = [...formattedMembers, ...pendingInvitesList];
  if (role) {
    allList = allList.filter((m) => m.role === role || m.workspaceRole === role);
  }

  res.json({
    success: true,
    data: allList,
    members: formattedMembers,
    pendingInvites: pendingInvitesList,
    pagination: {
      page: 1,
      limit: allList.length,
      total: allList.length,
      pages: 1
    }
  });
});

// @desc    Update user status (Activate/Suspend)
// @route   PATCH /api/v1/admin/users/:userId/status
// @access  Private (SUPER_ADMIN, ORG_ADMIN)
const updateUserStatus = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { status } = req.body;

  if (!Object.values(USER_STATUS).includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid user status' });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  // Prevent self-suspension
  if (user._id.toString() === req.user._id.toString() && status === USER_STATUS.SUSPENDED) {
    return res.status(400).json({ success: false, error: 'You cannot suspend your own account' });
  }

  user.status = status;
  await user.save();

  res.json({
    success: true,
    message: `User status successfully updated to ${status}`,
    data: user
  });
});

// @desc    Update user system role
// @route   PATCH /api/v1/admin/users/:userId/role
// @access  Private (SUPER_ADMIN, ORG_ADMIN)
const updateUserRole = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { role, workspaceId } = req.body;

  if (!Object.values(USER_ROLES).includes(role)) {
    return res.status(400).json({ success: false, error: 'Invalid role' });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  const oldRole = user.role;
  user.role = role;
  await user.save();

  // Also sync role in Workspace members
  const targetWorkspaceId = workspaceId || user.currentWorkspace || req.user.currentWorkspace;
  let targetProjectId = null;

  if (targetWorkspaceId) {
    await Workspace.updateOne(
      { _id: targetWorkspaceId, 'members.userId': user._id },
      { $set: { 'members.$.role': role } }
    );

    // Find any project in the workspace to link to project activity stream
    const firstProject = await Project.findOne({ workspaceId: targetWorkspaceId, isArchived: false });
    if (firstProject) {
      targetProjectId = firstProject._id;
    }
  }

  // Record audit activity so the role change is visible in the Activity History to everyone
  await Activity.create({
    workspaceId: targetWorkspaceId || null,
    projectId: targetProjectId || null,
    userId: req.user._id,
    action: 'ROLE_CHANGED',
    field: 'role',
    oldValue: oldRole,
    newValue: role,
    metadata: {
      targetUserId: user._id,
      targetUserName: user.name,
      targetUserEmail: user.email,
      assignedBy: req.user.name,
      description: `${req.user.name} assigned role '${role}' to ${user.name}`
    }
  });

  res.json({
    success: true,
    message: `User role updated to ${role}`,
    data: user
  });
});

// @desc    Get Organization / Workspace System Statistics
// @route   GET /api/v1/admin/stats
// @access  Private (SUPER_ADMIN, ORG_ADMIN)
const getSystemStats = asyncHandler(async (req, res) => {
  const targetWorkspaceId = req.query.workspaceId || req.user.currentWorkspace;

  if (!targetWorkspaceId) {
    return res.status(400).json({ success: false, error: 'Workspace ID is required' });
  }

  const workspace = await Workspace.findById(targetWorkspaceId);
  if (!workspace) {
    return res.status(404).json({ success: false, error: 'Workspace not found' });
  }

  const isPM = req.user.role === 'PROJECT_MANAGER';
  let projectFilter = { workspaceId: targetWorkspaceId, isArchived: false };
  if (isPM) {
    projectFilter.$or = [
      { leadId: req.user._id },
      { 'members.userId': req.user._id }
    ];
  }

  const projects = await Project.find(projectFilter);
  const projectIds = projects.map((p) => p._id);

  // Count tasks in these projects / workspace
  const taskQuery = isPM
    ? { projectId: { $in: projectIds }, isArchived: false }
    : { $or: [{ workspaceId: targetWorkspaceId }, { projectId: { $in: projectIds } }], isArchived: false };

  const totalTasks = await Task.countDocuments(taskQuery);

  const taskMatchCondition = isPM
    ? { projectId: { $in: projectIds }, isArchived: false }
    : {
        $or: [
          { workspaceId: new mongoose.Types.ObjectId(targetWorkspaceId) },
          { projectId: { $in: projectIds } }
        ],
        isArchived: false
      };

  const taskStatusBreakdown = await Task.aggregate([
    { $match: taskMatchCondition },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);

  // Calculate unique members linked to this workspace and its projects (avoid double-counting owner)
  const memberUserIds = new Set();
  if (workspace.ownerId) {
    memberUserIds.add(workspace.ownerId.toString());
  }
  if (workspace.members && Array.isArray(workspace.members)) {
    workspace.members.forEach((m) => {
      if (m.userId) memberUserIds.add(m.userId.toString());
    });
  }

  // Also include users set to this current workspace
  const workspaceUsers = await User.find({ currentWorkspace: targetWorkspaceId }).select('_id email').lean();
  workspaceUsers.forEach((u) => memberUserIds.add(u._id.toString()));

  const registeredEmails = workspaceUsers.map((u) => (u.email || '').toLowerCase().trim()).filter(Boolean);
  const inviteQuery = {
    workspaceId: targetWorkspaceId,
    status: 'PENDING',
    ...(registeredEmails.length > 0 ? { email: { $nin: registeredEmails } } : {})
  };
  const allPendingDocs = await Invitation.find(inviteQuery).select('isBatch allowedEmails acceptedEmails email').lean();
  let pendingInvitesCount = 0;
  allPendingDocs.forEach((inv) => {
    if (inv.isBatch && Array.isArray(inv.allowedEmails) && inv.allowedEmails.length > 0) {
      inv.allowedEmails.forEach((email) => {
        const clean = (email || '').toLowerCase().trim();
        if (clean && !registeredEmails.includes(clean)) {
          const accepted = inv.acceptedEmails && inv.acceptedEmails.some((a) => (a.email || '').toLowerCase() === clean);
          if (!accepted) pendingInvitesCount++;
        }
      });
    } else {
      const clean = (inv.email || '').toLowerCase().trim();
      if (clean && !registeredEmails.includes(clean)) {
        pendingInvitesCount++;
      }
    }
  });
  const pendingInvites = pendingInvitesCount;

  projects.forEach((p) => {
    if (p.leadId) memberUserIds.add(p.leadId.toString());
    if (p.members && Array.isArray(p.members)) {
      p.members.forEach((pm) => {
        if (pm.userId) memberUserIds.add(pm.userId.toString());
      });
    }
  });

  const userIdsArray = Array.from(memberUserIds);
  const totalMembers = await User.countDocuments({ _id: { $in: userIdsArray } });
  const activeMembers = await User.countDocuments({
    _id: { $in: userIdsArray },
    status: { $ne: 'SUSPENDED' }
  });

  res.json({
    success: true,
    data: {
      totalUsers: totalMembers + pendingInvites,
      activeUsers: activeMembers,
      pendingInvites,
      totalWorkspaces: 1,
      totalProjects: projects.length,
      totalTasks,
      activeSubscriptions: 1,
      taskStatusBreakdown
    }
  });
});

// @desc    Get all workspaces (Admin audit)
// @route   GET /api/v1/admin/workspaces
// @access  Private (SUPER_ADMIN, ORG_ADMIN)
const getAllWorkspaces = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [workspaces, total] = await Promise.all([
    Workspace.find()
      .populate('ownerId', 'name email')
      .populate('subscriptionId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Workspace.countDocuments()
  ]);

  res.json({
    success: true,
    data: workspaces,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

// @desc    Get In-Depth User Details (Teams, Tasks, Overdue, Projects)
// @route   GET /api/v1/admin/users/:userId/details
// @access  Private (SUPER_ADMIN, ORG_ADMIN)
const getUserDetails = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const targetWorkspaceId = req.query.workspaceId || req.user.currentWorkspace;

  const user = await User.findById(userId).lean();
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  // 1. Projects where user is lead or member
  const projects = await Project.find({
    workspaceId: targetWorkspaceId,
    isArchived: false,
    $or: [{ leadId: userId }, { 'members.userId': userId }]
  }).lean();

  const assignedProjects = projects.map((p) => {
    const isLead = p.leadId && p.leadId.toString() === userId.toString();
    const memberEntry = (p.members || []).find(
      (m) => m.userId && m.userId.toString() === userId.toString()
    );
    return {
      _id: p._id,
      name: p.name,
      key: p.key,
      color: p.color || '#1E3E62',
      role: isLead ? 'Project Lead' : memberEntry?.role || 'MEMBER',
      isLead
    };
  });

  // 2. Teams where user is member or lead
  const Team = require('../models/Team');
  const workspaceTeams = await Team.find({
    workspaceId: targetWorkspaceId,
    isArchived: false,
    $or: [{ members: userId }, { leadId: userId }]
  }).lean();

  const teamsList = [];
  const teamIdSet = new Set();

  workspaceTeams.forEach((t) => {
    teamIdSet.add(t._id.toString());
    teamsList.push({
      _id: t._id,
      name: t.name,
      key: t.key,
      color: t.color || '#2563EB',
      icon: t.icon || '👥',
      department: t.department || 'General',
      isLead: t.leadId && t.leadId.toString() === userId.toString(),
      type: 'Workspace Team',
      membersCount: (t.members || []).length
    });
  });

  // Also include project-level teams
  const allWorkspaceProjects = await Project.find({
    workspaceId: targetWorkspaceId,
    isArchived: false
  }).lean();

  allWorkspaceProjects.forEach((proj) => {
    if (proj.teams && Array.isArray(proj.teams)) {
      proj.teams.forEach((pt) => {
        const isMem = (pt.members || []).some(
          (m) => m && m.toString() === userId.toString()
        );
        const isLead = pt.leadId && pt.leadId.toString() === userId.toString();
        if (isMem || isLead) {
          const key = `proj_${proj._id}_${pt._id || pt.name}`;
          if (!teamIdSet.has(key)) {
            teamIdSet.add(key);
            teamsList.push({
              _id: pt._id || key,
              name: pt.name,
              key: pt.key || proj.key,
              color: pt.color || '#3B82F6',
              icon: pt.icon || '👥',
              department: proj.name,
              isLead,
              type: `Project: ${proj.name}`,
              membersCount: (pt.members || []).length
            });
          }
        }
      });
    }
  });

  // 3. Tasks assigned to this user
  const now = new Date();
  const assignedTasks = await Task.find({
    workspaceId: targetWorkspaceId,
    assigneeId: userId,
    isArchived: false
  })
    .populate('projectId', 'name key color')
    .sort({ dueDate: 1, createdAt: -1 })
    .lean();

  const totalTasks = assignedTasks.length;
  let completedCount = 0;
  let inProgressCount = 0;
  let todoCount = 0;
  let inReviewCount = 0;
  const overdueTasks = [];

  assignedTasks.forEach((task) => {
    const isDone = ['DONE', 'COMPLETED', 'RESOLVED', 'CLOSED'].includes(
      task.status?.toUpperCase()
    );
    if (isDone) {
      completedCount++;
    } else {
      if (['IN_PROGRESS', 'IN PROGRESS'].includes(task.status?.toUpperCase())) {
        inProgressCount++;
      } else if (
        ['IN_REVIEW', 'TESTING', 'REVIEW'].includes(task.status?.toUpperCase())
      ) {
        inReviewCount++;
      } else {
        todoCount++;
      }

      // Check if overdue
      if (task.dueDate && new Date(task.dueDate) < now) {
        const diffDays = Math.ceil(
          (now - new Date(task.dueDate)) / (1000 * 60 * 60 * 24)
        );
        overdueTasks.push({
          _id: task._id,
          key: task.key,
          title: task.title,
          priority: task.priority,
          status: task.status,
          dueDate: task.dueDate,
          daysOverdue: diffDays,
          project: task.projectId
            ? { name: task.projectId.name, key: task.projectId.key }
            : null
        });
      }
    }
  });

  const completionRate =
    totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

  // Recent 10 tasks for quick reference
  const recentTasks = assignedTasks.slice(0, 10).map((t) => ({
    _id: t._id,
    key: t.key,
    title: t.title,
    priority: t.priority,
    status: t.status,
    dueDate: t.dueDate,
    isOverdue:
      t.dueDate &&
      new Date(t.dueDate) < now &&
      !['DONE', 'COMPLETED'].includes(t.status?.toUpperCase()),
    project: t.projectId
      ? { name: t.projectId.name, key: t.projectId.key }
      : null
  }));

  res.json({
    success: true,
    data: {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        jobTitle: user.jobTitle || 'Team Member',
        department: user.department || 'Engineering',
        avatar: user.avatar,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt
      },
      assignedProjects,
      teams: teamsList,
      taskMetrics: {
        totalTasks,
        completedCount,
        inProgressCount,
        todoCount,
        inReviewCount,
        overdueCount: overdueTasks.length,
        completionRate
      },
      overdueTasks,
      recentTasks
    }
  });
});

module.exports = {
  getAllUsers,
  getUserDetails,
  updateUserStatus,
  updateUserRole,
  getSystemStats,
  getAllWorkspaces
};


