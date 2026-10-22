const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema(
  {
    module: {
      type: String,
      required: true
    },
    view: {
      type: Boolean,
      default: false
    },
    create: {
      type: Boolean,
      default: false
    },
    edit: {
      type: Boolean,
      default: false
    },
    delete: {
      type: Boolean,
      default: false
    }
  },
  { _id: false }
);

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide role name'],
      trim: true,
      maxlength: 100
    },
    key: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    description: {
      type: String,
      default: '',
      maxlength: 500
    },
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true
    },
    level: {
      type: Number,
      required: true,
      default: 4,
      min: 1,
      max: 5,
      index: true
    },
    isSystemRole: {
      type: Boolean,
      default: false
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },
    permissions: [permissionSchema],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
);

// Compound index for role key uniqueness per workspace (among non-deleted roles)
roleSchema.index({ workspaceId: 1, key: 1, isDeleted: 1 });

module.exports = mongoose.model('Role', roleSchema);
