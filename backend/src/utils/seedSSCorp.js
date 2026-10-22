const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');

const User = require('../models/User');
const Workspace = require('../models/Workspace');
const Project = require('../models/Project');
const Sprint = require('../models/Sprint');
const Task = require('../models/Task');
const Activity = require('../models/Activity');
const Subscription = require('../models/Subscription');

const seedSSCorp = async () => {
  try {
    console.log('[SS Corp Seeder] Connecting to database...');
    await connectDB();

    const PASSWORD_HASH = await bcrypt.hash('Test@123', 10);

    // ─── 1. Clean existing SS Corp artifacts if present ───────────────────
    const existingWs = await Workspace.findOne({ slug: 'sscorp' });
    if (existingWs) {
      console.log('[SS Corp Seeder] Cleaning up existing SS Corp workspace data...');
      const existingProjects = await Project.find({ workspaceId: existingWs._id });
      const projIds = existingProjects.map((p) => p._id);

      await Task.deleteMany({ projectId: { $in: projIds } });
      await Sprint.deleteMany({ projectId: { $in: projIds } });
      await Activity.deleteMany({ projectId: { $in: projIds } });
      await Project.deleteMany({ workspaceId: existingWs._id });
      await Workspace.deleteOne({ _id: existingWs._id });
    }

    // ─── 2. Create Users (All @sscorp.com / Test@123) ──────────────────────
    console.log('[SS Corp Seeder] Creating users...');

    const userData = [
      // Admin
      { name: 'SS Corp Admin', email: 'admin@sscorp.com', role: 'SUPER_ADMIN', jobTitle: 'Chief Executive & Admin', department: 'Executive' },
      // Project Manager
      { name: 'Arun Kumar', email: 'arun.manager@sscorp.com', role: 'ORG_ADMIN', jobTitle: 'Senior Project Manager', department: 'Program Management' },

      // 4 Hardware Engineers
      { name: 'Kavita Sharma', email: 'kavita.hw@sscorp.com', role: 'MEMBER', jobTitle: 'Principal Hardware Engineer', department: 'Hardware Engineering' },
      { name: 'Vikram Patel', email: 'vikram.hw@sscorp.com', role: 'MEMBER', jobTitle: 'Power Electronics Specialist', department: 'Hardware Engineering' },
      { name: 'Rahul Verma', email: 'rahul.hw@sscorp.com', role: 'MEMBER', jobTitle: 'Hardware Validation Engineer', department: 'Hardware Engineering' },
      { name: 'Ananya Sen', email: 'ananya.hw@sscorp.com', role: 'MEMBER', jobTitle: 'Analog Circuit Engineer', department: 'Hardware Engineering' },

      // 1 PCB Designer
      { name: 'Suresh Iyer', email: 'suresh.pcb@sscorp.com', role: 'MEMBER', jobTitle: 'Lead PCB Layout Designer', department: 'PCB Engineering' },

      // 6 Embedded Engineers
      { name: 'Deepak Joshi', email: 'deepak.embed@sscorp.com', role: 'MEMBER', jobTitle: 'Principal Firmware Architect', department: 'Embedded Systems' },
      { name: 'Priya Nair', email: 'priya.embed@sscorp.com', role: 'MEMBER', jobTitle: 'RTOS Embedded Engineer', department: 'Embedded Systems' },
      { name: 'Manoj Reddy', email: 'manoj.embed@sscorp.com', role: 'MEMBER', jobTitle: 'BSP & Device Drivers Developer', department: 'Embedded Systems' },
      { name: 'Sneha Kulkarni', email: 'sneha.embed@sscorp.com', role: 'MEMBER', jobTitle: 'Low-Power MCU Specialist', department: 'Embedded Systems' },
      { name: 'Amit Roy', email: 'amit.embed@sscorp.com', role: 'MEMBER', jobTitle: 'Embedded C/C++ Developer', department: 'Embedded Systems' },
      { name: 'Divya Mehra', email: 'divya.embed@sscorp.com', role: 'MEMBER', jobTitle: 'Firmware QA & Test Engineer', department: 'Embedded Systems' },

      // 5 Software Engineers
      { name: 'Rohit Das', email: 'rohit.soft@sscorp.com', role: 'MEMBER', jobTitle: 'Full-Stack Tech Lead', department: 'Software Engineering' },
      { name: 'Neha Gupta', email: 'neha.soft@sscorp.com', role: 'MEMBER', jobTitle: 'Senior Frontend Developer', department: 'Software Engineering' },
      { name: 'Karthik R', email: 'karthik.soft@sscorp.com', role: 'MEMBER', jobTitle: 'Cloud Backend & API Architect', department: 'Software Engineering' },
      { name: 'Pooja Rao', email: 'pooja.soft@sscorp.com', role: 'MEMBER', jobTitle: 'DevOps & Cloud Engineer', department: 'Software Engineering' },
      { name: 'Sanjay Menon', email: 'sanjay.soft@sscorp.com', role: 'MEMBER', jobTitle: 'Software QA Automation Engineer', department: 'Software Engineering' }
    ];

    const usersMap = {};

    for (const u of userData) {
      let userDoc = await User.findOne({ email: u.email });
      if (!userDoc) {
        userDoc = await User.create({
          name: u.name,
          email: u.email,
          password: 'Test@123',
          role: u.role,
          status: 'ACTIVE',
          jobTitle: u.jobTitle,
          department: u.department
        });
      } else {
        userDoc.name = u.name;
        userDoc.password = 'Test@123';
        userDoc.role = u.role;
        userDoc.jobTitle = u.jobTitle;
        userDoc.department = u.department;
        await userDoc.save();
      }
      usersMap[u.email] = userDoc;
    }

    const adminUser = usersMap['admin@sscorp.com'];
    const pmUser = usersMap['arun.manager@sscorp.com'];

    // ─── 3. Create Enterprise Workspace ───────────────────────────────────
    console.log('[SS Corp Seeder] Creating SS Corp Workspace...');

    const allUserIds = Object.values(usersMap).map((u) => ({
      userId: u._id,
      role: u.email === 'admin@sscorp.com' || u.email === 'arun.manager@sscorp.com' ? 'ORG_ADMIN' : 'MEMBER'
    }));

    const workspace = await Workspace.create({
      name: 'SS Corp',
      slug: 'sscorp',
      ownerId: adminUser._id,
      description: 'SS Corp Multi-Disciplinary Hardware, Embedded Systems & Cloud Platform',
      members: allUserIds
    });

    // Update users currentWorkspace
    await User.updateMany(
      { _id: { $in: Object.values(usersMap).map((u) => u._id) } },
      { currentWorkspace: workspace._id }
    );

    // ─── 4. Build 3 Projects with Custom Teams & Stages ────────────────────
    console.log('[SS Corp Seeder] Building 3 Specialized Projects...');

    const projectDefs = [
      {
        name: 'Smart Gateway IoT Hub',
        key: 'SGH',
        description: 'Industrial Smart Gateway with high-speed MCU, custom multi-layer PCB, and secure telemetry firmware.',
        category: 'Hardware & Embedded',
        color: '#0284C7', // Sky Blue
        leadId: pmUser._id,
        workflowStages: [
          { id: 'BACKLOG', label: 'Ideas & Backlog', color: 'bg-slate-500' },
          { id: 'TODO', label: 'To Do', color: 'bg-blue-500' },
          { id: 'IN_PROGRESS', label: 'In Progress / Lab Bench', color: 'bg-amber-500' },
          { id: 'IN_REVIEW', label: 'Peer Review & Testing', color: 'bg-purple-500' },
          { id: 'DONE', label: 'Verified & Done', color: 'bg-emerald-500' }
        ],
        teams: [
          {
            name: 'Hardware & Circuit Design',
            key: 'HW',
            icon: 'Cpu',
            color: '#0284C7',
            description: 'Schematics, power management, sensor circuits, and component qualification.',
            leadId: usersMap['kavita.hw@sscorp.com']._id,
            members: [
              usersMap['kavita.hw@sscorp.com']._id,
              usersMap['vikram.hw@sscorp.com']._id,
              usersMap['rahul.hw@sscorp.com']._id,
              usersMap['ananya.hw@sscorp.com']._id
            ],
            workflowStages: [
              { id: 'REQUIREMENTS', label: 'Requirements', color: 'bg-slate-500' },
              { id: 'SCHEMATICS', label: 'Schematics & Design', color: 'bg-blue-500' },
              { id: 'BOM_SOURCING', label: 'BOM & Sourcing', color: 'bg-amber-500' },
              { id: 'BRINGUP', label: 'Bring-up & Bench', color: 'bg-indigo-500' },
              { id: 'VALIDATION', label: 'Validation & DVT', color: 'bg-purple-500' },
              { id: 'DONE', label: 'Hardware Verified', color: 'bg-emerald-500' }
            ]
          },
          {
            name: 'PCB Layout & Fabrication',
            key: 'PCB',
            icon: 'Layers',
            color: '#0EA5E9',
            description: 'High-density 6-layer PCB routing, impedance matching, Gerber generation, and assembly.',
            leadId: usersMap['suresh.pcb@sscorp.com']._id,
            members: [
              usersMap['suresh.pcb@sscorp.com']._id,
              usersMap['kavita.hw@sscorp.com']._id
            ],
            workflowStages: [
              { id: 'DRC_RULES', label: 'Design Rules (DRC)', color: 'bg-slate-500' },
              { id: 'PLACEMENT', label: 'Placement', color: 'bg-blue-500' },
              { id: 'ROUTING_LAYERS', label: 'Routing & Layers', color: 'bg-amber-500' },
              { id: 'GERBER_EXPORT', label: 'Gerber Export', color: 'bg-indigo-500' },
              { id: 'FAB_ASSEMBLY', label: 'Fab & Assembly', color: 'bg-purple-500' },
              { id: 'DONE', label: 'Board Delivered', color: 'bg-emerald-500' }
            ]
          },
          {
            name: 'Firmware & Embedded RTOS',
            key: 'FW',
            icon: 'Binary',
            color: '#9333EA',
            description: 'FreeRTOS kernel, SPI/I2C drivers, secure bootloader, and OTA update engine.',
            leadId: usersMap['deepak.embed@sscorp.com']._id,
            members: [
              usersMap['deepak.embed@sscorp.com']._id,
              usersMap['priya.embed@sscorp.com']._id,
              usersMap['manoj.embed@sscorp.com']._id,
              usersMap['sneha.embed@sscorp.com']._id,
              usersMap['amit.embed@sscorp.com']._id,
              usersMap['divya.embed@sscorp.com']._id
            ],
            workflowStages: [
              { id: 'ARCHITECTURE', label: 'Architecture & Spec', color: 'bg-slate-500' },
              { id: 'HAL_DRIVERS', label: 'HAL & Drivers', color: 'bg-blue-500' },
              { id: 'FIRMWARE_DEV', label: 'Firmware Dev', color: 'bg-amber-500' },
              { id: 'HIL_TESTING', label: 'HIL / Bench Test', color: 'bg-indigo-500' },
              { id: 'RELEASE', label: 'Firmware Staging', color: 'bg-purple-500' },
              { id: 'DONE', label: 'Flashed & Done', color: 'bg-emerald-500' }
            ]
          }
        ]
      },
      {
        name: 'Cloud Fleet Management Platform',
        key: 'CFM',
        description: 'Next-gen enterprise software portal for device telematics, fleet analytics, and real-time alerts.',
        category: 'Software & Cloud',
        color: '#16A34A', // Green
        leadId: pmUser._id,
        workflowStages: [
          { id: 'BACKLOG', label: 'Backlog', color: 'bg-slate-500' },
          { id: 'TODO', label: 'Ready for Dev', color: 'bg-blue-500' },
          { id: 'IN_PROGRESS', label: 'In Development', color: 'bg-amber-500' },
          { id: 'IN_REVIEW', label: 'Code Review & QA', color: 'bg-purple-500' },
          { id: 'DONE', label: 'Deployed to Staging/Prod', color: 'bg-emerald-500' }
        ],
        teams: [
          {
            name: 'Frontend Web & UI',
            key: 'UI',
            icon: 'Layout',
            color: '#16A34A',
            description: 'React/Next.js dashboard interfaces, telemetry widgets, map tracking, and analytics charts.',
            leadId: usersMap['neha.soft@sscorp.com']._id,
            members: [
              usersMap['rohit.soft@sscorp.com']._id,
              usersMap['neha.soft@sscorp.com']._id
            ],
            workflowStages: [
              { id: 'BACKLOG', label: 'Backlog', color: 'bg-slate-500' },
              { id: 'TODO', label: 'To Do', color: 'bg-blue-500' },
              { id: 'IN_PROGRESS', label: 'In Development', color: 'bg-amber-500' },
              { id: 'CODE_REVIEW', label: 'Code Review (PR)', color: 'bg-indigo-500' },
              { id: 'QA_TESTING', label: 'QA Testing', color: 'bg-purple-500' },
              { id: 'DONE', label: 'Deployed & Done', color: 'bg-emerald-500' }
            ]
          },
          {
            name: 'Cloud Backend & Microservices',
            key: 'API',
            icon: 'Server',
            color: '#0D9488',
            description: 'Node.js/Go APIs, WebSocket ingestion engine, Kafka streams, and PostgreSQL databases.',
            leadId: usersMap['karthik.soft@sscorp.com']._id,
            members: [
              usersMap['rohit.soft@sscorp.com']._id,
              usersMap['karthik.soft@sscorp.com']._id,
              usersMap['pooja.soft@sscorp.com']._id
            ],
            workflowStages: [
              { id: 'BACKLOG', label: 'Backlog', color: 'bg-slate-500' },
              { id: 'TODO', label: 'To Do', color: 'bg-blue-500' },
              { id: 'IN_PROGRESS', label: 'In Development', color: 'bg-amber-500' },
              { id: 'CODE_REVIEW', label: 'API Review & Security', color: 'bg-indigo-500' },
              { id: 'QA_TESTING', label: 'Integration Tests', color: 'bg-purple-500' },
              { id: 'DONE', label: 'Deployed to Prod', color: 'bg-emerald-500' }
            ]
          },
          {
            name: 'DevOps & Cloud Infra',
            key: 'OPS',
            icon: 'Cloud',
            color: '#475569',
            description: 'Kubernetes clusters, CI/CD pipelines, AWS deployment, and Grafana monitoring.',
            leadId: usersMap['pooja.soft@sscorp.com']._id,
            members: [
              usersMap['pooja.soft@sscorp.com']._id,
              usersMap['karthik.soft@sscorp.com']._id
            ],
            workflowStages: [
              { id: 'BACKLOG', label: 'Backlog', color: 'bg-slate-500' },
              { id: 'TODO', label: 'To Do', color: 'bg-blue-500' },
              { id: 'IN_PROGRESS', label: 'Infra As Code', color: 'bg-amber-500' },
              { id: 'STAGING_VERIFY', label: 'Staging Validation', color: 'bg-indigo-500' },
              { id: 'PROD_DEPLOY', label: 'Production Rollout', color: 'bg-purple-500' },
              { id: 'DONE', label: 'Live & Monitored', color: 'bg-emerald-500' }
            ]
          },
          {
            name: 'Software QA & Automation',
            key: 'QA',
            icon: 'CheckCircle2',
            color: '#EA580C',
            description: 'Playwright end-to-end testing, integration tests, and performance load benchmarks.',
            leadId: usersMap['sanjay.soft@sscorp.com']._id,
            members: [
              usersMap['sanjay.soft@sscorp.com']._id
            ],
            workflowStages: [
              { id: 'TEST_PLANNING', label: 'Test Planning', color: 'bg-slate-500' },
              { id: 'TEST_EXECUTION', label: 'Test Execution', color: 'bg-blue-500' },
              { id: 'BUG_TRIAGE', label: 'Bug Triage', color: 'bg-amber-500' },
              { id: 'REGRESSION', label: 'Regression Suite', color: 'bg-indigo-500' },
              { id: 'SIGNOFF', label: 'Release Sign-off', color: 'bg-purple-500' },
              { id: 'DONE', label: 'QA Approved', color: 'bg-emerald-500' }
            ]
          }
        ]
      },
      {
        name: 'Autonomous Telemetry Station',
        key: 'ATMS',
        description: 'Complete end-to-end integration: Solar power PCB hardware, ARM firmware, and cloud telemetry analytics.',
        category: 'Integrated Systems',
        color: '#9333EA', // Purple
        leadId: pmUser._id,
        workflowStages: [
          { id: 'BACKLOG', label: 'Requirement Backlog', color: 'bg-slate-500' },
          { id: 'TODO', label: 'Scheduled', color: 'bg-blue-500' },
          { id: 'IN_PROGRESS', label: 'Active Execution', color: 'bg-amber-500' },
          { id: 'IN_REVIEW', label: 'Integrated Validation', color: 'bg-purple-500' },
          { id: 'DONE', label: 'Completed & Field Tested', color: 'bg-emerald-500' }
        ],
        teams: [
          {
            name: 'Hardware & Power Electronics',
            key: 'HW',
            icon: 'Cpu',
            color: '#0284C7',
            description: 'Solar MPPT charging circuits, battery protection, surge arrestors, and enclosure design.',
            leadId: usersMap['vikram.hw@sscorp.com']._id,
            members: [
              usersMap['kavita.hw@sscorp.com']._id,
              usersMap['vikram.hw@sscorp.com']._id,
              usersMap['rahul.hw@sscorp.com']._id,
              usersMap['ananya.hw@sscorp.com']._id
            ],
            workflowStages: [
              { id: 'REQUIREMENTS', label: 'Requirements', color: 'bg-slate-500' },
              { id: 'SCHEMATICS', label: 'Schematics & Design', color: 'bg-blue-500' },
              { id: 'BOM_SOURCING', label: 'BOM & Sourcing', color: 'bg-amber-500' },
              { id: 'BRINGUP', label: 'Bring-up & Bench', color: 'bg-indigo-500' },
              { id: 'VALIDATION', label: 'Validation & DVT', color: 'bg-purple-500' },
              { id: 'DONE', label: 'Hardware Verified', color: 'bg-emerald-500' }
            ]
          },
          {
            name: 'PCB Layout & CAM',
            key: 'PCB',
            icon: 'Layers',
            color: '#0EA5E9',
            description: '4-layer ruggedized PCB layout with thermal relief and conformal coating design.',
            leadId: usersMap['suresh.pcb@sscorp.com']._id,
            members: [
              usersMap['suresh.pcb@sscorp.com']._id
            ],
            workflowStages: [
              { id: 'DRC_RULES', label: 'Design Rules (DRC)', color: 'bg-slate-500' },
              { id: 'PLACEMENT', label: 'Placement', color: 'bg-blue-500' },
              { id: 'ROUTING_LAYERS', label: 'Routing & Layers', color: 'bg-amber-500' },
              { id: 'GERBER_EXPORT', label: 'Gerber Export', color: 'bg-indigo-500' },
              { id: 'FAB_ASSEMBLY', label: 'Fab & Assembly', color: 'bg-purple-500' },
              { id: 'DONE', label: 'Board Delivered', color: 'bg-emerald-500' }
            ]
          },
          {
            name: 'Embedded Firmware',
            key: 'FW',
            icon: 'Binary',
            color: '#9333EA',
            description: 'Ultra low-power sleep modes, 4G LTE-M modem drivers, and cryptographic payload signing.',
            leadId: usersMap['priya.embed@sscorp.com']._id,
            members: [
              usersMap['deepak.embed@sscorp.com']._id,
              usersMap['priya.embed@sscorp.com']._id,
              usersMap['manoj.embed@sscorp.com']._id,
              usersMap['sneha.embed@sscorp.com']._id,
              usersMap['amit.embed@sscorp.com']._id,
              usersMap['divya.embed@sscorp.com']._id
            ],
            workflowStages: [
              { id: 'ARCHITECTURE', label: 'Architecture & Spec', color: 'bg-slate-500' },
              { id: 'HAL_DRIVERS', label: 'HAL & Drivers', color: 'bg-blue-500' },
              { id: 'FIRMWARE_DEV', label: 'Firmware Dev', color: 'bg-amber-500' },
              { id: 'HIL_TESTING', label: 'HIL / Bench Test', color: 'bg-indigo-500' },
              { id: 'RELEASE', label: 'Firmware Staging', color: 'bg-purple-500' },
              { id: 'DONE', label: 'Flashed & Done', color: 'bg-emerald-500' }
            ]
          },
          {
            name: 'Cloud & Dashboard Software',
            key: 'SW',
            icon: 'Code2',
            color: '#16A34A',
            description: 'Live sensor telemetry graphs, historical anomaly detection, and SMS/Email incident dispatch.',
            leadId: usersMap['rohit.soft@sscorp.com']._id,
            members: [
              usersMap['rohit.soft@sscorp.com']._id,
              usersMap['neha.soft@sscorp.com']._id,
              usersMap['karthik.soft@sscorp.com']._id,
              usersMap['pooja.soft@sscorp.com']._id
            ],
            workflowStages: [
              { id: 'BACKLOG', label: 'Backlog', color: 'bg-slate-500' },
              { id: 'TODO', label: 'To Do', color: 'bg-blue-500' },
              { id: 'IN_PROGRESS', label: 'In Development', color: 'bg-amber-500' },
              { id: 'CODE_REVIEW', label: 'Code Review (PR)', color: 'bg-indigo-500' },
              { id: 'QA_TESTING', label: 'QA Testing', color: 'bg-purple-500' },
              { id: 'DONE', label: 'Deployed & Done', color: 'bg-emerald-500' }
            ]
          },
          {
            name: 'System Integration & QA',
            key: 'QA',
            icon: 'CheckCircle2',
            color: '#EA580C',
            description: 'Hardware-in-the-loop (HIL) testing, environmental thermal chamber verification, and automated regression.',
            leadId: usersMap['sanjay.soft@sscorp.com']._id,
            members: [
              usersMap['divya.embed@sscorp.com']._id,
              usersMap['sanjay.soft@sscorp.com']._id
            ],
            workflowStages: [
              { id: 'TEST_PLANNING', label: 'Test Planning', color: 'bg-slate-500' },
              { id: 'TEST_EXECUTION', label: 'Test Execution', color: 'bg-blue-500' },
              { id: 'BUG_TRIAGE', label: 'Bug Triage', color: 'bg-amber-500' },
              { id: 'CERTIFICATION', label: 'Certification & EMC', color: 'bg-indigo-500' },
              { id: 'SIGNOFF', label: 'Final Sign-off', color: 'bg-purple-500' },
              { id: 'DONE', label: 'QA Verified', color: 'bg-emerald-500' }
            ]
          }
        ]
      }
    ];

    // ─── 5. Insert Projects, Sprints & Tasks ──────────────────────────────
    for (const pDef of projectDefs) {
      console.log(`[SS Corp Seeder] Creating Project ${pDef.name} [${pDef.key}]...`);

      const allProjMembers = Object.values(usersMap).map((u) => ({
        userId: u._id,
        role: u._id.toString() === pmUser._id.toString() ? 'PROJECT_MANAGER' : 'MEMBER'
      }));

      const project = await Project.create({
        name: pDef.name,
        key: pDef.key,
        workspaceId: workspace._id,
        leadId: pDef.leadId,
        description: pDef.description,
        category: pDef.category,
        color: pDef.color,
        workflowStages: pDef.workflowStages,
        teams: pDef.teams,
        members: allProjMembers
      });

      // Create Sprints (Sprint 1 Active, Sprint 2 Planned)
      const startDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      const endDate = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000);

      const sprint1 = await Sprint.create({
        name: `${pDef.key} - Sprint 1: Prototype Core`,
        projectId: project._id,
        workspaceId: workspace._id,
        createdBy: pmUser._id,
        goal: 'Deliver initial design files, firmware drivers, and baseline integrations.',
        status: 'ACTIVE',
        startDate,
        endDate
      });

      const sprint2 = await Sprint.create({
        name: `${pDef.key} - Sprint 2: Validation & Hardening`,
        projectId: project._id,
        workspaceId: workspace._id,
        createdBy: pmUser._id,
        goal: 'Complete validation testing, thermal benchmarking, and cloud API stabilization.',
        status: 'PLANNED',
        startDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 24 * 24 * 60 * 60 * 1000)
      });

      // Populate realistic tasks per team
      const rawTasks = [];

      if (pDef.key === 'SGH') {
        // Smart Gateway IoT Hub tasks
        rawTasks.push(
          {
            title: 'Design 12V to 3.3V Step-Down Buck Converter circuit',
            desc: 'Calculate inductor values, output capacitor ripple, and thermal dissipation for 3A continuous load.',
            team: 'Hardware & Circuit Design',
            assignee: usersMap['vikram.hw@sscorp.com'],
            status: 'DONE',
            priority: 'HIGH',
            points: 5,
            sprint: sprint1._id,
            type: 'TASK'
          },
          {
            title: 'Select Cortex-M4 Microcontroller & crystal oscillator',
            desc: 'Compare STM32 vs NXP for dual SPI flash and low power standby current under 15uA.',
            team: 'Hardware & Circuit Design',
            assignee: usersMap['kavita.hw@sscorp.com'],
            status: 'SCHEMATICS',
            priority: 'MEDIUM',
            points: 3,
            sprint: sprint1._id,
            type: 'TASK'
          },
          {
            title: 'Transient voltage suppressor (TVS) ESD protection design',
            desc: 'Implement IEC 61000-4-2 Level 4 protection on external RS485 and USB lines.',
            team: 'Hardware & Circuit Design',
            assignee: usersMap['rahul.hw@sscorp.com'],
            status: 'BOM_SOURCING',
            priority: 'URGENT',
            points: 5,
            sprint: sprint1._id,
            type: 'TASK'
          },
          {
            title: 'Lab bench bring-up and power rail ripple measurement',
            desc: 'Verify 3.3V and 1.8V rails under 0-100% transient load with oscilloscope FFT.',
            team: 'Hardware & Circuit Design',
            assignee: usersMap['ananya.hw@sscorp.com'],
            status: 'BRINGUP',
            priority: 'HIGH',
            points: 5,
            sprint: sprint1._id,
            type: 'TASK'
          },
          {
            title: 'Temperature chamber DVT validation (-20°C to +70°C)',
            desc: 'Full environmental thermal sweep verifying clock stability and zero memory faults.',
            team: 'Hardware & Circuit Design',
            assignee: usersMap['vikram.hw@sscorp.com'],
            status: 'VALIDATION',
            priority: 'MEDIUM',
            points: 5,
            sprint: sprint1._id,
            type: 'TASK'
          },
          {
            title: 'Complete 6-layer impedance controlled PCB routing',
            desc: 'Stackup: Top, GND, Signal1, Power, GND, Bottom. Ensure 50-ohm single ended and 90-ohm USB diff pairs.',
            team: 'PCB Layout & Fabrication',
            assignee: usersMap['suresh.pcb@sscorp.com'],
            status: 'ROUTING_LAYERS',
            priority: 'URGENT',
            points: 8,
            sprint: sprint1._id,
            type: 'TASK'
          },
          {
            title: 'Generate Fabrication Gerber & Pick-and-Place BOM files',
            desc: 'Export standard RS-274X Gerbers, NC Drill files, and IPC-7351 centroid data for assembly.',
            team: 'PCB Layout & Fabrication',
            assignee: usersMap['suresh.pcb@sscorp.com'],
            status: 'GERBER_EXPORT',
            priority: 'HIGH',
            points: 3,
            sprint: sprint1._id,
            type: 'TASK'
          },
          {
            title: 'Component footprint placement & thermal vias',
            desc: 'Optimize thermal pad relief on QFN packages and bypass capacitor proximity.',
            team: 'PCB Layout & Fabrication',
            assignee: usersMap['suresh.pcb@sscorp.com'],
            status: 'PLACEMENT',
            priority: 'MEDIUM',
            points: 5,
            sprint: sprint1._id,
            type: 'TASK'
          },
          {
            title: 'Perform Design Rule Checks (DRC) for JLCPCB 6-layer spec',
            desc: 'Verify minimum trace width 3.5mil, via drill 0.2mm, and solder mask clearance 2mil.',
            team: 'PCB Layout & Fabrication',
            assignee: usersMap['suresh.pcb@sscorp.com'],
            status: 'DRC_RULES',
            priority: 'HIGH',
            points: 3,
            sprint: sprint1._id,
            type: 'TASK'
          },
          {
            title: 'Port FreeRTOS kernel to ARM Cortex-M4 target',
            desc: 'Configure SysTick timer, preemptive scheduler, heap memory management (heap_4), and fault handlers.',
            team: 'Firmware & Embedded RTOS',
            assignee: usersMap['deepak.embed@sscorp.com'],
            status: 'DONE',
            priority: 'HIGH',
            points: 5,
            sprint: sprint1._id,
            type: 'STORY'
          },
          {
            title: 'Implement DMA-driven SPI Flash driver for W25Q128',
            desc: 'Non-blocking quad SPI read/write driver with sector erase and CRC32 verification.',
            team: 'Firmware & Embedded RTOS',
            assignee: usersMap['priya.embed@sscorp.com'],
            status: 'HAL_DRIVERS',
            priority: 'HIGH',
            points: 5,
            sprint: sprint1._id,
            type: 'TASK'
          },
          {
            title: 'Develop dual-bank Fail-safe OTA Firmware Bootloader',
            desc: 'A/B partition update scheme with ECDSA SHA-256 cryptographic signature validation.',
            team: 'Firmware & Embedded RTOS',
            assignee: usersMap['manoj.embed@sscorp.com'],
            status: 'FIRMWARE_DEV',
            priority: 'URGENT',
            points: 8,
            sprint: sprint1._id,
            type: 'STORY'
          },
          {
            title: 'Automated HIL hardware testbench script suite',
            desc: 'Python PyTest script controlling power supply voltage swings and logic analyzer captures.',
            team: 'Firmware & Embedded RTOS',
            assignee: usersMap['divya.embed@sscorp.com'],
            status: 'HIL_TESTING',
            priority: 'MEDIUM',
            points: 3,
            sprint: sprint1._id,
            type: 'TASK'
          },
          {
            title: 'Firmware Release Candidate v1.0.0-rc2 staging build',
            desc: 'Tag git commit, generate signed bin/hex artifacts, and verify checksum table.',
            team: 'Firmware & Embedded RTOS',
            assignee: usersMap['deepak.embed@sscorp.com'],
            status: 'RELEASE',
            priority: 'HIGH',
            points: 3,
            sprint: sprint1._id,
            type: 'TASK'
          }
        );
      } else if (pDef.key === 'CFM') {
        // Cloud Fleet Management Platform tasks
        rawTasks.push(
          {
            title: 'Build Live Telematics Map with Leaflet / Mapbox',
            desc: 'Display real-time vehicle gateway positions with speed clusters and path replay history.',
            team: 'Frontend Web & UI',
            assignee: usersMap['neha.soft@sscorp.com'],
            status: 'DONE',
            priority: 'HIGH',
            points: 5,
            sprint: sprint1._id,
            type: 'STORY'
          },
          {
            title: 'Implement Multi-tenant RBAC permissions manager UI',
            desc: 'Role matrix modal for Super Admin, Project Manager, Team Lead, and Read-Only Inspector.',
            team: 'Frontend Web & UI',
            assignee: usersMap['rohit.soft@sscorp.com'],
            status: 'IN_PROGRESS',
            priority: 'HIGH',
            points: 5,
            sprint: sprint1._id,
            type: 'TASK'
          },
          {
            title: 'Vehicle Fleet Status Card Widgets and Real-time KPI charts',
            desc: 'Interactive Recharts bar/line components for fuel efficiency and diagnostic fault codes.',
            team: 'Frontend Web & UI',
            assignee: usersMap['rohit.soft@sscorp.com'],
            status: 'TODO',
            priority: 'MEDIUM',
            points: 3,
            sprint: sprint1._id,
            type: 'TASK'
          },
          {
            title: 'Code Review (PR #42): WebSocket Live Telemetry Syncing',
            desc: 'Review reactive state handling and memory leak prevention for continuous 10Hz socket stream.',
            team: 'Frontend Web & UI',
            assignee: usersMap['neha.soft@sscorp.com'],
            status: 'CODE_REVIEW',
            priority: 'HIGH',
            points: 3,
            sprint: sprint1._id,
            type: 'TASK'
          },
          {
            title: 'Design High-Throughput MQTT / WebSocket ingestion service',
            desc: 'Handle 50,000 concurrent IoT sensor telemetry packets per second with Redis buffer.',
            team: 'Cloud Backend & Microservices',
            assignee: usersMap['karthik.soft@sscorp.com'],
            status: 'DONE',
            priority: 'URGENT',
            points: 8,
            sprint: sprint1._id,
            type: 'STORY'
          },
          {
            title: 'Build TimescaleDB time-series queries for sensor analytics',
            desc: 'Continuous aggregates for hourly voltage, temperature, vibration, and packet loss metrics.',
            team: 'Cloud Backend & Microservices',
            assignee: usersMap['karthik.soft@sscorp.com'],
            status: 'IN_PROGRESS',
            priority: 'MEDIUM',
            points: 5,
            sprint: sprint1._id,
            type: 'TASK'
          },
          {
            title: 'Setup Kubernetes Terraform cluster on AWS EKS',
            desc: 'Multi-AZ cluster configuration with Auto-scaling group, Ingress Controller, and TLS certificates.',
            team: 'DevOps & Cloud Infra',
            assignee: usersMap['pooja.soft@sscorp.com'],
            status: 'DONE',
            priority: 'HIGH',
            points: 5,
            sprint: sprint1._id,
            type: 'TASK'
          },
          {
            title: 'Configure Prometheus & Grafana alerting dashboards',
            desc: 'Alert rules for CPU > 85%, HTTP 5xx error rate > 1%, and WebSocket connection drops.',
            team: 'DevOps & Cloud Infra',
            assignee: usersMap['pooja.soft@sscorp.com'],
            status: 'STAGING_VERIFY',
            priority: 'MEDIUM',
            points: 3,
            sprint: sprint1._id,
            type: 'TASK'
          },
          {
            title: 'Playwright end-to-end regression automation suite',
            desc: 'Automate user login, project creation, task assignment, and telemetry graph validations.',
            team: 'Software QA & Automation',
            assignee: usersMap['sanjay.soft@sscorp.com'],
            status: 'TEST_EXECUTION',
            priority: 'HIGH',
            points: 5,
            sprint: sprint1._id,
            type: 'TASK'
          }
        );
      } else if (pDef.key === 'ATMS') {
        // Autonomous Telemetry Station (Integrated System)
        rawTasks.push(
          {
            title: 'Design MPPT Solar Battery Charge Controller circuit',
            desc: 'Design synchronous buck converter with peak power tracking algorithm for 100W solar panels.',
            team: 'Hardware & Power Electronics',
            assignee: usersMap['vikram.hw@sscorp.com'],
            status: 'DONE',
            priority: 'URGENT',
            points: 8,
            sprint: sprint1._id,
            type: 'STORY'
          },
          {
            title: 'Thermal modeling of outdoor IP67 enclosure under direct sunlight',
            desc: 'CFD thermal simulation ensuring internal temperature stays below 65°C under 45°C ambient.',
            team: 'Hardware & Power Electronics',
            assignee: usersMap['ananya.hw@sscorp.com'],
            status: 'VALIDATION',
            priority: 'HIGH',
            points: 5,
            sprint: sprint1._id,
            type: 'TASK'
          },
          {
            title: '4-Layer Ruggedized PCB Layout with High Current Power Traces',
            desc: '2oz copper weight on power planes, isolated analog sensor ground plane, and test points.',
            team: 'PCB Layout & CAM',
            assignee: usersMap['suresh.pcb@sscorp.com'],
            status: 'DONE',
            priority: 'HIGH',
            points: 8,
            sprint: sprint1._id,
            type: 'TASK'
          },
          {
            title: 'Develop Quectel 4G LTE-M / NB-IoT AT command parser',
            desc: 'Robust state machine handling network registration, signal quality (CSQ), and socket transmission.',
            team: 'Embedded Firmware',
            assignee: usersMap['priya.embed@sscorp.com'],
            status: 'DONE',
            priority: 'HIGH',
            points: 5,
            sprint: sprint1._id,
            type: 'TASK'
          },
          {
            title: 'Implement Ultra Low-Power Deep Sleep with RTC Wakeup',
            desc: 'Power down all peripherals, achieve < 25 uA sleep current, and wake up every 15 minutes to sample sensors.',
            team: 'Embedded Firmware',
            assignee: usersMap['sneha.embed@sscorp.com'],
            status: 'FIRMWARE_DEV',
            priority: 'URGENT',
            points: 5,
            sprint: sprint1._id,
            type: 'STORY'
          },
          {
            title: 'Build Live Station Telemetry Dashboard & Gauges',
            desc: 'Real-time battery voltage, solar input wattage, temperature, and atmospheric pressure gauges.',
            team: 'Cloud & Dashboard Software',
            assignee: usersMap['rohit.soft@sscorp.com'],
            status: 'DONE',
            priority: 'HIGH',
            points: 5,
            sprint: sprint1._id,
            type: 'STORY'
          },
          {
            title: 'Automated SMS / WhatsApp alerts on low battery or sensor fault',
            desc: 'Twilio API trigger when battery drops below 11.2V or station fails to heartbeat for 60 minutes.',
            team: 'Cloud & Dashboard Software',
            assignee: usersMap['neha.soft@sscorp.com'],
            status: 'IN_PROGRESS',
            priority: 'MEDIUM',
            points: 3,
            sprint: sprint1._id,
            type: 'TASK'
          },
          {
            title: 'Environmental Chamber -20°C to +70°C Temperature Test',
            desc: 'Verify continuous sensor sampling and 4G transmission across extreme thermal cycles.',
            team: 'System Integration & QA',
            assignee: usersMap['divya.embed@sscorp.com'],
            status: 'CERTIFICATION',
            priority: 'URGENT',
            points: 5,
            sprint: sprint1._id,
            type: 'TASK'
          },
          {
            title: 'End-to-End Packet Loss & Battery Discharge Benchmark',
            desc: 'Measure solar charging vs discharge profile over 72-hour continuous test.',
            team: 'System Integration & QA',
            assignee: usersMap['sanjay.soft@sscorp.com'],
            status: 'TEST_EXECUTION',
            priority: 'MEDIUM',
            points: 3,
            sprint: sprint1._id,
            type: 'TASK'
          }
        );
      }

      // Insert tasks with sequence numbers
      let taskIndex = 1;
      for (const t of rawTasks) {
        const taskKey = `${pDef.key}-${taskIndex++}`;
        const dueDate = new Date(Date.now() + Math.floor(Math.random() * 8 + 2) * 24 * 60 * 60 * 1000);

        const createdTask = await Task.create({
          key: taskKey,
          taskNumber: taskIndex,
          title: t.title,
          description: t.desc,
          projectId: project._id,
          workspaceId: workspace._id,
          sprintId: t.sprint,
          team: t.team,
          assigneeId: t.assignee ? t.assignee._id : null,
          reporterId: pmUser._id,
          priority: t.priority,
          issueType: t.type,
          status: t.status,
          storyPoints: t.points,
          dueDate,
          workLogs: [
            {
              userId: t.assignee ? t.assignee._id : pmUser._id,
              timeSpentMinutes: Math.floor(Math.random() * 180 + 60),
              description: 'Initial implementation and lab test bench run.',
              createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
            }
          ]
        });

        // Activity log
        await Activity.create({
          taskId: createdTask._id,
          projectId: project._id,
          userId: pmUser._id,
          action: 'CREATED_TASK',
          details: `Created ${t.type.toLowerCase()} '${t.title}' for team ${t.team}`
        });
      }
    }

    console.log('\n=============================================================');
    console.log('🎉 SS Corp Enterprise Workspace & Dynamic Data Seeded Successfully!');
    console.log('=============================================================');
    console.log('🏢 Workspace:     SS Corp (slug: sscorp)');
    console.log('🔑 All Passwords: Test@123');
    console.log('-------------------------------------------------------------');
    console.log('👤 Primary Logins:');
    console.log('  - Super Admin:     admin@sscorp.com');
    console.log('  - Project Manager: arun.manager@sscorp.com');
    console.log('  - Hardware Lead:   kavita.hw@sscorp.com');
    console.log('  - PCB Specialist:  suresh.pcb@sscorp.com');
    console.log('  - Firmware Lead:   deepak.embed@sscorp.com');
    console.log('  - Software Lead:   rohit.soft@sscorp.com');
    console.log('  - QA Lead:         sanjay.soft@sscorp.com');
    console.log('-------------------------------------------------------------');
    console.log('📁 3 Projects Initialized:');
    console.log('  1. Smart Gateway IoT Hub [SGH] (Hardware + PCB + Firmware)');
    console.log('  2. Cloud Fleet Management Platform [CFM] (Software Web + Cloud APIs)');
    console.log('  3. Autonomous Telemetry Station [ATMS] (Hardware + PCB + Firmware + Software)');
    console.log('=============================================================\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
};

seedSSCorp();
