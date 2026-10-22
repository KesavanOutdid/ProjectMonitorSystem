const express = require('express');
const router = express.Router();
const { getTaskComments, addComment } = require('../controllers/commentController');
const { protect } = require('../middlewares/auth');

router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Comments
 *   description: Task comments and collaborative discussions
 */

/**
 * @swagger
 * /api/v1/tasks/{taskId}/comments:
 *   get:
 *     summary: Get all comments for a task
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of comments
 *   post:
 *     summary: Post a comment on a task
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       201:
 *         description: Comment created
 */
router.route('/:taskId/comments')
  .get(getTaskComments)
  .post(addComment);

module.exports = router;
