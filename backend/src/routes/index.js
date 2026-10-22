const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const adminRoutes = require('./adminRoutes');
const workspaceRoutes = require('./workspaceRoutes');
const projectRoutes = require('./projectRoutes');
const taskRoutes = require('./taskRoutes');
const commentRoutes = require('./commentRoutes');
const inviteRoutes = require('./inviteRoutes');
const roleRoutes = require('./roleRoutes');
const teamRoutes = require('./teamRoutes');
const recycleBinRoutes = require('./recycleBinRoutes');

// Root Health Check Route
router.get('/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'Project Monitor System API'
  });
});

// Register Sub-routes under /api/v1
router.use('/auth/admin', roleRoutes);
router.use('/auth', authRoutes);
router.use('/admin', roleRoutes);
router.use('/admin', adminRoutes);
router.use('/workspaces', workspaceRoutes);
router.use('/projects', projectRoutes);
router.use('/teams', teamRoutes);
router.use('/tasks', taskRoutes);
router.use('/comments', commentRoutes);
router.use('/invites', inviteRoutes);
router.use('/recycle-bin', recycleBinRoutes);

module.exports = router;


