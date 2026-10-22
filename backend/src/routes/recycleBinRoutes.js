const express = require('express');
const router = express.Router();
const {
  getRecycleBinItems,
  restoreRecycleBinItem,
  purgeRecycleBinItem,
  emptyRecycleBin
} = require('../controllers/recycleBinController');
const { protect } = require('../middlewares/auth');
const { authorize } = require('../middlewares/rbac');
const { USER_ROLES } = require('../constants/roles');

router.use(protect);

// Retrieve items in the recycle bin (Controller strictly filters by user role and ownership)
router.get(
  '/',
  getRecycleBinItems
);

// Empty entire recycle bin (Restricted to Org Admins)
router.delete(
  '/empty',
  authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN),
  emptyRecycleBin
);
router.post(
  '/empty',
  authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN),
  emptyRecycleBin
);

// Restore an item (supports both body payload and route params, scoped per role in controller)
router.post(
  '/restore',
  restoreRecycleBinItem
);
router.post(
  '/:type/:id/restore',
  restoreRecycleBinItem
);

// Permanently purge an item before 30 days (Restricted to Org Admins)
router.delete(
  '/purge',
  authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN),
  purgeRecycleBinItem
);
router.delete(
  '/:type/:id/purge',
  authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN),
  purgeRecycleBinItem
);

module.exports = router;
