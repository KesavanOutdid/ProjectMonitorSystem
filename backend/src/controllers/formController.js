const mongoose = require('mongoose');
const Form = require('../models/Form');
const Request = require('../models/Request');
const Task = require('../models/Task');
const Project = require('../models/Project');
const Team = require('../models/Team');
const User = require('../models/User');
const Activity = require('../models/Activity');
const Comment = require('../models/Comment');
const asyncHandler = require('../middlewares/asyncHandler');
const { emitToProject } = require('../config/socket');

// 3 Predefined System Forms (Fixed, standard templates)
const PREDEFINED_FORMS = [
  {
    title: 'Bug report',
    issueType: 'Bug',
    color: '#EF4444',
    description: 'Report a defect, software error, or unexpected behavior to the Team Lead for triage.',
    fields: [
      {
        id: 'b1',
        name: 'Bug Title',
        type: 'Summary',
        label: 'Bug Title',
        required: true,
        description: 'Concise headline of the bug or issue.',
        placeholder: 'e.g. Broken navigation in mobile view'
      },
      {
        id: 'b2',
        name: 'Bug Description',
        type: 'Description',
        label: 'Bug Description & Details',
        required: true,
        description: 'Explain what went wrong, what happened, and any relevant details.',
        placeholder: 'Describe the bug, what happened, error message...'
      },
      {
        id: 'b3',
        name: 'Select Task',
        type: 'Select Task',
        label: 'Related Task',
        required: false,
        description: 'Select existing task (shows Task ID, Title & any Subtasks).',
        placeholder: 'Select a task...'
      },
      {
        id: 'b4',
        name: 'Priority',
        type: 'Priority',
        label: 'Priority Level',
        required: true,
        description: 'Select the priority / severity level.',
        placeholder: 'Select priority',
        options: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
      }
    ]
  },
  {
    title: 'Dependency Request',
    issueType: 'Task',
    color: '#3B82F6',
    description: 'Request assignment or cross-team collaboration to resolve a task dependency. Routes to Team Lead for review and approval.',
    fields: [
      {
        id: 'w1',
        name: 'Request Summary',
        type: 'Summary',
        label: 'Dependency Title / Summary',
        required: true,
        description: 'Short headline of your dependency request.',
        placeholder: 'e.g. Need Redis caching endpoint for auth service'
      },
      {
        id: 'w2',
        name: 'Required Role',
        type: 'Short text',
        label: 'Required Role / Expertise Needed',
        required: true,
        description: 'What role or specialization is needed to resolve this dependency?',
        placeholder: 'e.g. Firmware Engineer, Backend Developer, PCB Designer, QA Specialist'
      },
      {
        id: 'w3',
        name: 'Select Task',
        type: 'Select Task',
        label: 'Dependent Task / Deliverable',
        required: true,
        description: 'Choose the task or dependency item.',
        placeholder: 'Select task from list...'
      },
      {
        id: 'w4',
        name: 'Reason & Details',
        type: 'Description',
        label: 'Reason & Deliverable Details',
        required: true,
        description: 'Explain what is needed from the other team/role and why.',
        placeholder: 'Describe the dependency, interface requirements, and expected deliverable...'
      },
      {
        id: 'w5',
        name: 'Target Date',
        type: 'Date',
        label: 'Target Completion Date',
        required: false,
        description: 'When do you need this dependency completed by?',
        placeholder: 'Date'
      }
    ]
  },
  {
    title: 'Task Assistance',
    issueType: 'Task',
    color: '#F59E0B',
    description: 'Request guidance, pair programming, or unblocking from your Team Lead on a task allotted to you.',
    fields: [
      {
        id: 'h1',
        name: 'Select Task',
        type: 'Select Task',
        label: 'Select Task Allotted to You',
        required: true,
        description: 'Choose from tasks currently allotted / assigned to you.',
        placeholder: 'Select your task...'
      },
      {
        id: 'h2',
        name: 'Reason & Problem',
        type: 'Description',
        label: 'Reason / Problem & Help Needed',
        required: true,
        description: 'Explain the error, what is blocking you, or what guidance you need.',
        placeholder: 'Explain what you tried, where you are stuck, or what guidance is needed...'
      },
      {
        id: 'h3',
        name: 'Target Date',
        type: 'Date',
        label: 'Target Completion / Due Date',
        required: true,
        description: 'When should this task be completed once assisted?',
        placeholder: 'Date'
      }
    ]
  }
];

