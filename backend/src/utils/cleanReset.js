require('dotenv').config({ path: __dirname + '/../../.env' });
const mongoose = require('mongoose');
const User = require('../models/User');
const Workspace = require('../models/Workspace');
const Subscription = require('../models/Subscription');
const Project = require('../models/Project');
const Task = require('../models/Task');
const Activity = require('../models/Activity');
const Comment = require('../models/Comment');
const Sprint = require('../models/Sprint');
const Form = require('../models/Form');
const Invitation = require('../models/Invitation');
const CacheService = require('../services/cacheService');
const { USER_ROLES, USER_STATUS, SUBSCRIPTION_PLANS, PLAN_LIMITS } = require('../constants/roles');

const cleanReset = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/project_monitor_system';
    console.log(`[CleanReset] Connecting to ${mongoUri}...`);
    await mongoose.connect(mongoUri);

    console.log('[CleanReset] Wiping all database collections...');
    await Promise.all([
      User.deleteMany({}),
      Workspace.deleteMany({}),
      Subscription.deleteMany({}),
      Project.deleteMany({}),
      Task.deleteMany({}),
      Activity.deleteMany({}),
      Comment.deleteMany({}),
      Sprint.deleteMany({}),
      Form.deleteMany({}),
      Invitation.deleteMany({})
    ]);

    try {
      await CacheService.delPattern('*');
      console.log('[CleanReset] Redis cache flushed.');
    } catch (e) {
      console.log('[CleanReset] Redis flush skipped:', e.message);
    }

    console.log('[CleanReset] Creating primary Organization Admin...');
    const adminUser = await User.create({
      name: 'Outdid Admin',
      email: 'admin@outdid.com',
      password: 'admin123',
      role: USER_ROLES.SUPER_ADMIN,
      status: USER_STATUS.ACTIVE,
      jobTitle: 'Organization Admin',
      department: 'Management'
    });

    console.log('[CleanReset] Creating clean workspace...');
    const workspace = await Workspace.create({
      name: 'Outdid',
      slug: 'outdid',
      ownerId: adminUser._id,
      createdBy: adminUser._id,
      description: 'Primary workspace for engineering, hardware, software, and project monitoring',
      members: [
        { userId: adminUser._id, role: USER_ROLES.SUPER_ADMIN }
      ]
    });

    const subscription = await Subscription.create({
      workspaceId: workspace._id,
      planType: SUBSCRIPTION_PLANS.ENTERPRISE,
      limits: PLAN_LIMITS.ENTERPRISE
    });

    workspace.subscriptionId = subscription._id;
    await workspace.save();

    adminUser.currentWorkspace = workspace._id;
    await adminUser.save();

    console.log('=====================================================');
    console.log('✅ Database Clean Reset Complete!');
    console.log('👤 Admin Email:    admin@outdid.com');
    console.log('🔑 Admin Password: admin123');
    console.log(`🏢 Workspace:      ${workspace.name} (${workspace._id})`);
    console.log('=====================================================');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('[CleanReset Error]:', error);
    process.exit(1);
  }
};

cleanReset();
