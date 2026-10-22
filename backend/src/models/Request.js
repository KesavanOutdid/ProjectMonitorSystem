const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true
    },
    requestNumber: {
      type: Number,
      required: true,
      index: true
    },
    title: {
      type: String,
      required: [true, 'Please provide request title'],
      trim: true,
      maxlength: 255
    },
    description: {
      type: String,
      default: ''
    },
    requestType: {
      type: String,
      enum: ['BUG', 'REQUEST_TO_WORK', 'REQUEST_HELP', 'DEPENDENCY_REQUEST', 'TASK_ASSISTANCE', 'OTHER'],
      default: 'OTHER',
      index: true
    },
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'MEDIUM'
    },
    requestStatus: {
      type: String,
      enum: ['PENDING_REVIEW', 'ACCEPTED', 'IN_PROGRESS', 'REJECTED', 'RESOLVED', 'COMPLETED'],
      default: 'PENDING_REVIEW',
      index: true
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
    formId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Form',
      default: null,
      index: true
    },
    reporterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    assigneeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null,
      index: true
    },
    team: {
      type: String,
      default: '',
      trim: true
    },
    teamLeadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    relatedTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
      index: true
    },
    createdTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
      index: true
    },
    acceptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    acceptedAt: {
      type: Date,
      default: null
    },
    dueDate: {
      type: Date,
      default: null
    },
    customFields: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    labels: [
      {
        type: String,
        trim: true
      }
    ],
    isArchived: {
      type: Boolean,
      default: false,
      index: true
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

requestSchema.index({ projectId: 1, createdAt: -1 });
requestSchema.index({ projectId: 1, requestStatus: 1 });
requestSchema.index({ teamLeadId: 1, requestStatus: 1 });
requestSchema.index({ workspaceId: 1, isDeleted: 1 });
requestSchema.index({ projectId: 1, isDeleted: 1 });
requestSchema.index({ isDeleted: 1, purgeAt: 1 });

module.exports = mongoose.model('Request', requestSchema);
