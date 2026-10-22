const Task = require('../models/Task');
const Project = require('../models/Project');
const Request = require('../models/Request');
const Team = require('../models/Team');

/**
 * 30-Day Automated Recycle Bin Purge Worker
 * Runs once every 24 hours (and on server boot) to permanently delete
 * items whose retention period has expired (purgeAt <= now).
 */
const runRecycleBinPurge = async () => {
  try {
    const now = new Date();
    const purgeFilter = { isDeleted: true, purgeAt: { $lte: now } };

    // 1. Purge expired tasks
    const expiredTasks = await Task.find(purgeFilter).select('_id attachments');
    if (expiredTasks.length > 0) {
      console.log(`[RecycleBinWorker] Purging ${expiredTasks.length} expired task(s)...`);
      await Task.deleteMany(purgeFilter);
    }

    // 2. Purge expired requests
    const expiredRequestsCount = await Request.countDocuments(purgeFilter);
    if (expiredRequestsCount > 0) {
      console.log(`[RecycleBinWorker] Purging ${expiredRequestsCount} expired request(s)...`);
      await Request.deleteMany(purgeFilter);
    }

    // 3. Purge expired teams
    const expiredTeamsCount = await Team.countDocuments(purgeFilter);
    if (expiredTeamsCount > 0) {
      console.log(`[RecycleBinWorker] Purging ${expiredTeamsCount} expired team(s)...`);
      await Team.deleteMany(purgeFilter);
    }

    // 4. Purge expired projects (and any cascaded tasks)
    const expiredProjects = await Project.find(purgeFilter).select('_id');
    for (const proj of expiredProjects) {
      console.log(`[RecycleBinWorker] Purging expired project ${proj._id} and all cascaded tasks...`);
      await Task.deleteMany({ projectId: proj._id });
      await Project.deleteOne({ _id: proj._id });
    }

    console.log('[RecycleBinWorker] 30-day retention check complete.');
  } catch (err) {
    console.error('[RecycleBinWorker] Error during automatic 30-day purge:', err);
  }
};

const initRecycleBinWorker = () => {
  // Run on startup after short delay
  setTimeout(() => {
    runRecycleBinPurge();
  }, 10000);

  // Run every 24 hours (86,400,000 ms)
  setInterval(() => {
    runRecycleBinPurge();
  }, 24 * 60 * 60 * 1000);

  console.log('[RecycleBinWorker] Automated 30-day recycle bin purge worker scheduled.');
};

module.exports = {
  runRecycleBinPurge,
  initRecycleBinWorker
};
