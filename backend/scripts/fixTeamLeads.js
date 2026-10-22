require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const dns = require('dns');

try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (_) {}

async function fixTeamLeads() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/project_monitor_system';
  await mongoose.connect(uri);

  const db = mongoose.connection.db;
  const projectsCol = db.collection('projects');
  const teamsCol = db.collection('teams');
  const usersCol = db.collection('users');

  const globalTeams = await teamsCol.find({}).toArray();
  const users = await usersCol.find({}).toArray();

  console.log(`Loaded ${globalTeams.length} global teams and ${users.length} users.`);

  const projects = await projectsCol.find({}).toArray();

  for (const project of projects) {
    if (!project.teams || project.teams.length === 0) continue;

    let updated = false;
    const newTeams = project.teams.map((pt) => {
      // Find matching global team
      const matchedGlobalTeam = globalTeams.find(
        (gt) =>
          gt.workspaceId.toString() === project.workspaceId.toString() &&
          ((gt.name && pt.name && gt.name.trim().toLowerCase() === pt.name.trim().toLowerCase()) ||
           (gt.key && pt.key && gt.key.trim().toUpperCase() === pt.key.trim().toUpperCase()))
      );

      if (matchedGlobalTeam && matchedGlobalTeam.leadId) {
        const leadUser = users.find((u) => u._id.toString() === matchedGlobalTeam.leadId.toString());
        console.log(`Project "${project.name}": Mapping team "${pt.name}" -> Lead: ${leadUser ? leadUser.name : matchedGlobalTeam.leadId}`);
        updated = true;
        return {
          ...pt,
          leadId: matchedGlobalTeam.leadId,
          members: Array.isArray(matchedGlobalTeam.members) && matchedGlobalTeam.members.length > 0 ? matchedGlobalTeam.members : pt.members
        };
      }
      return pt;
    });

    // Ensure all team leads are also in project.members
    const currentMemberIds = new Set((project.members || []).map((m) => (m.userId || m._id || m).toString()));
    const newMembers = [...(project.members || [])];

    newTeams.forEach((t) => {
      if (t.leadId && !currentMemberIds.has(t.leadId.toString())) {
        currentMemberIds.add(t.leadId.toString());
        newMembers.push({
          userId: t.leadId,
          role: 'TEAM_LEAD'
        });
        updated = true;
      }
    });

    if (updated) {
      await projectsCol.updateOne(
        { _id: project._id },
        {
          $set: {
            teams: newTeams,
            members: newMembers
          }
        }
      );
      console.log(`Updated project "${project.name}" teams with real team leads!`);
    }
  }

  // Also update existing requests in the requests collection so they reflect the real team lead
  const requestsCol = db.collection('requests');
  const requests = await requestsCol.find({}).toArray();
  for (const req of requests) {
    if (req.team) {
      const matchedGlobalTeam = globalTeams.find(
        (gt) => gt.name.trim().toLowerCase() === req.team.trim().toLowerCase() ||
                gt.key.trim().toUpperCase() === req.team.trim().toUpperCase()
      );
      if (matchedGlobalTeam && matchedGlobalTeam.leadId) {
        await requestsCol.updateOne(
          { _id: req._id },
          {
            $set: {
              teamId: matchedGlobalTeam._id,
              teamLeadId: matchedGlobalTeam.leadId
            }
          }
        );
        console.log(`Updated request "${req.key}" with teamLeadId for "${req.team}"`);
      }
    }
  }

  console.log('Done fixing team leads!');
  await mongoose.disconnect();
}

fixTeamLeads().catch(console.error);