// @desc    Get all predefined forms for a project
// @route   GET /api/v1/projects/:projectId/forms
// @access  Private
const getProjectForms = asyncHandler(async (req, res) => {
  const { projectId } = req.params;

  const project = await Project.findById(projectId);
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  // Automatically migrate any legacy titles in database to 'Dependency Request' and 'Task Assistance'
  await Form.updateMany(
    { projectId, title: { $regex: /^(request to work|request to work on task)$/i } },
    {
      $set: {
        title: 'Dependency Request',
        description: 'Request assignment or cross-team collaboration to resolve a task dependency. Routes to Team Lead for review and approval.'
      }
    }
  );
  await Form.updateMany(
    { projectId, title: { $regex: /^(request help|request help on task)$/i } },
    {
      $set: {
        title: 'Task Assistance',
        description: 'Request guidance, pair programming, or unblocking from your Team Lead on a task you are currently working on.'
      }
    }
  );

  // Sync latest predefined field schemas into existing project forms
  for (const pf of PREDEFINED_FORMS) {
    await Form.updateMany(
      { projectId, title: { $regex: new RegExp(`^${pf.title}$`, 'i') } },
      { $set: { fields: pf.fields, description: pf.description, issueType: pf.issueType, color: pf.color } }
    );
  }

  let forms = await Form.find({ projectId }).sort({ createdAt: 1 }).lean();

  // If project doesn't have the 3 predefined forms, seed/update them
  const predefinedTitles = PREDEFINED_FORMS.map((pf) => pf.title.toLowerCase());
  const existingTitles = forms.map((f) => f.title.toLowerCase());
  const missingForms = PREDEFINED_FORMS.filter((pf) => !existingTitles.includes(pf.title.toLowerCase()));

  if (missingForms.length > 0) {
    const newDocs = missingForms.map((pf) => ({
      ...pf,
      projectId,
      workspaceId: project.workspaceId,
      createdBy: req.user?._id
    }));
    await Form.insertMany(newDocs);
    forms = await Form.find({ projectId }).sort({ createdAt: 1 }).lean();
  }

  // Filter to keep predefined forms prominently
  const prioritizedForms = forms.filter((f) =>
    predefinedTitles.includes(f.title.toLowerCase())
  );

  const finalForms = prioritizedForms.length > 0 ? prioritizedForms : forms;

  res.json({
    success: true,
    count: finalForms.length,
    data: finalForms
  });
});

// @desc    Create custom form (disabled or locked to predefined system)
// @route   POST /api/v1/projects/:projectId/forms
// @access  Private
const createProjectForm = asyncHandler(async (req, res) => {
  res.status(400).json({
    success: false,
    error: 'Custom form creation is disabled. Please use the predefined system forms (Bug Report, Dependency Request, Task Assistance).'
  });
});

// @desc    Update a project form
// @route   PUT /api/v1/projects/:projectId/forms/:formId
// @access  Private
const updateProjectForm = asyncHandler(async (req, res) => {
  const { projectId, formId } = req.params;
  const { title, issueType, color, description, fields, status } = req.body;

  let form = await Form.findOne({ _id: formId, projectId });
  if (!form) {
    return res.status(404).json({ success: false, error: 'Form not found' });
  }

  if (title !== undefined) form.title = title;
  if (issueType !== undefined) form.issueType = issueType;
  if (color !== undefined) form.color = color;
  if (description !== undefined) form.description = description;
  if (fields !== undefined) form.fields = fields;
  if (status !== undefined) form.status = status;

  await form.save();

  res.json({
    success: true,
    data: form
  });
});

// @desc    Delete a project form
// @route   DELETE /api/v1/projects/:projectId/forms/:formId
// @access  Private
const deleteProjectForm = asyncHandler(async (req, res) => {
  const { projectId, formId } = req.params;

  const form = await Form.findOneAndDelete({ _id: formId, projectId });
  if (!form) {
    return res.status(404).json({ success: false, error: 'Form not found' });
  }

  res.json({
    success: true,
    message: 'Form deleted successfully'
  });
});

