const Role = require('../models/Role');
const Workspace = require('../models/Workspace');
const User = require('../models/User');
const asyncHandler = require('../middlewares/asyncHandler');
const {
  CONFIGURABLE_MODULES,
  getDefaultAdminPermissions,
  getDefaultPMPermissions,
  getDefaultLeadPermissions,
  getDefaultMemberPermissions,
  getDefaultPermissionsForLevel
} = require('../constants/permissions');

// Helper to resolve and verify workspace access
const resolveWorkspaceAndAuthorize = async (req, allowPM = false) => {
  const workspaceId =
    req.query.workspaceId ||
    req.body.workspaceId ||
    req.headers['x-workspace-id'] ||
    req.user.currentWorkspace;

  if (!workspaceId) {
    const error = new Error('Workspace ID is required');
    error.statusCode = 400;
    throw error;
  }

  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) {
    const error = new Error('Workspace not found');
    error.statusCode = 404;
    throw error;
  }

  const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
  const isOwner = workspace.ownerId && workspace.ownerId.toString() === req.user._id.toString();
  const isOrgAdminUser = req.user.role === 'ORG_ADMIN';
  const isWsAdmin =
    workspace.members &&
    workspace.members.some(
      (m) =>
        m.userId &&
        m.userId.toString() === req.user._id.toString() &&
        (m.role === 'ORG_ADMIN' || m.role === 'SUPER_ADMIN')
    );
  const isPM = req.user.role === 'PROJECT_MANAGER';

  if (!isSuperAdmin && !isOwner && !isOrgAdminUser && !isWsAdmin && !(allowPM && isPM)) {
    const error = new Error('Access denied: Only Organization Admins can manage roles and permissions');
    error.statusCode = 403;
    throw error;
  }

  return workspace;
};

// Helper: Ensure default hierarchical roles exist for a workspace (Level 1, 2, 3, 4)
const ensureDefaultRoles = async (workspaceId, userId) => {
  const defaultRoleTemplates = [
    {
      name: 'Organization Admin',
      key: 'ORG_ADMIN',
      level: 1,
      description: 'Full administrative access across all tabs, modules, members, and settings',
      workspaceId,
      isSystemRole: true,
      permissions: getDefaultAdminPermissions(),
      createdBy: userId
    },
    {
      name: 'Project Manager',
      key: 'PROJECT_MANAGER',
      level: 2,
      description: 'Project governance, space management, cross-functional team creation, and sprints',
      workspaceId,
      isSystemRole: true,
      permissions: getDefaultPMPermissions(),
      createdBy: userId
    },
    {
      name: 'Team Lead',
      key: 'TEAM_LEAD',
      level: 3,
      description: 'Team leadership, workflow stage management, task reviews, and assignments',
      workspaceId,
      isSystemRole: true,
      permissions: getDefaultLeadPermissions(),
      createdBy: userId
    },
    {
      name: 'Member',
      key: 'MEMBER',
      level: 4,
      description: 'Standard contributor with access to boards, backlog, documentation, and tasks',
      workspaceId,
      isSystemRole: true,
      permissions: getDefaultMemberPermissions(),
      createdBy: userId
    },
    {
      name: 'Viewer',
      key: 'VIEWER',
      level: 5,
      description: 'Read-only access across project boards, documentation, and summary',
      workspaceId,
      isSystemRole: true,
      permissions: getDefaultPermissionsForLevel(5),
      createdBy: userId
    }
  ];

  for (const tpl of defaultRoleTemplates) {
    const existing = await Role.findOne({ workspaceId, key: tpl.key, isDeleted: false });
    if (!existing) {
      await Role.create(tpl);
    } else if (!existing.level || existing.level !== tpl.level) {
      existing.level = tpl.level;
      await existing.save();
    }
  }
};

