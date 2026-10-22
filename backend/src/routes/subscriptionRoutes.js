const express = require('express');
const router = express.Router();
const {
  getCurrentSubscription,
  upgradeSubscription
} = require('../controllers/subscriptionController');
const { protect } = require('../middlewares/auth');

router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Subscriptions
 *   description: Workspace plan tiers, storage quotas, and upgrades
 */

/**
 * @swagger
 * /api/v1/subscriptions/current:
 *   get:
 *     summary: Get current subscription and usage limits for active workspace
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current subscription details
 */
router.get('/current', getCurrentSubscription);

/**
 * @swagger
 * /api/v1/subscriptions/upgrade:
 *   post:
 *     summary: Upgrade workspace plan (FREE, STARTER, PRO, ENTERPRISE)
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [planType]
 *             properties:
 *               planType:
 *                 type: string
 *                 enum: [FREE, STARTER, PRO, ENTERPRISE]
 *     responses:
 *       200:
 *         description: Plan upgraded
 */
router.post('/upgrade', upgradeSubscription);

module.exports = router;
