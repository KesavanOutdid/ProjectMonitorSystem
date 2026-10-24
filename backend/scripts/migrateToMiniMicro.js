require('dns').setServers(['8.8.8.8']);
require('dotenv').config();
const mongoose = require('mongoose');
const Task = require('../src/models/Task');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[Migration] Connected to MongoDB');

  const tasks = await Task.find({ 'subtasks.0': { $exists: true } });
  console.log(`Found ${tasks.length} tasks with subtasks.`);

  let migratedTasks = 0;
  let migratedMinis = 0;
  let migratedMicros = 0;

  for (const t of tasks) {
    let taskChanged = false;

    for (let stIdx = 0; stIdx < (t.subtasks || []).length; stIdx++) {
      const st = t.subtasks[stIdx];
      const oldMicros = Array.isArray(st.microtasks) ? st.microtasks : [];

      if (oldMicros.length > 0) {
        if (!Array.isArray(st.minitasks)) {
          st.minitasks = [];
        }

        oldMicros.forEach((oldMic, micIdx) => {
          let newMiniKey = oldMic.key ? oldMic.key.replace('-MIC-', '-MIN-') : '';
          if (!newMiniKey) {
            newMiniKey = st.key ? st.key.replace('-ST-', '-MIN-') + `-${st.minitasks.length + 1}` : `${t.key || 'TASK'}-MIN-${st.minitasks.length + 1}`;
          }

          // Transfer any sub-items (old minitasks) to new microtasks
          const childMicros = [];
          if (Array.isArray(oldMic.minitasks)) {
            oldMic.minitasks.forEach((oldMini, childIdx) => {
              let newChildMicKey = oldMini.key ? oldMini.key.replace('-MIN-', '-MIC-') : `${newMiniKey.replace('-MIN-', '-MIC-')}-${childIdx + 1}`;
              childMicros.push({
                key: newChildMicKey,
                title: oldMini.title,
                description: oldMini.description || '',
                status: oldMini.status || 'TODO',
                isCompleted: Boolean(oldMini.isCompleted),
                completedAt: oldMini.completedAt || null,
                startDate: oldMini.startDate || null,
                dueDate: oldMini.dueDate || null,
                assigneeId: oldMini.assigneeId || null,
                createdAt: oldMini.createdAt || new Date(),
                createdBy: oldMini.createdBy || null
              });
              migratedMicros++;
            });
          }

          st.minitasks.push({
            key: newMiniKey,
            title: oldMic.title,
            description: oldMic.description || '',
            status: oldMic.status || 'TODO',
            isCompleted: Boolean(oldMic.isCompleted),
            completedAt: oldMic.completedAt || null,
            startDate: oldMic.startDate || null,
            dueDate: oldMic.dueDate || null,
            assigneeId: oldMic.assigneeId || null,
            createdAt: oldMic.createdAt || new Date(),
            createdBy: oldMic.createdBy || null,
            microtasks: childMicros
          });
          migratedMinis++;
        });

        // Clear old microtasks array
        st.microtasks = [];
        taskChanged = true;
      }
    }

    if (taskChanged) {
      await t.save();
      migratedTasks++;
      console.log(`[Migrated] Task ${t.key}: Subtasks converted to Level 3 Mini-tasks & Level 4 Micro-tasks`);
    }
  }

  console.log(`Migration Complete: ${migratedTasks} tasks updated (${migratedMinis} mini-tasks, ${migratedMicros} micro-tasks).`);
  process.exit(0);
}

run().catch((err) => {
  console.error('[Migration Error]', err);
  process.exit(1);
});
