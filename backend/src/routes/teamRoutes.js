const express = require('express');
const router = express.Router();
const {
  getWorkspaceTeams,
  createTeam,
  updateTeam,
  addTeamMembers,
  removeTeamMember,
  deleteTeam
} = require('../controllers/teamController');
const { protect } = require('../middlewares/auth');

router.use(protect);

router.route('/')
  .get(getWorkspaceTeams)
  .post(createTeam);

router.route('/:teamId')
  .put(updateTeam)
  .delete(deleteTeam);

router.route('/:teamId/members')
  .post(addTeamMembers);

router.route('/:teamId/members/:userId')
  .delete(removeTeamMember);

module.exports = router;
