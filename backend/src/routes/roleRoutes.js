const express = require('express');
const router = express.Router();
const {
  getRoles,
  createRole,
  updateRole,
  deleteRole,
  getConfigurableModules,
  getRolePermissions,
  updateRolePermissions,
  getMyPermissions
} = require('../controllers/roleController');
const { protect } = require('../middlewares/auth');

// All role and permission management requires user authentication
router.use(protect);

// My effective permissions for current workspace
router.get('/my-permissions', getMyPermissions);

// Configurable modules list
router.get('/permissions/modules', getConfigurableModules);

// Role CRUD
router.get('/roles', getRoles);
router.post('/roles', createRole);
router.put('/roles/:roleId', updateRole);
router.delete('/roles/:roleId', deleteRole);

// Role Permissions
router.get('/roles/:roleId/permissions', getRolePermissions);
router.post('/roles/:roleId/permissions', updateRolePermissions);

module.exports = router;
