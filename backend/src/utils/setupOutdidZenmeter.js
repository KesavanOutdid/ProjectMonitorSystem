const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');

const User = require('../models/User');
const Workspace = require('../models/Workspace');
const Project = require('../models/Project');
const Sprint = require('../models/Sprint');
const Task = require('../models/Task');
const Activity = require('../models/Activity');
const Comment = require('../models/Comment');
const Subscription = require('../models/Subscription');
const Role = require('../models/Role');
const Team = require('../models/Team');
const { USER_ROLES, USER_STATUS, SUBSCRIPTION_PLANS, PLAN_LIMITS } = require('../constants/roles');

const setupOutdidZenmeter = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    console.log(`[Setup] Connecting to MongoDB: ${mongoUri}...`);
    await mongoose.connect(mongoUri);

    // 1. Locate Outdid Workspace
    const workspace = await Workspace.findOne({
      $or: [{ slug: 'outdid-unified-pvt-ltd-2953' }, { name: /Outdid/i }]
    });

    if (!workspace) {
      throw new Error("Workspace 'Outdid Unified PVT LTD' not found!");
    }

    console.log(`[Setup] Found Workspace: ${workspace.name} (${workspace._id})`);

    // 2. Clear all Projects, Tasks, Sprints, Activities, and Teams in Outdid Workspace
    console.log('[Setup] Finding projects to delete in Outdid workspace...');
    const existingProjects = await Project.find({ workspaceId: workspace._id });
    const projectIds = existingProjects.map((p) => p._id);

    console.log(`[Setup] Clearing ${projectIds.length} projects and all associated tasks/sprints/comments/activities...`);
    await Task.deleteMany({
      $or: [{ workspaceId: workspace._id }, { projectId: { $in: projectIds } }]
    });
    await Sprint.deleteMany({
      $or: [{ workspaceId: workspace._id }, { projectId: { $in: projectIds } }]
    });
    await Activity.deleteMany({
      $or: [{ workspaceId: workspace._id }, { projectId: { $in: projectIds } }]
    });
    await Comment.deleteMany({
      $or: [{ workspaceId: workspace._id }, { projectId: { $in: projectIds } }]
    });
    await Project.deleteMany({ workspaceId: workspace._id });

    console.log('[Setup] Clearing existing teams in Outdid workspace...');
    await Team.deleteMany({ workspaceId: workspace._id });

    // 3. Ensure Enterprise Subscription so all members and projects have full capacity
    if (workspace.subscriptionId) {
      await Subscription.findByIdAndUpdate(workspace.subscriptionId, {
        planType: SUBSCRIPTION_PLANS.ENTERPRISE,
        limits: PLAN_LIMITS.ENTERPRISE,
        status: 'ACTIVE'
      });
      console.log('[Setup] Upgraded Outdid subscription to ENTERPRISE plan limits.');
    }

    // 4. Fetch Workspace Custom Roles
    const roles = await Role.find({ workspaceId: workspace._id });
    const roleMap = {};
    for (const r of roles) {
      roleMap[r.key] = r._id;
    }
    console.log('[Setup] Found workspace roles:', Object.keys(roleMap));

    // 5. Define the 16 Zenmeter Users
    const usersSpec = [
      {
        sNo: 1,
        teamName: 'Hardware',
        teamKey: 'HW',
        roleTitle: 'Org admin/ Hardware Team Lead',
        systemRole: USER_ROLES.ORG_ADMIN,
        customRoleKey: 'ORG_ADMIN',
        name: 'Sam Chelladurai',
        email: 'sam.c@zenmeter.in',
        password: 'Pass@123',
        jobTitle: 'Org Admin / Hardware Team Lead',
        department: 'Hardware',
        isLead: true
      },
      {
        sNo: 2,
        teamName: 'Hardware',
        teamKey: 'HW',
        roleTitle: 'Engineer',
        systemRole: USER_ROLES.MEMBER,
        customRoleKey: 'MEMBER',
        name: 'Albha Bertish',
        email: 'albha.b@zenmeter.in',
        password: 'Pass@123',
        jobTitle: 'Hardware Engineer',
        department: 'Hardware',
        isLead: false
      },
      {
        sNo: 3,
        teamName: 'Hardware',
        teamKey: 'HW',
        roleTitle: 'Engineer',
        systemRole: USER_ROLES.MEMBER,
        customRoleKey: 'MEMBER',
        name: 'Siva Pragash',
        email: 'sivapragash.s@zenmeter.in',
        password: 'Pass@123',
        jobTitle: 'Hardware Engineer',
        department: 'Hardware',
        isLead: false
      },
      {
        sNo: 4,
        teamName: 'Lab Assistant',
        teamKey: 'LAB',
        roleTitle: 'Lab Assistant',
        systemRole: USER_ROLES.MEMBER,
        customRoleKey: 'MEMBER',
        name: 'Abhinand Sathyan PK',
        email: 'lab@zenmeter.in',
        password: 'Pass@123',
        jobTitle: 'Lab Assistant',
        department: 'Lab Assistant',
        isLead: true
      },
      {
        sNo: 5,
        teamName: 'PCB',
        teamKey: 'PCB',
        roleTitle: 'Team Lead',
        systemRole: USER_ROLES.TEAM_LEAD,
        customRoleKey: 'TEAM_LEAD',
        name: 'Mohan',
        email: 'pcb.cad@zenmeter.in',
        password: 'Pass@123',
        jobTitle: 'PCB Team Lead',
        department: 'PCB',
        isLead: true
      },
      {
        sNo: 6,
        teamName: 'Mechanical',
        teamKey: 'MECH',
        roleTitle: 'Team Lead',
        systemRole: USER_ROLES.TEAM_LEAD,
        customRoleKey: 'TEAM_LEAD',
        name: 'Tamil Arasu K',
        email: 'mech.cad@zenmeter.in',
        password: 'Pass@123',
        jobTitle: 'Mechanical Team Lead',
        department: 'Mechanical',
        isLead: true
      },
      {
        sNo: 7,
        teamName: 'Software',
        teamKey: 'SW',
        roleTitle: 'Team Lead',
        systemRole: USER_ROLES.TEAM_LEAD,
        customRoleKey: 'TEAM_LEAD',
        name: 'Kesavan D',
        email: 'kesavan.d@zenmeter.in',
        password: 'Pass@123',
        jobTitle: 'Software Team Lead',
        department: 'Software',
        isLead: true
      },
      {
        sNo: 8,
        teamName: 'Software',
        teamKey: 'SW',
        roleTitle: 'Engineer',
        systemRole: USER_ROLES.MEMBER,
        customRoleKey: 'MEMBER',
        name: 'Poovarasan S',
        email: 'poovarasan.s@zenmeter.in',
        password: 'Pass@123',
        jobTitle: 'Software Engineer',
        department: 'Software',
        isLead: false
      },
      {
        sNo: 9,
        teamName: 'Firmware',
        teamKey: 'FW',
        roleTitle: 'Project Manager / Firmware Team Lead',
        systemRole: USER_ROLES.PROJECT_MANAGER,
        customRoleKey: 'PROJECT_MANAGER',
        name: 'Kalaivanan Subramanian',
        email: 'kalaivanan.subramanian@zenmeter.in',
        password: 'Pass@123',
        jobTitle: 'Project Manager / Firmware Team Lead',
        department: 'Firmware',
        isLead: true
      },
      {
        sNo: 10,
        teamName: 'Firmware',
        teamKey: 'FW',
        roleTitle: 'Engineer',
        systemRole: USER_ROLES.MEMBER,
        customRoleKey: 'MEMBER',
        name: 'Vivek Pandurangan',
        email: 'vivek.p@zenmeter.in',
        password: 'Pass@123',
        jobTitle: 'Firmware Engineer',
        department: 'Firmware',
        isLead: false
      },
      {
        sNo: 11,
        teamName: 'Firmware',
        teamKey: 'FW',
        roleTitle: 'Engineer',
        systemRole: USER_ROLES.MEMBER,
        customRoleKey: 'MEMBER',
        name: 'Dhanushkumar S',
        email: 'dhanushkumar.s@zenmeter.in',
        password: 'Pass@123',
        jobTitle: 'Firmware Engineer',
        department: 'Firmware',
        isLead: false
      },
      {
        sNo: 12,
        teamName: 'Firmware',
        teamKey: 'FW',
        roleTitle: 'Engineer',
        systemRole: USER_ROLES.MEMBER,
        customRoleKey: 'MEMBER',
        name: 'Arun Vadivel',
        email: 'arun.v@zenmeter.in',
        password: 'Pass@123',
        jobTitle: 'Firmware Engineer',
        department: 'Firmware',
        isLead: false
      },
      {
        sNo: 13,
        teamName: 'Firmware',
        teamKey: 'FW',
        roleTitle: 'Engineer',
        systemRole: USER_ROLES.MEMBER,
        customRoleKey: 'MEMBER',
        name: 'Bala Sundaram',
        email: 'balasundaram.m@zenmeter.in',
        password: 'Pass@123',
        jobTitle: 'Firmware Engineer',
        department: 'Firmware',
        isLead: false
      },
      {
        sNo: 14,
        teamName: 'Testing',
        teamKey: 'TEST',
        roleTitle: 'Team Lead',
        systemRole: USER_ROLES.TEAM_LEAD,
        customRoleKey: 'TEAM_LEAD',
        name: 'Parthasarathy Janarthanam',
        email: 'parthasarathy.j@zenmeter.in',
        password: 'Pass@123',
        jobTitle: 'Testing Team Lead',
        department: 'Testing',
        isLead: true
      },
      {
        sNo: 15,
        teamName: 'Testing',
        teamKey: 'TEST',
        roleTitle: 'Engineer',
        systemRole: USER_ROLES.MEMBER,
        customRoleKey: 'MEMBER',
        name: 'Keerthana R',
        email: 'keerthana.r@zenmeter.in',
        password: 'Pass@123',
        jobTitle: 'Testing Engineer',
        department: 'Testing',
        isLead: false
      },
      {
        sNo: 16,
        teamName: 'Testing',
        teamKey: 'TEST',
        roleTitle: 'Engineer',
        systemRole: USER_ROLES.MEMBER,
        customRoleKey: 'MEMBER',
        name: 'Bhargavi Kootala',
        email: 'bhargavi.k@zenmeter.in',
        password: 'Pass@123',
        jobTitle: 'Testing Engineer',
        department: 'Testing',
        isLead: false
      }
    ];

    console.log('[Setup] Creating / updating 16 Zenmeter users in database...');
    const createdUsers = {};

    for (const spec of usersSpec) {
      let userDoc = await User.findOne({ email: spec.email.toLowerCase() });
      if (!userDoc) {
        userDoc = new User({
          name: spec.name,
          email: spec.email.toLowerCase(),
          password: spec.password,
          role: spec.systemRole,
          status: USER_STATUS.ACTIVE,
          jobTitle: spec.jobTitle,
          department: spec.department,
          currentWorkspace: workspace._id
        });
        await userDoc.save();
        console.log(`[Setup] Created user: ${spec.name} (${spec.email})`);
      } else {
        userDoc.name = spec.name;
        userDoc.password = spec.password; // will trigger pre-save bcrypt hash
        userDoc.role = spec.systemRole;
        userDoc.status = USER_STATUS.ACTIVE;
        userDoc.jobTitle = spec.jobTitle;
        userDoc.department = spec.department;
        userDoc.currentWorkspace = workspace._id;
        await userDoc.save();
        console.log(`[Setup] Updated user: ${spec.name} (${spec.email})`);
      }
      createdUsers[spec.email.toLowerCase()] = userDoc;
    }

    // 6. Update Workspace Members
    console.log('[Setup] Updating Outdid workspace members list...');
    const orgUser = await User.findOne({ email: 'org@outdid.com' });
    const membersList = [];

    // Keep org@outdid.com if it exists so system admin access is preserved
    if (orgUser) {
      membersList.push({
        userId: orgUser._id,
        role: 'ORG_ADMIN',
        customRoleId: roleMap['ORG_ADMIN'] || null,
        joinedAt: new Date()
      });
    }

    for (const spec of usersSpec) {
      const u = createdUsers[spec.email.toLowerCase()];
      membersList.push({
        userId: u._id,
        role: spec.systemRole,
        customRoleId: roleMap[spec.customRoleKey] || null,
        joinedAt: new Date()
      });
    }

    workspace.members = membersList;
    // Set Sam Chelladurai as Org Admin / Workspace Owner
    const samUser = createdUsers['sam.c@zenmeter.in'];
    if (samUser) {
      workspace.ownerId = samUser._id;
    }
    await workspace.save();
    console.log(`[Setup] Outdid Workspace updated with ${membersList.length} members.`);

    // 7. Define & Create the 7 Teams
    const teamsConfig = [
      {
        name: 'Hardware',
        key: 'HW',
        description: 'Hardware Design, Schematics, Components & Board Testing',
        color: '#2563EB',
        department: 'Hardware',
        leadEmail: 'sam.c@zenmeter.in',
        memberEmails: ['sam.c@zenmeter.in', 'albha.b@zenmeter.in', 'sivapragash.s@zenmeter.in']
      },
      {
        name: 'Lab Assistant',
        key: 'LAB',
        description: 'Lab Inventory, Hardware Setup & Component Logistics',
        color: '#0D9488',
        department: 'Lab Assistant',
        leadEmail: 'lab@zenmeter.in',
        memberEmails: ['lab@zenmeter.in']
      },
      {
        name: 'PCB',
        key: 'PCB',
        description: 'PCB Layout, Routing, Gerber Generation & Fabrication',
        color: '#D97706',
        department: 'PCB',
        leadEmail: 'pcb.cad@zenmeter.in',
        memberEmails: ['pcb.cad@zenmeter.in']
      },
      {
        name: 'Mechanical',
        key: 'MECH',
        description: 'Enclosures, 3D CAD Modeling & Thermal Design',
        color: '#4F46E5',
        department: 'Mechanical',
        leadEmail: 'mech.cad@zenmeter.in',
        memberEmails: ['mech.cad@zenmeter.in']
      },
      {
        name: 'Software',
        key: 'SW',
        description: 'Cloud Platform, APIs, Frontend/Backend Systems & Databases',
        color: '#059669',
        department: 'Software',
        leadEmail: 'kesavan.d@zenmeter.in',
        memberEmails: ['kesavan.d@zenmeter.in', 'poovarasan.s@zenmeter.in']
      },
      {
        name: 'Firmware',
        key: 'FW',
        description: 'Embedded C/C++, Microcontroller Firmware & RTOS Drivers',
        color: '#7C3AED',
        department: 'Firmware',
        leadEmail: 'kalaivanan.subramanian@zenmeter.in',
        memberEmails: [
          'kalaivanan.subramanian@zenmeter.in',
          'vivek.p@zenmeter.in',
          'dhanushkumar.s@zenmeter.in',
          'arun.v@zenmeter.in',
          'balasundaram.m@zenmeter.in'
        ]
      },
      {
        name: 'Testing',
        key: 'TEST',
        description: 'QA Validation, Functional Verification & Reliability Testing',
        color: '#DC2626',
        department: 'Testing',
        leadEmail: 'parthasarathy.j@zenmeter.in',
        memberEmails: ['parthasarathy.j@zenmeter.in', 'keerthana.r@zenmeter.in', 'bhargavi.k@zenmeter.in']
      }
    ];

    console.log('[Setup] Creating 7 new teams in Outdid workspace...');
    for (const tc of teamsConfig) {
      const leadUser = createdUsers[tc.leadEmail.toLowerCase()];
      const memberIds = tc.memberEmails.map((e) => createdUsers[e.toLowerCase()]._id);

      const team = await Team.create({
        name: tc.name,
        key: tc.key,
        description: tc.description,
        color: tc.color,
        department: tc.department,
        workspaceId: workspace._id,
        leadId: leadUser ? leadUser._id : memberIds[0],
        members: memberIds,
        createdBy: samUser ? samUser._id : workspace.ownerId
      });

      console.log(`[Setup] Created Team: ${team.name} [${team.key}] with Lead: ${leadUser ? leadUser.name : 'None'} and ${memberIds.length} members`);
    }

    console.log('\n[Setup] SUCCESS! Outdid Workspace reset and 16 Zenmeter users + 7 teams configured successfully.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('[Setup] Error during setup:', err);
    process.exit(1);
  }
};

setupOutdidZenmeter();
