const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a team name'],
      trim: true,
      maxlength: 100
    },
    key: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 10
    },
    description: {
      type: String,
      default: '',
      maxlength: 500
    },
    color: {
      type: String,
      default: '#2563EB'
    },
    icon: {
      type: String,
      default: '👥'
    },
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
      index: true
    },
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    department: {
      type: String,
      default: 'Engineering',
      trim: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    isArchived: {
      type: Boolean,
      default: false
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

teamSchema.index({ workspaceId: 1, name: 1 }, { unique: true });
teamSchema.index({ workspaceId: 1, isDeleted: 1 });
teamSchema.index({ isDeleted: 1, purgeAt: 1 });

module.exports = mongoose.model('Team', teamSchema);
