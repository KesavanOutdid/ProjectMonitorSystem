const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Invitation = require('../models/Invitation');
const Workspace = require('../models/Workspace');
const Project = require('../models/Project');
const User = require('../models/User');
const Activity = require('../models/Activity');
const asyncHandler = require('../middlewares/asyncHandler');
const EmailService = require('../services/emailService');
const CacheService = require('../services/cacheService');
const { USER_ROLES, USER_STATUS } = require('../constants/roles');

// Helper to generate access and refresh tokens
const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { id: userId },
    process.env.JWT_ACCESS_SECRET || 'super_secret_access_jwt_key',
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m' }
  );

  const refreshToken = jwt.sign(
    { id: userId },
    process.env.JWT_REFRESH_SECRET || 'super_secret_refresh_jwt_key',
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );

  return { accessToken, refreshToken };
};

// Helper to dynamically resolve client frontend URL from request body, headers (Origin / X-Forwarded-Host), or env fallback
const resolveFrontendUrl = (req) => {
  if (req.body && typeof req.body.frontendUrl === 'string' && req.body.frontendUrl.startsWith('http')) {
    return req.body.frontendUrl.replace(/\/+$/, '');
  }
  if (req.headers.origin && typeof req.headers.origin === 'string' && req.headers.origin.startsWith('http')) {
    return req.headers.origin.replace(/\/+$/, '');
  }
  const xForwardedHost = req.headers['x-forwarded-host'];
  if (xForwardedHost) {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    return `${proto}://${xForwardedHost}`.replace(/\/+$/, '');
  }
  if (req.headers.referer) {
    try {
      const url = new URL(req.headers.referer);
      return url.origin;
    } catch (_) {}
  }
  return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
};

// @desc    Send an Invitation to a Project and/or Workspace
// @route   POST /api/v1/invites
// @access  Private
const createInvitation = asyncHandler(async (req, res) => {
  const { email, workspaceId, projectId, projectIds, role = 'MEMBER', teamId } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, error: 'Recipient email is required' });
  }

  const targetWorkspaceId = workspaceId || req.user.currentWorkspace;
  if (!targetWorkspaceId) {
    return res.status(400).json({ success: false, error: 'Workspace ID is required' });
  }

  const workspace = await Workspace.findById(targetWorkspaceId);
  if (!workspace) {
    return res.status(404).json({ success: false, error: 'Workspace not found' });
  }

  const finalProjectIds = Array.isArray(projectIds) && projectIds.length > 0
    ? projectIds
    : (projectId ? [projectId] : []);

  let project = null;
  if (finalProjectIds.length > 0) {
    project = await Project.findById(finalProjectIds[0]);
  }

  // Permission check: Only ORG_ADMIN, SUPER_ADMIN, workspace owner, or Project Manager / Team Lead of this project can invite
  const isOrgAdmin = req.user.role === 'SUPER_ADMIN' || req.user.role === 'ORG_ADMIN';
  const isOwner = workspace.ownerId && workspace.ownerId.toString() === req.user._id.toString();
  const isWorkspaceAdmin = workspace.members && workspace.members.some(
    (m) => m.userId && m.userId.toString() === req.user._id.toString() && m.role === 'ORG_ADMIN'
  );
  
  let isProjectLeadOrManager = false;
  if (project) {
    const isLead = project.leadId && project.leadId.toString() === req.user._id.toString();
    const hasElevatedRole = project.members && project.members.some(
      (m) => m.userId && m.userId.toString() === req.user._id.toString() && ['PROJECT_MANAGER', 'TEAM_LEAD', 'LEAD'].includes(m.role)
    );
    isProjectLeadOrManager = isLead || hasElevatedRole;
  }

  const isGlobalProjectManager = req.user.role === 'PROJECT_MANAGER';
  const { getEffectiveUserLevel } = require('../middlewares/rbac');
  let userLevel = 5;
  try {
    userLevel = await getEffectiveUserLevel(req.user, req);
  } catch (_) {}
  const isPrivileged = isOrgAdmin || isOwner || isWorkspaceAdmin || isProjectLeadOrManager || isGlobalProjectManager || userLevel <= 2;

  if (!isPrivileged) {
    return res.status(403).json({
      success: false,
      error: 'Permission denied. Only Organization Admins, Project Managers, and Team Leads can invite members.'
    });
  }

  const cleanEmail = email.toLowerCase().trim();

  // If user is already registered, directly attach to workspace, project, and team
  const existingUser = await User.findOne({ email: cleanEmail });
  if (existingUser) {
    for (const pid of finalProjectIds) {
      const p = await Project.findById(pid);
      if (p) {
        const isAlreadyProjMember = p.members.some(
          (m) => m.userId && m.userId.toString() === existingUser._id.toString()
        );
        if (!isAlreadyProjMember) {
          p.members.push({ userId: existingUser._id, role });
          await p.save();
        }
      }
    }

    const isAlreadyWsMember = workspace.members.some(
      (m) => m.userId && m.userId.toString() === existingUser._id.toString()
    );
    if (!isAlreadyWsMember) {
      workspace.members.push({ userId: existingUser._id, role });
      await workspace.save();
    }

    if (teamId) {
      try {
        const Team = require('../models/Team');
        const teamDoc = await Team.findById(teamId);
        if (teamDoc && !teamDoc.members.some((m) => m.toString() === existingUser._id.toString())) {
          teamDoc.members.push(existingUser._id);
          await teamDoc.save();
        }
      } catch (_) {}
    }
  }

  // Generate unique secure token
  const token = crypto.randomBytes(32).toString('hex');

  // Upsert pending invitation
  let invite = await Invitation.findOne({
    email: cleanEmail,
    workspaceId: targetWorkspaceId,
    status: 'PENDING'
  });

  if (invite) {
    invite.token = token;
    invite.role = role;
    invite.projectId = finalProjectIds[0] || null;
    invite.projectIds = finalProjectIds;
    invite.teamId = teamId || null;
    invite.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    invite.inviterId = req.user._id;
    await invite.save();
  } else {
    invite = await Invitation.create({
      email: cleanEmail,
      workspaceId: targetWorkspaceId,
      projectId: finalProjectIds[0] || null,
      projectIds: finalProjectIds,
      teamId: teamId || null,
      role,
      token,
      inviterId: req.user._id
    });
  }

  const frontendUrl = resolveFrontendUrl(req);
  const inviteLink = `${frontendUrl}/invite/${token}`;

  // Send email async
  EmailService.sendInviteLink({
    inviteeEmail: cleanEmail,
    workspaceName: workspace.name,
    projectName: project ? project.name : null,
    inviterName: req.user.name,
    inviteLink,
    role
  }).catch((err) => console.error('[Invite Email Error]:', err.message));

  res.status(201).json({
    success: true,
    message: `Invitation successfully sent to ${cleanEmail}`,
    data: {
      inviteId: invite._id,
      email: invite.email,
      role: invite.role,
      teamId: invite.teamId,
      inviteLink,
      token
    }
  });
});

