require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const dns = require('dns');

try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (_) {}

const User = require('../src/models/User');
const Workspace = require('../src/models/Workspace');
const Subscription = require('../src/models/Subscription');
const Role = require('../src/models/Role');
const { USER_ROLES, USER_STATUS, SUBSCRIPTION_PLANS, PLAN_LIMITS } = require('../src/constants/roles');
const { ensureDefaultRoles } = require('../src/controllers/roleController');

async function setupRolesAndAdmin() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/project_monitor_system';
  console.log(`Connecting to MongoDB...`);
  await mongoose.connect(uri);

  console.log(`1. Creating Organization Administrator...`);
  const adminUser = await User.create({
    name: 'SSCorp Admin',
    email: 'org@sscorp.com',
    password: 'Test@123',
    role: USER_ROLES.ORG_ADMIN,
    status: USER_STATUS.ACTIVE,
    jobTitle: 'Organization Administrator',
    department: 'Executive Management'
  });

  console.log(`2. Creating Workspace: "SS Corp"...`);
  const workspace = await Workspace.create({
    name: 'SS Corp',
    slug: 'ss-corp',
    ownerId: adminUser._id,
    createdBy: adminUser._id,
    description: 'Corporate Organization Workspace',
    members: [
      {
        userId: adminUser._id,
        role: 'ORG_ADMIN'
      }
    ]
  });

  console.log(`3. Activating Enterprise Subscription...`);
  const subscription = await Subscription.create({
    workspaceId: workspace._id,
    planType: SUBSCRIPTION_PLANS.ENTERPRISE,
    limits: PLAN_LIMITS.ENTERPRISE
  });

  workspace.subscriptionId = subscription._id;
  await workspace.save();

  adminUser.currentWorkspace = workspace._id;
  await adminUser.save();

  console.log(`4. Generating Full Hierarchy Roles & Permissions (Levels 1 to 5)...`);
  await ensureDefaultRoles(workspace._id, adminUser._id);

  // Link admin member to ORG_ADMIN role
  const orgAdminRole = await Role.findOne({ workspaceId: workspace._id, key: 'ORG_ADMIN' });
  if (orgAdminRole) {
    workspace.members[0].customRoleId = orgAdminRole._id;
    await workspace.save();
  }

  const createdRoles = await Role.find({ workspaceId: workspace._id }).sort({ level: 1 }).lean();
  console.log(`\n=== ROLES & PERMISSIONS CREATED ===`);
  createdRoles.forEach((r) => {
    console.log(`- [Level ${r.level}] ${r.name} (${r.key}): ${r.description}`);
  });

  console.log(`\n=== ADMIN CREDENTIALS ===`);
  console.log(`Email:    org@sscorp.com`);
  console.log(`Password: Test@123`);
  console.log(`Workspace: SS Corp (${workspace._id})`);

  console.log(`\nSetup complete. No dummy projects or tasks created. Database is ready for custom creation.`);
  await mongoose.disconnect();
}

setupRolesAndAdmin().catch((err) => {
  console.error('Failed to setup roles and admin:', err);
  process.exit(1);
});