// @desc    List all roles for the active organization/workspace
// @route   GET /api/auth/admin/roles
// @access  Private (Org Admin)
const getRoles = asyncHandler(async (req, res) => {
  const workspace = await resolveWorkspaceAndAuthorize(req, true);
  await ensureDefaultRoles(workspace._id, req.user._id);

  // Populate workspace members with user profile details
  const populatedWorkspace = await Workspace.findById(workspace._id).populate(
    'members.userId',
    'name email avatar'
  );

  const roles = await Role.find({
    workspaceId: workspace._id,
    isDeleted: false
  })
    .populate('createdBy', 'name email avatar')
    .populate('updatedBy', 'name email avatar')
    .sort({ level: 1, isSystemRole: -1, createdAt: 1 });

  // Calculate detailed usedBy members, memberCount, and lastUsedAt for each role
  const rolesWithDetails = roles.map((role) => {
    const assignedUsers = ((populatedWorkspace && populatedWorkspace.members) || [])
      .filter((m) => {
        const customIdMatch = m.customRoleId && m.customRoleId.toString() === role._id.toString();
        const keyMatch = m.role === role.key;
        return customIdMatch || keyMatch;
      })
      .map((m) => {
        const u = m.userId;
        return {
          _id: u?._id || u,
          name: u?.name || 'Member',
          email: u?.email || '',
          avatar: u?.avatar || '',
          joinedAt: m.joinedAt
        };
      });

    let lastUsedAt = role.updatedAt || role.createdAt;
    if (assignedUsers.length > 0) {
      const dates = assignedUsers
        .map((u) => (u.joinedAt ? new Date(u.joinedAt).getTime() : 0))
        .filter((d) => d > 0);
      if (dates.length > 0) {
        lastUsedAt = new Date(Math.max(...dates));
      }
    }

    return {
      ...role.toObject(),
      memberCount: assignedUsers.length,
      usedBy: assignedUsers,
      lastUsedAt
    };
  });

  res.json({
    success: true,
    count: rolesWithDetails.length,
    data: rolesWithDetails
  });
});

// @desc    Create a new custom role for the organization
// @route   POST /api/auth/admin/roles
// @access  Private (Org Admin)
const createRole = asyncHandler(async (req, res) => {
  const workspace = await resolveWorkspaceAndAuthorize(req);
  const { name, key, description, level = 4, permissions } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Role name is required' });
  }

  const formattedKey = (key || name).trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  const numLevel = Math.max(1, Math.min(5, Number(level) || 4));

  const existing = await Role.findOne({
    workspaceId: workspace._id,
    key: formattedKey,
    isDeleted: false
  });

  if (existing) {
    return res.status(400).json({
      success: false,
      error: `A role with identifier '${formattedKey}' already exists in this organization`
    });
  }

  // Format permissions or default to permissions for this level
  let finalPermissions = [];
  if (Array.isArray(permissions) && permissions.length > 0) {
    finalPermissions = permissions.map((p) => ({
      module: p.module,
      view: Boolean(p.view),
      create: Boolean(p.create),
      edit: Boolean(p.edit),
      delete: Boolean(p.delete)
    }));
  } else {
    finalPermissions = getDefaultPermissionsForLevel(numLevel);
  }

  const newRole = await Role.create({
    name: name.trim(),
    key: formattedKey,
    description: description ? description.trim() : '',
    level: numLevel,
    workspaceId: workspace._id,
    isSystemRole: false,
    permissions: finalPermissions,
    createdBy: req.user._id
  });

  res.status(201).json({
    success: true,
    message: 'Role created successfully',
    data: newRole
  });
});

// @desc    Update role details
// @route   PUT /api/auth/admin/roles/:roleId
// @access  Private (Org Admin)
const updateRole = asyncHandler(async (req, res) => {
  const workspace = await resolveWorkspaceAndAuthorize(req);
  const { roleId } = req.params;
  const { name, description, level } = req.body;

  const role = await Role.findOne({
    _id: roleId,
    workspaceId: workspace._id,
    isDeleted: false
  });

  if (!role) {
    return res.status(404).json({ success: false, error: 'Role not found' });
  }

  if (name && name.trim()) role.name = name.trim();
  if (description !== undefined) role.description = description.trim();
  if (level !== undefined && !role.isSystemRole) {
    role.level = Math.max(1, Math.min(5, Number(level) || 4));
  }
  role.updatedBy = req.user._id;
  await role.save();

  res.json({
    success: true,
    message: 'Role updated successfully',
    data: role
  });
});