// @desc    Get Invitation details by token (Public)
// @route   GET /api/v1/invites/:token
// @access  Public
const getInvitationByToken = asyncHandler(async (req, res) => {
  const { token } = req.params;

  const invite = await Invitation.findOne({ token, status: 'PENDING' })
    .populate('workspaceId', 'name slug logo')
    .populate('projectId', 'name key category color')
    .populate('teamId', 'name key color department')
    .populate('inviterId', 'name email avatar');

  if (!invite) {
    return res.status(404).json({ success: false, error: 'Invitation link is invalid, already used, or expired.' });
  }

  if (new Date() > new Date(invite.expiresAt)) {
    invite.status = 'EXPIRED';
    await invite.save();
    return res.status(410).json({ success: false, error: 'Invitation link has expired. Please ask for a new invite.' });
  }

  let existingUser = null;
  if (!invite.isBatch) {
    existingUser = await User.findOne({ email: invite.email });
  }

  // Check if request is authenticated
  let authUser = null;
  try {
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      const jwtToken = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(jwtToken, process.env.JWT_ACCESS_SECRET || 'super_secret_access_jwt_key');
      authUser = await User.findById(decoded.id);
    }
  } catch (_) {}

  // Check if user is already a member of this project or workspace
  let isAlreadyMemberOfProject = false;
  let isAlreadyMemberOfWorkspace = false;
  const userToCheck = authUser || existingUser;
  if (userToCheck) {
    if (invite.projectId) {
      const p = await Project.findById(invite.projectId);
      if (p && p.members.some(m => m.userId && m.userId.toString() === userToCheck._id.toString())) {
        isAlreadyMemberOfProject = true;
      }
    }
    const ws = await Workspace.findById(invite.workspaceId);
    if (ws && ws.members.some(m => m.userId && m.userId.toString() === userToCheck._id.toString())) {
      isAlreadyMemberOfWorkspace = true;
    }
  }

  res.json({
    success: true,
    data: {
      isBatch: !!invite.isBatch,
      allowedEmailsCount: invite.isBatch ? (invite.allowedEmails ? invite.allowedEmails.length : 0) : 1,
      email: invite.isBatch ? '' : invite.email,
      role: invite.role,
      workspace: invite.workspaceId,
      project: invite.projectId,
      team: invite.teamId,
      inviter: invite.inviterId,
      isExistingUser: !!existingUser || !!authUser,
      existingUserName: authUser ? authUser.name : (existingUser ? existingUser.name : ''),
      isLoggedIn: !!authUser,
      isAlreadyMemberOfProject,
      isAlreadyMemberOfWorkspace
    }
  });
});

