const express = require('express');
const router = express.Router();
const {
  createInvitation,
  createBulkInvitations,
  getInvitationByToken,
  acceptInvitation,
  declineInvitation,
  getMyPendingInvitations,
  revokeInvitation,
  resendInvitation
} = require('../controllers/inviteController');
const { protect } = require('../middlewares/auth');

/**
 * @swagger
 * tags:
 *   name: Invitations
 *   description: Real-time project & workspace onboarding invitations
 */

router.get('/my-invites', protect, getMyPendingInvitations);
router.post('/', protect, createInvitation);
router.post('/bulk', protect, createBulkInvitations);
router.delete('/:inviteId', protect, revokeInvitation);
router.post('/:inviteId/resend', protect, resendInvitation);
router.get('/:token', getInvitationByToken);
router.post('/:token/accept', acceptInvitation);
router.post('/:token/decline', declineInvitation);

module.exports = router;
