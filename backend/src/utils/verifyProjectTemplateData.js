const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const ExcelJS = require('exceljs');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const Project = require('../models/Project');
const Sprint = require('../models/Sprint');
const User = require('../models/User');
const Team = require('../models/Team');

async function verify() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/project_monitor');
  console.log('MongoDB connected');

  const project = await Project.findOne();
  if (!project) {
    console.log('No project found in database to test.');
    await mongoose.disconnect();
    return;
  }

  console.log('Testing with project:', project.name, `(${project._id})`);

  // Fetch real project sprints
  const sprints = await Sprint.find({ projectId: project._id }).lean();
  console.log('Project Sprints:', sprints.map(s => s.name));

  // Fetch project teams
  const projectTeams = (project.teams || []).map(t => t.name || t);
  console.log('Project Teams:', projectTeams);

  console.log('Project Key:', project.key);

  await mongoose.disconnect();
}

verify().catch(console.error);
