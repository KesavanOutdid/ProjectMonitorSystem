const mongoose = require('mongoose');
const { SUBSCRIPTION_PLANS, PLAN_LIMITS } = require('../constants/roles');

const subscriptionSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      unique: true,
      index: true
    },
    planType: {
      type: String,
      enum: Object.values(SUBSCRIPTION_PLANS),
      default: SUBSCRIPTION_PLANS.FREE
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'EXPIRED'],
      default: 'ACTIVE'
    },
    billingCycle: {
      type: String,
      enum: ['MONTHLY', 'YEARLY', 'LIFETIME'],
      default: 'MONTHLY'
    },
    currentPeriodStart: {
      type: Date,
      default: Date.now
    },
    currentPeriodEnd: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    },
    limits: {
      maxProjects: { type: Number, default: PLAN_LIMITS.FREE.maxProjects },
      maxMembers: { type: Number, default: PLAN_LIMITS.FREE.maxMembers },
      maxStorageMB: { type: Number, default: PLAN_LIMITS.FREE.maxStorageMB },
      allowCustomFields: { type: Boolean, default: PLAN_LIMITS.FREE.allowCustomFields },
      allowS3Export: { type: Boolean, default: PLAN_LIMITS.FREE.allowS3Export }
    },
    usage: {
      projectsCount: { type: Number, default: 0 },
      membersCount: { type: Number, default: 1 },
      storageUsedMB: { type: Number, default: 0 }
    },
    stripeCustomerId: { type: String, default: null },
    stripeSubscriptionId: { type: String, default: null }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Subscription', subscriptionSchema);
