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
  logWork,
  toggleWatchTask,
  toggleRestrictTask,
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

// Task Links
router.post('/:taskId/links', linkTask);
router.delete('/:taskId/links/:linkId', unlinkTask);

router.route('/:taskId/subtasks')
  .post(addSubtask);

router.route('/:taskId/subtasks/:subtaskId')
  .patch(toggleSubtask)
  .delete(deleteSubtask);

// Microtasks
router.route('/:taskId/subtasks/:subtaskId/microtasks')
  .post(addMicrotask);

router.route('/:taskId/subtasks/:subtaskId/microtasks/:microtaskId')
  .patch(updateMicrotask)
  .put(updateMicrotask)
  .delete(deleteMicrotask);

router.route('/:taskId/worklogs')
  .post(logWork);

router.post('/:taskId/attachments', upload.taskAttachmentUpload.single('file'), uploadAttachment);
router.delete('/:taskId/attachments/:attachmentId', deleteAttachment);

const { getTaskComments, addComment } = require('../controllers/commentController');
router.route('/:taskId/comments')
  .get(getTaskComments)
  .post(addComment);

module.exports = router;