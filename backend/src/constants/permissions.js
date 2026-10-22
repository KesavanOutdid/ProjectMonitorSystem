const CONFIGURABLE_MODULES = [
  {
    id: 'dashboard',
    name: 'Dashboard',
    description: 'Overview dashboard and high-level project metrics',
    availableActions: ['view']
  },
  {
    id: 'summary',
    name: 'Project Summary',
    description: 'Project details, lead info, and status',
    availableActions: ['view', 'edit']
  },
  {
    id: 'board',
    name: 'Kanban Board',
    description: 'Interactive Kanban board and task workflow stages',
    availableActions: ['view', 'create', 'edit', 'delete']
  },
  {
    id: 'backlog',
    name: 'Backlog & Sprints',
    description: 'Sprint planning and backlog item management',
    availableActions: ['view', 'create', 'edit', 'delete']
  },

  {
    id: 'teams',
    name: 'Teams Progress',
    description: 'Team performance and capacity tracking',
    availableActions: ['view', 'create', 'edit', 'delete']
  },
  {
    id: 'analytics',
    name: 'Analytics & Reports',
    description: 'Velocity, burndown, and team productivity charts',
    availableActions: ['view']
  },
  {
    id: 'docs',
    name: 'Documentation',
    description: 'Project knowledge base and docs',
    availableActions: ['view', 'create', 'edit', 'delete']
  },
  {
    id: 'forms',
    name: 'Forms',
    description: 'Custom intake and submission forms',
    availableActions: ['view', 'create', 'edit', 'delete']
  },
  {
    id: 'requests',
    name: 'Requests & Tickets',
    description: 'Service desk requests and incoming tickets',
    availableActions: ['view', 'create', 'edit', 'delete']
  },
  {
    id: 'admin',
    name: 'Organization Administration',
    description: 'Member management, invitations, and workspace settings',
    availableActions: ['view', 'create', 'edit', 'delete']
  },
  {
    id: 'roles',
    name: 'Roles & Permissions',
    description: 'Manage custom roles and module access',
    availableActions: ['view', 'create', 'edit', 'delete']
  }
];

const getDefaultAdminPermissions = () => {
  return CONFIGURABLE_MODULES.map((m) => ({
    module: m.id,
    view: true,
    create: true,
    edit: true,
    delete: true
  }));
};

const getDefaultPMPermissions = () => {
  return CONFIGURABLE_MODULES.map((m) => ({
    module: m.id,
    view: m.id !== 'roles',
    create: !['roles'].includes(m.id),
    edit: !['roles'].includes(m.id),
    delete: ['board', 'backlog', 'teams', 'docs', 'forms', 'requests'].includes(m.id)
  }));
};

const getDefaultLeadPermissions = () => {
  return CONFIGURABLE_MODULES.map((m) => ({
    module: m.id,
    view: !['admin', 'roles'].includes(m.id),
    create: ['board', 'backlog', 'teams', 'docs', 'forms', 'requests'].includes(m.id),
    edit: ['board', 'backlog', 'teams', 'docs', 'forms', 'requests'].includes(m.id),
    delete: ['board', 'docs'].includes(m.id)
  }));
};

const getDefaultMemberPermissions = () => {
  return CONFIGURABLE_MODULES.map((m) => ({
    module: m.id,
    view: !['admin', 'roles'].includes(m.id),
    create: ['board', 'backlog', 'docs', 'requests'].includes(m.id),
    edit: ['board', 'backlog', 'docs', 'requests'].includes(m.id),
    delete: false
  }));
};

const getDefaultPermissionsForLevel = (level = 4) => {
  switch (Number(level)) {
    case 1:
      return getDefaultAdminPermissions();
    case 2:
      return getDefaultPMPermissions();
    case 3:
      return getDefaultLeadPermissions();
    case 5:
      return CONFIGURABLE_MODULES.map((m) => ({
        module: m.id,
        view: !['admin', 'roles'].includes(m.id),
        create: false,
        edit: false,
        delete: false
      }));
    case 4:
    default:
      return getDefaultMemberPermissions();
  }
};

module.exports = {
  CONFIGURABLE_MODULES,
  getDefaultAdminPermissions,
  getDefaultPMPermissions,
  getDefaultLeadPermissions,
  getDefaultMemberPermissions,
  getDefaultPermissionsForLevel
};
