const express = require('express');
const router = express.Router();
const {
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
  toggleWatchTask,
  toggleRestrictTask,
  toggleLockTask,
  uploadAttachment,
  deleteAttachment,
  linkTask,
  unlinkTask,
  deleteTask
} = require('../controllers/taskController');
const { protect } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

router.use(protect);

router.route('/')
  .get(getTasks)
  .post(createTask);

router.get('/kanban', getKanbanTasks);
router.patch('/:taskId/reorder', reorderTask);

router.route('/:taskId')
  .get(getTaskById)
  .put(updateTask)
  .delete(deleteTask);

router.get('/:taskId/activities', getTaskActivities);
router.post('/:taskId/watch', toggleWatchTask);
router.post('/:taskId/restrict', toggleRestrictTask);
router.post('/:taskId/lock', toggleLockTask);

// Task Links
router.post('/:taskId/links', linkTask);
router.delete('/:taskId/links/:linkId', unlinkTask);

router.route('/:taskId/subtasks')
  .post(addSubtask);

router.route('/:taskId/subtasks/:subtaskId')
  .patch(toggleSubtask)
  .delete(deleteSubtask);
router.post('/:taskId/subtasks/:subtaskId/lock', toggleLockTask);

// Mini-tasks (Level 3 - under Subtask)
router.route('/:taskId/subtasks/:subtaskId/minitasks')
  .post(addMinitask);

router.route('/:taskId/subtasks/:subtaskId/minitasks/:minitaskId')
  .patch(updateMinitask)
  .put(updateMinitask)
  .delete(deleteMinitask);
router.post('/:taskId/subtasks/:subtaskId/minitasks/:minitaskId/lock', toggleLockTask);

// Microtasks (Level 4 - under Mini-task)
router.route('/:taskId/subtasks/:subtaskId/minitasks/:minitaskId/microtasks')
  .post(addMicrotask);

router.route('/:taskId/subtasks/:subtaskId/minitasks/:minitaskId/microtasks/:microtaskId')
  .patch(updateMicrotask)
  .put(updateMicrotask)
  .delete(deleteMicrotask);
router.post('/:taskId/subtasks/:subtaskId/minitasks/:minitaskId/microtasks/:microtaskId/lock', toggleLockTask);

router.route('/:taskId/worklogs')
  .post(logWork);

router.post('/:taskId/attachments', upload.taskAttachmentUpload.single('file'), uploadAttachment);
router.delete('/:taskId/attachments/:attachmentId', deleteAttachment);

const { getTaskComments, addComment } = require('../controllers/commentController');
router.route('/:taskId/comments')
  .get(getTaskComments)
  .post(addComment);

module.exports = router;