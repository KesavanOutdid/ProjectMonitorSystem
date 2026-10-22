const Comment = require('../models/Comment');
const Task = require('../models/Task');
const Activity = require('../models/Activity');
const asyncHandler = require('../middlewares/asyncHandler');

// @desc    Get comments for a task
// @route   GET /api/v1/tasks/:taskId/comments
// @access  Private
const getTaskComments = asyncHandler(async (req, res) => {
  const { taskId } = req.params;

  const comments = await Comment.find({ taskId })
    .populate('userId', 'name email avatar')
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    data: comments
  });
});

// @desc    Add comment to a task
// @route   POST /api/v1/tasks/:taskId/comments
// @access  Private
const addComment = asyncHandler(async (req, res) => {
  const { taskId } = req.params;
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ success: false, error: 'Comment content cannot be empty' });
  }

  const task = await Task.findById(taskId);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }

  // Permission check: Level 5 cannot comment, Level 4 can only comment on their assigned task
  const Project = require('../models/Project');
  const { getEffectiveUserLevel } = require('../middlewares/rbac');
  let userLevel = 5;
  try {
    userLevel = await getEffectiveUserLevel(req.user, req);
  } catch (_) {}

  const isLevel1 = req.user.role === 'SUPER_ADMIN' || req.user.role === 'ORG_ADMIN' || userLevel === 1;
  const isGuest = req.user.role === 'GUEST' || req.user.role === 'VIEWER' || userLevel >= 5;

  if (isGuest) {
    return res.status(403).json({ success: false, error: 'Guests have read-only access and cannot comment' });
  }

  if (!isLevel1) {
    const project = await Project.findById(task.projectId);
    const isPM = (project?.leadId && (project.leadId._id || project.leadId).toString() === req.user._id.toString()) ||
      req.user.role === 'PROJECT_MANAGER' || userLevel === 2;
    const isTeamLead = req.user.role === 'TEAM_LEAD' || userLevel === 3;

    if (!isPM && !isTeamLead) {
      // Level 4 member: can only comment on their own assigned task
      const isAssignee = task.assigneeId && (task.assigneeId._id || task.assigneeId).toString() === req.user._id.toString();
      if (!isAssignee) {
        return res.status(403).json({
          success: false,
          error: 'Members can only comment on tasks assigned to them'
        });
      }
    }
  }

  const comment = await Comment.create({
    taskId,
    userId: req.user._id,
    content: content.trim()
  });

  await Activity.create({
    taskId,
    projectId: task.projectId,
    userId: req.user._id,
    action: 'COMMENT_ADDED',
    newValue: content.trim().slice(0, 100)
  });

  const populatedComment = await Comment.findById(comment._id).populate('userId', 'name email avatar');

  res.status(201).json({
    success: true,
    data: populatedComment
  });
});

module.exports = {
  getTaskComments,
  addComment
};