// @desc    Submit a predefined form -> Routes request to Team Lead & links to target task
// @route   POST /api/v1/projects/:projectId/forms/:formId/submit
// @access  Private
const submitProjectForm = asyncHandler(async (req, res) => {
  const { projectId, formId } = req.params;
  const { formValues, title, description, priority, dueDate } = req.body;

  const project = await Project.findById(projectId);
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  const form = await Form.findOne({ _id: formId, projectId });

  // 1. Determine Request Type
  let requestType = 'OTHER';
  const lowerTitle = (form?.title || '').toLowerCase();
  if (lowerTitle.includes('bug')) {
    requestType = 'BUG';
  } else if (lowerTitle.includes('work') || lowerTitle.includes('dependency')) {
    requestType = 'REQUEST_TO_WORK';
  } else if (lowerTitle.includes('help') || lowerTitle.includes('assistance')) {
    requestType = 'REQUEST_HELP';
  }

  // 2. Identify Target / Related Task (if selected in dropdown)
  let rawTaskId =
    req.body.relatedTaskId ||
    formValues?.['Select Task'] ||
    formValues?.['Related Task'] ||
    formValues?.targetTaskId ||
    null;

  let relatedTask = null;
  if (rawTaskId && typeof rawTaskId === 'string') {
    const objectIdMatch = rawTaskId.match(/[0-9a-fA-F]{24}/);
    if (objectIdMatch) {
      relatedTask = await Task.findOne({ _id: objectIdMatch[0], projectId }).populate('assigneeId', 'name email avatar');
    } else {
      // Try finding by Task Key (e.g. PROJ-101)
      const keyMatch = rawTaskId.match(/[A-Z0-9]+-\d+/i);
      if (keyMatch) {
        relatedTask = await Task.findOne({ key: keyMatch[0].toUpperCase(), projectId }).populate('assigneeId', 'name email avatar');
      }
    }
  }

  // 3. Identify User's Team & Team Lead
  let team = null;
  if (req.body.teamId) {
    team = await Team.findById(req.body.teamId).populate('leadId', 'name email avatar jobTitle');
    if (!team && project.teams) {
      const embedded = project.teams.find((t) => t._id.toString() === req.body.teamId.toString());
      if (embedded) team = embedded;
    }
  }

  // If target task belongs to a specific team, try using that team
  if (!team && relatedTask) {
    if (relatedTask.teamId) {
      team = await Team.findById(relatedTask.teamId).populate('leadId', 'name email avatar jobTitle');
    } else if (relatedTask.team) {
      team = await Team.findOne({
        workspaceId: project.workspaceId,
        $or: [{ name: relatedTask.team }, { key: relatedTask.team }]
      }).populate('leadId', 'name email avatar jobTitle');
      if (!team && project.teams) {
        team = project.teams.find((t) => t.name === relatedTask.team || t.key === relatedTask.team);
      }
    }
  }

  // Fallback: look up team where the current submitting user is a member
  if (!team) {
    team = await Team.findOne({
      workspaceId: project.workspaceId,
      members: req.user._id
    }).populate('leadId', 'name email avatar jobTitle');
  }

  const teamLeadId = req.body.teamLeadId || team?.leadId?._id || team?.leadId || relatedTask?.teamLeadId || null;

  // 4. Generate Request Key & Number
  const reqCount = await Request.countDocuments({ projectId });
  const requestNumber = reqCount + 1;
  const projKey = project.key || 'TASK';
  const key = `${projKey}-REQ-${requestNumber}`;

  // 5. Determine Title
  const finalTitle =
    title ||
    formValues?.Summary ||
    formValues?.['Bug Title'] ||
    formValues?.['Request Summary'] ||
    formValues?.['Blocker Summary'] ||
    (relatedTask ? `Assistance on [${relatedTask.key}] ${relatedTask.title}` : `[${form?.title || 'Form'}] Submission #${requestNumber}`);

  // Build formatted description
  let formattedDesc =
    description ||
    formValues?.Description ||
    formValues?.['Bug Description'] ||
    formValues?.['Reason & Details'] ||
    formValues?.['Reason & Problem'] ||
    formValues?.['Steps to Reproduce'] ||
    formValues?.['Why do you want to take this?'] ||
    formValues?.['Problem & What You Tried'] ||
    '';

  if (formValues && typeof formValues === 'object') {
    const extraDetails = Object.entries(formValues)
      .filter(([k]) => ![
        'Summary',
        'Bug Title',
        'Bug Description',
        'Request Summary',
        'Reason & Details',
        'Reason & Problem',
        'Blocker Summary',
        'Description',
        'Steps to Reproduce',
        'Why do you want to take this?',
        'Problem & What You Tried',
        'Select Task'
      ].includes(k))
      .map(([k, v]) => `• **${k}**: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join('\n');

    if (extraDetails) {
      formattedDesc += `\n\n### Form Details:\n${extraDetails}`;
    }
  }

  if (relatedTask) {
    formattedDesc += `\n\n🔗 **Linked Task**: [${relatedTask.key} - ${relatedTask.title}](status: ${relatedTask.status})`;
  }

  // 6. Create Document in dedicated 'requests' collection!
  const requestDoc = await Request.create({
    key,
    requestNumber,
    title: finalTitle,
    description: formattedDesc,
    requestType,
    priority: priority || formValues?.Priority || formValues?.Severity || formValues?.['Urgency Level'] || (relatedTask?.priority || 'MEDIUM'),
    requestStatus: 'PENDING_REVIEW',
    projectId,
    workspaceId: project.workspaceId,
    reporterId: req.user._id,
    formId: form ? form._id : null,
    relatedTaskId: relatedTask ? relatedTask._id : null,
    teamId: team ? team._id : null,
    team: team ? team.name : (relatedTask?.team || ''),
    teamLeadId: teamLeadId,
    dueDate: dueDate ? new Date(dueDate) : null,
    customFields: formValues || {},
    labels: ['FormSubmission', requestType, team?.name ? team.name.replace(/\s+/g, '') : 'General']
  });

  // 7. If linked to an existing task, record activity & notify on that task
  if (relatedTask) {
    await Activity.create({
      workspaceId: project.workspaceId,
      projectId,
      taskId: relatedTask._id,
      userId: req.user._id,
      action: 'REQUEST_LINKED',
      details: {
        requestKey: key,
        requestType,
        requestTitle: finalTitle,
        teamLead: team?.leadId?.name || 'Assigned Lead'
      }
    });

    await Comment.create({
      taskId: relatedTask._id,
      userId: req.user._id,
      content: `🔔 **${form?.title || requestType}** (Request #${key}) raised by **${req.user.name}**: "${finalTitle}". Waiting for Team Lead (${team?.leadId?.name || 'Lead'}) review.`
    });
  }

  // 8. Log initial activity on the new request
  await Activity.create({
    workspaceId: project.workspaceId,
    projectId,
    requestId: requestDoc._id,
    userId: req.user._id,
    action: 'CREATED_VIA_FORM',
    details: {
      formTitle: form?.title || 'Predefined Form',
      requestType,
      requestKey: key,
      teamLead: team?.leadId?.name || 'None'
    }
  });

  emitToProject(projectId, 'request:created', { request: requestDoc });

  res.status(201).json({
    success: true,
    message: 'Request submitted successfully and routed to Team Lead',
    data: requestDoc
  });
});

