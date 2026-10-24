require('dns').setServers(['8.8.8.8']);
require('dotenv').config();
const mongoose = require('mongoose');
const Task = require('../src/models/Task');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const tasks = await Task.find({ 'subtasks.0': { $exists: true } }).lean();
  console.log(`Found ${tasks.length} tasks with subtasks.`);

  for (const t of tasks) {
    for (const st of t.subtasks || []) {
      const miniCount = Array.isArray(st.minitasks) ? st.minitasks.length : 0;
      if (miniCount > 0) {
        console.log(`Task ${t.key} Subtask ${st.key || st.title} has ${miniCount} mini-tasks:`);
        for (const mini of st.minitasks) {
          const microCount = Array.isArray(mini.microtasks) ? mini.microtasks.length : 0;
          console.log(`  - Mini: ${mini.key} (${mini.title}) has ${microCount} microtasks`);
        }
      }
    }
  }
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
