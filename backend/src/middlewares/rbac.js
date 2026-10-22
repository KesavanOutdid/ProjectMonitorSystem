const { USER_ROLES } = require('../constants/roles');
const Workspace = require('../models/Workspace');
const Role = require('../models/Role');
const Project = require('../models/Project');

const ROLE_LEVEL_MAP = {
  [USER_ROLES.SUPER_ADMIN]: 1,
  [USER_ROLES.ORG_ADMIN]: 1,
  [USER_ROLES.PROJECT_MANAGER]: 2,
  [USER_ROLES.TEAM_LEAD]: 3,
  [USER_ROLES.MEMBER]: 4,
  [USER_ROLES.VIEWER]: 5,
  ORG_ADMIN: 1,
  SUPER_ADMIN: 1,
  PROJECT_MANAGER: 2,
  TEAM_LEAD: 3,
  MEMBER: 4,
  VIEWER: 5
};

/**
 * Resolve effective hierarchy level (1: Org Admin/CEO, 2: PM/Director, 3: Team Lead, 4: Member, 5: Viewer)
 */
const getEffectiveUserLevel = async (user, req) => {
  if (!user) return 5;
  if (user.role === USER_ROLES.SUPER_ADMIN || user.role === USER_ROLES.ORG_ADMIN) return 1;

  let workspaceId = req.query.workspaceId || req.body.workspaceId || req.headers['x-workspace-id'] || user.currentWorkspace;

  if (!workspaceId && req.params.projectId) {
    try {
      const proj = await Project.findById(req.params.projectId).select('workspaceId');
      if (proj) workspaceId = proj.workspaceId;
    } catch (_) {}
  }

  if (workspaceId) {
    try {
      const workspace = await Workspace.findById(workspaceId).select('ownerId members');
      if (workspace) {
        if (workspace.ownerId && workspace.ownerId.toString() === user._id.toString()) {
          return 1;
        }
        if (workspace.members) {
          const member = workspace.members.find(
            (m) => m.userId && m.userId.toString() === user._id.toString()
          );
          if (member) {
            if (member.customRoleId) {
              const roleDoc = await Role.findById(member.customRoleId).select('level');
              if (roleDoc && typeof roleDoc.level === 'number') {
                return roleDoc.level;
              }
            }
            if (member.role && ROLE_LEVEL_MAP[member.role]) {
              return ROLE_LEVEL_MAP[member.role];
            }
          }
        }
      }
    } catch (_) {}
  }

  return ROLE_LEVEL_MAP[user.role] || 4;
};

/**
 * Restrict route access to specific system roles or hierarchy levels
 * @param  {...(string|number)} allowedRolesOrLevels 
 */
const authorize = (...allowedRolesOrLevels) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'User is not authenticated' });
    }

    // Direct string role match bypass (e.g. SUPER_ADMIN)
    if (allowedRolesOrLevels.includes(req.user.role)) {
      req.userLevel = ROLE_LEVEL_MAP[req.user.role] || 1;
      return next();
    }

    // Calculate maximum allowed level
    let maxAllowedLevel = 0;
    for (const item of allowedRolesOrLevels) {
      if (typeof item === 'number') {
        if (item > maxAllowedLevel) maxAllowedLevel = item;
      } else if (typeof item === 'string' && ROLE_LEVEL_MAP[item]) {
        if (ROLE_LEVEL_MAP[item] > maxAllowedLevel) {
          maxAllowedLevel = ROLE_LEVEL_MAP[item];
        }
      }
    }

    // Default to level 1 if no valid level was parsed
    if (maxAllowedLevel === 0) {
      maxAllowedLevel = 1;
    }

    const userLevel = await getEffectiveUserLevel(req.user, req);
    req.userLevel = userLevel;

    if (userLevel <= maxAllowedLevel) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: `Access denied. Requires Hierarchy Level ${maxAllowedLevel} or higher (Your Level: ${userLevel})`
    });
  };
};

/**
 * Authorize route by maximum allowed hierarchy level (e.g. authorizeLevel(2) allows Level 1 & Level 2)
 */
const authorizeLevel = (maxLevel = 1) => {
  return authorize(maxLevel);
};

module.exports = { authorize, authorizeLevel, getEffectiveUserLevel };

