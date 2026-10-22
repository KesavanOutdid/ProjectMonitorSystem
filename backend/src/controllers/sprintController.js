const mongoose = require('mongoose');
const Sprint = require('../models/Sprint');
const Project = require('../models/Project');
const Task = require('../models/Task');
const Workspace = require('../models/Workspace');
const asyncHandler = require('../middlewares/asyncHandler');
const CacheService = require('../services/cacheService');

// @desc    Get all sprints for a project (Auto-creates Sprint 1 if none exist)
// @route   GET /api/v1/projects/:projectId/sprints
// @access  Private
const getSprints = asyncHandler(async (req, res) => {
  const { projectId } = req.params;

  const project = await Project.findById(projectId);
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  let sprints = await Sprint.find({ projectId })
    .populate('history.changedBy', 'name email avatar')
    .populate('createdBy', 'name email avatar')
    .populate('updatedBy', 'name email avatar')
    .sort({ createdAt: 1 });

  // Auto-initialize Sprint 1 if project has no sprints yet
  if (sprints.length === 0) {
    const startDate = new Date();
    const endDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const defaultSprint = await Sprint.create({
      name: 'Sprint 1',
      goal: 'Initial sprint and core deliverables',
      status: 'ACTIVE',
      projectId,
      workspaceId: project.workspaceId,
      startDate,
      endDate,
      createdBy: req.user._id,
      history: [
        {
          changedBy: req.user._id,
          action: 'CREATED',
          newStartDate: startDate,
          newEndDate: endDate,
          reason: 'Initial sprint cycle created',
          createdAt: new Date()
        }
      ]
    });
    sprints = [defaultSprint];
  }

  // Calculate task statistics for each sprint
  const sprintsWithStats = await Promise.all(
    sprints.map(async (sprint) => {
      const tasks = await Task.find({
        projectId,
        $or: [
          { sprintId: sprint._id },
          { sprint: sprint.name }
        ],
        isArchived: false
      }).select('status storyPoints priority');

      const totalTasks = tasks.length;
      const completedTasks = tasks.filter((t) => t.status === 'DONE').length;
      const inProgressTasks = tasks.filter((t) => ['IN_PROGRESS', 'IN_REVIEW'].includes(t.status)).length;
      const todoTasks = tasks.filter((t) => ['TODO', 'BACKLOG'].includes(t.status)).length;

      return {
        ...sprint.toObject(),
        stats: {
          totalTasks,
          completedTasks,
          inProgressTasks,
          todoTasks,
          percentComplete: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
        }
      };
    })
  );

  res.json({
    success: true,
    count: sprintsWithStats.length,
    data: sprintsWithStats
  });
});

// @desc    Create a new Sprint
// @route   POST /api/v1/projects/:projectId/sprints
// @access  Private
const createSprint = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { name, goal, startDate, endDate, status } = req.body;

  const project = await Project.findById(projectId);
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  // Count existing sprints to auto-name if not provided
  const sprintCount = await Sprint.countDocuments({ projectId });
  const sprintName = name && name.trim() ? name.trim() : `Sprint ${sprintCount + 1}`;

  const start = startDate ? new Date(startDate) : new Date();
  const end = endDate ? new Date(endDate) : new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);

  const sprint = await Sprint.create({
    name: sprintName,
    goal: goal || '',
    status: status || 'PLANNED',
    projectId,
    workspaceId: project.workspaceId,
    startDate: start,
    endDate: end,
    createdBy: req.user._id,
    history: [
      {
        changedBy: req.user._id,
        action: 'CREATED',
        newStartDate: start,
        newEndDate: end,
        reason: 'Sprint created',
        createdAt: new Date()
      }
    ]
  });

  await CacheService.invalidatePattern(`kanban:${projectId}*`);

  res.status(201).json({
    success: true,
    message: `Sprint '${sprint.name}' created successfully`,
    data: sprint
  });
});

// @desc    Start/Activate a Sprint
// @route   PATCH /api/v1/projects/:projectId/sprints/:sprintId/start
// @access  Private
const startSprint = asyncHandler(async (req, res) => {
  const { projectId, sprintId } = req.params;

  const sprint = await Sprint.findOne({ _id: sprintId, projectId });
  if (!sprint) {
    return res.status(404).json({ success: false, error: 'Sprint not found' });
  }

  const prevStart = sprint.startDate;
  const prevEnd = sprint.endDate;

  sprint.status = 'ACTIVE';
  sprint.updatedBy = req.user._id;
  if (req.body.startDate) {
    sprint.startDate = new Date(req.body.startDate);
  }
  if (req.body.endDate) {
    sprint.endDate = new Date(req.body.endDate);
  }

  if (!sprint.history) sprint.history = [];
  sprint.history.push({
    changedBy: req.user._id,
    action: 'STARTED',
    previousStartDate: prevStart,
    newStartDate: sprint.startDate,
    previousEndDate: prevEnd,
    newEndDate: sprint.endDate,
    reason: 'Sprint started / activated',
    createdAt: new Date()
  });

  await sprint.save();

  await CacheService.invalidatePattern(`kanban:${projectId}*`);

  res.json({
    success: true,
    message: `Sprint '${sprint.name}' is now active!`,
    data: sprint
  });
});

