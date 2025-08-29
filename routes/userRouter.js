const express = require('express');
const Router = express.Router();

const {
  // registerUser,
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

// POST
// Router.post(
//   '/register',
//   /*registerLimiter,*/ validate(validateRegister),
//   registerUser
// );

Router.post(
  '/register/request-otp',
  validate(validateRegister),
  requestRegisterOtp
);
Router.post('/register/resend-otp', resendRegisterOtp);
Router.post('/register/verify-otp', verifyRegisterOtp);

Router.post('/security/confirm-password', validateToken, confirmPassword);
Router.post('/update-email/request-otp', validateToken, requestEmailUpdateOtp);
Router.post('/update-email/resend-otp', validateToken, resendEmailUpdateOtp);
Router.post('/update-email/verify-otp', validateToken, verifyEmailUpdateOtp);

Router.post('/forgot-password/request-otp', requestPasswordResetOtp);
Router.post('/forgot-password/resend-otp', resendPasswordResetOtp);
Router.post('/forgot-password/verify-otp', verifyPasswordResetOtp);
Router.post('/forgot-password/reset-password', resetPasswordWithToken);

Router.post('/login', /*loginLimiter,*/ validate(validateLogin), loginUser);
Router.post('/logout', logoutUser);
Router.post('/refresh-token', refreshToken);

// PUT
Router.put(
  '/update-profile',
  validateToken,
  validate(validateUpdate),
  updateUser
);
Router.put(
  '/change-password',
  validateToken,
  validate(validateNewPassword),
  updatePassword
);

// GET
Router.get('/current-user', validateToken, getCurrentUser);
Router.get('/all-user', validateToken, getAllUsers);

Router.delete('/del', deleteTestAccount);

module.exports = Router;
