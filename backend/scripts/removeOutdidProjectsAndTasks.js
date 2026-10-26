require('dotenv').config();
const mongoose = require('mongoose');
const Project = require('../src/models/Project');
const Task = require('../src/models/Task');
const Sprint = require('../src/models/Sprint');
const Activity = require('../src/models/Activity');
const Comment = require('../src/models/Comment');
const Request = require('../src/models/Request');
const User = require('../src/models/User');
const CacheService = require('../src/services/cacheService');

async function removeOutdidProjectsAndTasks() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    console.log('[Remove] Connecting to database...');
    await mongoose.connect(mongoUri);

    const workspaceId = '6ad9a82e8dffb3f89afad155'; // Outdid Unified PVT LTD

    // 1. Find all projects in Outdid workspace
    const projects = await Project.find({ workspaceId }).lean();
    const projectIds = projects.map(p => p._id);
    console.log(`[Remove] Found ${projects.length} projects in Outdid workspace:`, projects.map(p => `${p.name} (${p.key})`));

    // 2. Delete tasks
    const tasksRes = await Task.deleteMany({ workspaceId });
    console.log(`[Remove] Deleted ${tasksRes.deletedCount} tasks in workspace.`);

    // 3. Delete sprints
    const sprintsRes = await Sprint.deleteMany({ workspaceId });
    console.log(`[Remove] Deleted ${sprintsRes.deletedCount} sprints in workspace.`);

    // 4. Delete activities
    const activitiesRes = await Activity.deleteMany({
      $or: [
        { workspaceId },
        { projectId: { $in: projectIds } }
      ]
    });
    console.log(`[Remove] Deleted ${activitiesRes.deletedCount} activities.`);

    // 5. Delete comments
    const commentsRes = await Comment.deleteMany({
      $or: [
        { workspaceId },
        { projectId: { $in: projectIds } }
      ]
    });
    console.log(`[Remove] Deleted ${commentsRes.deletedCount} comments.`);

    // 6. Delete requests
    const requestsRes = await Request.deleteMany({
      $or: [
        { workspaceId },
        { projectId: { $in: projectIds } }
      ]
    });
    console.log(`[Remove] Deleted ${requestsRes.deletedCount} requests.`);

    // 7. Delete the projects themselves
    const projectsRes = await Project.deleteMany({ _id: { $in: projectIds } });
    console.log(`[Remove] Deleted ${projectsRes.deletedCount} projects.`);

    // 8. Clear currentProject reference on users
    const userUpdateRes = await User.updateMany(
      { currentProject: { $in: projectIds } },
      { $unset: { currentProject: 1 } }
    );
    console.log(`[Remove] Updated ${userUpdateRes.modifiedCount} users to clear active project.`);

    // 9. Flush cache
    try {
      await CacheService.delPattern('*');
      console.log('[Remove] Redis cache flushed.');
    } catch (e) {
      console.log('[Remove] Cache flush skipped:', e.message);
    }

    console.log('[Remove] ✅ Outdid projects and tasks successfully removed!');
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('[Remove Error]:', error);
    process.exit(1);
  }
}

removeOutdidProjectsAndTasks();
