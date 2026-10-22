const Task = require('../models/Task');
const Project = require('../models/Project');
const Request = require('../models/Request');
const Team = require('../models/Team');
const Workspace = require('../models/Workspace');
const asyncHandler = require('../middlewares/asyncHandler');
const CacheService = require('../services/cacheService');
const { emitToProject, emitGlobal } = require('../config/socket');

/**
 * Helper to compute remaining retention days
 */
const getDaysRemaining = (purgeAt) => {
  if (!purgeAt) return 30;
  const diffMs = new Date(purgeAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
};

/**
 * @desc    Get all recycled/soft-deleted items in workspace
 * @route   GET /api/v1/recycle-bin
 * @access  Private (Org Admin, Project Manager)
 */
const getRecycleBinItems = asyncHandler(async (req, res) => {
  const workspaceId = req.query.workspaceId || req.user.currentWorkspace;
  const requestedType = (req.query.type || 'ALL').toUpperCase();

  if (!workspaceId) {
    return res.status(400).json({ success: false, error: 'Workspace ID is required' });
  }

  const isOrgAdmin = req.user.role === 'SUPER_ADMIN' || req.user.role === 'ORG_ADMIN';
  const isPM = req.user.role === 'PROJECT_MANAGER';
  const isLead = req.user.role === 'TEAM_LEAD';

  // Identify accessible projects for Project Managers
  let pmProjectIds = [];
  if (isPM) {
    const accessibleProjects = await Project.find({
      workspaceId,
      $or: [{ leadId: req.user._id }, { 'members.userId': req.user._id }]
    }).select('_id');
    pmProjectIds = accessibleProjects.map((p) => p._id);
  }

  // Identify accessible teams for Team Leads
  let leadTeamIds = [];
  if (isLead) {
    const accessibleTeams = await Team.find({
      workspaceId,
      leadId: req.user._id
    }).select('_id');
    leadTeamIds = accessibleTeams.map((t) => t._id);
  }

  const items = [];

  // 1. Fetch Deleted Tasks (Scoping: Admin = All, PM = Assigned Projects or self, Lead = Assigned Team or self, Member = Self only)
  if (requestedType === 'ALL' || requestedType === 'TASK') {
    const taskFilter = { workspaceId, isDeleted: true };
    if (isOrgAdmin) {
      // Sees all tasks in the workspace
    } else if (isPM) {
      taskFilter.$or = [
        { projectId: { $in: pmProjectIds } },
        { deletedBy: req.user._id }
      ];
    } else if (isLead) {
      taskFilter.$or = [
        { teamId: { $in: leadTeamIds } },
        { deletedBy: req.user._id }
      ];
    } else {
      taskFilter.deletedBy = req.user._id;
    }

    const tasks = await Task.find(taskFilter)
      .populate('projectId', 'name key color')
      .populate('deletedBy', 'name email avatar')
      .sort({ deletedAt: -1 })
      .lean();

    tasks.forEach((t) => {
      items.push({
        _id: t._id,
        type: 'TASK',
        itemType: 'TASK',
        title: t.title,
        key: t.key,
        color: t.projectId?.color || '#2563EB',
        priority: t.priority,
        status: t.status,
        project: t.projectId
          ? { _id: t.projectId._id, name: t.projectId.name, key: t.projectId.key, color: t.projectId.color }
          : null,
        context: {
          projectId: t.projectId?._id,
          projectName: t.projectId?.name,
          cascadeFrom: t.deleteContext?.cascadeFrom
        },
        deletedAt: t.deletedAt || t.updatedAt,
        purgeAt: t.purgeAt,
        daysRemaining: getDaysRemaining(t.purgeAt),
        deletedBy: t.deletedBy
          ? { _id: t.deletedBy._id, name: t.deletedBy.name, email: t.deletedBy.email }
          : null
      });
    });
  }

  // 2. Fetch Deleted Projects / Spaces (Only Org Admins and PMs can view deleted spaces; members NEVER see spaces)
  if ((requestedType === 'ALL' || requestedType === 'PROJECT') && (isOrgAdmin || isPM)) {
    const projectFilter = { workspaceId, isDeleted: true };
    if (!isOrgAdmin && isPM) {
      projectFilter.$or = [{ leadId: req.user._id }, { deletedBy: req.user._id }];
    }

    const projects = await Project.find(projectFilter)
      .populate('deletedBy', 'name email avatar')
      .sort({ deletedAt: -1 })
      .lean();

    projects.forEach((p) => {
      items.push({
        _id: p._id,
        type: 'PROJECT',
        itemType: 'PROJECT',
        title: p.name,
        key: p.key,
        color: p.color || '#1E3E62',
        context: {
          projectId: p._id,
          projectName: p.name
        },
        deletedAt: p.deletedAt || p.updatedAt,
        purgeAt: p.purgeAt,
        daysRemaining: getDaysRemaining(p.purgeAt),
        deletedBy: p.deletedBy
          ? { _id: p.deletedBy._id, name: p.deletedBy.name, email: p.deletedBy.email }
          : null
      });
    });
  }

  // 3. Fetch Deleted Requests (Admin = All, PM = Assigned Projects or self, Member/Lead = Self only)
  if (requestedType === 'ALL' || requestedType === 'REQUEST') {
    const requestFilter = { workspaceId, isDeleted: true };
    if (!isOrgAdmin && isPM) {
      requestFilter.$or = [
        { projectId: { $in: pmProjectIds } },
        { deletedBy: req.user._id }
      ];
    } else if (!isOrgAdmin) {
      requestFilter.deletedBy = req.user._id;
    }

    const requests = await Request.find(requestFilter)
      .populate('projectId', 'name key color')
      .populate('deletedBy', 'name email avatar')
      .sort({ deletedAt: -1 })
      .lean();

    requests.forEach((r) => {
      items.push({
        _id: r._id,
        type: 'REQUEST',
        itemType: 'REQUEST',
        title: r.title,
        key: r.key,
        color: '#6366F1',
        priority: r.priority,
        status: r.requestStatus,
        project: r.projectId
          ? { _id: r.projectId._id, name: r.projectId.name, key: r.projectId.key, color: r.projectId.color }
          : null,
        context: {
          projectId: r.projectId?._id,
          projectName: r.projectId?.name,
          cascadeFrom: r.deleteContext?.cascadeFrom
        },
        deletedAt: r.deletedAt || r.updatedAt,
        purgeAt: r.purgeAt,
        daysRemaining: getDaysRemaining(r.purgeAt),
        deletedBy: r.deletedBy
          ? { _id: r.deletedBy._id, name: r.deletedBy.name, email: r.deletedBy.email }
          : null
      });
    });
  }

  // 4. Fetch Deleted Teams (STRICTLY Org Admins only! PMs and Members NEVER see deleted teams)
  if ((requestedType === 'ALL' || requestedType === 'TEAM') && isOrgAdmin) {
    const teamFilter = { workspaceId, isDeleted: true };

    const teams = await Team.find(teamFilter)
      .populate('deletedBy', 'name email avatar')
      .sort({ deletedAt: -1 })
      .lean();

    teams.forEach((tm) => {
      items.push({
        _id: tm._id,
        type: 'TEAM',
        itemType: 'TEAM',
        title: tm.name,
        key: tm.key,
        color: tm.color || '#2563EB',
        department: tm.department,
        deletedAt: tm.deletedAt || tm.updatedAt,
        purgeAt: tm.purgeAt,
        daysRemaining: getDaysRemaining(tm.purgeAt),
        deletedBy: tm.deletedBy
          ? { _id: tm.deletedBy._id, name: tm.deletedBy.name, email: tm.deletedBy.email }
          : null
      });
    });
  }

  // Sort unified items newest deletion first
  items.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());

  res.json({
    success: true,
    count: items.length,
    data: items
  });
});