// @desc    Soft delete a role
// @route   DELETE /api/auth/admin/roles/:roleId
// @access  Private (Org Admin)
const deleteRole = asyncHandler(async (req, res) => {
  const workspace = await resolveWorkspaceAndAuthorize(req);
  const { roleId } = req.params;

  const role = await Role.findOne({
    _id: roleId,
    workspaceId: workspace._id,
    isDeleted: false
  });

  if (!role) {
    return res.status(404).json({ success: false, error: 'Role not found' });
  }

  if (role.isSystemRole && role.key === 'ORG_ADMIN') {
    return res.status(400).json({
      success: false,
      error: 'Cannot delete the primary Organization Admin role'
    });
  }

  // Soft delete
  role.isDeleted = true;
  role.updatedBy = req.user._id;
  await role.save();

  // Reset any members with this custom role back to default 'MEMBER'
  if (workspace.members) {
    let modified = false;
    workspace.members.forEach((m) => {
      if (m.customRoleId && m.customRoleId.toString() === role._id.toString()) {
        m.customRoleId = null;
        m.role = 'MEMBER';
        modified = true;
      }
    });
    if (modified) await workspace.save();
  }

  res.json({
    success: true,
    message: 'Role deleted successfully'
  });
});

// @desc    Get list of all configurable modules & available actions
// @route   GET /api/auth/admin/permissions/modules
// @access  Private (Org Admin)
const getConfigurableModules = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: CONFIGURABLE_MODULES
  });
});

// @desc    Fetch permissions assigned to a role
// @route   GET /api/auth/admin/roles/:roleId/permissions
// @access  Private (Org Admin)
const getRolePermissions = asyncHandler(async (req, res) => {
  const workspace = await resolveWorkspaceAndAuthorize(req);
  const { roleId } = req.params;

  const role = await Role.findOne({
    _id: roleId,
    workspaceId: workspace._id,
    isDeleted: false
  });

  if (!role) {
    return res.status(404).json({ success: false, error: 'Role not found' });
  }

  // Ensure all current modules are represented in the returned permissions
  const existingMap = new Map((role.permissions || []).map((p) => [p.module, p]));
  const fullPermissions = CONFIGURABLE_MODULES.map((mod) => {
    const existing = existingMap.get(mod.id);
    return {
      module: mod.id,
      moduleName: mod.name,
      description: mod.description,
      availableActions: mod.availableActions,
      view: existing ? Boolean(existing.view) : false,
      create: existing ? Boolean(existing.create) : false,
      edit: existing ? Boolean(existing.edit) : false,
      delete: existing ? Boolean(existing.delete) : false
    };
  });

  res.json({
    success: true,
    data: {
      roleId: role._id,
      roleName: role.name,
      roleKey: role.key,
      permissions: fullPermissions
    }
  });
});

// @desc    Bulk update/upsert role permissions
// @route   POST /api/auth/admin/roles/:roleId/permissions
// @access  Private (Org Admin)
const updateRolePermissions = asyncHandler(async (req, res) => {
  const workspace = await resolveWorkspaceAndAuthorize(req);
  const { roleId } = req.params;
  const { permissions } = req.body;

  if (!Array.isArray(permissions)) {
    return res.status(400).json({ success: false, error: 'Permissions must be an array' });
  }

  const role = await Role.findOne({
    _id: roleId,
    workspaceId: workspace._id,
    isDeleted: false
  });

  if (!role) {
    return res.status(404).json({ success: false, error: 'Role not found' });
  }

  // Clean & update permissions
  role.permissions = permissions.map((p) => ({
    module: p.module,
    view: Boolean(p.view),
    create: Boolean(p.create),
    edit: Boolean(p.edit),
    delete: Boolean(p.delete)
  }));

  role.updatedBy = req.user._id;
  await role.save();

  res.json({
    success: true,
    message: 'Role permissions updated successfully',
    data: role
  });
});

