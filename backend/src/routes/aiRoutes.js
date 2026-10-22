const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const {
  generateTasks,
  summarizeSprint,
  refineTask
} = require('../controllers/aiController');

router.use(protect);

router.post('/generate-tasks', generateTasks);
router.post('/summarize-sprint', summarizeSprint);
router.post('/refine-task', refineTask);

module.exports = router;