/**
 * @desc    Restore an item from recycle bin back to active state
 * @route   POST /api/v1/recycle-bin/:type/:id/restore or POST /api/v1/recycle-bin/restore
 * @access  Private (Scoped per role)
 */
const restoreRecycleBinItem = asyncHandler(async (req, res) => {
  const rawType = req.params.type || req.params.itemType || req.body.itemType || req.body.type || '';
  const itemId = req.params.id || req.params.itemId || req.body.itemId || req.body.id;
  const itemType = String(rawType).toUpperCase();

  if (!itemType || !itemId) {
    return res.status(400).json({ success: false, error: 'itemType and itemId are required' });
  }

  const isOrgAdmin = req.user.role === 'SUPER_ADMIN' || req.user.role === 'ORG_ADMIN';
  const isPM = req.user.role === 'PROJECT_MANAGER';
  const isLead = req.user.role === 'TEAM_LEAD';

  switch (itemType) {
    case 'TASK': {
      const task = await Task.findById(itemId);
      if (!task) return res.status(404).json({ success: false, error: 'Task not found' });

      // Permission check for task restoration
      if (!isOrgAdmin) {
        let allowed = false;
        if (task.deletedBy && task.deletedBy.toString() === req.user._id.toString()) {
          allowed = true;
        } else if (isPM) {
          const pmProject = await Project.findOne({
            _id: task.projectId,
            $or: [{ leadId: req.user._id }, { 'members.userId': req.user._id }]
          });
          if (pmProject) allowed = true;
        } else if (isLead && task.teamId) {
          const isLeadOfTeam = await Team.findOne({ _id: task.teamId, leadId: req.user._id });
          if (isLeadOfTeam) allowed = true;
        }

        if (!allowed) {
          return res.status(403).json({
            success: false,
            error: 'Permission denied: You can only restore tasks that you deleted or manage.'
          });
        }
      }

      await Task.updateOne(
        { _id: task._id },
        {
          $set: {
            isDeleted: false,
            isArchived: false,
            deletedAt: null,
            deletedBy: null,
            purgeAt: null,
            deleteContext: {}
          }
        }
      );

      // If parent project is soft-deleted, restore the project space too
      if (task.projectId) {
        await Project.updateOne(
          { _id: task.projectId, isDeleted: true },
          {
            $set: {
              isDeleted: false,
              isArchived: false,
              deletedAt: null,
              deletedBy: null,
              purgeAt: null
            }
          }
        );
        await CacheService.invalidateProject(task.projectId);
      }

      await CacheService.invalidateProject(task.projectId);
      await CacheService.invalidatePattern(`kanban:${task.projectId}*`);

      // Emit real-time broadcasts for other open tabs and users
      emitToProject(task.projectId, 'task:restored', { taskId: task._id, projectId: task.projectId });
      emitGlobal('task:restored', { taskId: task._id, projectId: task.projectId, workspaceId: task.workspaceId });
      emitGlobal('recycle-bin:changed', { action: 'RESTORE', itemType: 'TASK', itemId: task._id, workspaceId: task.workspaceId });

      return res.json({ success: true, message: `Task [${task.key}] restored successfully!` });
    }

    case 'PROJECT': {
      const project = await Project.findById(itemId);
      if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

      // Permission check for space restoration: Strictly Admins & Project Leads only
      if (!isOrgAdmin) {
        const isLeadOrOwner =
          (project.leadId && project.leadId.toString() === req.user._id.toString()) ||
          (project.deletedBy && project.deletedBy.toString() === req.user._id.toString());
        if (!isPM || !isLeadOrOwner) {
          return res.status(403).json({
            success: false,
            error: 'Permission denied: Only Organization Admins and Project Leads can restore project spaces.'
          });
        }
      }

      await Project.updateOne(
        { _id: project._id },
        {
          $set: {
            isDeleted: false,
            isArchived: false,
            deletedAt: null,
            deletedBy: null,
            purgeAt: null
          }
        }
      );

      // Restore all soft-deleted child tasks belonging to this project
      await Task.updateMany(
        { projectId: project._id, isDeleted: true },
        {
          $set: {
            isDeleted: false,
            isArchived: false,
            deletedAt: null,
            deletedBy: null,
            purgeAt: null,
            deleteContext: {}
          }
        }
      );

      // Restore all soft-deleted requests belonging to this project
      await Request.updateMany(
        { projectId: project._id, isDeleted: true },
        {
          $set: {
            isDeleted: false,
            isArchived: false,
            deletedAt: null,
            deletedBy: null,
            purgeAt: null,
            deleteContext: {}
          }
        }
      );

      await CacheService.invalidateProject(project._id);
      await CacheService.invalidatePattern(`kanban:${project._id}*`);

      // Emit real-time broadcasts
      emitGlobal('project:restored', { projectId: project._id, workspaceId: project.workspaceId });
      emitGlobal('recycle-bin:changed', { action: 'RESTORE', itemType: 'PROJECT', itemId: project._id, workspaceId: project.workspaceId });

      return res.json({ success: true, message: `Project Space '${project.name}' and all associated tasks restored successfully!` });
    }

    case 'REQUEST': {
      const request = await Request.findById(itemId);
      if (!request) return res.status(404).json({ success: false, error: 'Request not found' });

      if (!isOrgAdmin) {
        const isOwner = request.deletedBy && request.deletedBy.toString() === req.user._id.toString();
        if (!isOwner) {
          return res.status(403).json({
            success: false,
            error: 'Permission denied: You can only restore requests that you deleted.'
          });
        }
      }

      await Request.updateOne(
        { _id: request._id },
        {
          $set: {
            isDeleted: false,
            isArchived: false,
            deletedAt: null,
            deletedBy: null,
            purgeAt: null,
            deleteContext: {}
          }
        }
      );

      emitGlobal('recycle-bin:changed', { action: 'RESTORE', itemType: 'REQUEST', itemId: request._id, workspaceId: request.workspaceId });

      return res.json({ success: true, message: `Request [${request.key}] restored successfully!` });
    }

    case 'TEAM': {
      const team = await Team.findById(itemId);
      if (!team) return res.status(404).json({ success: false, error: 'Team not found' });

      if (!isOrgAdmin) {
        return res.status(403).json({
          success: false,
          error: 'Permission denied: Only Organization Admins can restore teams.'
        });
      }

      await Team.updateOne(
        { _id: team._id },
        {
          $set: {
            isDeleted: false,
            isArchived: false,
            deletedAt: null,
            deletedBy: null,
            purgeAt: null
          }
        }
      );

      emitGlobal('recycle-bin:changed', { action: 'RESTORE', itemType: 'TEAM', itemId: team._id, workspaceId: team.workspaceId });

      return res.json({ success: true, message: `Team '${team.name}' restored successfully!` });
    }

    default:
      return res.status(400).json({ success: false, error: `Unsupported itemType: ${itemType}` });
  }
});