// @desc    Get all submitted requests for a project from 'requests' collection
// @route   GET /api/v1/projects/:projectId/requests
// @access  Private
const getProjectRequests = asyncHandler(async (req, res) => {
  const { projectId } = req.params;

  const requests = await Request.find({
    projectId,
    isArchived: false,
    isDeleted: { $ne: true }
  })
    .populate('reporterId', 'name email avatar jobTitle role')
    .populate('assigneeId', 'name email avatar jobTitle role')
    .populate('acceptedBy', 'name email avatar jobTitle role')
    .populate('teamLeadId', 'name email avatar jobTitle role')
    .populate('relatedTaskId', 'key title status priority assigneeId issueType')
    .populate('createdTaskId', 'key title status priority assigneeId issueType')
    .populate('teamId', 'name key color leadId')
    .populate('formId', 'title color issueType')
    .sort({ createdAt: -1 })
    .lean();

  // Fetch comments for these requests
  const requestIds = requests.map((r) => r._id);
  const comments = await Comment.find({
    $or: [
      { requestId: { $in: requestIds } },
      { taskId: { $in: requestIds } }
    ]
  })
    .populate('userId', 'name email avatar jobTitle role')
    .sort({ createdAt: 1 })
    .lean();

  const commentsByReq = {};
  comments.forEach((c) => {
    const rId = (c.requestId || c.taskId)?.toString();
    if (rId) {
      if (!commentsByReq[rId]) commentsByReq[rId] = [];
      commentsByReq[rId].push(c);
    }
  });

  const enrichedRequests = requests.map((r) => ({
    ...r,
    comments: commentsByReq[r._id.toString()] || []
  }));

  res.json({
    success: true,
    count: enrichedRequests.length,
    data: enrichedRequests
  });
});

