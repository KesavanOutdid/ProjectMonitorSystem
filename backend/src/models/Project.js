const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide project name'],
      trim: true,
      maxlength: 120
    },
    key: {
      type: String,
      required: [true, 'Please provide a unique project key (e.g., PROJ)'],
      uppercase: true,
      trim: true,
      maxlength: 10
    },
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true
    },
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    description: {
      type: String,
      default: '',
      maxlength: 1000
    },
    category: {
      type: String,
      default: 'Software Development'
    },
    icon: {
      type: String,
      default: 'FolderKanban'
    },
    color: {
      type: String,
      default: '#1E3E62' // Navy Blue Accent
    },
    members: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        role: { type: String, default: 'MEMBER' }
      }
    ],
    teams: [
      {
        name: { type: String, required: true, trim: true },
        key: { type: String, trim: true },
        color: { type: String, default: '#3B82F6' },
        icon: { type: String, default: '👥' },
        description: { type: String, default: '' },
        leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
        workflowStages: [
          {
            id: { type: String, required: true },
            label: { type: String, required: true },
            color: { type: String, default: 'bg-blue-500' }
          }
        ]
      }
    ],
    workflowStages: {
      type: [
        {
          id: { type: String, required: true },
          label: { type: String, required: true },
          color: { type: String, default: 'bg-blue-500' }
        }
      ],
      default: [
        { id: 'BACKLOG', label: 'Idea', color: 'bg-slate-500' },
        { id: 'TODO', label: 'To Do', color: 'bg-blue-500' },
        { id: 'IN_PROGRESS', label: 'In Progress', color: 'bg-amber-500' },
        { id: 'IN_REVIEW', label: 'Testing', color: 'bg-purple-500' },
        { id: 'DONE', label: 'Done', color: 'bg-emerald-500' }
      ]
    },
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
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Compound indexes
projectSchema.index({ workspaceId: 1, key: 1 }, { unique: true });
projectSchema.index({ workspaceId: 1, isArchived: 1, createdAt: -1 });
projectSchema.index({ workspaceId: 1, isDeleted: 1 });
projectSchema.index({ isDeleted: 1, purgeAt: 1 });

module.exports = mongoose.model('Project', projectSchema);
