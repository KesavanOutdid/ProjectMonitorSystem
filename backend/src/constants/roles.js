const USER_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ORG_ADMIN: 'ORG_ADMIN',
  PROJECT_MANAGER: 'PROJECT_MANAGER',
  TEAM_LEAD: 'TEAM_LEAD',
  DEVELOPER: 'DEVELOPER',
  HARDWARE: 'HARDWARE',
  FIRMWARE: 'FIRMWARE',
  PCB_DESIGNER: 'PCB_DESIGNER',
  QA: 'QA',
  CLOUD: 'CLOUD',
  DESIGNER: 'DESIGNER',
  MEMBER: 'MEMBER',
  GUEST: 'GUEST'
};

const USER_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  SUSPENDED: 'SUSPENDED',
  INVITED: 'INVITED'
};

const ISSUE_TYPES = {
  TASK: 'TASK',
  BUG: 'BUG',
  STORY: 'STORY',
  EPIC: 'EPIC',
  SUBTASK: 'SUBTASK'
};

const ISSUE_PRIORITY = {
  LOWEST: 'LOWEST',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT'
};

const ISSUE_STATUS = {
  BACKLOG: 'BACKLOG',
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  IN_REVIEW: 'IN_REVIEW',
  DONE: 'DONE'
};

const SUBSCRIPTION_PLANS = {
  FREE: 'FREE',
  STARTER: 'STARTER',
  PRO: 'PRO',
  ENTERPRISE: 'ENTERPRISE'
};

const PLAN_LIMITS = {
  FREE: {
    maxProjects: 3,
    maxMembers: 5,
    maxStorageMB: 500,
    allowCustomFields: false,
    allowS3Export: false
  },
  STARTER: {
    maxProjects: 10,
    maxMembers: 20,
    maxStorageMB: 5000,
    allowCustomFields: true,
    allowS3Export: false
  },
  PRO: {
    maxProjects: 50,
    maxMembers: 100,
    maxStorageMB: 50000,
    allowCustomFields: true,
    allowS3Export: true
  },
  ENTERPRISE: {
    maxProjects: 999999,
    maxMembers: 999999,
    maxStorageMB: 1000000,
    allowCustomFields: true,
    allowS3Export: true
  }
};

module.exports = {
  USER_ROLES,
  USER_STATUS,
  ISSUE_TYPES,
  ISSUE_PRIORITY,
  ISSUE_STATUS,
  SUBSCRIPTION_PLANS,
  PLAN_LIMITS
};