// @desc    Update Request Status (Accept, Reject, In Progress, Complete)
// @route   PATCH /api/v1/projects/:projectId/requests/:requestId/status
// @access  Private
const updateRequestStatus = asyncHandler(async (req, res) => {
  const { projectId, requestId } = req.params;
  const { requestStatus, boardStatus, assigneeId, sprintId, sprint, priority, note } = req.body;

  const requestDoc = await Request.findOne({ _id: requestId, projectId });
  if (!requestDoc) {
    return res.status(404).json({ success: false, error: 'Request not found' });
  }

  // Permission check:
  // Only the assigned Team Lead of this request, OR Super Admin / Org Admin / Project Manager
  const isSuperOrOrgAdmin = ['SUPER_ADMIN', 'ORG_ADMIN', 'PROJECT_MANAGER'].includes(req.user.role);
  const isDesignatedTeamLead =
    requestDoc.teamLeadId && requestDoc.teamLeadId.toString() === req.user._id.toString();

  // Also check if current user is lead of the team
  let isTeamLeadOfTeam = false;
  if (requestDoc.teamId) {
    const team = await Team.findById(requestDoc.teamId);
    if (team?.leadId && team.leadId.toString() === req.user._id.toString()) {
      isTeamLeadOfTeam = true;
    }
  }

  if (!isSuperOrOrgAdmin && !isDesignatedTeamLead && !isTeamLeadOfTeam) {
    return res.status(403).json({
      success: false,
      error: 'Permission denied: Only the Team Lead or Project Manager can approve or reject this request.'
    });
  }

  const oldRequestStatus = requestDoc.requestStatus;
  const actionType = req.body.actionType;

  // -------------------------------------------------------------
  // ACTION 2: ACCEPT & CREATE BOARD TASK
  // -------------------------------------------------------------
  if (actionType === 'CREATE_TASK' || req.body.createBoardTask) {
    const project = await Project.findById(projectId);

    // Determine Team Code
    let teamCode = 'GEN';
    if (requestDoc.teamId) {
      const teamObj = await Team.findById(requestDoc.teamId);
      if (teamObj?.key) teamCode = teamObj.key.toUpperCase();
      else if (teamObj?.name) teamCode = teamObj.name.substring(0, 3).toUpperCase();
    } else if (requestDoc.team) {
      teamCode = requestDoc.team.substring(0, 3).toUpperCase();
    }

    // Increment Project task counter
    const updatedProject = await Project.findByIdAndUpdate(
      projectId,
      { $inc: { taskCounter: 1 } },
      { new: true, upsert: false }
    );
    let taskNumber = updatedProject?.taskCounter || 1;
    const projKey = project?.key || 'TASK';
    const boardKey = `${projKey}-MT-${teamCode}-${taskNumber}`;

    const newBoardTask = await Task.create({
      key: boardKey,
      taskNumber: Number(taskNumber),
      title: requestDoc.title.replace(/^\[.*?\]\s*/, ''),
      description: `${requestDoc.description || ''}\n\n*Created by Team Lead from Request #${requestDoc.key}*`,
      issueType: requestDoc.requestType === 'BUG' ? 'BUG' : 'TASK',
      priority: priority || requestDoc.priority || 'MEDIUM',
      status: boardStatus || 'TODO',
      projectId,
      workspaceId: requestDoc.workspaceId,
      reporterId: requestDoc.reporterId,
      assigneeId: assigneeId && assigneeId !== 'unassigned' ? assigneeId : (requestDoc.requestType === 'REQUEST_TO_WORK' ? requestDoc.reporterId : null),
      sprintId: sprintId && sprintId !== 'backlog' ? sprintId : null,
      sprint: sprint || (sprintId && sprintId !== 'backlog' ? 'Sprint 1' : 'Backlog'),
      teamId: requestDoc.teamId,
      team: requestDoc.team,
      teamLeadId: requestDoc.teamLeadId || req.user._id,
      originRequestId: requestDoc._id,
      labels: ['BoardTask', requestDoc.requestType || 'Request']
    });

    requestDoc.requestStatus = 'IN_PROGRESS';
    requestDoc.createdTaskId = newBoardTask._id;
    requestDoc.acceptedBy = req.user._id;
    requestDoc.acceptedAt = new Date();
    await requestDoc.save();

    await Comment.create({
      requestId: requestDoc._id,
      userId: req.user._id,
      content: `📋 Team Lead ${req.user.name} accepted request and created board task **[${boardKey} - ${newBoardTask.title}]**. ${note ? 'Note: ' + note : ''}`
    });

    await Activity.create({
      workspaceId: requestDoc.workspaceId,
      projectId,
      requestId: requestDoc._id,
      userId: req.user._id,
      action: 'TASK_CREATED_FROM_REQUEST',
      details: {
        boardKey,
        boardTaskId: newBoardTask._id
      }
    });

    const populatedRequest = await Request.findById(requestDoc._id)
      .populate('reporterId', 'name email avatar jobTitle role')
      .populate('assigneeId', 'name email avatar jobTitle role')
      .populate('acceptedBy', 'name email avatar jobTitle role')
      .populate('teamLeadId', 'name email avatar jobTitle role')
      .populate('relatedTaskId', 'key title status priority assigneeId issueType')
      .populate('createdTaskId', 'key title status priority assigneeId issueType')
      .populate('teamId', 'name key color')
      .populate('formId', 'title color issueType')
      .lean();

    emitToProject(projectId, 'task:created', { task: newBoardTask });
    emitToProject(projectId, 'request:updated', { request: populatedRequest });
    emitToProject(projectId, 'task:updated', { task: populatedRequest });

    return res.json({
      success: true,
      message: `Board task ${boardKey} created successfully`,
      data: {
        request: populatedRequest,
        createdTask: newBoardTask
      }
    });
  }

  // -------------------------------------------------------------
  // ACTION 1: ACCEPT & RESOLVE DIRECTLY (Marks COMPLETED)
  // -------------------------------------------------------------
  if (actionType === 'RESOLVE_DIRECTLY' || requestStatus === 'COMPLETED' || requestStatus === 'RESOLVED') {
    requestDoc.requestStatus = 'COMPLETED';
    requestDoc.acceptedBy = req.user._id;
    requestDoc.acceptedAt = new Date();

    // If Dependency Request / Request to Work -> Assign target task to requester!
    if ((requestDoc.requestType === 'REQUEST_TO_WORK' || requestDoc.requestType === 'DEPENDENCY_REQUEST') && requestDoc.relatedTaskId) {
      const targetTask = await Task.findById(requestDoc.relatedTaskId);
      if (targetTask) {
        targetTask.assigneeId = requestDoc.reporterId;
        if (targetTask.status === 'BACKLOG') targetTask.status = 'TODO';
        await targetTask.save();

        const requester = await User.findById(requestDoc.reporterId).select('name');
        await Comment.create({
          taskId: targetTask._id,
          userId: req.user._id,
          content: `✅ Team Lead ${req.user.name} APPROVED Dependency Request (${requestDoc.key}). Task assigned to **${requester?.name || 'Requester'}**! ${note ? 'Note: ' + note : ''}`
        });

        emitToProject(projectId, 'task:updated', { task: targetTask });
      }
    } else if ((requestDoc.requestType === 'REQUEST_HELP' || requestDoc.requestType === 'TASK_ASSISTANCE') && requestDoc.relatedTaskId) {
      await Comment.create({
        taskId: requestDoc.relatedTaskId,
        userId: req.user._id,
        content: `🤝 Team Lead ${req.user.name} directly resolved Task Assistance (${requestDoc.key}). Resolution: ${note || 'Issue resolved.'}`
      });
    }

    await requestDoc.save();

    if (note && note.trim()) {
      await Comment.create({
        requestId: requestDoc._id,
        userId: req.user._id,
        content: `✅ Team Lead ${req.user.name} resolved request directly: ${note.trim()}`
      });
    }

    const populatedRequest = await Request.findById(requestDoc._id)
      .populate('reporterId', 'name email avatar jobTitle role')
      .populate('assigneeId', 'name email avatar jobTitle role')
      .populate('acceptedBy', 'name email avatar jobTitle role')
      .populate('teamLeadId', 'name email avatar jobTitle role')
      .populate('relatedTaskId', 'key title status priority assigneeId issueType')
      .populate('createdTaskId', 'key title status priority assigneeId issueType')
      .populate('teamId', 'name key color')
      .populate('formId', 'title color issueType')
      .lean();

    emitToProject(projectId, 'request:updated', { request: populatedRequest });
    emitToProject(projectId, 'task:updated', { task: populatedRequest });

    return res.json({
      success: true,
      message: 'Request resolved and marked completed directly',
      data: populatedRequest
    });
  }

  // -------------------------------------------------------------
  // ACTION 3: REJECT
  // -------------------------------------------------------------
  if (actionType === 'REJECT' || requestStatus === 'REJECTED') {
    requestDoc.requestStatus = 'REJECTED';
    await requestDoc.save();

    const rejectComment = `❌ Request was REJECTED by Team Lead ${req.user.name}. Reason: ${note || 'No reason provided.'}`;
    await Comment.create({
      requestId: requestDoc._id,
      userId: req.user._id,
      content: rejectComment
    });

    if (requestDoc.relatedTaskId) {
      await Comment.create({
        taskId: requestDoc.relatedTaskId,
        userId: req.user._id,
        content: rejectComment
      });
    }

    const populatedRequest = await Request.findById(requestDoc._id)
      .populate('reporterId', 'name email avatar jobTitle role')
      .populate('assigneeId', 'name email avatar jobTitle role')
      .populate('acceptedBy', 'name email avatar jobTitle role')
      .populate('teamLeadId', 'name email avatar jobTitle role')
      .populate('relatedTaskId', 'key title status priority assigneeId issueType')
      .populate('createdTaskId', 'key title status priority assigneeId issueType')
      .populate('teamId', 'name key color')
      .populate('formId', 'title color issueType')
      .lean();

    emitToProject(projectId, 'request:updated', { request: populatedRequest });
    emitToProject(projectId, 'task:updated', { task: populatedRequest });

    return res.json({
      success: true,
      message: 'Request rejected',
      data: populatedRequest
    });
  }

  // Fallback for standard status transitions (ACCEPTED, IN_PROGRESS, etc.)
  requestDoc.requestStatus = requestStatus;
  if (requestStatus === 'ACCEPTED' || requestStatus === 'IN_PROGRESS') {
    requestDoc.acceptedBy = req.user._id;
    requestDoc.acceptedAt = new Date();
  }
  await requestDoc.save();

  if (note && note.trim()) {
    await Comment.create({
      requestId: requestDoc._id,
      userId: req.user._id,
      content: note.trim()
    });
  }

  await Activity.create({
    workspaceId: requestDoc.workspaceId,
    projectId,
    requestId: requestDoc._id,
    userId: req.user._id,
    action: 'STATUS_UPDATED',
    details: {
      oldStatus: oldRequestStatus,
      newStatus: requestStatus,
      requestKey: requestDoc.key,
      note
    }
  });

  const populatedRequest = await Request.findById(requestDoc._id)
    .populate('reporterId', 'name email avatar jobTitle role')
    .populate('assigneeId', 'name email avatar jobTitle role')
    .populate('acceptedBy', 'name email avatar jobTitle role')
    .populate('teamLeadId', 'name email avatar jobTitle role')
    .populate('relatedTaskId', 'key title status priority assigneeId issueType')
    .populate('createdTaskId', 'key title status priority assigneeId issueType')
    .populate('teamId', 'name key color')
    .populate('formId', 'title color issueType')
    .lean();

  emitToProject(projectId, 'request:updated', { request: populatedRequest });
  emitToProject(projectId, 'task:updated', { task: populatedRequest });

  res.json({
    success: true,
    message: `Request status updated to ${requestStatus}`,
    data: populatedRequest
  });
});

