const Subscription = require('../models/Subscription');
const Workspace = require('../models/Workspace');
const asyncHandler = require('../middlewares/asyncHandler');
const { SUBSCRIPTION_PLANS, PLAN_LIMITS } = require('../constants/roles');

// @desc    Get subscription status and usage for active workspace
// @route   GET /api/v1/subscriptions/current
// @access  Private
const getCurrentSubscription = asyncHandler(async (req, res) => {
  const workspaceId = req.user.currentWorkspace;
  if (!workspaceId) {
    return res.status(400).json({ success: false, error: 'No active workspace selected' });
  }

  let subscription = await Subscription.findOne({ workspaceId });
  if (!subscription) {
    subscription = await Subscription.create({
      workspaceId,
      planType: SUBSCRIPTION_PLANS.FREE,
      limits: PLAN_LIMITS.FREE
    });
  }

  res.json({
    success: true,
    data: subscription
  });
});

// @desc    Upgrade or update workspace subscription tier
// @route   POST /api/v1/subscriptions/upgrade
// @access  Private (OrgAdmin or SuperAdmin)
const upgradeSubscription = asyncHandler(async (req, res) => {
  const { planType } = req.body;
  const workspaceId = req.user.currentWorkspace;

  if (!Object.values(SUBSCRIPTION_PLANS).includes(planType)) {
    return res.status(400).json({ success: false, error: 'Invalid subscription plan' });
  }

  let subscription = await Subscription.findOne({ workspaceId });
  if (!subscription) {
    subscription = new Subscription({ workspaceId });
  }

  subscription.planType = planType;
  subscription.limits = PLAN_LIMITS[planType] || PLAN_LIMITS.FREE;
  subscription.status = 'ACTIVE';
  subscription.currentPeriodStart = new Date();
  subscription.currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await subscription.save();

  res.json({
    success: true,
    message: `Subscription successfully upgraded to ${planType} plan!`,
    data: subscription
  });
});

module.exports = {
  getCurrentSubscription,
  upgradeSubscription
};