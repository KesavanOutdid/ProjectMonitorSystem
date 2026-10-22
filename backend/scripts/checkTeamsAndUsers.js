require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const dns = require('dns');

try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (_) {}

async function checkTeamsAndUsers() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/project_monitor_system';
  await mongoose.connect(uri);

  const db = mongoose.connection.db;
  const users = await db.collection('users').find({}).toArray();
  console.log('=== USERS IN DB ===');
  users.forEach((u) => {
    console.log(`- User [${u._id}]: ${u.name} (${u.email}) | Role: ${u.role}`);
  });

  const projects = await db.collection('projects').find({}).toArray();
  console.log('\n=== PROJECTS & TEAMS ===');
  projects.forEach((p) => {
    console.log(`Project: [${p._id}] "${p.name}" (Key: ${p.key}) | LeadId: ${p.leadId}`);
    if (p.teams && p.teams.length > 0) {
      p.teams.forEach((t) => {
        const leadUser = users.find((u) => u._id.toString() === (t.leadId ? t.leadId.toString() : ''));
        console.log(`  - Team: "${t.name}" (${t.key}) | leadId: ${t.leadId} => Name: ${leadUser ? leadUser.name : 'Not Found / null'}`);
      });
    } else {
      console.log('  No embedded teams.');
    }
  });

  const globalTeams = await db.collection('teams').find({}).toArray();
  console.log('\n=== GLOBAL TEAMS COLLECTION ===');
  globalTeams.forEach((gt) => {
    const leadUser = users.find((u) => u._id.toString() === (gt.leadId ? gt.leadId.toString() : ''));
    console.log(`  - Global Team: "${gt.name}" (${gt.key}) | leadId: ${gt.leadId} => Name: ${leadUser ? leadUser.name : 'Not Found'}`);
  });

  await mongoose.disconnect();
}

checkTeamsAndUsers().catch(console.error);