// @desc    Add comment on a request
// @route   POST /api/v1/projects/:projectId/requests/:requestId/comments
// @access  Private
const addRequestComment = asyncHandler(async (req, res) => {
  const { projectId, requestId } = req.params;
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ success: false, error: 'Please provide comment text' });
  }

  const requestDoc = await Request.findOne({ _id: requestId, projectId });
  if (!requestDoc) {
    return res.status(404).json({ success: false, error: 'Request not found' });
  }

  const comment = await Comment.create({
    requestId: requestDoc._id,
    userId: req.user._id,
    content: content.trim()
  });

  const populatedComment = await Comment.findById(comment._id).populate('userId', 'name email avatar jobTitle role');

  // Also log activity on related task if exists
  if (requestDoc.relatedTaskId) {
    await Activity.create({
      workspaceId: requestDoc.workspaceId,
      projectId,
      taskId: requestDoc.relatedTaskId,
      userId: req.user._id,
      action: 'REQUEST_COMMENTED',
      details: {
        requestKey: requestDoc.key,
        author: req.user.name,
        commentSnippet: content.slice(0, 100)
      }
    });
  }

  emitToProject(projectId, 'comment:created', { comment: populatedComment });
  emitToProject(projectId, 'request:comment_added', { requestId: requestDoc._id, comment: populatedComment });

  res.status(201).json({
    success: true,
    data: populatedComment
  });
});

