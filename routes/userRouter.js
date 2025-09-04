const express = require('express');
const router = express.Router();

const {
  requestRegisterOtp,
  resendRegisterOtp,
  verifyRegisterOtp,
  loginUser,
  getCurrentUser,
  updateUser,
  getAllUsers,
  updatePassword,
  logoutUser,
  refreshToken,
  requestEmailUpdateOtp,
  resendEmailUpdateOtp,
  verifyEmailUpdateOtp,
  requestPasswordResetOtp,
  resendPasswordResetOtp,
  resetPasswordWithToken,
  verifyPasswordResetOtp,
  confirmPassword,
  deleteTestAccount
} = require('../controller/userController');

const validateToken = require('../middleware/validations/validateTokenHandler');
const validateRegister = require('../middleware/validations/validateRegister');
const validateUpdate = require('../middleware/validations/validateUpdate');
const validateLogin = require('../middleware/validations/validateLogin');
const validateNewPassword = require('../middleware/validations/validateNewPassword');
const { createRateLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validations/validate');

// Rate limiters
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Terlalu banyak percobaan login, coba lagi nanti.'
});
const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Pendaftaran terlalu sering, coba lagi dalam 1 jam.'
});

// ---------------- PUBLIC ROUTES ---------------- //
// Register (OTP)
router.post(
  '/register/request-otp',
  validate(validateRegister),
  requestRegisterOtp
);
router.post('/register/resend-otp', resendRegisterOtp);
router.post('/register/verify-otp', verifyRegisterOtp);

// Forgot password (OTP)
router.post('/forgot-password/request-otp', requestPasswordResetOtp);
router.post('/forgot-password/resend-otp', resendPasswordResetOtp);
router.post('/forgot-password/verify-otp', verifyPasswordResetOtp);
router.post('/forgot-password/reset-password', resetPasswordWithToken);

// Auth
router.post('/login', /*loginLimiter,*/ validate(validateLogin), loginUser);
router.post('/logout', logoutUser);
router.post('/refresh-token', refreshToken);

// Testing only
router.delete('/del', deleteTestAccount);

// ---------------- PROTECTED ROUTES ---------------- //
// Email update (OTP)
router.post('/security/confirm-password', validateToken, confirmPassword);
router.post('/update-email/request-otp', validateToken, requestEmailUpdateOtp);
router.post('/update-email/resend-otp', validateToken, resendEmailUpdateOtp);
router.post('/update-email/verify-otp', validateToken, verifyEmailUpdateOtp);

// User management
router.get('/current-user', validateToken, getCurrentUser);
router.put(
  '/update-profile',
  validateToken,
  validate(validateUpdate),
  updateUser
);
router.put(
  '/change-password',
  validateToken,
  validate(validateNewPassword),
  updatePassword
);
router.get('/all-user', validateToken, getAllUsers);

module.exports = router;