// @desc    Complete a Sprint and optionally move incomplete tasks to another sprint or backlog
// @route   PATCH /api/v1/projects/:projectId/sprints/:sprintId/complete
// @access  Private
const completeSprint = asyncHandler(async (req, res) => {
  const { projectId, sprintId } = req.params;
  const { moveToSprintId } = req.body;

  const sprint = await Sprint.findOne({ _id: sprintId, projectId });
  if (!sprint) {
    return res.status(404).json({ success: false, error: 'Sprint not found' });
  }

  sprint.status = 'COMPLETED';
  sprint.completedAt = new Date();
  sprint.updatedBy = req.user._id;

  if (!sprint.history) sprint.history = [];
  sprint.history.push({
    changedBy: req.user._id,
    action: 'COMPLETED',
    previousStartDate: sprint.startDate,
    newStartDate: sprint.startDate,
    previousEndDate: sprint.endDate,
    newEndDate: sprint.endDate,
    reason: 'Sprint completed',
    createdAt: new Date()
  });

  await sprint.save();

  // Handle incomplete tasks
  let movedCount = 0;
  if (moveToSprintId) {
    const targetSprint = await Sprint.findOne({ _id: moveToSprintId, projectId });
    if (targetSprint) {
      const updateResult = await Task.updateMany(
        {
          projectId,
          $or: [{ sprintId: sprint._id }, { sprint: sprint.name }],
          status: { $ne: 'DONE' },
          isArchived: false
        },
        {
          $set: {
            sprintId: targetSprint._id,
            sprint: targetSprint.name
          }
        }
      );
      movedCount = updateResult.modifiedCount || 0;
    }
  }

  await CacheService.invalidatePattern(`kanban:${projectId}*`);
  await CacheService.invalidatePattern(`tasks:${projectId}*`);

  res.json({
    success: true,
    message: `Sprint '${sprint.name}' completed! ${movedCount} incomplete tasks moved to next sprint.`,
    data: sprint
  });
});

// @desc    Update Sprint details (Date extensions, goals, names with audit history)
// @route   PUT /api/v1/projects/:projectId/sprints/:sprintId
// @access  Private
const updateSprint = asyncHandler(async (req, res) => {
  const { projectId, sprintId } = req.params;
  const { name, goal, startDate, endDate, status, reason } = req.body;

  const sprint = await Sprint.findOne({ _id: sprintId, projectId });
  if (!sprint) {
    return res.status(404).json({ success: false, error: 'Sprint not found' });
  }

  const prevStart = sprint.startDate;
  const prevEnd = sprint.endDate;
  const prevName = sprint.name;
  let dateChanged = false;
  let nameChanged = false;
  let daysExt = 0;

  if (name && name.trim() && name.trim() !== prevName) {
    nameChanged = true;
    sprint.name = name.trim();
  }
  if (goal !== undefined) sprint.goal = goal;
  if (status) sprint.status = status;
  sprint.updatedBy = req.user._id;

  if (startDate && new Date(startDate).getTime() !== new Date(prevStart).getTime()) {
    dateChanged = true;
    sprint.startDate = new Date(startDate);
  }
  if (endDate && new Date(endDate).getTime() !== new Date(prevEnd).getTime()) {
    dateChanged = true;
    const newEndMs = new Date(endDate).getTime();
    const oldEndMs = new Date(prevEnd).getTime();
    daysExt = Math.round((newEndMs - oldEndMs) / (1000 * 60 * 60 * 24));
    sprint.endDate = new Date(endDate);
  }

  if (dateChanged) {
    if (!sprint.history) sprint.history = [];
    sprint.history.push({
      changedBy: req.user._id,
      action: daysExt > 0 ? 'EXTENDED' : 'DATES_UPDATED',
      previousStartDate: prevStart,
      newStartDate: sprint.startDate,
      previousEndDate: prevEnd,
      newEndDate: sprint.endDate,
      daysExtended: daysExt,
      reason: reason || (daysExt > 0 ? `Sprint extended by ${daysExt} days` : 'Sprint schedule adjusted'),
      createdAt: new Date()
    });
  }

  await sprint.save();

  // Cascade sprint name update to all tasks linked to this sprint
  if (nameChanged) {
    await Task.updateMany(
      { sprintId: sprint._id },
      { $set: { sprint: sprint.name } }
    );
  }

  await CacheService.invalidatePattern(`kanban:${projectId}*`);
  await CacheService.invalidatePattern(`tasks:${projectId}*`);
  await CacheService.invalidatePattern('workspace-dashboard:*');

  const populatedSprint = await Sprint.findById(sprint._id)
    .populate('history.changedBy', 'name email avatar')
    .populate('createdBy', 'name email avatar')
    .populate('updatedBy', 'name email avatar');

  res.json({
    success: true,
    message: dateChanged && daysExt > 0 ? `Sprint extended by ${daysExt} days` : 'Sprint updated successfully',
    data: populatedSprint
  });
});