/**
 * @desc    Permanently hard-delete an item before 30 days
 * @route   DELETE /api/v1/recycle-bin/:type/:id/purge
 * @access  Private (Org Admin Only)
 */
const purgeRecycleBinItem = asyncHandler(async (req, res) => {
  const rawType = req.params.type || req.params.itemType || req.body.itemType || req.body.type || '';
  const itemId = req.params.id || req.params.itemId || req.body.itemId || req.body.id;
  const itemType = String(rawType).toUpperCase();

  const isOrgAdmin = req.user.role === 'SUPER_ADMIN' || req.user.role === 'ORG_ADMIN';

  if (!isOrgAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Permission denied: Only Organization Admins can permanently destroy records.'
    });
  }

  if (!itemType || !itemId) {
    return res.status(400).json({ success: false, error: 'itemType and itemId are required' });
  }

  switch (itemType) {
    case 'TASK': {
      await Task.deleteOne({ _id: itemId });
      emitGlobal('recycle-bin:changed', { action: 'PURGE', itemType: 'TASK', itemId, workspaceId: req.user.currentWorkspace });
      return res.json({ success: true, message: 'Task permanently deleted.' });
    }
    case 'PROJECT': {
      await Task.deleteMany({ projectId: itemId });
      await Project.deleteOne({ _id: itemId });
      emitGlobal('recycle-bin:changed', { action: 'PURGE', itemType: 'PROJECT', itemId, workspaceId: req.user.currentWorkspace });
      return res.json({ success: true, message: 'Project and all associated items permanently deleted.' });
    }
    case 'REQUEST': {
      await Request.deleteOne({ _id: itemId });
      emitGlobal('recycle-bin:changed', { action: 'PURGE', itemType: 'REQUEST', itemId, workspaceId: req.user.currentWorkspace });
      return res.json({ success: true, message: 'Request permanently deleted.' });
    }
    case 'TEAM': {
      await Team.deleteOne({ _id: itemId });
      emitGlobal('recycle-bin:changed', { action: 'PURGE', itemType: 'TEAM', itemId, workspaceId: req.user.currentWorkspace });
      return res.json({ success: true, message: 'Team permanently deleted.' });
    }
    default:
      return res.status(400).json({ success: false, error: `Invalid itemType: ${itemType}` });
  }
});

