const express = require('express');
const router = express.Router();
const {
  getMyWorkspaces,
  createWorkspace,
  inviteMember,
  switchWorkspace,
  getWorkspaceDashboard,
  getWorkspaceMembers
} = require('../controllers/workspaceController');
const { protect } = require('../middlewares/auth');
const { authorize } = require('../middlewares/rbac');
const { USER_ROLES } = require('../constants/roles');

router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Workspaces
 *   description: Workspace / Organization management
 */

/**
 * @swagger
 * /api/v1/workspaces:
 *   get:
 *     summary: Get all workspaces for the logged in user
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of workspaces
 *   post:
 *     summary: Create a new workspace
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Workspace created
 */
router.route('/')
  .get(getMyWorkspaces)
  .post(
    authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN),
    createWorkspace
  );

/**
 * @swagger
 * /api/v1/workspaces/{workspaceId}/invite:
 *   post:
 *     summary: Invite a user to a workspace
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *               role:
 *                 type: string
 *     responses:
 *       200:
 *         description: Invitation sent
 */
router.post(
  '/:workspaceId/invite',
  authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN, USER_ROLES.PROJECT_MANAGER, USER_ROLES.TEAM_LEAD),
  inviteMember
);

// Dashboard (workspace-level overview)
router.get('/:workspaceId/dashboard', getWorkspaceDashboard);

// Workspace Members
router.get('/:workspaceId/members', getWorkspaceMembers);

/**
 * @swagger
 * /api/v1/workspaces/switch/{workspaceId}:
 *   post:
 *     summary: Switch user's active workspace
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Switched workspace
 */
router.post('/switch/:workspaceId', switchWorkspace);

module.exports = router;
