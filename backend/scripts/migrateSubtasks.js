require('dns').setServers(['8.8.8.8']);
require('dotenv').config();
const mongoose = require('mongoose');
const Task = require('../src/models/Task');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const tasks = await Task.find({ 'subtasks.0': { $exists: true } });
  console.log(`Found ${tasks.length} tasks with subtasks.`);

  for (const t of tasks) {
    let changed = false;
    t.subtasks.forEach((st, idx) => {
      if (!st.key) {
        const parts = (t.key || 'PROJ-MT-1').split('-');
        const projKey = parts[0] || 'TASK';
        const mtNum = t.taskNumber || parts[parts.length - 1] || '1';
        st.key = `${projKey}-ST-${mtNum}-${idx + 1}`;
        changed = true;
      }
      if (!st.status) {
        st.status = st.isCompleted ? 'DONE' : 'TODO';
        changed = true;
      }
    });

    if (changed) {
      await t.save();
      console.log(`Updated task ${t.key} with subtasks.`);
    }
  }

  const updatedTasks = await Task.find({ 'subtasks.0': { $exists: true } }).select('key title status subtasks').lean();
  console.log('Result:', JSON.stringify(updatedTasks, null, 2));
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