/**
 * @desc    Empty entire recycle bin (Admin only)
 * @route   DELETE /api/v1/recycle-bin/empty or POST /api/v1/recycle-bin/empty
 * @access  Private (Org Admin Only)
 */
const emptyRecycleBin = asyncHandler(async (req, res) => {
  const workspaceId = req.query.workspaceId || req.body.workspaceId || req.user.currentWorkspace;
  const isOrgAdmin = req.user.role === 'SUPER_ADMIN' || req.user.role === 'ORG_ADMIN';

  if (!isOrgAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Permission denied: Only Organization Admins can empty the recycle bin.'
    });
  }

  const filter = { workspaceId, isDeleted: true };

  await Task.deleteMany(filter);
  await Request.deleteMany(filter);
  await Team.deleteMany(filter);

  const deletedProjects = await Project.find(filter).select('_id');
  for (const p of deletedProjects) {
    await Task.deleteMany({ projectId: p._id });
    await Project.deleteOne({ _id: p._id });
  }

  emitGlobal('recycle-bin:changed', { action: 'EMPTY', workspaceId });

  res.json({
    success: true,
    message: 'Recycle bin permanently emptied.'
  });
});

module.exports = {
  getRecycleBinItems,
  restoreRecycleBinItem,
  purgeRecycleBinItem,
  emptyRecycleBin
};