// @desc    Soft Delete Request (Moved to Recycle Bin, 30-day retention)
// @route   DELETE /api/v1/projects/:projectId/requests/:requestId
// @access  Private (Org Admin, PM, Team Lead, Request Reporter)
const deleteRequest = asyncHandler(async (req, res) => {
  const { projectId, requestId } = req.params;

  const requestDoc = await Request.findOne({ _id: requestId, projectId });
  if (!requestDoc) {
    return res.status(404).json({ success: false, error: 'Request not found' });
  }

  // Permission: Admins, PM, or Reporter of request, or Team Lead
  const isSuperOrOrgAdmin = ['SUPER_ADMIN', 'ORG_ADMIN', 'PROJECT_MANAGER'].includes(req.user.role);
  const isReporter = requestDoc.reporterId && requestDoc.reporterId.toString() === req.user._id.toString();
  const isTeamLead = requestDoc.teamLeadId && requestDoc.teamLeadId.toString() === req.user._id.toString();

  if (!isSuperOrOrgAdmin && !isReporter && !isTeamLead) {
    return res.status(403).json({ success: false, error: 'Not authorized to delete this request' });
  }

  requestDoc.isDeleted = true;
  requestDoc.deletedAt = new Date();
  requestDoc.deletedBy = req.user._id;
  requestDoc.purgeAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  requestDoc.deleteContext = { cascadeFrom: null };
  await requestDoc.save();

  emitToProject(projectId, 'request:deleted', { requestId: requestDoc._id });

  res.json({
    success: true,
    message: 'Request moved to Recycle Bin (retained for 30 days)',
    data: { _id: requestDoc._id }
  });
});

module.exports = {
  getProjectForms,
  createProjectForm,
  updateProjectForm,
  deleteProjectForm,
  submitProjectForm,
  getProjectRequests,
  updateRequestStatus,
  addRequestComment,
  deleteRequest
};