// @desc    Accept Invitation (Public: registers new user or joins existing user)
// @route   POST /api/v1/invites/:token/accept
// @access  Public
const acceptInvitation = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { name, password, comment, email } = req.body;

  const invite = await Invitation.findOne({ token, status: 'PENDING' });
  if (!invite) {
    return res.status(404).json({ success: false, error: 'Invitation is invalid or has already been accepted' });
  }

  if (new Date() > new Date(invite.expiresAt)) {
    return res.status(410).json({ success: false, error: 'Invitation has expired' });
  }

  const workspace = await Workspace.findById(invite.workspaceId);
  if (!workspace) {
    return res.status(404).json({ success: false, error: 'Workspace no longer exists' });
  }

  let targetEmail = (invite.email || '').toLowerCase().trim();
  if (invite.isBatch) {
    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Please enter your email address to accept this invitation'
      });
    }
    targetEmail = email.toLowerCase().trim();

    // Check if targetEmail is in allowedEmails
    const isAllowed = invite.allowedEmails && invite.allowedEmails.some((e) => e.toLowerCase() === targetEmail);
    if (!isAllowed) {
      return res.status(403).json({
        success: false,
        error: `You are not allowed. The email '${targetEmail}' was not included in this invitation link.`
      });
    }

    // Check if this email already accepted this invitation
    const alreadyAccepted = invite.acceptedEmails && invite.acceptedEmails.some((a) => a.email.toLowerCase() === targetEmail);
    if (alreadyAccepted) {
      return res.status(400).json({
        success: false,
        error: `This invitation link has already been accepted by '${targetEmail}'. Please log in.`
      });
    }
  }

  let user = await User.findOne({ email: targetEmail }).select('+password');

  // Check if request is made by an already authenticated user
  let authUser = null;
  try {
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      const authToken = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(authToken, process.env.JWT_ACCESS_SECRET || 'super_secret_access_jwt_key');
      authUser = await User.findById(decoded.id);
    }
  } catch (_) {}

  if (!user) {
    // If authenticated user's email matches or they are logged in, use authenticated user
    if (authUser) {
      user = authUser;
    } else {
      // New user signing up via invite link
      if (!password || password.length < 6) {
        return res.status(400).json({ success: false, error: 'Please provide a password of at least 6 characters' });
      }

      user = await User.create({
        name: name || targetEmail.split('@')[0],
        email: targetEmail,
        password: password,
        role: invite.role || USER_ROLES.MEMBER,
        status: USER_STATUS.ACTIVE,
        currentWorkspace: workspace._id,
        lastLoginAt: new Date()
      });
    }
  } else {
    // Existing user: if they are already logged in as this user, no password re-entry needed!
    const isSelf = authUser && authUser._id.toString() === user._id.toString();
    if (!isSelf) {
      if (!password) {
        return res.status(400).json({ success: false, error: 'Please enter your password to join with this account' });
      }
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ success: false, error: 'Incorrect password for existing account' });
      }
    }
    user.currentWorkspace = workspace._id;
    user.status = USER_STATUS.ACTIVE;
  }

  // 1. Add to Workspace members if not already
  const isWorkspaceMember = workspace.members.some(
    (m) => m.userId.toString() === user._id.toString()
  );
  if (!isWorkspaceMember) {
    workspace.members.push({
      userId: user._id,
      role: invite.role || USER_ROLES.MEMBER
    });
    await workspace.save();
  }

  // 2. Add to Team if specified
  if (invite.teamId) {
    try {
      const Team = require('../models/Team');
      const teamDoc = await Team.findById(invite.teamId);
      if (teamDoc && !teamDoc.members.some((m) => m.toString() === user._id.toString())) {
        teamDoc.members.push(user._id);
        await teamDoc.save();
      }
    } catch (_) {}
  }

  // 3. Add to Project members for all assigned projects (if any assigned)
  const targetProjectIds = (invite.projectIds && invite.projectIds.length > 0)
    ? invite.projectIds
    : (invite.projectId ? [invite.projectId] : []);

  let joinedProject = null;
  for (const pid of targetProjectIds) {
    const proj = await Project.findById(pid);
    if (proj) {
      if (!joinedProject) joinedProject = proj;
      const isProjMember = proj.members.some(
        (m) => m.userId.toString() === user._id.toString()
      );
      if (!isProjMember) {
        proj.members.push({
          userId: user._id,
          role: invite.role || USER_ROLES.MEMBER
        });
        await proj.save();
      }
    }
  }

  // Record audit activity so the join event is visible in the Activity History
  await Activity.create({
    workspaceId: workspace._id,
    projectId: joinedProject ? joinedProject._id : (invite.projectId || null),
    userId: user._id,
    action: 'MEMBER_JOINED',
    field: 'role',
    newValue: invite.role || 'MEMBER',
    metadata: {
      targetUserId: user._id,
      targetUserName: user.name,
      targetUserEmail: user.email,
      role: invite.role || 'MEMBER',
      description: `${user.name} joined as '${invite.role || 'MEMBER'}'`
    }
  });

  // 4. Mark invite as accepted & record any note/comment
  if (invite.isBatch) {
    invite.acceptedEmails.push({
      email: targetEmail,
      userId: user._id,
      acceptedAt: new Date()
    });
    if (invite.acceptedEmails.length >= invite.allowedEmails.length) {
      invite.status = 'ACCEPTED';
    }
    if (comment) {
      invite.comment = (invite.comment ? invite.comment + '\n' : '') + `${targetEmail}: ${comment}`;
    }
    await invite.save();
  } else {
    invite.status = 'ACCEPTED';
    if (comment) {
      invite.comment = comment;
    }
    await invite.save();
  }

  // Invalidate caches so new members and projects reflect everywhere instantly
  await CacheService.invalidatePattern('projects:*');
  await CacheService.invalidatePattern('tasks:*');
  await CacheService.invalidatePattern('kanban:*');

  // 5. Generate Auth Tokens
  const { accessToken, refreshToken } = generateTokens(user._id);
  user.refreshToken = refreshToken;
  user.lastLoginAt = new Date();
  await user.save();

  res.json({
    success: true,
    message: `Successfully joined ${workspace.name}${joinedProject ? ` and project ${joinedProject.name}` : ''}!`,
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        currentWorkspace: workspace._id
      },
      workspace: {
        id: workspace._id,
        name: workspace.name,
        slug: workspace.slug
      },
      project: joinedProject ? {
        id: joinedProject._id,
        name: joinedProject.name,
        key: joinedProject.key
      } : null,
      tokens: {
        accessToken,
        refreshToken
      }
    }
  });
});

