const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Workspace = require('../models/Workspace');
const Subscription = require('../models/Subscription');
const Otp = require('../models/Otp');
const asyncHandler = require('../middlewares/asyncHandler');
const EmailService = require('../services/emailService');
const Role = require('../models/Role');
const Invitation = require('../models/Invitation');
const Project = require('../models/Project');
const Team = require('../models/Team');
const Activity = require('../models/Activity');
const { CONFIGURABLE_MODULES, getDefaultAdminPermissions, getDefaultMemberPermissions } = require('../constants/permissions');
const { USER_ROLES, USER_STATUS, SUBSCRIPTION_PLANS, PLAN_LIMITS } = require('../constants/roles');
const { ensureDefaultRoles } = require('./roleController');

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

// @desc    Send 6-digit OTP for Registration Verification
// @route   POST /api/v1/auth/send-register-otp
// @access  Public
const sendRegisterOtp = asyncHandler(async (req, res) => {
  const { name, email, password, workspaceName, accountType } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, error: 'Please provide name, email, and password' });
  }

  if (password.length < 6) {
    return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long' });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Check if email already registered
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    return res.status(400).json({ success: false, error: 'An account with this email already exists' });
  }

  // Generate 6-digit cryptographically random OTP
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

  // Expire in 10 minutes
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  // Upsert OTP record
  await Otp.deleteMany({ email: normalizedEmail, type: 'REGISTER' });
  await Otp.create({
    email: normalizedEmail,
    otp: otpCode,
    type: 'REGISTER',
    payload: {
      name: name.trim(),
      email: normalizedEmail,
      password,
      workspaceName: workspaceName ? workspaceName.trim() : '',
      accountType: accountType || 'organization'
    },
    expiresAt
  });

  console.log(`\n========================================`);
  console.log(`[AUTH OTP SERVICE] Registration OTP for ${normalizedEmail}: >>> ${otpCode} <<<`);
  console.log(`========================================\n`);

  // Send Email async via nodemailer
  const emailResult = await EmailService.sendRegistrationOtp({
    email: normalizedEmail,
    name: name.trim(),
    otp: otpCode
  });

  res.status(200).json({
    success: true,
    message: `Verification code sent to ${normalizedEmail}`,
    data: {
      email: normalizedEmail,
      expiresInMinutes: 10,
      devOtp: process.env.NODE_ENV === 'development' ? otpCode : undefined
    }
  });
});