// @desc    Get Sprint Burndown chart metrics
// @route   GET /api/v1/projects/:projectId/sprints/:sprintId/burndown
// @access  Private
const getSprintBurndown = asyncHandler(async (req, res) => {
  const { projectId, sprintId } = req.params;
  const { team, assigneeId } = req.query;

  const sprint = await Sprint.findOne({ _id: sprintId, projectId });
  if (!sprint) {
    return res.status(404).json({ success: false, error: 'Sprint not found' });
  }

  const query = {
    projectId,
    $or: [{ sprintId: sprint._id }, { sprint: sprint.name }],
    isArchived: false
  };

  if (team && team !== 'ALL') {
    query.team = new RegExp(`^${team}$`, 'i');
  }
  if (assigneeId && assigneeId !== 'ALL') {
    query.assigneeId = assigneeId;
  }

  const tasks = await Task.find(query).select('status updatedAt createdAt title key storyPoints priority issueType assigneeId team');

  const totalTasks = tasks.length;
  const completedTasksCount = tasks.filter(t => t.status === 'DONE').length;

  const start = new Date(sprint.startDate || sprint.createdAt || Date.now() - 7 * 86400000);
  const end = new Date(sprint.endDate || Date.now() + 7 * 86400000);
  
  // Calculate total number of days
  const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  const today = new Date();
  
  const timeline = [];
  const idealDailyBurn = totalTasks / totalDays;

  for (let i = 0; i <= totalDays; i++) {
    const currentDate = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    const dateStr = currentDate.toISOString().split('T')[0];
    const idealRemaining = Math.max(0, Math.round((totalTasks - (idealDailyBurn * i)) * 10) / 10);
    
    // Calculate actual remaining up to this date
    let actualRemaining = null;
    if (currentDate <= today || i === 0) {
      const completedUpToDate = tasks.filter((t) => {
        if (t.status !== 'DONE') return false;
        const compDate = new Date(t.updatedAt || t.createdAt);
        return compDate <= currentDate;
      });
      actualRemaining = Math.max(0, totalTasks - completedUpToDate.length);
    }

    timeline.push({
      day: `Day ${i + 1}`,
      date: dateStr,
      ideal: idealRemaining,
      actual: actualRemaining
    });
  }

  res.json({
    success: true,
    data: {
      sprintName: sprint.name,
      totalTasks,
      completedTasks: completedTasksCount,
      startDate: start,
      endDate: end,
      timeline
    }
  });
});

// @desc    Get Project Velocity metrics
// @route   GET /api/v1/projects/:projectId/velocity
// @access  Private
const getProjectVelocity = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { team, assigneeId } = req.query;

  const sprints = await Sprint.find({ projectId }).sort({ createdAt: 1 });
  const velocityData = await Promise.all(
    sprints.map(async (sprint) => {
      const query = {
        projectId,
        $or: [{ sprintId: sprint._id }, { sprint: sprint.name }],
        isArchived: false
      };

      if (team && team !== 'ALL') {
        query.team = new RegExp(`^${team}$`, 'i');
      }
      if (assigneeId && assigneeId !== 'ALL') {
        query.assigneeId = assigneeId;
      }

      const tasks = await Task.find(query).select('status storyPoints');

      const committed = tasks.length;
      const completed = tasks.filter((t) => t.status === 'DONE').length;

      return {
        sprintId: sprint._id,
        name: sprint.name,
        status: sprint.status,
        committed,
        completed
      };
    })
  );

  const completedSprints = velocityData.filter((v) => v.status === 'COMPLETED');
  const avgVelocity = completedSprints.length > 0
    ? Math.round(completedSprints.reduce((sum, v) => sum + v.completed, 0) / completedSprints.length)
    : velocityData.length > 0
      ? Math.round(velocityData.reduce((sum, v) => sum + v.completed, 0) / velocityData.length)
      : 0;

  res.json({
    success: true,
    data: {
      averageVelocity: avgVelocity,
      sprints: velocityData
    }
  });
});

module.exports = {
  getSprints,
  createSprint,
  startSprint,
  completeSprint,
  updateSprint,
  getSprintBurndown,
  getProjectVelocity
};