// @desc    Get effective permissions for the current user in the active workspace
// @route   GET /api/auth/admin/my-permissions
// @access  Private
const getMyPermissions = asyncHandler(async (req, res) => {
  const workspaceId =
    req.query.workspaceId ||
    req.headers['x-workspace-id'] ||
    req.user.currentWorkspace;

  if (!workspaceId) {
    return res.status(400).json({ success: false, error: 'Workspace ID required' });
  }

  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) {
    return res.status(404).json({ success: false, error: 'Workspace not found' });
  }

  const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
  const isOwner = workspace.ownerId && workspace.ownerId.toString() === req.user._id.toString();
  const isOrgAdminUser = req.user.role === 'ORG_ADMIN';

  // Find member record in this workspace
  const memberRecord = (workspace.members || []).find(
    (m) => m.userId && m.userId.toString() === req.user._id.toString()
  );

  const isWsAdmin = memberRecord && (memberRecord.role === 'ORG_ADMIN' || memberRecord.role === 'SUPER_ADMIN');

  // If user is Org Admin, Workspace Owner, or Super Admin -> full access to everything
  if (isSuperAdmin || isOwner || isOrgAdminUser || isWsAdmin) {
    const fullPermissions = {};
    CONFIGURABLE_MODULES.forEach((m) => {
      fullPermissions[m.id] = { view: true, create: true, edit: true, delete: true };
    });

    return res.json({
      success: true,
      data: {
        roleKey: 'ORG_ADMIN',
        roleName: 'Organization Admin',
        isOrgAdmin: true,
        permissions: fullPermissions
      }
    });
  }

  // If regular member, check if customRoleId is attached or lookup role by key
  let userRoleDoc = null;
  if (memberRecord?.customRoleId) {
    userRoleDoc = await Role.findOne({
      _id: memberRecord.customRoleId,
      workspaceId,
      isDeleted: false
    });
  }

  if (!userRoleDoc && memberRecord?.role) {
    userRoleDoc = await Role.findOne({
      key: memberRecord.role,
      workspaceId,
      isDeleted: false
    });
  }

  const isLevel1 = userRoleDoc && userRoleDoc.level === 1;
  if (isLevel1) {
    const fullPermissions = {};
    CONFIGURABLE_MODULES.forEach((m) => {
      fullPermissions[m.id] = { view: true, create: true, edit: true, delete: true };
    });
    return res.json({
      success: true,
      data: {
        roleKey: userRoleDoc.key,
        roleName: userRoleDoc.name,
        isOrgAdmin: true,
        level: 1,
        permissions: fullPermissions
      }
    });
  }

  const permissionMap = {};
  if (userRoleDoc && Array.isArray(userRoleDoc.permissions)) {
    userRoleDoc.permissions.forEach((p) => {
      permissionMap[p.module] = {
        view: Boolean(p.view),
        create: Boolean(p.create),
        edit: Boolean(p.edit),
        delete: Boolean(p.delete)
      };
    });
  }

  // Ensure defaults for any missing modules
  CONFIGURABLE_MODULES.forEach((m) => {
    if (!permissionMap[m.id]) {
      permissionMap[m.id] = { view: false, create: false, edit: false, delete: false };
    }
  });

  res.json({
    success: true,
    data: {
      roleKey: userRoleDoc ? userRoleDoc.key : (memberRecord?.role || 'MEMBER'),
      roleName: userRoleDoc ? userRoleDoc.name : 'Member',
      isOrgAdmin: false,
      level: userRoleDoc ? (userRoleDoc.level || 4) : 4,
      permissions: permissionMap
    }
  });
});

module.exports = {
  getRoles,
  createRole,
  updateRole,
  deleteRole,
  getConfigurableModules,
  getRolePermissions,
  updateRolePermissions,
  getMyPermissions,
  ensureDefaultRoles
};