// @desc    Verify OTP & Complete User Registration
// @route   POST /api/v1/auth/verify-register-otp
// @access  Public
const verifyRegisterOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ success: false, error: 'Please provide email and verification code' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const trimmedOtp = otp.toString().trim();

  // Find latest valid OTP
  const otpDoc = await Otp.findOne({
    email: normalizedEmail,
    type: 'REGISTER'
  }).sort({ createdAt: -1 });

  if (!otpDoc) {
    return res.status(400).json({
      success: false,
      error: 'No verification code found. Please request a new code.'
    });
  }

  if (new Date() > otpDoc.expiresAt) {
    await Otp.deleteMany({ email: normalizedEmail, type: 'REGISTER' });
    return res.status(400).json({
      success: false,
      error: 'Verification code has expired. Please request a new one.'
    });
  }

  if (otpDoc.otp !== trimmedOtp) {
    return res.status(400).json({
      success: false,
      error: 'Invalid 6-digit verification code. Please check and try again.'
    });
  }

  // Extract payload from OTP document
  const { name, password, workspaceName, accountType } = otpDoc.payload || req.body;

  if (!name || !password) {
    return res.status(400).json({
      success: false,
      error: 'Registration session expired or corrupted. Please restart registration.'
    });
  }

  // Double check if user registered in the meantime
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    await Otp.deleteMany({ email: normalizedEmail, type: 'REGISTER' });
    return res.status(400).json({ success: false, error: 'Email already registered. Please log in.' });
  }

  // Create user (first user is SUPER_ADMIN if no users exist, otherwise ORG_ADMIN)
  const isFirstUser = (await User.countDocuments()) === 0;
  const role = isFirstUser ? USER_ROLES.SUPER_ADMIN : USER_ROLES.ORG_ADMIN;

  const user = await User.create({
    name,
    email: normalizedEmail,
    password,
    role,
    status: USER_STATUS.ACTIVE,
    lastLoginAt: new Date()
  });

  // Create default workspace for user
  const defaultWsName = accountType === 'personal'
    ? (workspaceName || `${name.split(' ')[0]}'s Personal Space`)
    : (workspaceName || `${name.split(' ')[0]}'s Organization`);
  const wsName = defaultWsName;
  const slug = `${wsName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString().slice(-4)}`;

  const workspace = await Workspace.create({
    name: wsName,
    slug,
    ownerId: user._id,
    members: [{ userId: user._id, role: USER_ROLES.ORG_ADMIN }]
  });

  // Create default roles for this workspace (Levels 1 to 5)
  await ensureDefaultRoles(workspace._id, user._id);
  const adminRole = await Role.findOne({ workspaceId: workspace._id, key: 'ORG_ADMIN' });
  if (adminRole) {
    workspace.members[0].customRoleId = adminRole._id;
  }

  // Create initial free subscription
  const subscription = await Subscription.create({
    workspaceId: workspace._id,
    planType: SUBSCRIPTION_PLANS.FREE,
    limits: PLAN_LIMITS.FREE
  });

  workspace.subscriptionId = subscription._id;
  await workspace.save();

  // Auto-link any pending invitations for this email address
  let primaryWorkspace = workspace;
  try {
    const pendingInvites = await Invitation.find({
      $or: [
        { email: normalizedEmail },
        { allowedEmails: normalizedEmail }
      ],
      status: 'PENDING'
    });

    if (pendingInvites.length > 0) {
      for (const inv of pendingInvites) {
        const invWs = await Workspace.findById(inv.workspaceId);
        if (invWs) {
          // 1. Add user to invited workspace if not already member
          const isMember = invWs.members && invWs.members.some(
            (m) => m.userId && m.userId.toString() === user._id.toString()
          );
          if (!isMember) {
            invWs.members.push({
              userId: user._id,
              role: inv.role || USER_ROLES.MEMBER
            });
            await invWs.save();
          }

          // 2. Add user to invited team if specified
          if (inv.teamId) {
            try {
              const teamDoc = await Team.findById(inv.teamId);
              if (teamDoc && !teamDoc.members.some((m) => m.toString() === user._id.toString())) {
                teamDoc.members.push(user._id);
                await teamDoc.save();
              }
            } catch (_) {}
          }

          // 3. Add user to invited project(s)
          const targetProjIds = (inv.projectIds && inv.projectIds.length > 0)
            ? inv.projectIds
            : (inv.projectId ? [inv.projectId] : []);

          for (const pid of targetProjIds) {
            const proj = await Project.findById(pid);
            if (proj && !proj.members.some((m) => m.userId && m.userId.toString() === user._id.toString())) {
              proj.members.push({
                userId: user._id,
                role: inv.role || USER_ROLES.MEMBER
              });
              await proj.save();
            }
          }

          // 4. Mark invitation as accepted
          if (inv.isBatch) {
            inv.acceptedEmails = inv.acceptedEmails || [];
            inv.acceptedEmails.push({
              email: normalizedEmail,
              userId: user._id,
              acceptedAt: new Date()
            });
            if (inv.acceptedEmails.length >= (inv.allowedEmails || []).length) {
              inv.status = 'ACCEPTED';
            }
            await inv.save();
          } else {
            inv.status = 'ACCEPTED';
            await inv.save();
          }

          // 5. Audit log
          await Activity.create({
            workspaceId: invWs._id,
            projectId: inv.projectId || null,
            userId: user._id,
            action: 'MEMBER_JOINED',
            field: 'role',
            newValue: inv.role || 'MEMBER',
            metadata: {
              targetUserId: user._id,
              targetUserName: user.name,
              targetUserEmail: user.email,
              role: inv.role || 'MEMBER',
              description: `${user.name} registered directly and was automatically connected via pending invitation`
            }
          });

          // Set primary workspace to the invited workspace so the user lands straight inside!
          primaryWorkspace = invWs;
          user.role = inv.role || user.role;
        }
      }
    }
  } catch (err) {
    console.error('[Auto-link Registration Error]:', err.message);
  }

  user.currentWorkspace = primaryWorkspace._id;
  const { accessToken, refreshToken } = generateTokens(user._id);
  user.refreshToken = refreshToken;
  await user.save();

  // Clear OTPs for this email
  await Otp.deleteMany({ email: normalizedEmail, type: 'REGISTER' });

  // Send onboarding welcome email async
  EmailService.sendWelcomeEmail(user).catch(() => {});

  res.status(201).json({
    success: true,
    message: 'Email verified and registered successfully',
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        currentWorkspace: primaryWorkspace._id
      },
      workspace: {
        id: primaryWorkspace._id,
        name: primaryWorkspace.name,
        slug: primaryWorkspace.slug
      },
      tokens: {
        accessToken,
        refreshToken
      }
    }
  });
});

