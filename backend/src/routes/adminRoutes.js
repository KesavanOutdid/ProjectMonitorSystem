const express = require('express');
const router = express.Router();
const {
  getAllUsers,
  getUserDetails,
  updateUserStatus,
  updateUserRole,
  getSystemStats,
  getAllWorkspaces
} = require('../controllers/adminController');
const { protect } = require('../middlewares/auth');
const { authorize } = require('../middlewares/rbac');
const { USER_ROLES } = require('../constants/roles');

// Apply protection to all admin routes
router.use(protect);

router.get(
  '/users/:userId/details',
  authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN, USER_ROLES.PROJECT_MANAGER),
  getUserDetails
);


/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Super Admin system management, user status, roles, and stats
 */

/**
 * @swagger
 * /api/v1/admin/stats:
 *   get:
 *     summary: Get global system statistics (Users, Projects, Tasks, Subscriptions)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System metrics
 */
router.get(
  '/stats',
  authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN, USER_ROLES.PROJECT_MANAGER),
  getSystemStats
);

/**
 * @swagger
 * /api/v1/admin/users:
 *   get:
 *     summary: Get users with search, role, and status filters
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of users with pagination
 */
router.get(
  '/users',
  authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN, USER_ROLES.PROJECT_MANAGER),
  getAllUsers
);

/**
 * @swagger
 * /api/v1/admin/users/{userId}/status:
 *   patch:
 *     summary: Update user status (ACTIVE, SUSPENDED, INACTIVE)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User status updated
 */
router.patch(
  '/users/:userId/status',
  authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN),
  updateUserStatus
);

/**
 * @swagger
 * /api/v1/admin/users/{userId}/role:
 *   patch:
 *     summary: Update user role (SUPER_ADMIN, ORG_ADMIN, MEMBER, etc.)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User role updated
 */
router.patch(
  '/users/:userId/role',
  authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN),
  updateUserRole
);

/**
 * @swagger
 * /api/v1/admin/workspaces:
 *   get:
 *     summary: Audit all workspaces across the system
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Workspace list
 */
router.get(
  '/workspaces',
  authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN),
  getAllWorkspaces
);

module.exports = router;
