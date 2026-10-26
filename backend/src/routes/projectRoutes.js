const express = require('express');
const router = express.Router();
const {
  getProjects,
  createProject,
  getProjectById,
  getProjectMembers,
  getProjectSummary,
  getProjectActivities,
  updateProjectWorkflowStages,
  addProjectMember,
  removeProjectMember,
  getProjectTeams,
  createProjectTeam,
  updateProjectTeam,
  updateTeamWorkflowStages,
  deleteProjectTeam,
  getProjectTeamsProgress,
  deleteProject
} = require('../controllers/projectController');
const { protect } = require('../middlewares/auth');
const { authorize } = require('../middlewares/rbac');
const { USER_ROLES } = require('../constants/roles');

router.use(protect);

router.route('/')
  .get(getProjects)
  .post(
    authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN, USER_ROLES.PROJECT_MANAGER),
    createProject
  );

const {
  getSprints,
  createSprint,
  startSprint,
  completeSprint,
  updateSprint,
  getSprintBurndown,
  getProjectVelocity
} = require('../controllers/sprintController');

const {
  previewExcelImport,
  executeExcelImport,
  downloadProjectExcelTemplate,
  exportProjectExcel
} = require('../controllers/excelImportController');
const upload = require('../middlewares/upload');

const { getProjectDependencyGraph } = require('../controllers/taskController');

router.route('/:projectId')
  .get(getProjectById)
  .delete(
    authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN, USER_ROLES.PROJECT_MANAGER),
    deleteProject
  );

router.route('/:projectId/members')
  .get(getProjectMembers)
  .post(
    authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN, USER_ROLES.PROJECT_MANAGER, USER_ROLES.TEAM_LEAD),
    addProjectMember
  );
router.delete(
  '/:projectId/members/:userId',
  authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN, USER_ROLES.PROJECT_MANAGER, USER_ROLES.TEAM_LEAD),
  removeProjectMember
);
router.get('/:projectId/summary', getProjectSummary);
router.get('/:projectId/activities', getProjectActivities);
router.put(
  '/:projectId/stages',
  authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN, USER_ROLES.PROJECT_MANAGER),
  updateProjectWorkflowStages
);
router.get('/:projectId/dependency-graph', getProjectDependencyGraph);
router.get('/:projectId/velocity', getProjectVelocity);

// Teams & Team Progress Intelligence
router.route('/:projectId/teams')
  .get(getProjectTeams)
  .post(
    authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN, USER_ROLES.PROJECT_MANAGER),
    createProjectTeam
  );
router.route('/:projectId/teams/:teamId')
  .put(
    authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN, USER_ROLES.PROJECT_MANAGER, USER_ROLES.TEAM_LEAD),
    updateProjectTeam
  )
  .delete(
    authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN, USER_ROLES.PROJECT_MANAGER, USER_ROLES.TEAM_LEAD),
    deleteProjectTeam
  );
router.put(
  '/:projectId/teams/:teamId/stages',
  authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN, USER_ROLES.PROJECT_MANAGER, USER_ROLES.TEAM_LEAD),
  updateTeamWorkflowStages
);
router.get('/:projectId/teams-progress', getProjectTeamsProgress);

// Sprints
router.route('/:projectId/sprints')
  .get(getSprints)
  .post(
    authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN, USER_ROLES.PROJECT_MANAGER, USER_ROLES.TEAM_LEAD),
    createSprint
  );

router.patch(
  '/:projectId/sprints/:sprintId/start',
  authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN, USER_ROLES.PROJECT_MANAGER, USER_ROLES.TEAM_LEAD),
  startSprint
);
router.patch(
  '/:projectId/sprints/:sprintId/complete',
  authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN, USER_ROLES.PROJECT_MANAGER, USER_ROLES.TEAM_LEAD),
  completeSprint
);
router.put(
  '/:projectId/sprints/:sprintId',
  authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN, USER_ROLES.PROJECT_MANAGER, USER_ROLES.TEAM_LEAD),
  updateSprint
);
router.get('/:projectId/sprints/:sprintId/burndown', getSprintBurndown);

// Excel Sprint & Task Bulk Import / Export
router.get(
  '/:projectId/import-excel/template',
  authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN, USER_ROLES.PROJECT_MANAGER, USER_ROLES.TEAM_LEAD),
  downloadProjectExcelTemplate
);
router.get('/:projectId/export-excel', exportProjectExcel);
router.post(
  '/:projectId/import-excel/preview',
  authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN, USER_ROLES.PROJECT_MANAGER, USER_ROLES.TEAM_LEAD),
  upload.single('file'),
  previewExcelImport
);
router.post(
  '/:projectId/import-excel/execute',
  authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN, USER_ROLES.PROJECT_MANAGER, USER_ROLES.TEAM_LEAD),
  upload.single('file'),
  executeExcelImport
);

// Custom Forms & Request Intake
const {
  getProjectForms,
  createProjectForm,
  updateProjectForm,
  deleteProjectForm,
  submitProjectForm,
  getProjectRequests,
  updateRequestStatus,
  addRequestComment,
  deleteRequest
} = require('../controllers/formController');

router.route('/:projectId/forms')
  .get(getProjectForms)
  .post(
    authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN, USER_ROLES.PROJECT_MANAGER),
    createProjectForm
  );

router.route('/:projectId/forms/:formId')
  .put(
    authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN, USER_ROLES.PROJECT_MANAGER),
    updateProjectForm
  )
  .delete(
    authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN, USER_ROLES.PROJECT_MANAGER),
    deleteProjectForm
  );

router.post('/:projectId/forms/:formId/submit', submitProjectForm);

// Requests / Submissions Management
router.get('/:projectId/requests', getProjectRequests);
router.patch(
  '/:projectId/requests/:requestId/status',
  authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ORG_ADMIN, USER_ROLES.PROJECT_MANAGER, USER_ROLES.TEAM_LEAD),
  updateRequestStatus
);
router.post('/:projectId/requests/:requestId/comments', addRequestComment);
router.delete('/:projectId/requests/:requestId', deleteRequest);

module.exports = router;


