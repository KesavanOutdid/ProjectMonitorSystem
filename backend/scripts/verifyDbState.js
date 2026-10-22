require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const dns = require('dns');

try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (_) {}

async function verify() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/project_monitor_system';
  await mongoose.connect(uri);

  const db = mongoose.connection.db;
  const tasksCol = db.collection('tasks');
  const requestsCol = db.collection('requests');

  const tasks = await tasksCol.find({}).toArray();
  const requests = await requestsCol.find({}).toArray();

  console.log('=== MONGODB COMPASS COLLECTIONS STATUS ===');
  console.log(`[tasks] Collection count: ${tasks.length}`);
  tasks.forEach((t) => {
    console.log(`  - Task [${t.key}]: "${t.title}" | Status: ${t.status} | Labels: ${JSON.stringify(t.labels || [])} | Subtasks: ${(t.subtasks || []).length}`);
  });

  console.log(`\n[requests] Collection count: ${requests.length}`);
  requests.forEach((r) => {
    console.log(`  - Request [${r.key}]: "${r.title}" | Status: ${r.requestStatus} | Type: ${r.requestType} | Team: ${r.team || 'None'}`);
  });

  // Verify that NO request documents remain in tasks collection
  const pollutedTasks = await tasksCol.find({
    $or: [
      { labels: 'FormSubmission' },
      { key: /REQ-/ }
    ]
  }).toArray();

  console.log(`\nPolluted form requests inside tasks collection: ${pollutedTasks.length}`);

  await mongoose.disconnect();
}

verify().catch(console.error);
