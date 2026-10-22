const mongoose = require('mongoose');

const invitationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
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
    projectIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
      }
    ],
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null,
      index: true
    },
    role: {
      type: String,
      default: 'MEMBER'
    },
    inviterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED'],
      default: 'PENDING'
    },
    isBatch: {
      type: Boolean,
      default: false
    },
    allowedEmails: [
      {
        type: String,
        lowercase: true,
        trim: true
      }
    ],
    acceptedEmails: [
      {
        email: {
          type: String,
          lowercase: true,
          trim: true
        },
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        acceptedAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    comment: {
      type: String,
      default: ''
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days expiry
    }
  },
  {
    timestamps: true
  }
);

invitationSchema.index({ email: 1, workspaceId: 1, status: 1 });

module.exports = mongoose.model('Invitation', invitationSchema);