// @desc    Decline Invitation (Public)
// @route   POST /api/v1/invites/:token/decline
// @access  Public
const declineInvitation = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { comment } = req.body;

  const invite = await Invitation.findOne({ token, status: 'PENDING' });
  if (!invite) {
    return res.status(404).json({ success: false, error: 'Invitation is invalid or already resolved' });
  }

  invite.status = 'DECLINED';
  invite.comment = comment || 'Invitation declined by invitee';
  await invite.save();

  res.json({
    success: true,
    message: 'Invitation declined.'
  });
});

// @desc    Send Bulk Invitations to multiple recipients (existing members or new emails)
// @route   POST /api/v1/invites/bulk
// @access  Private
const createBulkInvitations = asyncHandler(async (req, res) => {
  const { invites = [], defaultRole = 'MEMBER', workspaceId, projectId, projectIds, teamId } = req.body;

  if (!Array.isArray(invites) || invites.length === 0) {
    return res.status(400).json({ success: false, error: 'Please provide at least one recipient to invite' });
  }

  const targetWorkspaceId = workspaceId || req.user.currentWorkspace;
  if (!targetWorkspaceId) {
    return res.status(400).json({ success: false, error: 'Workspace ID is required' });
  }

  const workspace = await Workspace.findById(targetWorkspaceId);
  if (!workspace) {
    return res.status(404).json({ success: false, error: 'Workspace not found' });
  }

  const finalProjectIds = Array.isArray(projectIds) && projectIds.length > 0
    ? projectIds
    : (projectId ? [projectId] : []);

  const project = finalProjectIds.length > 0 ? await Project.findById(finalProjectIds[0]) : null;

  // Permission check
  const isOrgAdmin = req.user.role === 'SUPER_ADMIN' || req.user.role === 'ORG_ADMIN';
  const isOwner = workspace.ownerId && workspace.ownerId.toString() === req.user._id.toString();
  const isPM = req.user.role === 'PROJECT_MANAGER';
  const isWorkspaceAdmin = workspace.members && workspace.members.some(
    (m) => m.userId && m.userId.toString() === req.user._id.toString() && m.role === 'ORG_ADMIN'
  );

  let isProjectLeadOrManager = false;
  if (project) {
    const isLead = project.leadId && project.leadId.toString() === req.user._id.toString();
    const hasElevatedRole = project.members && project.members.some(
      (m) => m.userId && m.userId.toString() === req.user._id.toString() && ['PROJECT_MANAGER', 'TEAM_LEAD', 'LEAD'].includes(m.role)
    );
    isProjectLeadOrManager = isLead || hasElevatedRole;
  }

  const { getEffectiveUserLevel } = require('../middlewares/rbac');
  let userLevel = 5;
  try {
    userLevel = await getEffectiveUserLevel(req.user, req);
  } catch (_) {}
  const isPrivileged = isOrgAdmin || isPM || isOwner || isWorkspaceAdmin || isProjectLeadOrManager || userLevel <= 2;

  if (!isPrivileged) {
    return res.status(403).json({
      success: false,
      error: 'Permission denied. Only Organization Admins, Project Managers, and Team Leads can invite members.'
    });
  }

  const frontendUrl = resolveFrontendUrl(req);
  const cleanEmails = Array.from(
    new Set(
      invites
        .map((item) => (typeof item === 'string' ? item : item.email || '').toLowerCase().trim())
        .filter((e) => e && e.includes('@'))
    )
  );

  if (cleanEmails.length === 0) {
    return res.status(400).json({ success: false, error: 'Please provide at least one valid email address' });
  }

  // Pre-add existing registered users to workspace / teams / projects if applicable
  for (const cleanEmail of cleanEmails) {
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      for (const pid of finalProjectIds) {
        const p = await Project.findById(pid);
        if (p) {
          const isAlreadyProjMember = p.members.some(
            (m) => m.userId && m.userId.toString() === existingUser._id.toString()
          );
          if (!isAlreadyProjMember) {
            p.members.push({
              userId: existingUser._id,
              role: defaultRole
            });
            await p.save();
          }
        }
      }

      const isAlreadyWsMember = workspace.members.some(
        (m) => m.userId && m.userId.toString() === existingUser._id.toString()
      );
      if (!isAlreadyWsMember) {
        workspace.members.push({
          userId: existingUser._id,
          role: defaultRole
        });
        await workspace.save();
      }

      if (teamId) {
        try {
          const Team = require('../models/Team');
          const teamDoc = await Team.findById(teamId);
          if (teamDoc && !teamDoc.members.some((m) => m.toString() === existingUser._id.toString())) {
            teamDoc.members.push(existingUser._id);
            await teamDoc.save();
          }
        } catch (_) {}
      }
    }
  }

  // Generate individual invitations for all recipients in this batch
  const createdInvites = [];
  for (const email of cleanEmails) {
    const token = crypto.randomBytes(32).toString('hex');
    const inviteDoc = await Invitation.create({
      email,
      workspaceId: targetWorkspaceId,
      projectId: finalProjectIds[0] || null,
      projectIds: finalProjectIds,
      teamId: teamId || null,
      role: defaultRole,
      token,
      status: 'PENDING',
      inviterId: req.user._id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    const inviteLink = `${frontendUrl}/invite/${token}`;
    createdInvites.push({
      email,
      name: email.split('@')[0],
      role: defaultRole,
      inviteLink,
      token
    });

    // Send email to recipient
    EmailService.sendInviteLink({
      inviteeEmail: email,
      workspaceName: workspace.name,
      projectName: project ? project.name : null,
      inviterName: req.user.name,
      inviteLink,
      role: defaultRole
    }).catch(() => {});
  }

  if (project) {
    await CacheService.invalidatePattern(`project:${finalProjectIds[0]}*`);
    await CacheService.del(`summary:${finalProjectIds[0]}`);
  }

  res.status(201).json({
    success: true,
    message: `Generated ${createdInvites.length} invitation link(s)!`,
    data: {
      inviteLink: createdInvites[0]?.inviteLink,
      token: createdInvites[0]?.token,
      count: createdInvites.length,
      allowedEmails: cleanEmails,
      role: defaultRole,
      teamId: teamId || null,
      invitations: createdInvites,
      recipients: createdInvites,
      invites: createdInvites
    }
  });
});

// @desc    Get all pending invitations for the logged-in user
// @route   GET /api/v1/invites/my-invites
// @access  Private
const getMyPendingInvitations = asyncHandler(async (req, res) => {
  const userEmail = req.user.email.toLowerCase().trim();

  const invites = await Invitation.find({
    $or: [
      { email: userEmail },
      { allowedEmails: userEmail }
    ],
    status: 'PENDING'
  })
    .populate('workspaceId', 'name slug logo')
    .populate('projectId', 'name key color')
    .populate('teamId', 'name key color department')
    .populate('inviterId', 'name email avatar')
    .sort({ createdAt: -1 });

  // Filter out any already expired or already accepted
  const activeInvites = invites.filter((inv) => {
    if (new Date() > new Date(inv.expiresAt)) return false;
    if (inv.isBatch && inv.acceptedEmails && inv.acceptedEmails.some((a) => a.email.toLowerCase() === userEmail)) {
      return false;
    }
    return true;
  });

  res.json({
    success: true,
    data: activeInvites
  });
});

// @desc    Revoke / Cancel an invitation
// @route   DELETE /api/v1/invites/:inviteId
// @access  Private
const revokeInvitation = asyncHandler(async (req, res) => {
  const { inviteId } = req.params;

  const invite = await Invitation.findById(inviteId);
  if (!invite) {
    return res.status(404).json({ success: false, error: 'Invitation not found' });
  }

  // Permission check
  const workspace = await Workspace.findById(invite.workspaceId);
  const isOrgAdmin = req.user.role === 'SUPER_ADMIN' || req.user.role === 'ORG_ADMIN';
  const isPM = req.user.role === 'PROJECT_MANAGER';
  const isOwner = workspace && workspace.ownerId && workspace.ownerId.toString() === req.user._id.toString();
  const isInviter = invite.inviterId && invite.inviterId.toString() === req.user._id.toString();

  if (!isOrgAdmin && !isPM && !isOwner && !isInviter) {
    return res.status(403).json({ success: false, error: 'Permission denied to revoke this invitation' });
  }

  invite.status = 'DECLINED';
  invite.comment = `Revoked by administrator ${req.user.name}`;
  await invite.save();

  if (invite.projectId) {
    await CacheService.invalidatePattern(`project:${invite.projectId}*`);
  }

  res.json({
    success: true,
    message: 'Invitation successfully revoked'
  });
});

// @desc    Resend an invitation email
// @route   POST /api/v1/invites/:inviteId/resend
// @access  Private
const resendInvitation = asyncHandler(async (req, res) => {
  const { inviteId } = req.params;

  const invite = await Invitation.findById(inviteId)
    .populate('workspaceId', 'name')
    .populate('projectId', 'name');

  if (!invite) {
    return res.status(404).json({ success: false, error: 'Invitation not found' });
  }

  // Extend expiry by 7 days from now
  invite.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  invite.status = 'PENDING';
  await invite.save();

  const frontendUrl = resolveFrontendUrl(req);
  const inviteLink = `${frontendUrl}/invite/${invite.token}`;

  const targetEmails = invite.isBatch ? invite.allowedEmails : [invite.email];

  for (const email of targetEmails) {
    EmailService.sendInviteLink({
      inviteeEmail: email,
      workspaceName: invite.workspaceId?.name || 'Workspace',
      projectName: invite.projectId?.name || null,
      inviterName: req.user.name,
      inviteLink,
      role: invite.role
    }).catch(() => {});
  }

  res.json({
    success: true,
    message: 'Invitation resent successfully',
    data: {
      inviteLink,
      token: invite.token,
      expiresAt: invite.expiresAt
    }
  });
});

module.exports = {
  createInvitation,
  createBulkInvitations,
  getInvitationByToken,
  acceptInvitation,
  declineInvitation,
  getMyPendingInvitations,
  revokeInvitation,
  resendInvitation
};
