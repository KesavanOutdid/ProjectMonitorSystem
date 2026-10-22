require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const dns = require('dns');

try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (_) {}

async function migrateAndClean() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/project_monitor_system';
  console.log('Connecting to MongoDB at:', uri);
  await mongoose.connect(uri);

  const db = mongoose.connection.db;
  const tasksCol = db.collection('tasks');
  const requestsCol = db.collection('requests');
  const commentsCol = db.collection('comments');

  // 1. Find all request documents in tasks collection
  const requestTasks = await tasksCol.find({
    $or: [
      { labels: 'FormSubmission' },
      { labels: 'Intake' },
      { requestType: { $exists: true, $ne: null } },
      { formId: { $exists: true, $ne: null } },
      { key: /REQ-/ }
    ]
  }).toArray();

  console.log(`Found ${requestTasks.length} request documents in 'tasks' collection.`);

  let migratedCount = 0;
  let alreadyExistedCount = 0;
  const idsToDeleteFromTasks = [];

  for (const doc of requestTasks) {
    idsToDeleteFromTasks.push(doc._id);

    // Check if already in requests collection
    const existingReq = await requestsCol.findOne({
      $or: [{ _id: doc._id }, { key: doc.key }]
    });

    if (!existingReq) {
      // Build Request doc
      const newReqDoc = {
        _id: doc._id,
        key: doc.key,
        requestNumber: doc.taskNumber || doc.requestNumber || 1,
        title: doc.title,
        description: doc.description || '',
        requestType: doc.requestType || 'OTHER',
        priority: doc.priority || 'MEDIUM',
        requestStatus: doc.requestStatus || 'PENDING_REVIEW',
        projectId: doc.projectId,
        workspaceId: doc.workspaceId,
        formId: doc.formId || null,
        reporterId: doc.reporterId,
        assigneeId: doc.assigneeId || null,
        teamId: doc.teamId || null,
        team: doc.team || '',
        teamLeadId: doc.teamLeadId || null,
        relatedTaskId: doc.relatedTaskId || null,
        createdTaskId: doc.createdTaskId || null,
        acceptedBy: doc.acceptedBy || null,
        acceptedAt: doc.acceptedAt || null,
        dueDate: doc.dueDate || null,
        customFields: doc.customFields || {},
        labels: Array.isArray(doc.labels) ? doc.labels : ['FormSubmission'],
        isArchived: doc.isArchived || false,
        createdAt: doc.createdAt || new Date(),
        updatedAt: doc.updatedAt || new Date()
      };

      await requestsCol.insertOne(newReqDoc);
      migratedCount++;
    } else {
      alreadyExistedCount++;
    }

    // Update comments to have requestId
    await commentsCol.updateMany(
      { taskId: doc._id, requestId: { $exists: false } },
      { $set: { requestId: doc._id } }
    );
  }

  console.log(`Migrated to 'requests' collection: ${migratedCount}`);
  console.log(`Already in 'requests' collection: ${alreadyExistedCount}`);

  // 2. Remove all request documents from tasks collection
  if (idsToDeleteFromTasks.length > 0) {
    const deleteRes = await tasksCol.deleteMany({ _id: { $in: idsToDeleteFromTasks } });
    console.log(`Deleted ${deleteRes.deletedCount} request documents from 'tasks' collection.`);
  }

  // 3. Clean up leftover request fields on remaining tasks
  const unsetRes = await tasksCol.updateMany(
    {},
    {
      $unset: {
        requestStatus: "",
        formId: "",
        requestType: ""
      }
    }
  );
  console.log(`Unset request fields on remaining tasks: modified ${unsetRes.modifiedCount}`);

  // 4. Verify counts
  const totalTasks = await tasksCol.countDocuments();
  const totalRequests = await requestsCol.countDocuments();
  console.log(`Current 'tasks' collection count (ONLY genuine board tasks): ${totalTasks}`);
  console.log(`Current 'requests' collection count (All form requests): ${totalRequests}`);

  await mongoose.disconnect();
  console.log('Migration complete!');
}

migrateAndClean().catch((err) => {
  console.error('Error in migration:', err);
  process.exit(1);
});