// @desc    Register a new user & create initial workspace
// @route   POST /api/v1/auth/register
// @access  Public
const register = asyncHandler(async (req, res) => {
  const { name, email, password, workspaceName, accountType } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, error: 'Please provide name, email, and password' });
  }

  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    return res.status(400).json({ success: false, error: 'Email already registered' });
  }

  // Create user (first user is SUPER_ADMIN if no users exist, otherwise ORG_ADMIN)
  const isFirstUser = (await User.countDocuments()) === 0;
  const role = isFirstUser ? USER_ROLES.SUPER_ADMIN : USER_ROLES.ORG_ADMIN;

  const user = await User.create({
    name,
    email: email.toLowerCase(),
    password,
    role,
    status: USER_STATUS.ACTIVE,
    lastLoginAt: new Date()
  });

  // Create default workspace for user
  const defaultWsName = accountType === 'personal' 
    ? (workspaceName || `${name.split(' ')[0]}'s Personal Space`) 
    : (workspaceName || `${name.split(' ')[0]}'s Organization`);
  const wsName = defaultWsName;
  const slug = `${wsName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString().slice(-4)}`;

  const workspace = await Workspace.create({
    name: wsName,
    slug,
    ownerId: user._id,
    members: [{ userId: user._id, role: USER_ROLES.ORG_ADMIN }]
  });

  // Create default roles for this workspace
  const adminRole = await Role.create({
    name: 'Organization Admin',
    key: 'ORG_ADMIN',
    description: 'Full administrative access across all tabs, modules, members, and settings',
    workspaceId: workspace._id,
    isSystemRole: true,
    permissions: getDefaultAdminPermissions(),
    createdBy: user._id
  });

  await Role.create({
    name: 'Member',
    key: 'MEMBER',
    description: 'Standard member with access to work boards, backlog, and tasks',
    workspaceId: workspace._id,
    isSystemRole: true,
    permissions: getDefaultMemberPermissions(),
    createdBy: user._id
  });

  workspace.members[0].customRoleId = adminRole._id;

  // Create initial free subscription
  const subscription = await Subscription.create({
    workspaceId: workspace._id,
    planType: SUBSCRIPTION_PLANS.FREE,
    limits: PLAN_LIMITS.FREE
  });

  workspace.subscriptionId = subscription._id;
  await workspace.save();

  user.currentWorkspace = workspace._id;
  const { accessToken, refreshToken } = generateTokens(user._id);
  user.refreshToken = refreshToken;
  await user.save();

  // Send onboarding email async
  EmailService.sendWelcomeEmail(user).catch(() => {});

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        currentWorkspace: workspace._id
      },
      workspace: {
        id: workspace._id,
        name: workspace.name,
        slug: workspace.slug
      },
      tokens: {
        accessToken,
        refreshToken
      }
    }
  });
});

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Please provide email and password' });
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user) {
    return res.status(401).json({ success: false, error: 'Invalid email or password credentials' });
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return res.status(401).json({ success: false, error: 'Invalid email or password credentials' });
  }

  if (user.status === USER_STATUS.SUSPENDED) {
    return res.status(403).json({ success: false, error: 'Your account has been suspended by an administrator.' });
  }

  const { accessToken, refreshToken } = generateTokens(user._id);
  user.refreshToken = refreshToken;
  user.lastLoginAt = new Date();
  await user.save();

  // Get active workspace or user's first workspace
  let activeWorkspace = null;
  if (user.currentWorkspace) {
    activeWorkspace = await Workspace.findById(user.currentWorkspace);
  }
  if (!activeWorkspace) {
    activeWorkspace = await Workspace.findOne({ 'members.userId': user._id, isArchived: false });
    if (activeWorkspace) {
      user.currentWorkspace = activeWorkspace._id;
      await user.save();
    }
  }

  res.json({
    success: true,
    message: 'Logged in successfully',
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        status: user.status,
        currentWorkspace: activeWorkspace ? activeWorkspace._id : null,
        unreadProjectAssignments: user.unreadProjectAssignments || []
      },
      workspace: activeWorkspace ? {
        id: activeWorkspace._id,
        name: activeWorkspace.name,
        slug: activeWorkspace.slug
      } : null,
      tokens: {
        accessToken,
        refreshToken
      }
    }
  });
});

