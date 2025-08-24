const express = require('express');
const Router = express.Router();

const {
  registerUser,
  loginUser,
  getCurrentUser,
  updateUser,
  getAllUsers,
  updatePassword,
  logoutUser,
  refreshToken
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
Router.post(
  '/register',
  /*registerLimiter,*/ validate(validateRegister),
  registerUser
);
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

module.exports = Router;
