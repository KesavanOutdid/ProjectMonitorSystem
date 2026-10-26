const mongoose = require('mongoose');
const { ISSUE_TYPES, ISSUE_PRIORITY, ISSUE_STATUS } = require('../constants/roles');

const attachmentSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true },
    fileName: { type: String, required: true },
    url: { type: String, required: true },
    storageKey: { type: String, required: true },
    storageDriver: { type: String, default: 'local' }, // 'local' or 's3'
    mimeType: { type: String, required: true },
    size: { type: Number, required: true }, // in bytes
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const taskSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      uppercase: true,
      trim: true,
      index: true // e.g. PROJ-101
    },
    taskNumber: {
      type: Number,
      index: true
    },
    title: {
      type: String,
      required: [true, 'Please provide task summary/title'],
      trim: true,
      maxlength: 255
    },
    description: {
      type: String,
      default: ''
    },
    issueType: {
      type: String,
      enum: Object.values(ISSUE_TYPES),
      default: ISSUE_TYPES.TASK,
      index: true
    },
    priority: {
      type: String,
      enum: Object.values(ISSUE_PRIORITY),
      default: ISSUE_PRIORITY.MEDIUM,
      index: true
    },
    status: {
      type: String,
      default: 'TODO',
      trim: true,
      index: true
    },
    order: {
      type: Number,
      default: 0 // Position for kanban column ordering
    },
    storyPoints: {
      type: Number,
      default: 0
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true
    },
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true
    },
    assigneeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    reporterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    parentTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
      index: true
    },
    sprintId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sprint',
      default: null,
      index: true
    },
    sprint: {
      type: String,
      default: 'Sprint 1',
      trim: true,
      index: true
    },
    labels: [
      {
        type: String,
        trim: true
      }
    ],
    startDate: {
      type: Date,
      default: null
    },
    dueDate: {
      type: Date,
      default: null
    },
    durationDays: {
      type: Number,
      default: null
    },
    team: {
      type: String,
      default: '',
      trim: true
    },
    epic: {
      type: String,
      default: '',
      trim: true
    },
    originalEstimate: {
      type: Number,
      default: 0 // in minutes
    },
    timeSpent: {
      type: Number,
      default: 0 // in minutes
    },
    customFields: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    formId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Form',
      default: null,
      index: true
    },
    requestType: {
      type: String,
      enum: ['BUG', 'REQUEST_TO_WORK', 'REQUEST_HELP', 'DEPENDENCY_REQUEST', 'TASK_ASSISTANCE', 'OTHER'],
      default: 'OTHER',
      index: true
    },
    relatedTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
      index: true
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null,
      index: true
    },
    teamLeadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    requestStatus: {
      type: String,
      enum: ['PENDING_REVIEW', 'ACCEPTED', 'IN_PROGRESS', 'REJECTED', 'RESOLVED', 'COMPLETED'],
      default: null,
      index: true
    },
    acceptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    acceptedAt: {
      type: Date,
      default: null
    },
    createdTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
      index: true
    },
    originRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Request',
      default: null,
      index: true
    },
    subtasks: [
      {
        key: { type: String, uppercase: true, trim: true },
        title: { type: String, required: true, trim: true },
        description: { type: String, default: '' },
        status: { type: String, default: 'TODO', trim: true },
        isCompleted: { type: Boolean, default: false },
        completedAt: { type: Date, default: null },
        startDate: { type: Date, default: null },
        dueDate: { type: Date, default: null },
        durationDays: { type: Number, default: null },
        assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        createdAt: { type: Date, default: Date.now },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        isLocked: { type: Boolean, default: false },
        lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        lockedAt: { type: Date, default: null },
        minitasks: [
          {
            key: { type: String, uppercase: true, trim: true },
            title: { type: String, required: true, trim: true },
            description: { type: String, default: '' },
            status: { type: String, default: 'TODO', trim: true },
            isCompleted: { type: Boolean, default: false },
            completedAt: { type: Date, default: null },
            startDate: { type: Date, default: null },
            dueDate: { type: Date, default: null },
            durationDays: { type: Number, default: null },
            assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
            createdAt: { type: Date, default: Date.now },
            createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            isLocked: { type: Boolean, default: false },
            lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
            lockedAt: { type: Date, default: null },
            microtasks: [
              {
                key: { type: String, uppercase: true, trim: true },
                title: { type: String, required: true, trim: true },
                description: { type: String, default: '' },
                status: { type: String, default: 'TODO', trim: true },
                isCompleted: { type: Boolean, default: false },
                completedAt: { type: Date, default: null },
                startDate: { type: Date, default: null },
                dueDate: { type: Date, default: null },
                durationDays: { type: Number, default: null },
                assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
                createdAt: { type: Date, default: Date.now },
                createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                isLocked: { type: Boolean, default: false },
                lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
                lockedAt: { type: Date, default: null }
              }
            ]
          }
        ],
        microtasks: [
          {
            key: { type: String, uppercase: true, trim: true },
            title: { type: String, trim: true },
            description: { type: String, default: '' },
            status: { type: String, default: 'TODO', trim: true },
            isCompleted: { type: Boolean, default: false },
            completedAt: { type: Date, default: null },
            startDate: { type: Date, default: null },
            dueDate: { type: Date, default: null },
            durationDays: { type: Number, default: null },
            assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
            createdAt: { type: Date, default: Date.now },
            createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            isLocked: { type: Boolean, default: false },
            lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
            lockedAt: { type: Date, default: null },
            minitasks: []
          }
        ]
      }
    ],
    workLogs: [
      {
        timeSpentMinutes: { type: Number, required: true },
        startedAt: { type: Date, default: Date.now },
        description: { type: String, default: '' },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        createdAt: { type: Date, default: Date.now }
      }
    ],
    linkedIssues: [
      {
        type: { type: String, default: 'relates_to' }, // 'blocks', 'is_blocked_by', 'relates_to', 'duplicates'
        targetTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
        createdAt: { type: Date, default: Date.now }
      }
    ],
    watchers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    attachments: [attachmentSchema],
    isArchived: {
      type: Boolean,
      default: false,
      index: true
    },
    isRestricted: {
      type: Boolean,
      default: false
    },
    isLocked: {
      type: Boolean,
      default: false,
      index: true
    },
    lockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    lockedAt: {
      type: Date,
      default: null
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },
    deletedAt: {
      type: Date,
      default: null
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    purgeAt: {
      type: Date,
      default: null,
      index: true
    },
    deleteContext: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

// Recycle Bin & Soft Delete Indexes
taskSchema.index({ workspaceId: 1, isDeleted: 1 });
taskSchema.index({ projectId: 1, isDeleted: 1 });
taskSchema.index({ isDeleted: 1, purgeAt: 1 });

// High-Performance Indexes for 5ms Cursor Pagination & Filter Scenarios
taskSchema.index({ projectId: 1, isArchived: 1, _id: -1 }); // Default cursor pagination
taskSchema.index({ projectId: 1, status: 1, order: 1 }); // Kanban column order
taskSchema.index({ projectId: 1, status: 1, _id: -1 }); // Filter by status + cursor
taskSchema.index({ assigneeId: 1, status: 1, _id: -1 }); // Filter by assignee + cursor
taskSchema.index({ projectId: 1, priority: 1, _id: -1 }); // Filter by priority + cursor
taskSchema.index({ workspaceId: 1, isArchived: 1, _id: -1 }); // Workspace-wide task search

// Pre-validate hook to guarantee taskNumber and key exist
taskSchema.pre('validate', async function (next) {
  if (!this.taskNumber || isNaN(this.taskNumber)) {
    try {
      const highestTask = await mongoose.model('Task').findOne({ projectId: this.projectId }).sort({ taskNumber: -1 }).select('taskNumber').lean();
      this.taskNumber = (highestTask?.taskNumber || 0) + 1;
      if (!this.key && this.projectId) {
        const Project = mongoose.model('Project');
        const proj = await Project.findById(this.projectId).select('key').lean();
        this.key = `${proj?.key || 'TASK'}-${this.taskNumber}`;
      }
    } catch (e) {
      this.taskNumber = 1;
      if (!this.key) this.key = `TASK-${Date.now().toString().slice(-4)}`;
    }
  }
  next();
});

// Text Index for full-text search across titles and descriptions
taskSchema.index({ title: 'text', description: 'text', key: 'text' });

module.exports = mongoose.model('Task', taskSchema);