// @desc    Refresh access token using refresh token
// @route   POST /api/v1/auth/refresh-token
// @access  Public
const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;

  if (!token) {
    return res.status(400).json({ success: false, error: 'Refresh token is required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET || 'super_secret_refresh_jwt_key');
    const user = await User.findById(decoded.id).select('+refreshToken');

    if (!user || user.refreshToken !== token) {
      return res.status(401).json({ success: false, error: 'Invalid or revoked refresh token' });
    }

    const tokens = generateTokens(user._id);
    user.refreshToken = tokens.refreshToken;
    await user.save();

    res.json({
      success: true,
      data: {
        tokens
      }
    });
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Expired or invalid refresh token' });
  }
});

// @desc    Get current logged in user profile
// @route   GET /api/v1/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate('currentWorkspace');
  res.json({
    success: true,
    data: user
  });
});

// @desc    Update user profile details (Name, Job Title, Avatar)
// @route   PUT /api/v1/auth/profile
// @access  Private
const updateProfile = asyncHandler(async (req, res) => {
  const { name, jobTitle, avatar } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  if (name && name.trim()) user.name = name.trim();
  if (jobTitle !== undefined) user.jobTitle = jobTitle.trim();
  if (avatar !== undefined) user.avatar = avatar;

  await user.save();

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      jobTitle: user.jobTitle,
      avatar: user.avatar,
      currentWorkspace: user.currentWorkspace
    }
  });
});

// @desc    Change user password (Verify current + set new)
// @route   PUT /api/v1/auth/change-password
// @access  Private
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, error: 'Please provide both current and new password' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, error: 'New password must be at least 6 characters' });
  }

  const user = await User.findById(req.user._id).select('+password');
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    return res.status(400).json({ success: false, error: 'Current password does not match' });
  }

  user.password = newPassword;
  await user.save();

  res.json({
    success: true,
    message: 'Password changed successfully'
  });
});

// @desc    Logout user & invalidate refresh token
// @route   POST /api/v1/auth/logout
// @access  Private
const logout = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { refreshToken: null });
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

const { getStorageProvider } = require('../storage');

// @desc    Upload user avatar picture
// @route   POST /api/v1/auth/avatar
// @access  Private
const uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No avatar image file uploaded' });
  }

  const user = await User.findById(req.user._id);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  const storage = getStorageProvider();
  const uploadResult = await storage.uploadFile(req.file, `avatars/${user._id}`);

  user.avatar = uploadResult.url;
  await user.save();

  res.json({
    success: true,
    message: 'Profile picture updated successfully',
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      jobTitle: user.jobTitle,
      avatar: user.avatar,
      currentWorkspace: user.currentWorkspace
    }
  });
});

// @desc    Get user's unread project assignment notices
// @route   GET /api/v1/auth/my-project-notifications
// @access  Private
const getMyProjectNotifications = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('unreadProjectAssignments');
  res.json({
    success: true,
    data: user?.unreadProjectAssignments || []
  });
});

// @desc    Dismiss project assignment notice(s)
// @route   POST /api/v1/auth/my-project-notifications/dismiss
// @access  Private
const dismissProjectNotification = asyncHandler(async (req, res) => {
  const { projectId } = req.body;
  const user = await User.findById(req.user._id);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  if (projectId) {
    user.unreadProjectAssignments = (user.unreadProjectAssignments || []).filter(
      (a) => a.projectId && a.projectId.toString() !== projectId.toString()
    );
  } else {
    user.unreadProjectAssignments = [];
  }

  await user.save();
  res.json({
    success: true,
    message: 'Notifications dismissed',
    data: user.unreadProjectAssignments
  });
});

module.exports = {
  sendRegisterOtp,
  verifyRegisterOtp,
  register,
  login,
  refreshToken,
  getMe,
  updateProfile,
  uploadAvatar,
  changePassword,
  logout,
  getMyProjectNotifications,
  dismissProjectNotification
};