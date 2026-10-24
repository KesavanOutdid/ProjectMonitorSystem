const mongoose = require('mongoose');

const sprintSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide sprint name'],
      trim: true,
      maxlength: 100
    },
    goal: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: ['PLANNED', 'ACTIVE', 'COMPLETED'],
      default: 'ACTIVE',
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
    startDate: {
      type: Date,
      default: Date.now
    },
    endDate: {
      type: Date,
      default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 2 weeks default sprint
    },
    teams: {
      type: [String],
      default: [] // Empty array signifies "All Teams" (Shared Project Sprint)
    },
    completedAt: {
      type: Date,
      default: null
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    history: [
      {
        changedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        action: {
          type: String,
          enum: ['CREATED', 'DATES_UPDATED', 'EXTENDED', 'COMPLETED', 'STARTED'],
          default: 'DATES_UPDATED'
        },
        previousStartDate: { type: Date },
        newStartDate: { type: Date },
        previousEndDate: { type: Date },
        newEndDate: { type: Date },
        daysExtended: { type: Number, default: 0 },
        reason: { type: String, default: '' },
        createdAt: { type: Date, default: Date.now }
      }
    ]
  },
  {
    timestamps: true
  }
);

sprintSchema.index({ projectId: 1, status: 1 });

module.exports = mongoose.model('Sprint', sprintSchema);
