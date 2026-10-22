const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/authController');
const { protect } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: User registration, OTP email verification, authentication, and JWT tokens
 */

router.post('/send-register-otp', sendRegisterOtp);
router.post('/verify-register-otp', verifyRegisterOtp);
router.post('/register', register);
router.post('/login', login);
router.post('/refresh-token', refreshToken);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.post('/avatar', protect, upload.single('avatar'), uploadAvatar);
router.put('/change-password', protect, changePassword);
router.post('/logout', protect, logout);
router.get('/my-project-notifications', protect, getMyProjectNotifications);
router.post('/my-project-notifications/dismiss', protect, dismissProjectNotification);

module.exports = router;

