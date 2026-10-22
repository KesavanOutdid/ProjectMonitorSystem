require('dotenv').config({ path: __dirname + '/../../.env' });
const mongoose = require('mongoose');
const dns = require('dns');

try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (e) {}

const User = require('../models/User');
const Workspace = require('../models/Workspace');
const Subscription = require('../models/Subscription');
const Project = require('../models/Project');
const Team = require('../models/Team');
const Task = require('../models/Task');
const Activity = require('../models/Activity');
const Comment = require('../models/Comment');
const Sprint = require('../models/Sprint');
const Role = require('../models/Role');
const Invitation = require('../models/Invitation');
const Otp = require('../models/Otp');
const { USER_ROLES, USER_STATUS, SUBSCRIPTION_PLANS, PLAN_LIMITS } = require('../constants/roles');
const {
  CONFIGURABLE_MODULES,
  getDefaultAdminPermissions,
  getDefaultPMPermissions,
  getDefaultLeadPermissions,
  getDefaultMemberPermissions
} = require('../constants/permissions');

const seedData = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/project_monitor_system';
    console.log(`[Seed] Connecting to MongoDB: ${mongoUri}...`);
    await mongoose.connect(mongoUri);

    console.log('[Seed] Wiping all existing collections for clean state...');
    await Promise.all([
      User.deleteMany({}),
      Workspace.deleteMany({}),
      Subscription.deleteMany({}),
      Project.deleteMany({}),
      Team.deleteMany({}),
      Task.deleteMany({}),
      Activity.deleteMany({}),
      Comment.deleteMany({}),
      Sprint.deleteMany({}),
      Role.deleteMany({}),
      Invitation.deleteMany({}),
      Otp.deleteMany({})
    ]);

    console.log('[Seed] Creating Organization Admin user (org@sscorp.com)...');
    const orgAdmin = await User.create({
      name: 'SSCorp Admin',
      email: 'org@sscorp.com',
      password: 'Test@123',
      role: USER_ROLES.ORG_ADMIN,
      status: USER_STATUS.ACTIVE,
      jobTitle: 'Organization Administrator',
      department: 'Management'
    });

    console.log('[Seed] Creating Organization Workspace (SS Corp)...');
    const workspace = await Workspace.create({
      name: 'SS Corp',
      slug: 'ss-corp',
      ownerId: orgAdmin._id,
      createdBy: orgAdmin._id,
      description: 'Primary corporate organization workspace',
      members: [
        {
          userId: orgAdmin._id,
          role: 'ORG_ADMIN'
        }
      ]
    });

    console.log('[Seed] Setting up Enterprise Subscription...');
    const subscription = await Subscription.create({
      workspaceId: workspace._id,
      planType: SUBSCRIPTION_PLANS.ENTERPRISE,
      limits: PLAN_LIMITS.ENTERPRISE
    });

    workspace.subscriptionId = subscription._id;
    await workspace.save();

    orgAdmin.currentWorkspace = workspace._id;
    await orgAdmin.save();

    console.log('[Seed] Creating Organization Default Roles & Permission Matrices (Levels 1-4)...');
    const adminRole = await Role.create({
      name: 'Organization Admin',
      key: 'ORG_ADMIN',
      level: 1,
      description: 'Full administrative access across all tabs, modules, members, and settings',
      workspaceId: workspace._id,
      isSystemRole: true,
      permissions: getDefaultAdminPermissions(),
      createdBy: orgAdmin._id
    });

    const pmRole = await Role.create({
      name: 'Project Manager',
      key: 'PROJECT_MANAGER',
      level: 2,
      description: 'Project governance, space management, cross-functional team creation, and sprints',
      workspaceId: workspace._id,
      isSystemRole: true,
      permissions: getDefaultPMPermissions(),
      createdBy: orgAdmin._id
    });

    const leadRole = await Role.create({
      name: 'Team Lead',
      key: 'TEAM_LEAD',
      level: 3,
      description: 'Team leadership, workflow stage management, task reviews, and assignments',
      workspaceId: workspace._id,
      isSystemRole: true,
      permissions: getDefaultLeadPermissions(),
      createdBy: orgAdmin._id
    });

    const memberRole = await Role.create({
      name: 'Member',
      key: 'MEMBER',
      level: 4,
      description: 'Standard contributor with access to work boards, backlog, and tasks',
      workspaceId: workspace._id,
      isSystemRole: true,
      permissions: getDefaultMemberPermissions(),
      createdBy: orgAdmin._id
    });

    // Link the admin member's customRoleId to adminRole
    workspace.members[0].customRoleId = adminRole._id;

    console.log('[Seed] Creating 2 Project Managers...');
    const pmUsers = await User.create([
      {
        name: 'Alex Morgan',
        email: 'alex.pm@sscorp.com',
        password: 'Test@123',
        role: USER_ROLES.PROJECT_MANAGER,
        status: USER_STATUS.ACTIVE,
        jobTitle: 'Senior Project Manager',
        department: 'Product',
        currentWorkspace: workspace._id
      },
      {
        name: 'Sarah Connor',
        email: 'sarah.pm@sscorp.com',
        password: 'Test@123',
        role: USER_ROLES.PROJECT_MANAGER,
        status: USER_STATUS.ACTIVE,
        jobTitle: 'Technical Project Manager',
        department: 'Engineering',
        currentWorkspace: workspace._id
      }
    ]);

    for (const pm of pmUsers) {
      workspace.members.push({
        userId: pm._id,
        role: 'PROJECT_MANAGER',
        customRoleId: pmRole._id
      });
    }

    console.log('[Seed] Creating 20 Normal Members...');
    const memberData = [
      { name: 'David Miller', email: 'david.miller@sscorp.com', jobTitle: 'Hardware Engineer', department: 'Hardware' },
      { name: 'Emma Watson', email: 'emma.watson@sscorp.com', jobTitle: 'Embedded Systems Engineer', department: 'Firmware' },
      { name: 'Lucas Vance', email: 'lucas.vance@sscorp.com', jobTitle: 'PCB Design Specialist', department: 'PCB Design' },
      { name: 'Chloe Bennett', email: 'chloe.bennett@sscorp.com', jobTitle: 'Senior Backend Developer', department: 'Engineering' },
      { name: 'Marcus Brody', email: 'marcus.brody@sscorp.com', jobTitle: 'Full Stack Developer', department: 'Engineering' },
      { name: 'Sophia Patel', email: 'sophia.patel@sscorp.com', jobTitle: 'Firmware Engineer', department: 'Firmware' },
      { name: 'James Wilson', email: 'james.wilson@sscorp.com', jobTitle: 'Hardware Test Engineer', department: 'Hardware' },
      { name: 'Olivia Taylor', email: 'olivia.taylor@sscorp.com', jobTitle: 'QA Automation Engineer', department: 'Quality Assurance (QA)' },
      { name: 'Daniel Craig', email: 'daniel.craig@sscorp.com', jobTitle: 'DevOps & Cloud Architect', department: 'Engineering' },
      { name: 'Aria Montgomery', email: 'aria.montgomery@sscorp.com', jobTitle: 'UI/UX Product Designer', department: 'Design & UI/UX' },
      { name: 'Ethan Hunt', email: 'ethan.hunt@sscorp.com', jobTitle: 'Security & Firmware Analyst', department: 'Firmware' },
      { name: 'Maya Lin', email: 'maya.lin@sscorp.com', jobTitle: 'Frontend React Developer', department: 'Engineering' },
      { name: 'Noah Centineo', email: 'noah.centineo@sscorp.com', jobTitle: 'Hardware Assembly Specialist', department: 'Hardware' },
      { name: 'Isabella Rossi', email: 'isabella.rossi@sscorp.com', jobTitle: 'Quality Control Analyst', department: 'Quality Assurance (QA)' },
      { name: 'Liam Neeson', email: 'liam.neeson@sscorp.com', jobTitle: 'Systems Integration Engineer', department: 'Engineering' },
      { name: 'Ava DuVernay', email: 'ava.duvernay@sscorp.com', jobTitle: 'Product Designer', department: 'Design & UI/UX' },
      { name: 'Benjamin Franklin', email: 'benjamin.franklin@sscorp.com', jobTitle: 'Electrical Engineer', department: 'Hardware' },
      { name: 'Harper Lee', email: 'harper.lee@sscorp.com', jobTitle: 'Technical Documentation & QA', department: 'Quality Assurance (QA)' },
      { name: 'Sebastian Stan', email: 'sebastian.stan@sscorp.com', jobTitle: 'Microcontroller Engineer', department: 'Firmware' },
      { name: 'Zendaya Coleman', email: 'zendaya.coleman@sscorp.com', jobTitle: 'API & Cloud Platform Engineer', department: 'Engineering' }
    ];

    const teamLeadEmails = [
      'david.miller@sscorp.com',
      'emma.watson@sscorp.com',
      'chloe.bennett@sscorp.com',
      'olivia.taylor@sscorp.com'
    ];

    const normalMembers = await User.create(
      memberData.map((m) => {
        const isLead = teamLeadEmails.includes(m.email);
        return {
          ...m,
          password: 'Test@123',
          role: isLead ? USER_ROLES.TEAM_LEAD : USER_ROLES.MEMBER,
          status: USER_STATUS.ACTIVE,
          currentWorkspace: workspace._id
        };
      })
    );

    for (const mem of normalMembers) {
      const isLead = teamLeadEmails.includes(mem.email);
      workspace.members.push({
        userId: mem._id,
        role: isLead ? 'TEAM_LEAD' : 'MEMBER',
        customRoleId: isLead ? leadRole._id : memberRole._id
      });
    }

    await workspace.save();

    console.log('[Seed] Creating starter Organization Teams with assigned Team Leads...');
    await Team.create([
      {
        name: 'Hardware Engineering',
        key: 'HE',
        description: 'Physical hardware, board schematics, and mechanical components',
        color: '#2563EB',
        department: 'Hardware',
        workspaceId: workspace._id,
        leadId: normalMembers[0]._id, // David Miller (TEAM_LEAD)
        members: [normalMembers[0]._id, normalMembers[2]._id, normalMembers[6]._id, normalMembers[12]._id, normalMembers[16]._id],
        createdBy: orgAdmin._id
      },
      {
        name: 'Firmware Development',
        key: 'FD',
        description: 'Low-level device drivers, embedded software, and RTOS',
        color: '#7C3AED',
        department: 'Firmware',
        workspaceId: workspace._id,
        leadId: normalMembers[1]._id, // Emma Watson (TEAM_LEAD)
        members: [normalMembers[1]._id, normalMembers[5]._id, normalMembers[10]._id, normalMembers[18]._id],
        createdBy: orgAdmin._id
      },
      {
        name: 'Cloud Platform & API',
        key: 'CPA',
        description: 'Scalable backend microservices, real-time sync, and data pipelines',
        color: '#059669',
        department: 'Engineering',
        workspaceId: workspace._id,
        leadId: normalMembers[3]._id, // Chloe Bennett (TEAM_LEAD)
        members: [normalMembers[3]._id, normalMembers[4]._id, normalMembers[8]._id, normalMembers[11]._id, normalMembers[19]._id],
        createdBy: orgAdmin._id
      },
      {
        name: 'Quality Assurance & Testing',
        key: 'QAT',
        description: 'Automated regressions, acceptance criteria, and reliability testing',
        color: '#D97706',
        department: 'Quality Assurance (QA)',
        workspaceId: workspace._id,
        leadId: normalMembers[7]._id, // Olivia Taylor (TEAM_LEAD)
        members: [normalMembers[7]._id, normalMembers[13]._id, normalMembers[17]._id],
        createdBy: orgAdmin._id
      }
    ]);

    console.log(`
============================================================
✅ Database Cleaned & Seeded Successfully!
============================================================
🏢 Organization: SS Corp (${workspace._id})
👤 Admin:        org@sscorp.com (Test@123)

👑 Project Managers (2 Created):
   1. Alex Morgan    <alex.pm@sscorp.com> (Test@123)
   2. Sarah Connor   <sarah.pm@sscorp.com> (Test@123)

⭐ Team Leads (4 Created, Role: TEAM_LEAD, Password: Test@123):
   1. David Miller   <david.miller@sscorp.com> (Hardware Engineering Lead)
   2. Emma Watson    <emma.watson@sscorp.com>  (Firmware Development Lead)
   3. Chloe Bennett  <chloe.bennett@sscorp.com> (Cloud Platform & API Lead)
   4. Olivia Taylor  <olivia.taylor@sscorp.com> (QA & Testing Lead)

👥 Members (16 Standard Contributors, Password: Test@123):
   - Lucas Vance          (PCB Design)
   - Marcus Brody         (Engineering)
   - Sophia Patel         (Firmware)
   - James Wilson         (Hardware)
   - Daniel Craig         (Engineering)
   - Aria Montgomery      (Design & UI/UX)
   - Ethan Hunt           (Firmware)
   - Maya Lin             (Engineering)
   - Noah Centineo        (Hardware)
   - Isabella Rossi       (Quality Assurance)
   - Liam Neeson          (Engineering)
   - Ava DuVernay         (Design & UI/UX)
   - Benjamin Franklin    (Hardware)
   - Harper Lee           (Quality Assurance)
   - Sebastian Stan       (Firmware)
   - Zendaya Coleman      (Engineering)

🏢 Teams Created with Assigned Leads:
   - Hardware Engineering (HE) -> Lead: David Miller
   - Firmware Development (FD) -> Lead: Emma Watson
   - Cloud Platform & API (CPA) -> Lead: Chloe Bennett
   - Quality Assurance & Testing (QAT) -> Lead: Olivia Taylor
============================================================
    `);

    process.exit(0);
  } catch (error) {
    console.error(`[Seed Error] ${error.message}`);
    process.exit(1);
  }
};

seedData();
